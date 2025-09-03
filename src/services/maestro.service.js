import { cleanSku, pad2 } from '../utils/sku.js'

export function MaestroService(prisma) {
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
        await prisma.maestro.upsert({
          where: { sku: cleanSku(it.sku) },
          create: {
            sku: cleanSku(it.sku),
            descripcion: it.descripcion || '',
            categoria_cod: pad2(it.categoria_cod || ''),
            tipo_cod: pad2(it.tipo_cod || ''),
            clasif_cod: pad2(it.clasif_cod || ''),
          },
          update: {
            descripcion: it.descripcion || '',
            categoria_cod: pad2(it.categoria_cod || ''),
            tipo_cod: pad2(it.tipo_cod || ''),
            clasif_cod: pad2(it.clasif_cod || ''),
          }
        })
        count++
      }
      return count
    },
  }
}
