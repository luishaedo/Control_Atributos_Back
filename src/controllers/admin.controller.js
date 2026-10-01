import { toCSV } from '../utils/csv.js'
import { IdentityService } from '../services/identity.service.js'

export function AdminController(prisma, env = process.env) {
  const ADMIN_TOKEN = env.ADMIN_TOKEN || ''
  const identity = IdentityService(prisma, env)
  const isProd = env.NODE_ENV === 'production'
  const cookieOptions = {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 8,
  }
  const clearCookieOptions = {
    httpOnly: cookieOptions.httpOnly,
    sameSite: cookieOptions.sameSite,
    secure: cookieOptions.secure,
  }

  return {
    ping: (req, res) => res.json({ ok: true, user: req.auth?.user || null }),

    login: async (req, res) => {
      const username = req.body?.username
      const password = req.body?.password
      if (username || password) {
        const result = await identity.login({
          username,
          password,
          userAgent: req.headers['user-agent'] || null,
        })
        if (!result.ok) {
          return res.status(result.status).json({
            error: result.status === 403 ? 'Permiso insuficiente' : 'No autorizado',
            code: result.code,
            requestId: req.id,
          })
        }
        res.cookie('cc_session', result.token, cookieOptions)
        return res.json({ ok: true, user: result.user, expiresAt: result.expiresAt })
      }

      if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN no configurado en .env' })
      const token = String(req.body?.token || '')
      if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED', requestId: req.id })
      res.cookie('cc_admin_token', ADMIN_TOKEN, cookieOptions)
      return res.json({
        ok: true,
        user: { id: 'bootstrap-admin', username: 'bootstrap-admin', nombre: 'Bootstrap Admin', rol: 'ADMIN', sucursal: null },
        bootstrap: true,
      })
    },

    logout: async (req, res) => {
      await identity.revokeSession(req.auth?.sessionId)
      res.clearCookie('cc_session', clearCookieOptions)
      res.clearCookie('cc_admin_token', clearCookieOptions)
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
