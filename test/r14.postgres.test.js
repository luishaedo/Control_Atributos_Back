import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { CampaniasService } from '../src/services/campanias.service.js'
import { ActualizacionesService } from '../src/services/actualizaciones.service.js'
import { CampaignClosureService } from '../src/services/campaignClosure.service.js'
import { EscaneosService } from '../src/services/escaneos.service.js'
import { MaestroController } from '../src/controllers/maestro.controller.js'

const url = process.env.R14_TEST_DATABASE_URL

test('R1.4 PostgreSQL aislado: ciclo, cierre, rollback y reversión', { skip: !url }, async t => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55439')
  assert.equal(parsed.pathname, '/r14_isolated')
  assert.equal(parsed.username, 'r13test')

  const db = new PrismaClient({ datasources: { db: { url } } })
  const run = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()
  const sku = suffix => `R14${suffix}${run}`
  const skus = ['SNAP', 'OK', 'PEND', 'REJ', 'ROLL', 'DOUBLE', 'NEW', 'NOREJ', 'RACE'].map(sku)
  const campaignIds = []
  const campaigns = CampaniasService(db)
  const decisions = ActualizacionesService(db)
  const closure = CampaignClosureService(db)
  const dates = { inicia: new Date('2026-09-01T00:00:00Z'), termina: new Date('2026-10-01T00:00:00Z') }

  t.after(async () => {
    await db.campania.deleteMany({ where: { id: { in: campaignIds } } })
    await db.maestro.deleteMany({ where: { sku: { in: skus } } })
    await db.dicCategoria.deleteMany({ where: { cod: { in: ['81', '84'] } } })
    await db.dicTipo.deleteMany({ where: { cod: '82' } })
    await db.dicClasif.deleteMany({ where: { cod: '83' } })
    await db.$disconnect()
  })

  await Promise.all([
    db.dicCategoria.createMany({ data: [{ cod: '81', nombre: 'Base' }, { cod: '84', nombre: 'Cambio' }], skipDuplicates: true }),
    db.dicTipo.createMany({ data: [{ cod: '82', nombre: 'Tipo' }], skipDuplicates: true }),
    db.dicClasif.createMany({ data: [{ cod: '83', nombre: 'Clasificación' }], skipDuplicates: true }),
    db.maestro.createMany({ data: [...skus.slice(0, 6), skus[8]].map(value => ({
      sku: value, descripcion: value, categoria_cod: '81', tipo_cod: '82', clasif_cod: '83',
    })) }),
  ])

  await t.test('fechas inválidas se rechazan antes de escribir', async () => {
    await assert.rejects(campaigns.crearCampaniaConSnapshot({
      nombre: 'Inválida', inicia: dates.termina, termina: dates.inicia,
    }), { code: 'INVALID_CAMPAIGN_DATES', status: 400 })
  })

  await t.test('objetivos fuera de formato o diccionario se rechazan sin escribir', async () => {
    const before = await db.campania.count()
    await assert.rejects(campaigns.crearCampaniaConSnapshot({
      nombre: 'Formato inválido', ...dates, categoria_objetivo_cod: '841',
    }), { code: 'INVALID_CODE_FORMAT', status: 422 })
    await assert.rejects(campaigns.crearCampaniaConSnapshot({
      nombre: 'Dominio inválido', ...dates, categoria_objetivo_cod: '99',
    }), { code: 'INVALID_DICTIONARY', status: 422 })
    assert.equal(await db.campania.count(), before)
  })

  const main = await campaigns.crearCampaniaConSnapshot({ nombre: `Principal ${run}`, ...dates })
  campaignIds.push(main.id)
  assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), 0)
  await campaigns.activar(main.id)
  assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), 7)

  await t.test('snapshot se congela al activar y GET no escribe', async () => {
    await db.maestro.update({ where: { sku: skus[0] }, data: { categoria_cod: '84' } })
    const before = await db.campaniaMaestro.count({ where: { campaniaId: main.id } })
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    await MaestroController(db).getUnoCampania({ params: { id: main.id, sku: skus[0] } }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.categoria_cod, '81')
    assert.equal(await db.campaniaMaestro.count({ where: { campaniaId: main.id } }), before)
  })

  await t.test('no se puede activar una segunda campaña mientras otra está activa', async () => {
    const second = await campaigns.crearCampaniaConSnapshot({ nombre: `Segunda ${run}`, ...dates })
    campaignIds.push(second.id)
    await assert.rejects(campaigns.activar(second.id), { code: 'ACTIVE_CAMPAIGN_EXISTS', status: 409 })
  })

  const accepted = await decisions.recordDecision({
    campaniaId: main.id, sku: skus[1], propuesta: { categoria_cod: '84' },
    decision: 'aceptar', decidedBy: 'r14', aplicarAhora: false,
  })
  await decisions.recordDecision({
    campaniaId: main.id, sku: skus[2], propuesta: { categoria_cod: '84' },
    decision: 'aceptar', decidedBy: 'r14', aplicarAhora: false,
  })
  await decisions.recordDecision({
    campaniaId: main.id, sku: skus[3], propuesta: { categoria_cod: '84' },
    decision: 'aceptar', decidedBy: 'r14', aplicarAhora: false,
  })
  const rejection = await decisions.recordDecision({
    campaniaId: main.id, sku: skus[3], propuesta: { categoria_cod: '84' },
    decision: 'rechazar', decidedBy: 'r14', aplicarAhora: false,
  })
  await db.skuStage.update({ where: { campaniaId_sku: { campaniaId: main.id, sku: skus[1] } }, data: { stage: 'consolidate' } })
  await db.skuStage.update({ where: { campaniaId_sku: { campaniaId: main.id, sku: skus[3] } }, data: { stage: 'consolidate' } })
  await db.unknownSku.createMany({ data: [
    { campaniaId: main.id, sku: skus[6], skuNormalized: skus[6], descripcion: 'Alta', categoria_cod: '81', tipo_cod: '82', clasif_cod: '83', status: 'APPROVED' },
    { campaniaId: main.id, sku: skus[7], skuNormalized: skus[7], descripcion: 'Rechazado', categoria_cod: '81', tipo_cod: '82', clasif_cod: '83', status: 'REJECTED' },
  ] })
  await db.skuStage.createMany({ data: [
    { campaniaId: main.id, sku: skus[6], stage: 'consolidate' },
    { campaniaId: main.id, sku: skus[7], stage: 'consolidate' },
  ] })

  await t.test('cierre aplica solo confirmados y conserva rechazos', async () => {
    const result = await closure.close({ campaniaId: main.id, closedBy: 'r14-admin' })
    assert.deepEqual(result, { alreadyClosed: false, applied: 1, unknownApplied: 1 })
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[1] } })).categoria_cod, '84')
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[2] } })).categoria_cod, '81')
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[3] } })).categoria_cod, '81')
    assert.equal((await db.actualizacion.findUnique({ where: { id: rejection.id } })).estado, 'rechazada')
    assert.ok(await db.unknownSku.findUnique({ where: { campaniaId_sku: { campaniaId: main.id, sku: skus[7] } } }))
    assert.ok(await db.maestro.findUnique({ where: { sku: skus[6] } }) )
    assert.equal(await db.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId: main.id, sku: skus[6] } } }), null)
    const closed = await db.campania.findUnique({ where: { id: main.id } })
    assert.equal(closed.estado, 'CERRADA')
    assert.equal(closed.activa, false)
    assert.ok(closed.closedAt)
  })

  await t.test('doble cierre es idempotente y campaña cerrada no se reactiva', async () => {
    const repeated = await closure.close({ campaniaId: main.id, closedBy: 'otro' })
    assert.equal(repeated.alreadyClosed, true)
    assert.equal(repeated.applied, 1)
    await assert.rejects(campaigns.activar(main.id), { code: 'CAMPAIGN_CLOSED', status: 409 })
  })

  await t.test('reversión compensa, enlaza y no modifica el evento original', async () => {
    const reversal = await decisions.revertApplied({ id: accepted.id, decidedBy: 'r14-admin' })
    assert.equal(reversal.estado, 'aplicada')
    assert.equal(reversal.reversalOfId, accepted.id)
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[1] } })).categoria_cod, '81')
    assert.equal((await db.actualizacion.findUnique({ where: { id: accepted.id } })).estado, 'aplicada')
    await assert.rejects(decisions.revertApplied({ id: accepted.id, decidedBy: 'r14-admin' }), {
      code: 'REVERSAL_ALREADY_EXISTS', status: 409,
    })
  })

  const rollbackCampaign = await campaigns.crearCampaniaConSnapshot({ nombre: `Rollback ${run}`, ...dates, activa: true })
  campaignIds.push(rollbackCampaign.id)
  const rollbackDecision = await decisions.recordDecision({
    campaniaId: rollbackCampaign.id, sku: skus[4], propuesta: { categoria_cod: '84' },
    decision: 'aceptar', decidedBy: 'r14', aplicarAhora: false,
  })
  await db.skuStage.update({ where: { campaniaId_sku: { campaniaId: rollbackCampaign.id, sku: skus[4] } }, data: { stage: 'consolidate' } })

  await t.test('fallo al finalizar cierre revierte maestro, decisión y campaña', async () => {
    const failing = {
      $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, {
        get(target, key) {
          if (key !== 'campania') return target[key]
          return new Proxy(target.campania, { get(delegate, operation) {
            if (operation !== 'update') return delegate[operation]
            return async args => {
              if (args.data?.estado === 'CERRADA') throw new Error('forced close failure')
              return delegate.update(args)
            }
          } })
        },
      })), options),
    }
    await assert.rejects(CampaignClosureService(failing).close({
      campaniaId: rollbackCampaign.id, closedBy: 'r14',
    }), /forced close failure/)
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[4] } })).categoria_cod, '81')
    assert.equal((await db.actualizacion.findUnique({ where: { id: rollbackDecision.id } })).estado, 'pendiente')
    assert.equal((await db.campania.findUnique({ where: { id: rollbackCampaign.id } })).estado, 'ACTIVA')
  })

  await closure.close({ campaniaId: rollbackCampaign.id, closedBy: 'r14' })

  const doubleCampaign = await campaigns.crearCampaniaConSnapshot({ nombre: `Doble ${run}`, ...dates, activa: true })
  campaignIds.push(doubleCampaign.id)
  const doubleDecision = await decisions.recordDecision({
    campaniaId: doubleCampaign.id, sku: skus[5], propuesta: { categoria_cod: '84' },
    decision: 'aceptar', decidedBy: 'r14', aplicarAhora: false,
  })
  await db.skuStage.update({ where: { campaniaId_sku: { campaniaId: doubleCampaign.id, sku: skus[5] } }, data: { stage: 'consolidate' } })

  await t.test('dos cierres concurrentes producen una sola aplicación', async () => {
    const results = await Promise.allSettled([
      closure.close({ campaniaId: doubleCampaign.id, closedBy: 'uno' }),
      closure.close({ campaniaId: doubleCampaign.id, closedBy: 'dos' }),
    ])
    assert.ok(results.some(result => result.status === 'fulfilled'))
    for (const result of results.filter(item => item.status === 'rejected')) {
      assert.equal(result.reason.code, 'CLOSE_CONFLICT')
    }
    assert.equal((await db.actualizacion.findUnique({ where: { id: doubleDecision.id } })).estado, 'aplicada')
    assert.equal(await db.actualizacion.count({ where: { id: doubleDecision.id, estado: 'aplicada' } }), 1)
    assert.equal((await db.maestro.findUnique({ where: { sku: skus[5] } })).categoria_cod, '84')
  })

  const raceCampaign = await campaigns.crearCampaniaConSnapshot({ nombre: `Carrera ${run}`, ...dates, activa: true })
  campaignIds.push(raceCampaign.id)

  await t.test('escaneo contra cierre termina completo o se rechaza sin escritura parcial', async () => {
    const scanPayload = {
      campaniaId: raceCampaign.id,
      idempotencyKey: `r14-race-${run}`,
      skuRaw: skus[8],
      email: 'r14@example.test',
      sucursal: 'TEST-R14',
      sugeridos: {},
    }
    const results = await Promise.allSettled([
      CampaignClosureService(db).close({ campaniaId: raceCampaign.id, closedBy: 'cierre' }),
      EscaneosService(db).crear(scanPayload),
    ])
    const closeResult = results[0]
    const scanResult = results[1]
    if (closeResult.status === 'rejected') {
      assert.equal(closeResult.reason.code, 'CLOSE_CONFLICT')
      await CampaignClosureService(db).close({ campaniaId: raceCampaign.id, closedBy: 'reintento' })
    }
    if (scanResult.status === 'rejected') {
      assert.ok(['CAMPAIGN_NOT_ACTIVE', 'SCAN_CONFLICT'].includes(scanResult.reason.code))
    }
    const scanCount = await db.escaneo.count({
      where: { campaniaId: raceCampaign.id, idempotencyKey: scanPayload.idempotencyKey },
    })
    assert.equal(scanCount, scanResult.status === 'fulfilled' ? 1 : 0)
    const closed = await db.campania.findUnique({ where: { id: raceCampaign.id } })
    assert.equal(closed.estado, 'CERRADA')
    assert.equal(closed.activa, false)
  })
})
