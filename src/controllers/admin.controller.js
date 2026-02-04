import { toCSV } from '../utils/csv.js'

export function AdminController(prisma) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
  const isProd = process.env.NODE_ENV === 'production'
  const cookieOptions = {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 8,
  }

  return {
    ping: (_req, res) => res.json({ ok: true }),

    login: (req, res) => {
      if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN no configurado en .env' })
      const token = String(req.body?.token || '')
      if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' })
      res.cookie('cc_admin_token', ADMIN_TOKEN, cookieOptions)
      return res.json({ ok: true })
    },

    logout: (_req, res) => {
      res.clearCookie('cc_admin_token', cookieOptions)
      return res.json({ ok: true })
    },

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
