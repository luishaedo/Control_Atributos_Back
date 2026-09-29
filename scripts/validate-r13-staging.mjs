import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const stagingBase = 'https://control-atributos-staging.onrender.com'
const fields = ['categoria_cod', 'tipo_cod', 'clasif_cod']

// Credentials are supplied in memory by the caller. No dotenv, credentials file or logging.
// Remote fixtures are retained as an inactive campaign; no deletion or reset is performed.
export async function validateR13({ databaseUrl, token, expectedVersion, base = stagingBase, local = false, onProgress = () => {} }) {
  const target = new URL(databaseUrl)
  if (local) {
    assert.equal(target.hostname, '127.0.0.1')
    assert.equal(target.port, '55439')
    assert.equal(target.pathname, '/r13_isolated')
    assert.equal(new URL(base).hostname, '127.0.0.1')
  } else {
    assert.equal(base, stagingBase)
    assert.equal(target.hostname, 'ep-curly-shape-anyk4jwe-pooler.c-6.us-east-1.aws.neon.tech')
    assert.equal(target.pathname, '/r02_prisma_validation')
    assert.match(expectedVersion, /^[a-f0-9]{40}$/)
  }
  assert.ok(token)
  const report = { checkedAt: new Date().toISOString(), base, expectedVersion,
    passed: false, fixturesRetained: true, campaignId: null, skus: [], checks: [], requests: [] }
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  async function request(path, body) {
    const started = Date.now()
    // An HTTP timeout does not cancel DB work: no retries and no cleanup on timeout.
    const res = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) })
    const data = await res.json()
    report.requests.push({ path, status: res.status, durationMs: Date.now() - started, requestId: res.headers.get('x-request-id') })
    return { status: res.status, data }
  }
  const ok = async (path, body) => {
    const result = await request(path, body)
    assert.equal(result.status, 200)
    return result.data
  }
  const check = async (name, fn) => {
    try { await fn(); report.checks.push({ name, passed: true }); onProgress({ name, passed: true }) }
    catch (error) { report.checks.push({ name, passed: false, code: error.code || error.name || 'FAILED' }); throw error }
  }
  try {
    await check('versión exacta y DB disponible antes de escribir', async () => {
      const health = await ok('/api/health/ready')
      assert.equal(health.version, expectedVersion)
      assert.equal(health.database, 'up')
      await ok('/api/admin/ping')
    })
    const runId = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
    const campaign = await db.campania.create({ data: {
      nombre: `TEST-R13-${runId}`, inicia: new Date(), termina: new Date(), activa: false,
    } })
    report.campaignId = campaign.id
    const createSku = async () => {
      const sku = `R13-${runId}-${report.skus.length}`
      await db.maestro.create({ data: { sku, descripcion: 'TEST R1.3 - fixture aislado',
        categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' } })
      report.skus.push(sku)
      return sku
    }
    const codes = async sku => {
      const row = await db.maestro.findUniqueOrThrow({ where: { sku } })
      return fields.map(f => row[f])
    }
    const decide = async (sku, propuesta, extra = {}) => (await ok('/api/admin/revisiones/decidir', {
      campaniaId: campaign.id, sku, propuesta, decision: 'aceptar', decidedBy: 'r13-staging-test', ...extra,
    })).actualizacion
    const apply = ids => request('/api/admin/actualizaciones/aplicar', { ids, decidedBy: 'r13-staging-test' })
    for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
      await check(`conserva tres atributos: ${order.join('-')}`, async () => {
        const sku = await createSku()
        // Canary verifies the API and the direct connection see the same fixture.
        const read = await ok(`/api/maestro/${sku}`)
        assert.equal(read.descripcion, 'TEST R1.3 - fixture aislado')
        const decisions = []
        for (let i = 0; i < 3; i++) decisions.push(await decide(sku, { [fields[i]]: `0${i + 2}` }))
        for (const i of order) assert.equal((await apply([decisions[i].id])).status, 200)
        assert.deepEqual(await codes(sku), ['02', '03', '04'])
      })
    }
    await check('sustitución parcial conserva otro atributo', async () => {
      const sku = await createSku()
      const old = await decide(sku, { categoria_cod: '02', tipo_cod: '03' })
      await decide(sku, { categoria_cod: '04' })
      const rows = await db.actualizacion.findMany({ where: { campaniaId: campaign.id, sku, archivada: false, estado: 'pendiente' } })
      assert.equal((await apply(rows.map(r => r.id))).status, 200)
      assert.deepEqual(await codes(sku), ['04', '03', '01'])
      assert.equal((await db.actualizacion.findUniqueOrThrow({ where: { id: old.id } })).archivada, true)
    })
    await check('doble aplicación HTTP paralela: 200 y 409, una aplicación', async () => {
      const sku = await createSku()
      const row = await decide(sku, { categoria_cod: '02' })
      const responses = await Promise.all([apply([row.id]), apply([row.id])])
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
      assert.equal(responses.find(r => r.status === 409).data.code, 'UPDATE_CONFLICT')
      assert.deepEqual(await codes(sku), ['02', '01', '01'])
      assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id, sku, estado: 'aplicada' } }), 1)
    })
    await check('rechazo nuevo invalida aceptación anterior', async () => {
      const sku = await createSku()
      const old = await decide(sku, { categoria_cod: '02' })
      await decide(sku, { categoria_cod: '02' }, { decision: 'rechazar' })
      assert.equal((await apply([old.id])).status, 409)
      assert.deepEqual(await codes(sku), ['01', '01', '01'])
    })
    await check('baseline cambiado: rollback total del lote', async () => {
      const sku = await createSku()
      const a = await decide(sku, { categoria_cod: '02' })
      const b = await decide(sku, { tipo_cod: '03' })
      // Only the newly created fixture is changed, to simulate another writer.
      await db.maestro.update({ where: { sku }, data: { tipo_cod: '99' } })
      const result = await apply([a.id, b.id])
      assert.equal(result.status, 409)
      assert.equal(result.data.code, 'UPDATE_CONFLICT')
      assert.deepEqual(await codes(sku), ['01', '99', '01'])
      assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id, sku, estado: 'aplicada' } }), 0)
    })
    await check('aplicación inmediata devuelve estado persistido', async () => {
      const sku = await createSku()
      await decide(sku, { categoria_cod: '02' }, { aplicarAhora: true })
      const row = await decide(sku, { categoria_cod: '03' }, { aplicarAhora: true })
      assert.equal(row.estado, 'aplicada')
      assert.equal(row.old_categoria_cod, '02')
      assert.deepEqual(await codes(sku), ['03', '01', '01'])
    })
    report.passed = true
  } catch (error) {
    // Never persist raw error messages/Prisma objects: they may include connection data.
    report.failureCode = error.code || error.name || 'FAILED'
  } finally {
    await db.$disconnect()
  }
  return report
}
