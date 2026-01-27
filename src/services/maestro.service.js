import { cleanSku, pad2 } from '../utils/sku.js'

export function MaestroService(prisma) {
  const normalizeValue = (value) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  return {
    async upsertDiccionarios({ categorias = [], tipos = [], clasif = [] }) {
      for (const c of categorias) {
        await prisma.dicCategoria.upsert({ where: { cod: c.cod }, create: c, update: { nombre: c.nombre } })
      }
      for (const t of tipos) {
        await prisma.dicTipo.upsert({ where: { cod: t.cod }, create: t, update: { nombre: t.nombre } })
      }
      for (const cl of clasif) {
        await prisma.dicClasif.upsert({ where: { cod: cl.cod }, create: cl, update: { nombre: cl.nombre } })
      }
      return { categorias: categorias.length, tipos: tipos.length, clasif: clasif.length }
    },

    async upsertMaestro(items = []) {
      let count = 0
      for (const it of items) {
        if (!it?.sku) continue
        const sku = cleanSku(it.sku)
        const descripcion = normalizeValue(it.descripcion)
        const categoriaCod = normalizeValue(it.categoria_cod)
        const tipoCod = normalizeValue(it.tipo_cod)
        const clasifCod = normalizeValue(it.clasif_cod)
        const updateData = {}
        if (descripcion !== null) updateData.descripcion = descripcion
        if (categoriaCod !== null) updateData.categoria_cod = pad2(categoriaCod)
        if (tipoCod !== null) updateData.tipo_cod = pad2(tipoCod)
        if (clasifCod !== null) updateData.clasif_cod = pad2(clasifCod)
        if (Object.keys(updateData).length === 0) {
          const existing = await prisma.maestro.findUnique({ where: { sku } })
          if (!existing) {
            await prisma.maestro.create({
              data: {
                sku,
                descripcion: '',
                categoria_cod: '',
                tipo_cod: '',
                clasif_cod: '',
              }
            })
          }
        } else {
          await prisma.maestro.upsert({
            where: { sku },
            create: {
              sku,
              descripcion: descripcion ?? '',
              categoria_cod: categoriaCod !== null ? pad2(categoriaCod) : '',
              tipo_cod: tipoCod !== null ? pad2(tipoCod) : '',
              clasif_cod: clasifCod !== null ? pad2(clasifCod) : '',
            },
            update: updateData
          })
        }
        count++
      }
      return count
    },
  }
}
