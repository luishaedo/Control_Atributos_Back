import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { EscaneosService } from '../src/services/escaneos.service.js'

// Explicit opt-in only. Never use DATABASE_URL or load .env for these tests.
const url = process.env.R12_TEST_DATABASE_URL

test('R1.2 PostgreSQL aislado: atomicidad, idempotencia y concurrencia', { skip: !url }, async t => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55439')
  assert.equal(parsed.pathname, '/r12_isolated')
  assert.equal(parsed.username, 'r13test')

  const db = new PrismaClient({ datasources: { db: { url } } })
  const run = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()
  const knownSku = `R12K${run}`
  const unknownSku = `R12U${run}`
  const campaign = await db.campania.create({ data: {
    nombre: `R12-${run}`, inicia: new Date(), termina: new Date(), activa: true,
    activatedOnce: true, estado: 'ACTIVA', activatedAt: new Date(),
  } })
  t.after(async () => {
    await db.campania.delete({ where: { id: campaign.id } })
    await db.maestro.deleteMany({ where: { sku: knownSku } })
    await db.dicCategoria.deleteMany({ where: { cod: '91' } })
    await db.dicTipo.deleteMany({ where: { cod: '92' } })
    await db.dicClasif.deleteMany({ where: { cod: '93' } })
    await db.$disconnect()
  })
  await Promise.all([
    db.dicCategoria.create({ data: { cod: '91', nombre: 'R12' } }),
    db.dicTipo.create({ data: { cod: '92', nombre: 'R12' } }),
    db.dicClasif.create({ data: { cod: '93', nombre: 'R12' } }),
    db.maestro.create({ data: {
      sku: knownSku, descripcion: 'Fixture R1.2', categoria_cod: '91', tipo_cod: '92', clasif_cod: '93',
    } }),
    db.campaniaMaestro.create({ data: {
      campaniaId: campaign.id, sku: knownSku, descripcion: 'Fixture R1.2',
      categoria_cod: '91', tipo_cod: '92', clasif_cod: '93',
    } }),
  ])

  const service = EscaneosService(db)
  const known = key => ({
    campaniaId: campaign.id, idempotencyKey: key, skuRaw: knownSku,
    email: 'r12-test', sucursal: 'centro', sugeridos: {},
  })
  const unknown = key => ({
    campaniaId: campaign.id, idempotencyKey: key, skuRaw: unknownSku,
    email: 'r12-test', sucursal: 'centro',
    sugeridos: { categoria_cod: '91', tipo_cod: '92', clasif_cod: '93' },
  })

  await t.test('dos solicitudes simultáneas con la misma clave crean un escaneo', async () => {
    const payload = { ...known(`same-${run}`), skuRaw: `${knownSku}#ETIQUETA` }
    const responses = await Promise.all([service.crear(payload), service.crear(payload)])
    assert.deepEqual(responses[0], responses[1])
    assert.equal(responses[0].warnings[0]?.code, 'SKU_SUFFIX_IGNORED')
    assert.equal(await db.escaneo.count({ where: {
      campaniaId: campaign.id, idempotencyKey: payload.idempotencyKey,
    } }), 1)
  })

  await t.test('misma clave con otro payload devuelve conflicto sin escribir', async () => {
    const payload = known(`conflict-${run}`)
    await service.crear(payload)
    await assert.rejects(service.crear({ ...payload, sucursal: 'norte' }), {
      code: 'SCAN_IDEMPOTENCY_CONFLICT', status: 409,
    })
    assert.equal(await db.escaneo.count({ where: {
      campaniaId: campaign.id, idempotencyKey: payload.idempotencyKey,
    } }), 1)
  })

  await t.test('fallo de etapa revierte escaneo, desconocido y contador', async () => {
    const payload = unknown(`rollback-${run}`)
    const failing = { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, {
      get(target, key) {
        if (key !== 'skuStage') return target[key]
        return new Proxy(target[key], { get(delegate, operation) {
          if (operation !== 'upsert') return delegate[operation]
          return async () => { throw new Error('forced stage failure') }
        } })
      },
    })), options),
    escaneo: db.escaneo,
    campaniaMaestro: db.campaniaMaestro,
    unknownSku: db.unknownSku,
    skuStage: db.skuStage,
    }
    await assert.rejects(EscaneosService(failing).crear(payload), /forced stage failure/)
    assert.equal(await db.escaneo.count({ where: { campaniaId: campaign.id, sku: unknownSku } }), 0)
    assert.equal(await db.unknownSku.count({ where: { campaniaId: campaign.id, sku: unknownSku } }), 0)
    assert.equal(await db.skuStage.count({ where: { campaniaId: campaign.id, sku: unknownSku } }), 0)
  })

  await t.test('replay desconocido no duplica ni incrementa seenCount', async () => {
    const payload = unknown(`unknown-${run}`)
    await service.crear(payload)
    await service.crear(payload)
    assert.equal(await db.escaneo.count({ where: { campaniaId: campaign.id, sku: unknownSku } }), 1)
    assert.equal((await db.unknownSku.findUnique({ where: {
      campaniaId_sku: { campaniaId: campaign.id, sku: unknownSku },
    } })).seenCount, 1)
  })

  await t.test('un nuevo escaneo conserva etapa consolidate', async () => {
    await db.skuStage.upsert({
      where: { campaniaId_sku: { campaniaId: campaign.id, sku: knownSku } },
      create: { campaniaId: campaign.id, sku: knownSku, stage: 'consolidate' },
      update: { stage: 'consolidate' },
    })
    await service.crear(known(`stage-${run}`))
    assert.equal((await db.skuStage.findUnique({ where: {
      campaniaId_sku: { campaniaId: campaign.id, sku: knownSku },
    } })).stage, 'consolidate')
  })

  await t.test('siete sucursales concurrentes conservan siete observaciones únicas', async () => {
    const payloads = Array.from({ length: 7 }, (_, index) => ({
      ...known(`branch-${index}-${run}`),
      sucursal: `sucursal-${index + 1}`,
      email: `operador-${index + 1}`,
    }))
    const firstAttempts = await Promise.allSettled(payloads.map(payload => service.crear(payload)))
    for (const [index, result] of firstAttempts.entries()) {
      if (result.status === 'fulfilled') continue
      assert.equal(result.reason.code, 'SCAN_CONFLICT')
      await service.crear(payloads[index])
    }
    assert.equal(await db.escaneo.count({ where: {
      campaniaId: campaign.id,
      idempotencyKey: { in: payloads.map(payload => payload.idempotencyKey) },
    } }), 7)
  })
})
