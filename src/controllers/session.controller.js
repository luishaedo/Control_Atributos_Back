import { IdentityService } from '../services/identity.service.js'

function sessionCookieOptions(env = process.env) {
  const isProd = env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 8,
  }
}

function clearCookieOptions(env = process.env) {
  const options = sessionCookieOptions(env)
  return {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
  }
}

export function SessionController(prisma, env = process.env) {
  const identity = IdentityService(prisma, env)

  return {
    current: (req, res) => {
      res.json({ ok: true, user: req.auth?.user || null })
    },

    login: async (req, res) => {
      const result = await identity.login({
        username: req.body?.username,
        password: req.body?.password,
        userAgent: req.headers['user-agent'] || null,
      })
      if (!result.ok) {
        return res.status(result.status).json({
          error: result.status === 403 ? 'Permiso insuficiente' : 'No autorizado',
          code: result.code,
          requestId: req.id,
        })
      }
      res.cookie('cc_session', result.token, sessionCookieOptions(env))
      return res.json({ ok: true, user: result.user, expiresAt: result.expiresAt })
    },

    logout: async (req, res) => {
      await identity.revokeSession(req.auth?.sessionId)
      res.clearCookie('cc_session', clearCookieOptions(env))
      return res.json({ ok: true })
    },
  }
}
