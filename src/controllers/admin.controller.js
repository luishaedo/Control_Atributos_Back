import { toCSV } from '../utils/csv.js'

export function AdminController(prisma) {
  return {
    ping: (_req, res) => res.json({ ok: true }),

    exportCategorias: async (_req, res) => {
      const list = await prisma.dicCategoria.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const { toCSV } = await import('../utils/csv.js')
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"')
      res.send(csv)
    },

    exportTipos: async (_req, res) => {
      const list = await prisma.dicTipo.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const { toCSV } = await import('../utils/csv.js')
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="tipos.csv"')
      res.send(csv)
    },

    exportClasif: async (_req, res) => {
      const list = await prisma.dicClasif.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const { toCSV } = await import('../utils/csv.js')
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="clasif.csv"')
      res.send(csv)
    },
  }
}
