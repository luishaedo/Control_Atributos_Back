import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

const { PrismaClient } = createRequire(import.meta.url)('@prisma/client')

const stagingBase = 'https://control-atributos-staging.onrender.com'
const expectedHost = 'ep-curly-shape-anyk4jwe-pooler.c-6.us-east-1.aws.neon.tech'
const redact = value => String(value || '')
  .replace(/postgres(?:ql)?:\/\/[^@\s'"]+@/g, 'postgresql://<redacted>@')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer <redacted>')
  .replace(/[A-Za-z0-9._~+/=-]{24,}/g, '<redacted>')

// Credentials live only in the caller process. Fixtures are retained for audit in the isolated DB.
export async function validateR14({ databaseUrl, token, expectedVersion, onProgress = () => {} }) {
  const normalizedDatabaseUrl = String(databaseUrl || '').match(/postgres(?:ql)?:\/\/[^\s'"]+/)?.[0] || databaseUrl
  const target = new URL(normalizedDatabaseUrl)
  assert.equal(target.hostname, expectedHost)
  assert.equal(target.pathname, '/r02_prisma_validation')
  assert.match(expectedVersion, /^[a-f0-9]{40}$/)
  assert.ok(token)

  const report = {
    checkedAt: new Date().toISOString(),
    base: stagingBase,
    expectedVersion,
    passed: false,
    fixturesRetained: true,
    campaignIds: [],
    skus: [],
    checks: [],
    requests: [],
  }
  const db = new PrismaClient({ datasources: { db: { url: normalizedDatabaseUrl } } })
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:5173',
    'Content-Type': 'application/json',
  }

  async function request(method, path, body) {
    const started = Date.now()
    const res = await fetch(`${stagingBase}${path}`, {
      method,
      redirect: 'error',
      headers: authHeaders,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json()
    report.requests.push({
      method,
      path,
      status: res.status,
      responseCode: data?.code,
      durationMs: Date.now() - started,
      requestId: res.headers.get('x-request-id'),
    })
    return { status: res.status, data }
  }
  const ok = async (method, path, body) => {
    const result = await request(method, path, body)
    assert.equal(result.status, 200)
    return result.data
  }
  const check = async (name, fn) => {
    try {
      await fn()
      report.checks.push({ name, passed: true })
      onProgress({ name, passed: true })
    } catch (error) {
      report.checks.push({
        name,
        passed: false,
        code: error.code || error.name || 'FAILED',
        message: redact(error.message),
      })
      throw error
    }
  }

  try {
    await check('versión, DB y migración R1.4 exactas', async () => {
      const health = await ok('GET', '/api/health/ready')
      assert.equal(health.version, expectedVersion)
      assert.equal(health.database, 'up')
      await ok('GET', '/api/admin/ping')
      assert.equal(await db.$queryRaw`SELECT count(*)::int AS count FROM public._prisma_migrations WHERE migration_name = '20260930220000_r14_campaign_lifecycle' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`.then(rows => rows[0].count), 1)
    })

    await db.campania.updateMany({
      where: { nombre: { startsWith: 'TEST-R14-' }, activa: true },
      data: { activa: false, estado: 'CERRADA', closedAt: new Date() },
    })

    const runId = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
    const sku = label => `TESTR14${runId}${label}`
    const known = ['CONF', 'PEND', 'REJ', 'LATE', 'DOUBLE'].map(sku)
    const approvedUnknown = sku('UNKNOWNOK')
    const rejectedUnknown = sku('UNKNOWNREJ')
    report.skus.push(...known, approvedUnknown, rejectedUnknown)
    const dates = { inicia: '2026-09-01T00:00:00.000Z', termina: '2026-10-01T00:00:00.000Z' }

    await Promise.all([
      db.dicCategoria.createMany({
        data: ['01', '02', '03'].map(cod => ({ cod, nombre: `TEST R1.4 categoria ${cod}` })),
        skipDuplicates: true,
      }),
      db.dicTipo.createMany({
        data: ['01', '02', '03'].map(cod => ({ cod, nombre: `TEST R1.4 tipo ${cod}` })),
        skipDuplicates: true,
      }),
      db.dicClasif.createMany({
        data: ['01', '02', '03'].map(cod => ({ cod, nombre: `TEST R1.4 clasif ${cod}` })),
        skipDuplicates: true,
      }),
    ])

    await db.maestro.createMany({ data: known.map(value => ({
      sku: value,
      descripcion: 'TEST R1.4 - fixture aislado',
      categoria_cod: '01',
      tipo_cod: '01',
      clasif_cod: '01',
    })) })

    let main
    await check('borrador sin snapshot y objetivos inválidos sin escritura', async () => {
      const before = await db.campania.count()
      const invalid = await request('POST', '/api/admin/campanias', {
        nombre: `TEST-R14-INVALID-${runId}`,
        ...dates,
        categoria_objetivo_cod: '999',
      })
      assert.equal(invalid.status, 422)
      assert.equal(invalid.data.code, 'INVALID_CODE_FORMAT')
      assert.equal(await db.campania.count(), before)
      main = await ok('POST', '/api/admin/campanias', { nombre: `TEST-R14-MAIN-${runId}`, ...dates })
      report.campaignIds.push(main.id)
      assert.equal(main.estado, 'BORRADOR')
      assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), 0)
    })

    let snapshotCount
    await check('activación única congela snapshot y GET no escribe', async () => {
      const masterCount = await db.maestro.count()
      const active = await ok('POST', `/api/admin/campanias/${main.id}/activar`, {})
      assert.equal(active.estado, 'ACTIVA')
      snapshotCount = await db.campaniaMaestro.count({ where: { campaniaId: main.id } })
      assert.equal(snapshotCount, masterCount)

      const lateSku = sku('AFTERSNAPSHOT')
      report.skus.push(lateSku)
      await db.maestro.create({ data: {
        sku: lateSku,
        descripcion: 'TEST R1.4 - alta posterior',
        categoria_cod: '01',
        tipo_cod: '01',
        clasif_cod: '01',
      } })
      const lookup = await request('GET', `/api/campanias/${main.id}/maestro/${lateSku}`)
      assert.equal(lookup.status, 404)
      assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), snapshotCount)

      const second = await ok('POST', '/api/admin/campanias', { nombre: `TEST-R14-SECOND-${runId}`, ...dates })
      report.campaignIds.push(second.id)
      const conflict = await request('POST', `/api/admin/campanias/${second.id}/activar`, {})
      assert.equal(conflict.status, 409)
      assert.ok(['ACTIVE_CAMPAIGN_EXISTS', 'CAMPAIGN_ACTIVATION_CONFLICT'].includes(conflict.data.code))
    })

    const decide = async (targetSku, propuesta, decision = 'aceptar') =>
      (await ok('POST', '/api/admin/revisiones/decidir', {
        campaniaId: main.id,
        sku: targetSku,
        propuesta,
        decision,
        decidedBy: 'r14-staging-test',
        aplicarAhora: false,
      })).actualizacion
    const consolidate = async targetSku => {
      await ok('POST', '/api/admin/etapas/mover', {
        campaniaId: main.id, sku: targetSku, stage: 'confirm', updatedBy: 'r14-staging-test',
      })
      await ok('POST', '/api/admin/etapas/mover', {
        campaniaId: main.id, sku: targetSku, stage: 'consolidate', updatedBy: 'r14-staging-test',
      })
    }

    let accepted
    let rejected
    await check('aceptar propone, confirmar habilita y aplicación directa se bloquea', async () => {
      accepted = await decide(known[0], { categoria_cod: '02' })
      await consolidate(known[0])
      await decide(known[1], { categoria_cod: '02' })
      await decide(known[2], { categoria_cod: '02' })
      rejected = await decide(known[2], { categoria_cod: '02' }, 'rechazar')
      await consolidate(known[2])
      const direct = await request('POST', '/api/admin/actualizaciones/aplicar', {
        ids: [accepted.id], decidedBy: 'r14-staging-test',
      })
      assert.equal(direct.status, 409)
      assert.equal(direct.data.code, 'APPLY_REQUIRES_CLOSE')
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[0] } })).categoria_cod, '01')
    })

    let approvedUnknownId
    await check('desconocidos aprobados y rechazados quedan diferenciados', async () => {
      const scan = async (targetSku, key) => ok('POST', '/api/escaneos', {
        campaniaId: main.id,
        idempotencyKey: `TEST-R14-${runId}-${key}`,
        skuRaw: targetSku,
        email: 'r14-staging-test',
        sucursal: 'TEST-R14',
        sugeridos: { categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' },
      })
      approvedUnknownId = (await scan(approvedUnknown, 'UNKNOWN-OK')).unknown.id
      const rejectedId = (await scan(rejectedUnknown, 'UNKNOWN-REJ')).unknown.id
      await ok('POST', `/api/admin/desconocidos/${approvedUnknown}/confirmar`, {
        campaniaId: main.id, updatedBy: 'r14-staging-test',
      })
      await ok('POST', `/api/admin/unknowns/${rejectedId}/reject`, {
        decidedBy: 'r14-staging-test', reason: 'TEST-R14 rechazo preservado',
      })
      assert.equal((await db.unknownSku.findUniqueOrThrow({ where: { id: approvedUnknownId } })).status, 'APPROVED')
      assert.equal((await db.unknownSku.findUniqueOrThrow({ where: { id: rejectedId } })).status, 'REJECTED')
    })

    await check('cierre aplica solo confirmados y conserva snapshot/rechazos', async () => {
      const close = await ok('POST', `/api/admin/campanias/${main.id}/cerrar`, { decidedBy: 'r14-staging-test' })
      assert.equal(close.alreadyClosed, false)
      assert.equal(close.applied, 1)
      assert.equal(close.unknownApplied, 1)
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[0] } })).categoria_cod, '02')
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[1] } })).categoria_cod, '01')
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[2] } })).categoria_cod, '01')
      assert.equal((await db.actualizacion.findUniqueOrThrow({ where: { id: rejected.id } })).estado, 'rechazada')
      assert.ok(await db.maestro.findUnique({ where: { sku: approvedUnknown } }))
      assert.equal(await db.maestro.findUnique({ where: { sku: rejectedUnknown } }), null)
      assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), snapshotCount)
      const campaign = await db.campania.findUniqueOrThrow({ where: { id: main.id } })
      assert.equal(campaign.estado, 'CERRADA')
      assert.equal(campaign.activa, false)
      assert.ok(campaign.closedAt)
    })

    await check('cierre repetido y no reactivación', async () => {
      const repeated = await ok('POST', `/api/admin/campanias/${main.id}/cerrar`, { decidedBy: 'r14-staging-test-2' })
      assert.equal(repeated.alreadyClosed, true)
      const activation = await request('POST', `/api/admin/campanias/${main.id}/activar`, {})
      assert.equal(activation.status, 409)
      assert.equal(activation.data.code, 'CAMPAIGN_CLOSED')
    })

    await check('reversión compensatoria única conserva original', async () => {
      const reversed = await ok('POST', `/api/admin/actualizaciones/${accepted.id}/revertir`, {
        decidedBy: 'r14-staging-test', notas: 'TEST-R14 reversión',
      })
      assert.equal(reversed.actualizacion.reversalOfId, accepted.id)
      assert.equal(reversed.actualizacion.estado, 'aplicada')
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[0] } })).categoria_cod, '01')
      assert.equal((await db.actualizacion.findUniqueOrThrow({ where: { id: accepted.id } })).estado, 'aplicada')
      const duplicate = await request('POST', `/api/admin/actualizaciones/${accepted.id}/revertir`, {
        decidedBy: 'r14-staging-test',
      })
      assert.equal(duplicate.status, 409)
      assert.equal(duplicate.data.code, 'REVERSAL_ALREADY_EXISTS')
    })

    let concurrentCampaign
    let concurrentDecision
    await check('dos cierres concurrentes producen una aplicación', async () => {
      concurrentCampaign = await ok('POST', '/api/admin/campanias', {
        nombre: `TEST-R14-CONCURRENT-${runId}`, ...dates, activa: true,
      })
      report.campaignIds.push(concurrentCampaign.id)
      concurrentDecision = (await ok('POST', '/api/admin/revisiones/decidir', {
        campaniaId: concurrentCampaign.id,
        sku: known[4],
        propuesta: { tipo_cod: '03' },
        decision: 'aceptar',
        decidedBy: 'r14-staging-test',
        aplicarAhora: false,
      })).actualizacion
      await ok('POST', '/api/admin/etapas/mover', {
        campaniaId: concurrentCampaign.id, sku: known[4], stage: 'confirm', updatedBy: 'r14-staging-test',
      })
      await ok('POST', '/api/admin/etapas/mover', {
        campaniaId: concurrentCampaign.id, sku: known[4], stage: 'consolidate', updatedBy: 'r14-staging-test',
      })
      const closePath = `/api/admin/campanias/${concurrentCampaign.id}/cerrar`
      const results = await Promise.all([
        request('POST', closePath, { decidedBy: 'r14-staging-a' }),
        request('POST', closePath, { decidedBy: 'r14-staging-b' }),
      ])
      assert.ok(results.some(result => result.status === 200))
      assert.ok(results.every(result => result.status === 200 || result.status === 409))
      assert.equal(await db.actualizacion.count({ where: { id: concurrentDecision.id, estado: 'aplicada' } }), 1)
      assert.equal((await db.maestro.findUniqueOrThrow({ where: { sku: known[4] } })).tipo_cod, '03')
      assert.equal((await db.campania.findUniqueOrThrow({ where: { id: concurrentCampaign.id } })).estado, 'CERRADA')
    })

    report.passed = true
  } catch (error) {
    report.failureCode = error.code || error.name || 'FAILED'
    report.failureMessage = redact(error.message)
  } finally {
    await db.$disconnect()
  }
  return report
}
