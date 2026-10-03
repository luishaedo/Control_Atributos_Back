import { parse } from 'csv-parse/sync'
import { parseCode, parseSku } from './sku.js'

const norm = value => String(value ?? '').trim()

function decodeCSV(buffer) {
  const utf8Text = buffer.toString('utf8')
  if (!utf8Text.includes('\uFFFD')) {
    return { text: utf8Text.replace(/^\uFEFF/, ''), encoding: utf8Text.startsWith('\uFEFF') ? 'utf8-sig' : 'utf8' }
  }
  return { text: buffer.toString('latin1'), encoding: 'latin1' }
}

function parseWithAutoDelimiter(buffer) {
  const { text, encoding } = decodeCSV(buffer)
  const firstLine = (text.slice(0, 2000).split(/\r?\n/)[0] || '')
  const counts = [';', ',', '\t'].map(delimiter => [delimiter, [...firstLine].filter(char => char === delimiter).length])
  const [delimiter, count] = counts.sort((a, b) => b[1] - a[1])[0]
  const selectedDelimiter = count ? delimiter : ','
  const headers = parse(text, { bom: true, skip_empty_lines: true, trim: true, delimiter: selectedDelimiter, to_line: 1 })[0] || []
  let parsed
  try {
    parsed = parse(text, {
      bom: true,
      columns: true,
      info: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      delimiter: selectedDelimiter,
    })
  } catch {
    throw Object.assign(new Error('El CSV no se pudo leer. Revisá comillas, separadores y filas incompletas.'), {
      status: 400, code: 'INVALID_CSV_FORMAT',
    })
  }
  return { rows: parsed.map(({ record, info }) => ({ record, line: info.lines })), headers, delimiter: selectedDelimiter, encoding }
}

function val(obj, keys = []) {
  for (const key of keys) {
    const match = Object.keys(obj).find(header => header.trim().toLowerCase() === key.trim().toLowerCase())
    if (match !== undefined) return obj[match]
  }
  return undefined
}

function hasAnyHeader(headers, accepted) {
  const actual = new Set(headers.map(header => header.trim().toLowerCase()))
  return accepted.some(header => actual.has(header.toLowerCase()))
}

function rowIssue(line, rawRow, field, reason, message, value) {
  return { row: line, field, value: value ?? null, reason, message, raw: rawRow }
}

export function parseDicCSVReport(buffer) {
  const { rows, headers, delimiter, encoding } = parseWithAutoDelimiter(buffer)
  if (!hasAnyHeader(headers, ['cod', 'Código', 'Codigo']) || !hasAnyHeader(headers, ['nombre', 'Descripción', 'Descripcion'])) {
    const error = Object.assign(new Error('Encabezados de diccionario inválidos. Usá: cod,nombre'), { status: 400, code: 'INVALID_IMPORT_HEADERS' })
    throw error
  }
  const items = []
  const omittedRows = []
  const seenCodes = new Set()
  for (const { record, line } of rows) {
    const codRaw = val(record, ['cod', 'Código', 'Codigo'])
    const nombreRaw = val(record, ['nombre', 'Descripción', 'Descripcion'])
    const parsedCode = parseCode(codRaw)
    if (!parsedCode.valid) {
      omittedRows.push(rowIssue(line, record, 'cod', 'invalid_code', 'El código debe tener uno o dos dígitos; no se truncó el valor.', codRaw))
      continue
    }
    if (!norm(nombreRaw)) {
      omittedRows.push(rowIssue(line, record, 'nombre', 'missing_name', 'La descripción/nombre está vacío.', nombreRaw))
      continue
    }
    if (seenCodes.has(parsedCode.normalized)) {
      omittedRows.push(rowIssue(line, record, 'cod', 'duplicate_code_in_file', `El código ${parsedCode.normalized} ya aparece en una fila anterior.`, codRaw))
      continue
    }
    seenCodes.add(parsedCode.normalized)
    items.push({ cod: parsedCode.normalized, nombre: norm(nombreRaw), sourceRow: line })
  }
  return { items, omittedRows, delimiter, encoding }
}

