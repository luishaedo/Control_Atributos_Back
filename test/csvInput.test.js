import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDicCSV, parseMaestroCSV, parseDicCSVReport, parseMaestroCSVReport } from '../src/utils/csvInput.js'

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

test('R3.1 CSV acepta encabezados canónicos exportables para round-trip', () => {
  const [dic] = parseDicCSV(Buffer.from('cod,nombre\n1,Categoría\n'))
  assert.deepEqual(dic, { cod: '01', nombre: 'Categoría' })

  const [item] = parseMaestroCSV(Buffer.from(
    'sku,descripcion,categoria_cod,tipo_cod,clasif_cod\nABC1,Prueba,1,02,3\n'))
  assert.deepEqual(item, {
    sku: 'ABC1',
    descripcion: 'Prueba',
    categoria_cod: '01',
    tipo_cod: '02',
    clasif_cod: '03',
  })
})

test('Importación CSV conserva filas válidas e informa las omitidas con fila y contenido', () => {
  const report = parseDicCSVReport(Buffer.from('cod,nombre\n1,Categoría\nABC,Inválido\n2,\n'))
  assert.equal(report.items.length, 1)
  assert.equal(report.items[0].cod, '01')
  assert.deepEqual(report.omittedRows.map(row => [row.row, row.field, row.reason]), [
    [3, 'cod', 'invalid_code'],
    [4, 'nombre', 'missing_name'],
  ])
  assert.deepEqual(report.omittedRows[0].raw, { cod: 'ABC', nombre: 'Inválido' })
})

test('CSV de maestro identifica SKU/código inválidos y duplicados sin descartar filas válidas', () => {
  const report = parseMaestroCSVReport(Buffer.from(
    'sku,descripcion,categoria_cod,tipo_cod,clasif_cod\nABC1,Ok,1,2,3\nABC2,Error,XX,2,3\nabc1,Duplicado,1,2,3\n'))
  assert.equal(report.items.length, 1)
  assert.equal(report.items[0].sourceRow, 2)
  assert.deepEqual(report.omittedRows.map(row => [row.row, row.field, row.reason]), [
    [3, 'categoria_cod', 'invalid_code'],
    [4, 'sku', 'duplicate_sku_in_file'],
  ])
})

test('Plantillas con encabezados canónicos vacías son parseables', () => {
  assert.deepEqual(parseDicCSVReport(Buffer.from('cod,nombre\n')).items, [])
  assert.deepEqual(parseMaestroCSVReport(Buffer.from('sku,descripcion,categoria_cod,tipo_cod,clasif_cod\n')).items, [])
})

test('CSV descargado de omitidas conserva formato reimportable aunque incluya columnas de motivo', () => {
  const report = parseDicCSVReport(Buffer.from('cod,nombre,_fila_origen,_campo,_motivo_omision\n02,Corregida,3,cod,Antes era inválida\n'))
  assert.equal(report.items[0].cod, '02')
  assert.equal(report.items[0].nombre, 'Corregida')
  assert.equal(report.omittedRows.length, 0)
})
