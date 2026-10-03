import { IdentityService, actorFromAuth } from '../services/identity.service.js'

export function parseCookies(header = '') {
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

function isDevAuthBypassEnabled(env) {
  const raw = String(env.ADMIN_AUTH_BYPASS_DEV || '').trim().toLowerCase()
  return env.NODE_ENV !== 'production' && TRUTHY_VALUES.has(raw)
}

export function authAdmin(env = process.env) {
  const ADMIN_TOKEN = env.ADMIN_TOKEN || ''
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

function bearerToken(req) {
  const auth = req.headers.authorization || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

function legacyBootstrapAuth(req, env) {
  const ADMIN_TOKEN = env.ADMIN_TOKEN || ''
  if (!ADMIN_TOKEN) return null
  const cookies = parseCookies(req.headers.cookie || '')
  const token = bearerToken(req) || cookies.cc_admin_token || ''
  if (token !== ADMIN_TOKEN) return null
  return {
    sessionId: null,
    legacy: true,
    user: {
      id: 'bootstrap-admin',
      username: 'bootstrap-admin',
      nombre: 'Bootstrap Admin',
      rol: 'ADMIN',
      sucursal: null,
    },
  }
}

export function authSession({ prisma, env = process.env, roles = [], allowPasswordChange = false }) {
  const allowedRoles = new Set(roles.map(role => String(role).toUpperCase()))
  const identity = IdentityService(prisma, env)
  return async (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie || '')
    const token = bearerToken(req) || cookies.cc_session || ''
    let auth = await identity.authenticateToken(token)
    if (!auth) auth = legacyBootstrapAuth(req, env)
    if (!auth) return res.status(401).json({ error: 'No autorizado', code: 'UNAUTHORIZED', requestId: req.id })
    if (allowedRoles.size && !allowedRoles.has(auth.user.rol)) {
      return res.status(403).json({ error: 'Permiso insuficiente', code: 'FORBIDDEN', requestId: req.id })
    }
    if (!allowPasswordChange && auth.user.mustChangePassword) {
      return res.status(403).json({ error: 'Debés cambiar la contraseña antes de continuar', code: 'PASSWORD_CHANGE_REQUIRED', requestId: req.id })
    }
    req.auth = auth
    next()
  }
}

export function authAdminOrDevBypass({ prisma, env = process.env, roles = ['ADMIN'], allowPasswordChange = false }) {
  const strictAuth = authSession({ prisma, env, roles, allowPasswordChange })
  return (req, res, next) => {
    if (isDevAuthBypassEnabled(env)) {
      if (!bypassWarningShown) {
        bypassWarningShown = true
        console.warn('[SECURITY] ADMIN_AUTH_BYPASS_DEV habilitado: rutas admin sin auth (solo desarrollo).')
      }
      req.auth = {
        sessionId: null,
        legacy: true,
        user: {
          id: 'dev-bypass',
          username: 'dev-bypass',
          nombre: 'Dev Bypass',
          rol: 'ADMIN',
          sucursal: null,
        },
      }
      return next()
    }
    return strictAuth(req, res, next)
  }
}

export function bindServerActor(req, _res, next) {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const actor = actorFromAuth(req.auth)
    req.body.decidedBy = actor
    req.body.updatedBy = actor
    req.body.closedBy = actor
  }
  next()
}
