import { MaestroService } from '../services/maestro.service.js'
import { cleanSku, pad2 } from '../utils/sku.js'
import { toCSV } from '../utils/csv.js'


export function MaestroController(prisma) {
  const svc = MaestroService(prisma)
  const normalizeCode = (value) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    if (!trimmed) return null
    return pad2(trimmed)
  }
  return {
    listar: async (req, res) => {
      const q = String(req.query.q || '').trim().toUpperCase()
      const page = Math.max(1, parseInt(req.query.page || '1', 10))
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '50', 10)))
      
      const where = q ? {
        OR: [
          { sku: { contains: q } },
          { descripcion: { contains: q } },
        ]
      } : {}

       const [items, total] = await Promise.all([
    prisma.maestro.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.maestro.count({ where })
  ])
  res.json({ page, pageSize, total, items })
},

    getUno: async (req, res) => {
      const sku = cleanSku(req.params.sku || '')
      if (!sku) return res.status(400).json({ error: 'SKU inválido' })
      const item = await prisma.maestro.findUnique({ where: { sku } })
      if (!item) return res.status(404).json({ error: 'No encontrado' })
      res.json(item)
    },
    importar: async (req, res) => {
      const { items = [] } = req.body || {}
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
      const invalidItems = []
      const categories = new Set()
      const types = new Set()
      const classifications = new Set()
      const normalizedItems = []

      for (const item of items) {
        const sku = cleanSku(item?.sku || '')
        const categoriaCod = normalizeCode(item?.categoria_cod)
        const tipoCod = normalizeCode(item?.tipo_cod)
        const clasifCod = normalizeCode(item?.clasif_cod)
        if (!sku || !categoriaCod || !tipoCod || !clasifCod) {
          invalidItems.push({
            sku: sku || item?.sku || null,
            reason: 'missing_fields',
          })
          continue
        }
        categories.add(categoriaCod)
        types.add(tipoCod)
        classifications.add(clasifCod)
        normalizedItems.push({
          ...item,
          sku,
          categoria_cod: categoriaCod,
          tipo_cod: tipoCod,
          clasif_cod: clasifCod,
        })
      }

      const [dicCats, dicTypes, dicClasif] = await Promise.all([
        prisma.dicCategoria.findMany({ where: { cod: { in: Array.from(categories) } } }),
        prisma.dicTipo.findMany({ where: { cod: { in: Array.from(types) } } }),
        prisma.dicClasif.findMany({ where: { cod: { in: Array.from(classifications) } } }),
      ])
      const dicCatSet = new Set(dicCats.map((c) => c.cod))
      const dicTypeSet = new Set(dicTypes.map((t) => t.cod))
      const dicClasifSet = new Set(dicClasif.map((c) => c.cod))

      const validItems = []
      for (const item of normalizedItems) {
        if (!dicCatSet.has(item.categoria_cod)) {
          invalidItems.push({ sku: item.sku, reason: 'invalid_categoria' })
          continue
        }
        if (!dicTypeSet.has(item.tipo_cod)) {
          invalidItems.push({ sku: item.sku, reason: 'invalid_tipo' })
          continue
        }
        if (!dicClasifSet.has(item.clasif_cod)) {
          invalidItems.push({ sku: item.sku, reason: 'invalid_clasif' })
          continue
        }
        validItems.push(item)
      }

      if (invalidItems.length) {
        return res.status(400).json({
          error: 'items inválidos',
          invalidCount: invalidItems.length,
          invalidItems,
        })
      }

      const { count, skipped } = await svc.upsertMaestro(validItems)
      const skippedMessage = skipped.length ? 'Artículos omitidos por datos vacíos' : null
      res.json({
        ok: true,
        count,
        skippedCount: skipped.length,
        skippedMessage,
        skipped
      })
    },
     exportCSV: async (_req, res) => {
      const list = await prisma.maestro.findMany({ orderBy: { sku: 'asc' } })
      const rows = [['sku','descripcion','categoria_cod','tipo_cod','clasif_cod']]
      for (const m of list) rows.push([m.sku, m.descripcion, m.categoria_cod, m.tipo_cod, m.clasif_cod])
      const { toCSV } = await import('../utils/csv.js')
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="maestro.csv"')
      res.send(csv)
    },

    listMissing: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return res.status(400).json({ error: 'campaniaId requerido' })
      }
      const items = await prisma.unknownSku.findMany({
        where: {
          campaniaId,
          OR: [{ status: { not: 'confirmed' } }, { status: null }],
        },
        orderBy: { updatedAt: 'desc' },
      })
      res.json({ items })
    },
  }
}
