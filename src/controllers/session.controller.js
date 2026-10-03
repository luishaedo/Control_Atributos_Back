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

    changePassword: async (req, res) => {
      const result = await identity.changePassword({
        userId: req.auth?.user?.id,
        sessionId: req.auth?.sessionId,
        currentPassword: req.body?.currentPassword,
        newPassword: req.body?.newPassword,
        requestId: req.id,
      })
      if (!result.ok) {
        const messages = {
          SESSION_REQUIRED: 'Iniciá sesión con tu usuario para cambiar la contraseña',
          INVALID_PASSWORD_INPUT: 'Ingresá la contraseña actual y una nueva de al menos 8 caracteres',
          INVALID_CURRENT_PASSWORD: 'La contraseña actual no es correcta',
          PASSWORD_UNCHANGED: 'La nueva contraseña debe ser distinta de la actual',
          PASSWORD_CONFLICT: 'La cuenta cambió durante la operación; ingresá nuevamente',
        }
        return res.status(result.status).json({ error: messages[result.code], code: result.code, requestId: req.id })
      }
      res.clearCookie('cc_session', clearCookieOptions(env))
      return res.json({ ok: true, sessionsRevoked: true })
    },
  }
}
