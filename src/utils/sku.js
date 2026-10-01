export function parseSku(raw = '') {
  const value = String(raw ?? '').trim()
  const separatorIndex = value.search(/[#$]/)
  const base = separatorIndex >= 0 ? value.slice(0, separatorIndex) : value
  const separator = separatorIndex >= 0 ? value[separatorIndex] : null
  const suffix = separatorIndex >= 0 ? value.slice(separatorIndex + 1) : null
  const valid = /^[A-Za-z0-9]+$/.test(base)
  return {
    valid,
    normalized: valid ? base.toUpperCase() : '',
    separator,
    suffix,
    hadSuffix: separatorIndex >= 0,
    reason: valid ? null : (base ? 'INVALID_FORMAT' : 'REQUIRED'),
  }
}

export function cleanSku(raw = '') {
  return parseSku(raw).normalized
}

export function parseCode(value = '') {
  const raw = String(value ?? '').trim()
  const valid = /^\d{1,2}$/.test(raw)
  return {
    valid,
    normalized: valid ? raw.padStart(2, '0') : '',
    reason: valid ? null : (raw ? 'INVALID_FORMAT' : 'REQUIRED'),
  }
}

export function pad2(value = '') {
  return parseCode(value).normalized
}
export function cumpleObjetivos(camp, snap) {
  // Si la campaña define objetivos por código, chequea coincidencia exacta
  if (camp?.categoria_objetivo_cod && camp.categoria_objetivo_cod !== snap?.categoria_cod) return false
  if (camp?.tipo_objetivo_cod && camp.tipo_objetivo_cod !== snap?.tipo_cod) return false
  if (camp?.clasif_objetivo_cod && camp.clasif_objetivo_cod !== snap?.clasif_cod) return false
  return true
}
