export function toCSV(rows) {
  const esc = (x) => {
    if (x == null) return ''
    const s = String(x)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const body = rows.map(r => r.map(esc).join(',')).join('\n')
  return '\ufeff' + body // BOM UTF-8 para Excel
}
