import test from 'node:test'
import assert from 'node:assert/strict'
import { ImportService } from '../src/services/import.service.js'

function fixture() {
  const data = { dicCategoria: new Map(), dicTipo: new Map(), dicClasif: new Map(), maestro: new Map() }
  const dictionaryModel = model => ({
    upsert: async ({ where, create, update }) => {
      const current = data[model].get(where.cod)
      data[model].set(where.cod, current ? { ...current, ...update } : create)
    },
    findMany: async ({ where }) => [...data[model].values()].filter(item => where.cod.in.includes(item.cod)),
  })
  const prisma = {
    $transaction: async callback => callback(prisma),
    dicCategoria: dictionaryModel('dicCategoria'),
    dicTipo: dictionaryModel('dicTipo'),
    dicClasif: dictionaryModel('dicClasif'),
    maestro: {
      upsert: async ({ where, create, update }) => {
        const current = data.maestro.get(where.sku)
        data.maestro.set(where.sku, current ? { ...current, ...update } : create)
      },
    },
  }
  return { service: ImportService(prisma), data }
}

test('importación por archivo omite filas malas por cada diccionario y carga las válidas', async () => {
  const { service, data } = fixture()
  const result = await service.importarDiccionariosDesdeBuffers({
    categoriasBuf: Buffer.from('cod,nombre\n01,Categoría válida\nSKU123,Artículo mezclado\n'),
    tiposBuf: Buffer.from('cod,nombre\n02,Tipo válido\n'),
  })
  assert.equal(result.categorias, 1)
  assert.equal(result.tipos, 1)
  assert.equal(result.omittedRows.categorias.length, 1)
  assert.equal(result.omittedRows.categorias[0].row, 3)
  assert.equal(result.omittedRows.tipos.length, 0)
  assert.equal(data.dicCategoria.has('01'), true)
  assert.equal(data.dicCategoria.has('SKU123'), false)
  assert.equal(data.dicTipo.has('02'), true)
})

test('importación CSV de maestro carga las válidas y omite referencias inexistentes', async () => {
  const { service, data } = fixture()
  await service.importarDiccionariosDesdeBuffers({
    categoriasBuf: Buffer.from('cod,nombre\n01,Categoría\n'),
    tiposBuf: Buffer.from('cod,nombre\n02,Tipo\n'),
    clasifBuf: Buffer.from('cod,nombre\n03,Clasificación\n'),
  })
  const result = await service.importarMaestroDesdeBuffer(Buffer.from(
    'sku,descripcion,categoria_cod,tipo_cod,clasif_cod\nABC1,Válido,01,02,03\nABC2,Inválido,99,02,03\n'))
  assert.equal(result.count, 1)
  assert.equal(result.omittedRows.length, 1)
  assert.equal(result.omittedRows[0].row, 3)
  assert.match(result.omittedRows[0].message, /no existe en el diccionario/)
  assert.equal(data.maestro.has('ABC1'), true)
  assert.equal(data.maestro.has('ABC2'), false)
})
