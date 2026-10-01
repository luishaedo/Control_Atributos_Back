import test from 'node:test'
import assert from 'node:assert/strict'
import { EscaneosService } from '../src/services/escaneos.service.js'

function memoryPrisma({ known = true, initialStage = null, failStage = false } = {}) {
  let state = {
    scans: [],
    unknowns: [],
    stages: initialStage ? [{ campaniaId: 1, sku: 'SKU1', stage: initialStage }] : [],
    snapshots: known ? [{ campaniaId: 1, sku: 'SKU1', descripcion: 'Fixture', categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' }] : [],
  }
  const match = (row, key) => row.campaniaId === key.campaniaId && row.sku === key.sku
  const models = get => ({
    campania: { findUnique: async ({ where }) => where.id === 1 ? { id: 1, activa: true } : null },
    maestro: { findUnique: async () => null },
    campaniaMaestro: {
      findUnique: async ({ where }) => get().snapshots.find(row => match(row, where.campaniaId_sku)) || null,
      upsert: async () => assert.fail('snapshot inesperado'),
    },
    dicCategoria: { findUnique: async ({ where }) => where.cod === '01' ? where : null },
    dicTipo: { findUnique: async ({ where }) => where.cod === '01' ? where : null },
    dicClasif: { findUnique: async ({ where }) => where.cod === '01' ? where : null },
    escaneo: {
      findUnique: async ({ where }) => {
        const key = where.campaniaId_idempotencyKey
        return get().scans.find(row => row.campaniaId === key.campaniaId && row.idempotencyKey === key.idempotencyKey) || null
      },
      create: async ({ data }) => {
        const row = { id: get().scans.length + 1, ...structuredClone(data) }
        get().scans.push(row)
        return row
      },
    },
    unknownSku: {
      findUnique: async ({ where }) => get().unknowns.find(row => match(row, where.campaniaId_sku)) || null,
      create: async ({ data }) => {
        const row = { id: get().unknowns.length + 1, ...structuredClone(data) }
        get().unknowns.push(row)
        return row
      },
      update: async ({ where, data }) => {
        const row = get().unknowns.find(item => match(item, where.campaniaId_sku))
        Object.assign(row, structuredClone(data), {
          seenCount: data.seenCount?.increment ? row.seenCount + data.seenCount.increment : row.seenCount,
        })
        return row
      },
    },
    skuStage: {
      findUnique: async ({ where }) => get().stages.find(row => match(row, where.campaniaId_sku)) || null,
      upsert: async ({ where, create, update }) => {
        if (failStage) throw new Error('stage failure')
        let row = get().stages.find(item => match(item, where.campaniaId_sku))
        if (row) Object.assign(row, structuredClone(update))
        else { row = structuredClone(create); get().stages.push(row) }
        return row
      },
    },
  })
  const prisma = models(() => state)
  prisma.$transaction = async (fn, options) => {
    assert.equal(options.isolationLevel, 'Serializable')
    const working = structuredClone(state)
    const result = await fn(models(() => working))
    state = working
    return result
  }
  prisma.state = () => state
  return prisma
}

const knownPayload = {
  campaniaId: 1,
  idempotencyKey: 'scan-key-0001',
  skuRaw: 'SKU1',
  email: 'operador',
  sucursal: 'centro',
  sugeridos: {},
}

const unknownPayload = {
  ...knownPayload,
  skuRaw: 'NUEVO1',
  sugeridos: { categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' },
}

test('R1.2 replay idéntico devuelve el resultado sin una segunda escritura', async () => {
  const prisma = memoryPrisma()
  const service = EscaneosService(prisma)
  const first = await service.crear(knownPayload)
  const replay = await service.crear(knownPayload)
  assert.deepEqual(replay, first)
  assert.equal(prisma.state().scans.length, 1)
})

test('R1.2 reutilizar la clave con otro payload devuelve conflicto', async () => {
  const prisma = memoryPrisma()
  const service = EscaneosService(prisma)
  await service.crear(knownPayload)
  await assert.rejects(service.crear({ ...knownPayload, sucursal: 'norte' }), {
    code: 'SCAN_IDEMPOTENCY_CONFLICT', status: 409,
  })
  assert.equal(prisma.state().scans.length, 1)
})

test('R1.2 fallo posterior al insert revierte escaneo y etapa', async () => {
  const prisma = memoryPrisma({ failStage: true })
  await assert.rejects(EscaneosService(prisma).crear(knownPayload), /stage failure/)
  assert.equal(prisma.state().scans.length, 0)
  assert.equal(prisma.state().stages.length, 0)
})

test('R1.2 replay desconocido no duplica escaneo ni seenCount', async () => {
  const prisma = memoryPrisma({ known: false })
  const service = EscaneosService(prisma)
  await service.crear(unknownPayload)
  await service.crear(unknownPayload)
  assert.equal(prisma.state().scans.length, 1)
  assert.equal(prisma.state().unknowns.length, 1)
  assert.equal(prisma.state().unknowns[0].seenCount, 1)
})

test('R1.2 un nuevo escaneo no retrocede una etapa consolidada', async () => {
  const prisma = memoryPrisma({ initialStage: 'consolidate' })
  await EscaneosService(prisma).crear(knownPayload)
  assert.equal(prisma.state().stages[0].stage, 'consolidate')
})

test('R1.1 escaneo separa el sufijo y avisa qué identidad usó', async () => {
  const prisma = memoryPrisma()
  const response = await EscaneosService(prisma).crear({
    ...knownPayload,
    skuRaw: 'sku1#etiqueta',
  })
  assert.equal(response.skuNormalized, 'SKU1')
  assert.deepEqual(response.warnings, [{
    code: 'SKU_SUFFIX_IGNORED',
    field: 'skuRaw',
    separator: '#',
    skuNormalized: 'SKU1',
    message: 'Se usó el SKU base SKU1; el sufijo iniciado por # no forma parte de la identidad.',
  }])
})

test('R1.1 escaneo rechaza SKU inválido y códigos sin truncar', async () => {
  const service = EscaneosService(memoryPrisma())
  await assert.rejects(service.crear({ ...knownPayload, skuRaw: 'SKU-1' }), {
    code: 'INVALID_SKU', status: 400,
  })
  await assert.rejects(service.crear({
    ...knownPayload,
    idempotencyKey: 'invalid-code-format',
    sugeridos: { categoria_cod: '123' },
  }), { code: 'INVALID_CODE_FORMAT', status: 422 })
  await assert.rejects(service.crear({
    ...knownPayload,
    idempotencyKey: 'invalid-code-domain',
    sugeridos: { categoria_cod: '99' },
  }), { code: 'INVALID_DICTIONARY', status: 422 })
})
