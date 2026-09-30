import { parseCode, parseSku } from '../utils/sku.js'

export function MaestroService(prisma) {
  const normalizeValue = (value) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  return {
    async upsertDiccionarios({ categorias = [], tipos = [], clasif = [] }) {
      const normalizeEntries = (items, field) => items.map((item, index) => {
        const parsed = parseCode(item?.cod)
        if (!parsed.valid) {
          throw Object.assign(new Error(`${field}[${index}].cod debe tener uno o dos dígitos; no se truncó el valor`), {
            status: 400, code: 'INVALID_CODE_FORMAT',
          })
        }
        return { ...item, cod: parsed.normalized }
      })
      const normalizedCategorias = normalizeEntries(categorias, 'categorias')
      const normalizedTipos = normalizeEntries(tipos, 'tipos')
      const normalizedClasif = normalizeEntries(clasif, 'clasif')
      for (const c of normalizedCategorias) {
        await prisma.dicCategoria.upsert({ where: { cod: c.cod }, create: c, update: { nombre: c.nombre } })
      }
      for (const t of normalizedTipos) {
        await prisma.dicTipo.upsert({ where: { cod: t.cod }, create: t, update: { nombre: t.nombre } })
      }
      for (const cl of normalizedClasif) {
        await prisma.dicClasif.upsert({ where: { cod: cl.cod }, create: cl, update: { nombre: cl.nombre } })
      }
      return { categorias: normalizedCategorias.length, tipos: normalizedTipos.length, clasif: normalizedClasif.length }
    },

    async upsertMaestro(items = []) {
      let count = 0
      const skipped = []
      for (const it of items) {
        if (!it?.sku) continue
        const parsedSku = parseSku(it.sku)
        if (!parsedSku.valid) {
          skipped.push({ sku: it.sku, reason: 'invalid_sku' })
          continue
        }
        const sku = parsedSku.normalized
        const descripcion = normalizeValue(it.descripcion)
        const categoriaCod = normalizeValue(it.categoria_cod)
        const tipoCod = normalizeValue(it.tipo_cod)
        const clasifCod = normalizeValue(it.clasif_cod)
        const updateData = {}
        if (descripcion !== null) updateData.descripcion = descripcion
        const parsedCodes = Object.fromEntries([
          ['categoria_cod', categoriaCod], ['tipo_cod', tipoCod], ['clasif_cod', clasifCod],
        ].map(([field, value]) => [field, value === null ? null : parseCode(value)]))
        const invalidField = Object.entries(parsedCodes).find(([, parsed]) => parsed && !parsed.valid)?.[0]
        if (invalidField) {
          skipped.push({ sku, reason: `invalid_${invalidField}` })
          continue
        }
        if (categoriaCod !== null) updateData.categoria_cod = parsedCodes.categoria_cod.normalized
        if (tipoCod !== null) updateData.tipo_cod = parsedCodes.tipo_cod.normalized
        if (clasifCod !== null) updateData.clasif_cod = parsedCodes.clasif_cod.normalized
        if (Object.keys(updateData).length === 0) {
          skipped.push({ sku, reason: 'empty_payload' })
          continue
        }
        await prisma.maestro.upsert({
          where: { sku },
          create: {
            sku,
            descripcion: descripcion ?? '',
            categoria_cod: parsedCodes.categoria_cod?.normalized || '',
            tipo_cod: parsedCodes.tipo_cod?.normalized || '',
            clasif_cod: parsedCodes.clasif_cod?.normalized || '',
          },
          update: updateData
        })
        count++
      }
      return { count, skipped }
    },
  }
}
