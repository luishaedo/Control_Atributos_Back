// src/utils/csvInput.js
import { parse } from 'csv-parse/sync'

const norm = (s='') => String(s).trim()

const pad2 = (v='') => {
  const s = String(v || '').trim()
  if (s === '') return ''
  const n = Number(s)
  if (!Number.isNaN(n)) return String(n).padStart(2, '0').slice(-2)
  return s.padStart(2, '0').slice(-2)
}

// Detecta delimitador por la 1ra línea
function sniffDelimiter(buf) {
  const head = buf.subarray(0, 2000).toString('utf8')
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
  const delimiter = sniffDelimiter(buffer)
  return parse(buffer, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    delimiter
  })
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
  const rows = parseWithAutoDelimiter(buffer)
  return rows.map((r,i) => {
    const codigo = val(r, ['Código','Codigo','codigo','CODIGO','Código ','Codigo ','codigo ','CODIGO '])
    const desc   = val(r, ['Descripción','Descripcion','descripcion','DESCRIPCION','Descripción ','Descripcion ','descripcion ','DESCRIPCION '])
    const cod = pad2(codigo)
    if (!cod) throw new Error(`Fila ${i+2}: diccionario sin "Código"`)
    return { cod, nombre: norm(desc || '') }
  })
}

export function parseMaestroCSV(buffer) {
  const rows = parseWithAutoDelimiter(buffer)
  return rows.map((r,i) => {
    const sku  = norm(val(r, ['Código','Codigo','codigo','CODIGO','Código ','Codigo ','codigo ','CODIGO ']) || '')
    if (!sku) throw new Error(`Fila ${i+2}: maestro sin "Código" (SKU)`)
    const desc = val(r, ['Descripción','Descripcion','descripcion','DESCRIPCION','Descripción ','Descripcion ','descripcion ','DESCRIPCION ']) || ''
    const cat  = val(r, ['Categoría','Categoria','categoria','CATEGORIA','Categoría ','Categoria ','categoria ','CATEGORIA '])
    const tip  = val(r, ['Tipo','tipo','TIPO','Tipo ','tipo ','TIPO '])
    const cla  = val(r, ['Clasificación','Clasificacion','clasificacion','CLASIFICACION','Clasificación ','Clasificacion ','clasificacion ','CLASIFICACION '])

    return {
      sku,
      descripcion: norm(desc),
      categoria_cod: pad2(cat),
      tipo_cod:      pad2(tip),
      clasif_cod:    pad2(cla),
    }
  })
}
