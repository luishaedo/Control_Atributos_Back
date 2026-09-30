import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDicCSV, parseMaestroCSV } from '../src/utils/csvInput.js'

test('R1.1 CSV informa sufijo de SKU y guarda solo la base', () => {
  const [item] = parseMaestroCSV(Buffer.from(
    'Codigo,Descripcion,Categoria,Tipo,Clasificacion\nabc1#etiqueta,Prueba,1,02,3\n'))
  assert.equal(item.sku, 'ABC1')
  assert.deepEqual(item.skuWarning, {
    code: 'SKU_SUFFIX_IGNORED',
    skuRaw: 'abc1#etiqueta',
    skuNormalized: 'ABC1',
    separator: '#',
  })
})

test('R1.1 CSV rechaza códigos largos o contaminados sin truncarlos', () => {
  assert.throws(() => parseDicCSV(Buffer.from('Codigo,Descripcion\n123,Inválido\n')), error =>
    error.status === 400 && /no se truncó/.test(error.message))
  assert.throws(() => parseMaestroCSV(Buffer.from(
    'Codigo,Descripcion,Categoria,Tipo,Clasificacion\nABC1,Prueba,A-9,02,03\n')), error =>
    error.status === 400 && /Categoría/.test(error.message))
})
