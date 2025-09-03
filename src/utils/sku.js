export function cleanSku(raw = '') {
  return String(raw).trim().toUpperCase().replace(/\s+/g, '')
}
export function pad2(v = '') {
  const s = String(v || '').padStart(2, '0')
  return s.length > 2 ? s.slice(-2) : s
}
export function cumpleObjetivos(camp, snap) {
  // Si la campaña define objetivos por código, chequea coincidencia exacta
  if (camp?.categoria_objetivo_cod && camp.categoria_objetivo_cod !== snap?.categoria_cod) return false
  if (camp?.tipo_objetivo_cod && camp.tipo_objetivo_cod !== snap?.tipo_cod) return false
  if (camp?.clasif_objetivo_cod && camp.clasif_objetivo_cod !== snap?.clasif_cod) return false
  return true
}
