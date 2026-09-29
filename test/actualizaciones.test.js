import test from 'node:test'
import assert from 'node:assert/strict'
import { ActualizacionesService } from '../src/services/actualizaciones.service.js'
import { ActualizacionesController } from '../src/controllers/actualizaciones.controller.js'

const fields = ['categoria_cod', 'tipo_cod', 'clasif_cod']
function decision(id, field, overrides = {}) {
  return { id, ts: new Date(id * 1000), campaniaId: 1, sku: 'SKU', estado: 'pendiente', archivada: false,
    appliedAt: null, decidedBy: 'reviewer', ...Object.fromEntries(fields.flatMap(f => [
      [`old_${f}`, '01'], [`new_${f}`, f === field ? String(id + 1).padStart(2, '0') : ''],
    ])), ...overrides }
}
function fixture(acts, master = { sku: 'SKU', categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' }) {
  let state = { acts: structuredClone(acts), master: structuredClone(master) }
  let failClaim = false
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value)
  const prisma = { async $transaction(fn, options) {
    assert.equal(options.isolationLevel, 'Serializable')
    const draft = structuredClone(state)
    const result = await fn({
      actualizacion: {
        async findMany({ where, orderBy }) {
          const rows = draft.acts.filter(a => matches(a, where))
          const sign = orderBy[0].ts === 'asc' ? 1 : -1
          return structuredClone(rows.sort((a, b) => sign * (a.ts - b.ts || a.id - b.id)))
        },
        async updateMany({ where, data }) {
          if (failClaim) return { count: 0 }
          const rows = draft.acts.filter(a => matches(a, where))
          rows.forEach(a => Object.assign(a, data))
          return { count: rows.length }
        },
      },
      maestro: { async updateMany({ where, data }) {
        if (!draft.master || !matches(draft.master, where)) return { count: 0 }
        Object.assign(draft.master, data)
        return { count: 1 }
      } },
    })
    state = draft
    return result
  } }
  return { service: ActualizacionesService(prisma), get state() { return state }, failClaim() { failClaim = true } }
}

for (const order of [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]) {
  test(`preserves all three attributes in order ${order}`, async () => {
    const f = fixture(fields.map((field, i) => decision(i + 1, field)))
    for (const id of order) assert.deepEqual(await f.service.applyUpdates({ ids: [id] }), { count: 1 })
    assert.deepEqual(f.state.master, { sku: 'SKU', categoria_cod: '02', tipo_cod: '03', clasif_cod: '04' })
    assert.ok(f.state.acts.every(a => a.estado === 'aplicada' && a.appliedAt))
  })
}
test('batch patches multiple attributes and deduplicates request IDs', async () => {
  const f = fixture(fields.map((field, i) => decision(i + 1, field)))
  assert.deepEqual(await f.service.applyUpdates({ ids: [3, 1, 2, 1] }), { count: 3 })
  assert.deepEqual(fields.map(field => f.state.master[field]), ['02', '03', '04'])
})
test('stale attribute rejects complete batch without marking earlier rows applied', async () => {
  const f = fixture([decision(1, fields[0]), decision(2, fields[1])], {
    sku: 'SKU', categoria_cod: '01', tipo_cod: '99', clasif_cod: '01',
  })
  const before = structuredClone(f.state)
  await assert.rejects(f.service.applyUpdates({ ids: [1, 2] }), { status: 409, code: 'UPDATE_CONFLICT' })
  assert.deepEqual(f.state, before)
})
test('newer rejection supersedes acceptance; equal timestamps use ID tie-break', async () => {
  const f = fixture([decision(1, fields[0]), decision(2, fields[0], { estado: 'rechazada', ts: new Date(1000) })])
  await assert.rejects(f.service.applyUpdates({ ids: [1] }), { code: 'UPDATE_CONFLICT' })
  assert.equal(f.state.master.categoria_cod, '01')
})
test('archived, rejected, applied and missing IDs cannot silently succeed', async () => {
  for (const overrides of [{ archivada: true }, { estado: 'rechazada' }, { estado: 'aplicada' }, { appliedAt: new Date() }]) {
    const f = fixture([decision(1, fields[0], overrides)])
    await assert.rejects(f.service.applyUpdates({ ids: [1] }), { status: 409 })
  }
  await assert.rejects(fixture([]).service.applyUpdates({ ids: [9] }), { status: 409 })
})
test('missing master/baseline and empty decisions fail closed', async () => {
  await assert.rejects(fixture([decision(1, fields[0])], null).service.applyUpdates({ ids: [1] }), { status: 409 })
  for (const overrides of [{ old_categoria_cod: null }, { new_categoria_cod: '  ' }]) {
    await assert.rejects(fixture([decision(1, fields[0], overrides)]).service.applyUpdates({ ids: [1] }), { status: 409 })
  }
})
test('lost decision claim rolls back master patch', async () => {
  const f = fixture([decision(1, fields[0])]); f.failClaim()
  await assert.rejects(f.service.applyUpdates({ ids: [1] }), { status: 409 })
  assert.equal(f.state.master.categoria_cod, '01')
})
test('same attribute from different campaigns cannot be applied twice in one batch', async () => {
  const f = fixture([decision(1, fields[0]), decision(2, fields[0], { campaniaId: 2 })])
  await assert.rejects(f.service.applyUpdates({ ids: [1, 2] }), { status: 409 })
  assert.equal(f.state.master.categoria_cod, '01')
})
test('serialization conflict is reported without retrying', async () => {
  let calls = 0
  const service = ActualizacionesService({ $transaction: async () => { calls++; throw { code: 'P2034' } } })
  await assert.rejects(service.applyUpdates({ ids: [1] }), { code: 'UPDATE_CONFLICT', status: 409 })
  assert.equal(calls, 1)
})
test('invalid IDs are rejected before database access', async () => {
  const service = ActualizacionesService({})
  for (const ids of [[], [0], [-1], ['1'], [1.5], [null], '1']) {
    await assert.rejects(service.applyUpdates({ ids }), { status: 400 })
  }
})
test('controller preserves actionable 409 and correlation ID', async () => {
  const controller = ActualizacionesController({ $transaction: async () => { throw { code: 'P2034' } } })
  const response = { status(n) { this.statusCode = n; return this }, json(body) { this.body = body; return this } }
  await controller.aplicar({ body: { ids: [1] }, id: 'correlation' }, response)
  assert.equal(response.statusCode, 409)
  assert.equal(response.body.code, 'UPDATE_CONFLICT')
  assert.equal(response.body.requestId, 'correlation')
})
