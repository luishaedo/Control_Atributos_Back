// src/utils/csvInput.js
import { parse } from 'csv-parse/sync'
import { parseCode, parseSku } from './sku.js'

const norm = (s='') => String(s).trim()
const validationError = message => Object.assign(new Error(message), { status: 400, code: 'INVALID_IMPORT_DATA' })

function decodeCSV(buffer) {
  const utf8Text = buffer.toString('utf8')
  const hasReplacement = utf8Text.includes('\uFFFD')
  if (!hasReplacement) {
    if (utf8Text.startsWith('\uFEFF')) {
      return { text: utf8Text.slice(1), encoding: 'utf8-sig' }
    }
    return { text: utf8Text, encoding: 'utf8' }
  }

  const latin1Text = buffer.toString('latin1')
  return { text: latin1Text, encoding: 'latin1' }
}

// Detecta delimitador por la 1ra línea
function sniffDelimiter(text) {
  const head = text.slice(0, 2000)
  const firstLine = (head.split(/\r?\n/)[0] || '')
  const counts = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length
  }
  // prioriza el que más aparece
  const best = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]
  return (best && best[1] > 0) ? best[0] : ','
}

function parseWithAutoDelimiter(buffer) {
  const { text, encoding } = decodeCSV(buffer)
  const delimiter = sniffDelimiter(text)
  const rows = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    delimiter
  })
  return { rows, delimiter, encoding }
}

// Normaliza claves de encabezado para soportar variantes y espacios
function val(obj, keys=[]) {
  for (const k of keys) {
    if (k in obj) return obj[k]
    const kTrim = String(k).trim()
    for (const kk of Object.keys(obj)) {
      if (String(kk).trim().toLowerCase() === kTrim.toLowerCase()) return obj[kk]
    }
  }
  return undefined
}

export function parseDicCSV(buffer) {
  const { rows, delimiter, encoding } = parseWithAutoDelimiter(buffer)
  const headerKeys = Object.keys(rows[0] || {})
  return rows.map((r,i) => {
    const codigo = val(r, ['Código','Codigo','codigo','CODIGO','cod','COD'])
    const desc   = val(r, ['Descripción','Descripcion','descripcion','DESCRIPCION','nombre','Nombre','NOMBRE'])
    const parsedCode = parseCode(codigo)
    if (!parsedCode.valid) {
      throw validationError(
        `Fila ${i+2}: "Código" debe tener uno o dos dígitos; no se truncó el valor. ` +
        `Encabezados fila 1: ${headerKeys.join(', ')}. ` +
        `Encoding: ${encoding}. ` +
        `Delimiter: "${delimiter}"`
      )
    }
    return { cod: parsedCode.normalized, nombre: norm(desc || '') }
  })
}

export function parseMaestroCSV(buffer) {
  const { rows } = parseWithAutoDelimiter(buffer)
  return rows.map((r,i) => {
    const skuRaw = norm(val(r, ['SKU','sku','Código','Codigo','codigo','CODIGO']) || '')
    const parsedSku = parseSku(skuRaw)
    if (!parsedSku.valid) throw validationError(`Fila ${i+2}: SKU inválido; se admite una base alfanumérica y sufijo opcional #/$`)
    const desc = val(r, ['Descripción','Descripcion','descripcion','DESCRIPCION']) || ''
    const cat  = val(r, ['categoria_cod','Categoría','Categoria','categoria','CATEGORIA'])
    const tip  = val(r, ['tipo_cod','Tipo','tipo','TIPO'])
    const cla  = val(r, ['clasif_cod','Clasificación','Clasificacion','clasificacion','CLASIFICACION'])

    const parsedCodes = [
      ['Categoría', parseCode(cat)],
      ['Tipo', parseCode(tip)],
      ['Clasificación', parseCode(cla)],
    ]
    const invalidCode = parsedCodes.find(([, parsed]) => !parsed.valid)
    if (invalidCode) {
      throw validationError(`Fila ${i+2}: ${invalidCode[0]} debe tener uno o dos dígitos; no se truncó el valor`)
    }

    return {
      sku: parsedSku.normalized,
      descripcion: norm(desc),
      categoria_cod: parsedCodes[0][1].normalized,
      tipo_cod: parsedCodes[1][1].normalized,
      clasif_cod: parsedCodes[2][1].normalized,
      ...(parsedSku.hadSuffix ? { skuWarning: {
        code: 'SKU_SUFFIX_IGNORED',
        skuRaw,
        skuNormalized: parsedSku.normalized,
        separator: parsedSku.separator,
      } } : {}),
    }
  })
}
