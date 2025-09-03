import { MaestroService } from '../services/maestro.service.js'
import { cleanSku } from '../utils/sku.js'
import { toCSV } from '../utils/csv.js'

export function MaestroController(prisma) {
  const svc = MaestroService(prisma)
  return {
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
      const count = await svc.upsertMaestro(items)
      res.json({ ok: true, count })
    },
    exportCSV: async (_req, res) => {
      const list = await prisma.maestro.findMany({ orderBy: { sku: 'asc' } })
      const rows = [['sku','descripcion','categoria_cod','tipo_cod','clasif_cod']]
      for (const m of list) rows.push([m.sku, m.descripcion, m.categoria_cod, m.tipo_cod, m.clasif_cod])
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="maestro.csv"')
      res.send(csv)
    },
  }
}
