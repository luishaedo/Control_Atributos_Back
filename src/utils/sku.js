export function cleanSku(raw = '') {
  if (!raw) return ''
  const m = raw.match(/^[A-Za-z0-9]+/)
  return (m ? m[0] : '').toUpperCase()
}
export function pad2(x) {
  if (x === null || x === undefined) return ''
  const soloDigitos = String(x).replace(/\D/g, '')
  return soloDigitos.padStart(2, '0')
}
export function cumpleObjetivos(camp, maestro) {
  if (!camp || !maestro) return true
  const catOK = !camp.categoria_objetivo_cod || pad2(maestro.categoria_cod) === pad2(camp.categoria_objetivo_cod)
  const tipoOK = !camp.tipo_objetivo_cod || pad2(maestro.tipo_cod) === pad2(camp.tipo_objetivo_cod)
  const claOK  = !camp.clasif_objetivo_cod || pad2(maestro.clasif_cod) === pad2(camp.clasif_objetivo_cod)
  return catOK && tipoOK && claOK
}
