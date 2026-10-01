import test from 'node:test'
import assert from 'node:assert/strict'
import { MaestroController } from '../src/controllers/maestro.controller.js'

function fixture() {
  const rows = new Map()
  const dictionaries = {
    dicCategoria: [{ cod: '01', nombre: 'Categoría' }],
    dicTipo: [{ cod: '02', nombre: 'Tipo' }],
    dicClasif: [{ cod: '03', nombre: 'Clasificación' }],
  }
  const filterCodes = (items, args = {}) => {
    const requested = args.where?.cod?.in
    return requested ? items.filter(item => requested.includes(item.cod)) : items
  }
  const prisma = {
    $transaction: async fn => fn(prisma),
    ...Object.fromEntries(Object.entries(dictionaries).map(([model, items]) => [model, {
      findMany: async args => filterCodes(items, args),
      upsert: async () => assert.fail(`upsert inesperado en ${model}`),
    }])),
    maestro: {
      findUnique: async ({ where }) => rows.get(where.sku) || null,
      findMany: async () => [...rows.values()].sort((a, b) => a.sku.localeCompare(b.sku)),
      count: async () => rows.size,
      upsert: async ({ where, create, update }) => {
        const row = rows.has(where.sku) ? { ...rows.get(where.sku), ...update } : { ...create }
        rows.set(where.sku, row)
        return row
      },
    },
  }
  const response = () => ({
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
    setHeader(name, value) { this.headers[name] = value },
    send(body) { this.body = body; return this },
  })
  return { controller: MaestroController(prisma), response, rows }
}

test('R1.1 importación, lookup y exportación comparten la identidad SKU', async () => {
  const { controller, response, rows } = fixture()
  const imported = response()
  await controller.importar({ body: { items: [{
    sku: 'abc1$etiqueta', descripcion: 'Prueba',
    categoria_cod: '1', tipo_cod: '02', clasif_cod: '3',
  }] } }, imported)
  assert.equal(imported.statusCode, 200)
  assert.equal(imported.body.warningCount, 1)
  assert.equal(imported.body.warnings[0].code, 'SKU_SUFFIX_IGNORED')
  assert.deepEqual(rows.get('ABC1'), {
    sku: 'ABC1', descripcion: 'Prueba', categoria_cod: '01', tipo_cod: '02', clasif_cod: '03',
  })

  const lookup = response()
  await controller.getUno({ params: { sku: 'abc1#otra-etiqueta' } }, lookup)
  assert.equal(lookup.statusCode, 200)
  assert.equal(lookup.body.sku, 'ABC1')

  const exported = response()
  await controller.exportCSV({}, exported)
  assert.match(exported.body, /ABC1,Prueba,01,02,03/)
  assert.doesNotMatch(exported.body, /etiqueta/)
})

test('R1.1 importación rechaza código inválido sin truncar ni escribir', async () => {
  const { controller, response, rows } = fixture()
  const result = response()
  await controller.importar({ body: { items: [{
    sku: 'ABC2', descripcion: 'Inválido',
    categoria_cod: '123', tipo_cod: '02', clasif_cod: '03',
  }] } }, result)
  assert.equal(result.statusCode, 400)
  assert.equal(result.body.invalidItems[0].reason, 'invalid_code_or_missing_fields')
  assert.equal(rows.size, 0)
})

test('R3.1 importación de maestro rechaza lote completo antes de escribir parcialmente', async () => {
  const { controller, response, rows } = fixture()
  const result = response()
  await controller.importar({ body: { items: [
    { sku: 'ABC1', descripcion: 'Válido', categoria_cod: '01', tipo_cod: '02', clasif_cod: '03' },
    { sku: 'ABC2', descripcion: 'Inválido', categoria_cod: '99', tipo_cod: '02', clasif_cod: '03' },
  ] } }, result)
  assert.equal(result.statusCode, 400)
  assert.equal(result.body.code, 'INVALID_DICTIONARY')
  assert.equal(result.body.invalidCount, 1)
  assert.equal(rows.size, 0)
})

test('R3.1 importación de maestro rechaza SKUs duplicados del mismo lote', async () => {
  const { controller, response, rows } = fixture()
  const result = response()
  await controller.importar({ body: { items: [
    { sku: 'ABC1', descripcion: 'Primero', categoria_cod: '01', tipo_cod: '02', clasif_cod: '03' },
    { sku: 'abc1#etiqueta', descripcion: 'Duplicado', categoria_cod: '01', tipo_cod: '02', clasif_cod: '03' },
  ] } }, result)
  assert.equal(result.statusCode, 400)
  assert.equal(result.body.code, 'INVALID_IMPORT_DATA')
  assert.equal(result.body.invalidItems[0].reason, 'duplicate_sku_in_batch')
  assert.equal(rows.size, 0)
})