export function parseMaestroCSVReport(buffer) {
  const { rows, headers } = parseWithAutoDelimiter(buffer)
  const headerGroups = [
    ['sku', 'SKU', 'Código', 'Codigo'],
    ['descripcion', 'Descripción', 'Descripcion'],
    ['categoria_cod', 'Categoría', 'Categoria'],
    ['tipo_cod', 'Tipo'],
    ['clasif_cod', 'Clasificación', 'Clasificacion'],
  ]
  if (headerGroups.some(group => !hasAnyHeader(headers, group))) {
    throw Object.assign(new Error('Encabezados de maestro inválidos. Usá: sku,descripcion,categoria_cod,tipo_cod,clasif_cod'), {
      status: 400, code: 'INVALID_IMPORT_HEADERS',
    })
  }
  const items = []
  const omittedRows = []
  const seenSkus = new Set()
  for (const { record, line } of rows) {
    const skuRaw = norm(val(record, ['sku', 'Código', 'Codigo']))
    const parsedSku = parseSku(skuRaw)
    if (!parsedSku.valid) {
      omittedRows.push(rowIssue(line, record, 'sku', 'invalid_sku', 'El SKU está vacío o tiene caracteres inválidos.', skuRaw))
      continue
    }
    const normalizedCodes = [
      ['categoria_cod', val(record, ['categoria_cod', 'Categoría', 'Categoria'])],
      ['tipo_cod', val(record, ['tipo_cod', 'Tipo'])],
      ['clasif_cod', val(record, ['clasif_cod', 'Clasificación', 'Clasificacion'])],
    ].map(([field, value]) => [field, value, parseCode(value)])
    const invalidCode = normalizedCodes.find(([, , parsed]) => !parsed.valid)
    if (invalidCode) {
      omittedRows.push(rowIssue(line, record, invalidCode[0], 'invalid_code', 'El código debe tener uno o dos dígitos, no estar vacío y no se truncó el valor.', invalidCode[1]))
      continue
    }
    if (seenSkus.has(parsedSku.normalized)) {
      omittedRows.push(rowIssue(line, record, 'sku', 'duplicate_sku_in_file', `El SKU ${parsedSku.normalized} ya aparece en una fila anterior.`, skuRaw))
      continue
    }
    seenSkus.add(parsedSku.normalized)
    items.push({
      sku: parsedSku.normalized,
      descripcion: norm(val(record, ['descripcion', 'Descripción', 'Descripcion'])),
      categoria_cod: normalizedCodes[0][2].normalized,
      tipo_cod: normalizedCodes[1][2].normalized,
      clasif_cod: normalizedCodes[2][2].normalized,
      sourceRow: line,
      rawRow: record,
      ...(parsedSku.hadSuffix ? { skuWarning: {
        code: 'SKU_SUFFIX_IGNORED', skuRaw, skuNormalized: parsedSku.normalized, separator: parsedSku.separator,
      } } : {}),
    })
  }
  return { items, omittedRows }
}

// Strict compatibility helpers for callers that require a wholly valid parse.
export function parseDicCSV(buffer) {
  const report = parseDicCSVReport(buffer)
  if (report.omittedRows.length) {
    const first = report.omittedRows[0]
    throw Object.assign(new Error(`Fila ${first.row} (${first.field}): ${first.message}`), { status: 400, code: 'INVALID_IMPORT_DATA', details: report.omittedRows })
  }
  return report.items.map(({ sourceRow, ...item }) => item)
}

export function parseMaestroCSV(buffer) {
  const report = parseMaestroCSVReport(buffer)
  if (report.omittedRows.length) {
    const first = report.omittedRows[0]
    const field = ({ categoria_cod: 'Categoría', tipo_cod: 'Tipo', clasif_cod: 'Clasificación' })[first.field] || first.field
    throw Object.assign(new Error(`Fila ${first.row} (${field}): ${first.message}`), { status: 400, code: 'INVALID_IMPORT_DATA', details: report.omittedRows })
  }
  return report.items.map(({ sourceRow, rawRow, ...item }) => item)
}
