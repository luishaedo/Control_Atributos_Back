function parseCookies(header = '') {
  return header
    .split(';')
    .map(p => p.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=')
      if (idx === -1) return acc
      const key = part.slice(0, idx).trim()
      const value = part.slice(idx + 1)
      if (key) acc[key] = decodeURIComponent(value)
      return acc
    }, {})
}

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on'])
let bypassWarningShown = false

function isDevAuthBypassEnabled() {
  const raw = String(process.env.ADMIN_AUTH_BYPASS_DEV || '').trim().toLowerCase()
  return process.env.NODE_ENV !== 'production' && TRUTHY_VALUES.has(raw)
}

export function authAdmin() {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
  return (req, res, next) => {
    if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN no configurado en .env' })
    const auth = req.headers.authorization || ''
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const cookies = parseCookies(req.headers.cookie || '')
    const cookieToken = cookies.cc_admin_token || ''
    const token = bearer || cookieToken
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' })
    next()
  }
}

export function authAdminOrDevBypass() {
  const strictAuth = authAdmin()
  return (req, res, next) => {
    if (isDevAuthBypassEnabled()) {
      if (!bypassWarningShown) {
        bypassWarningShown = true
        console.warn('[SECURITY] ADMIN_AUTH_BYPASS_DEV habilitado: rutas admin sin auth (solo desarrollo).')
      }
      return next()
    }
    return strictAuth(req, res, next)
  }
}
