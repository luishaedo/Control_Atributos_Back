import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { ActualizacionesService } from '../src/services/actualizaciones.service.js'

// Explicit opt-in only. Never use DATABASE_URL or load .env for these tests.
const url = process.env.R13_TEST_DATABASE_URL
const fields = ['categoria_cod', 'tipo_cod', 'clasif_cod']
const conflict = result => result.status === 'rejected' && result.reason.code === 'UPDATE_CONFLICT'

function barrier() {
  let arrivals = 0, release
  const ready = new Promise(resolve => { release = resolve })
  return async () => { if (++arrivals === 2) release(); await ready }
}

// Delay an actual database operation until both real transactions reach it.
function gated(db, model, method, wait, after = false) {
  return { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, {
    get(target, key) {
      if (key !== model) return target[key]
      let first = true
      return new Proxy(target[key], { get(delegate, operation) {
        if (operation !== method) return delegate[operation]
        return async args => {
          if (!first) return delegate[operation](args)
          first = false
          if (!after) await wait()
          const result = await delegate[operation](args)
          if (after) await wait()
          return result
        }
      } })
    }
  })), { ...options, timeout: 10000 }) }
}

test('R1.3 PostgreSQL aislado: conservación, atomicidad y carreras reales', { skip: !url }, async t => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55439')
  assert.equal(parsed.pathname, '/r13_isolated')
  assert.equal(parsed.username, 'r13test')
  const db = new PrismaClient({ datasources: { db: { url } } })
  const sku = `R13${randomUUID().replaceAll('-', '')}`
  const requiredCodes = {
    dicCategoria: ['02', '03', '04'],
    dicTipo: ['03'],
    dicClasif: ['04'],
  }
  const createdCodes = {}
  for (const [model, codes] of Object.entries(requiredCodes)) {
    const existing = await db[model].findMany({ where: { cod: { in: codes } }, select: { cod: true } })
    const existingSet = new Set(existing.map(item => item.cod))
    createdCodes[model] = codes.filter(code => !existingSet.has(code))
    if (createdCodes[model].length) {
      await db[model].createMany({ data: createdCodes[model].map(cod => ({ cod, nombre: `Test ${cod}` })) })
    }
  }
  const campaign = await db.campania.create({ data: {
    nombre: sku, inicia: new Date(), termina: new Date(), activa: true,
    activatedOnce: true, estado: 'ACTIVA', activatedAt: new Date(),
  } })
  t.after(async () => {
    await db.campania.delete({ where: { id: campaign.id } })
    await db.maestro.deleteMany({ where: { sku } })
    for (const [model, codes] of Object.entries(createdCodes)) {
      if (codes.length) await db[model].deleteMany({ where: { cod: { in: codes } } })
    }
    await db.$disconnect()
  })
  await db.maestro.create({ data: { sku, descripcion: 'fixture aislado', ...Object.fromEntries(fields.map(f => [f, '01'])) } })
  const service = ActualizacionesService(db)
  const reset = async () => {
    await db.actualizacion.deleteMany({ where: { campaniaId: campaign.id } })
    await db.maestro.update({ where: { sku }, data: Object.fromEntries(fields.map(f => [f, '01'])) })
  }
  const decide = (propuesta, extra = {}, svc = service) => svc.recordDecision({
    campaniaId: campaign.id, sku, propuesta, decision: 'aceptar', decidedBy: 'test', notas: '', ...extra,
  })
  const master = async () => {
    const row = await db.maestro.findUnique({ where: { sku } })
    return fields.map(f => row[f])
  }
  for (const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]) {
    await t.test(`tres atributos, orden ${order}`, async () => {
      await reset()
      const rows = []
      for (const [i, field] of fields.entries()) rows.push(await decide({ [field]: `0${i + 2}` }))
      for (const i of order) await service.applyUpdates({ ids: [rows[i].id] })
      assert.deepEqual(await master(), ['02', '03', '04'])
    })
  }
  await t.test('reemplazo parcial conserva propuesta restante y original auditado', async () => {
    await reset()
    const original = await decide({ categoria_cod: '02', tipo_cod: '03' })
    await decide({ categoria_cod: '04' })
    const pending = await db.actualizacion.findMany({ where: { campaniaId: campaign.id, archivada: false } })
    await service.applyUpdates({ ids: pending.map(row => row.id) })
    assert.deepEqual(await master(), ['04', '03', '01'])
    const archived = await db.actualizacion.findUnique({ where: { id: original.id } })
    assert.equal(archived.archivada, true)
    assert.equal(archived.new_tipo_cod, '03')
  })
  await t.test('rechazo reciente invalida aceptación anterior sin perder otro atributo', async () => {
    await reset()
    const old = await decide({ categoria_cod: '02', tipo_cod: '03' })
    await decide({ categoria_cod: '02' }, { decision: 'rechazar' })
    await assert.rejects(service.applyUpdates({ ids: [old.id] }), { code: 'UPDATE_CONFLICT' })
    const remaining = await db.actualizacion.findMany({ where: { campaniaId: campaign.id, archivada: false, estado: 'pendiente' } })
    await service.applyUpdates({ ids: remaining.map(row => row.id) })
    assert.deepEqual(await master(), ['01', '03', '01'])
  })
  await t.test('dos aplicaciones simultáneas de la misma decisión: una sola confirma', async () => {
    await reset()
    const row = await decide({ categoria_cod: '02' })
    const concurrent = ActualizacionesService(gated(db, 'maestro', 'updateMany', barrier()))
    const results = await Promise.allSettled([1,2].map(() => concurrent.applyUpdates({ ids: [row.id] })))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.filter(conflict).length, 1)
    assert.deepEqual(await master(), ['02', '01', '01'])
  })
  await t.test('continuación parcial no revive atributo ya rechazado en historial con empate de fecha', async () => {
    await reset()
    const old = await decide({ categoria_cod: '02', tipo_cod: '03' })
    // Legacy overlapping rows can predate the transactional decision writer.
    const { id, ...rejected } = old
    await db.actualizacion.create({ data: { ...rejected, estado: 'rechazada', new_categoria_cod: '' } })
    const next = await decide({ categoria_cod: '04' })
    const pending = await db.actualizacion.findMany({ where: { campaniaId: campaign.id, archivada: false, estado: 'pendiente' } })
    assert.deepEqual(pending.map(row => row.id), [next.id])
    await service.applyUpdates({ ids: [next.id] })
    assert.deepEqual(await master(), ['04', '01', '01'])
  })
  await t.test('atributos distintos simultáneos: conflicto explícito, reaplicación manual conserva ambos', async () => {
    await reset()
    const rows = [await decide({ categoria_cod: '02' }), await decide({ tipo_cod: '03' })]
    const concurrent = ActualizacionesService(gated(db, 'maestro', 'updateMany', barrier()))
    const results = await Promise.allSettled(rows.map(row => concurrent.applyUpdates({ ids: [row.id] })))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.filter(conflict).length, 1)
    const loser = results.findIndex(conflict)
    await service.applyUpdates({ ids: [rows[loser].id] })
    assert.deepEqual(await master(), ['02', '03', '01'])
  })
  await t.test('dos revisores simultáneos: una decisión pendiente vigente', async () => {
    await reset()
    const concurrent = ActualizacionesService(gated(db, 'actualizacion', 'findMany', barrier(), true))
    const results = await Promise.allSettled(['02', '03'].map(code => decide({ categoria_cod: code }, {}, concurrent)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.filter(conflict).length, 1)
    assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id, archivada: false } }), 1)
  })
  await t.test('cambio externo invalida lote entero, incluidas escrituras anteriores', async () => {
    await reset()
    const a = await decide({ categoria_cod: '02' })
    const b = await decide({ tipo_cod: '03' })
    await db.maestro.update({ where: { sku }, data: { tipo_cod: '99' } })
    await assert.rejects(service.applyUpdates({ ids: [a.id, b.id] }), { code: 'UPDATE_CONFLICT' })
    assert.deepEqual(await master(), ['01', '99', '01'])
    assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id, estado: 'aplicada' } }), 0)
  })
  await t.test('aplicación anticipada se rechaza sin crear decisión ni tocar maestro', async () => {
    await reset()
    await assert.rejects(decide({ categoria_cod: '02' }, { aplicarAhora: true }), {
      code: 'APPLY_REQUIRES_CLOSE', status: 409,
    })
    assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id } }), 0)
    assert.deepEqual(await master(), ['01', '01', '01'])
  })
  await t.test('intento anticipado no archiva decisión ni cambia etapa existente', async () => {
    await reset()
    const original = await decide({ categoria_cod: '02' })
    await db.skuStage.update({ where: { campaniaId_sku: { campaniaId: campaign.id, sku } }, data: { stage: 'consolidate' } })
    await assert.rejects(decide({ categoria_cod: '03' }, { aplicarAhora: true }), {
      code: 'APPLY_REQUIRES_CLOSE', status: 409,
    })
    assert.equal(await db.actualizacion.count({ where: { campaniaId: campaign.id } }), 1)
    assert.equal((await db.actualizacion.findUnique({ where: { id: original.id } })).archivada, false)
    assert.equal((await db.skuStage.findUnique({ where: { campaniaId_sku: { campaniaId: campaign.id, sku } } })).stage, 'consolidate')
  })
})
