import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt)
const ROLES = new Set(['OPERADOR', 'REVISOR', 'ADMIN'])

function hours(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizeRole(value) {
  const role = String(value || '').trim().toUpperCase()
  return ROLES.has(role) ? role : ''
}

export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase()
}

export function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    nombre: user.nombre,
    rol: user.rol,
    activo: user.activo,
    mustChangePassword: user.mustChangePassword,
    sucursal: user.sucursal ? {
      id: user.sucursal.id,
      codigo: user.sucursal.codigo,
      nombre: user.sucursal.nombre,
    } : null,
  }
}

export function actorFromAuth(auth) {
  const user = auth?.user
  return user?.username || user?.nombre || 'unknown'
}

export function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(String(password || ''), salt, 64)
  return `scrypt:${salt}:${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, expectedHex] = String(stored || '').split(':')
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const derived = await scryptAsync(String(password || ''), salt, expected.length)
  const actual = Buffer.from(derived)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function IdentityService(prisma, env = process.env) {
  const sessionHours = hours(env.SESSION_TTL_HOURS, 8)

  async function createSession({ user, userAgent }) {
    const token = randomBytes(32).toString('base64url')
    const now = new Date()
    const expiresAt = new Date(now.getTime() + sessionHours * 60 * 60 * 1000)
    const session = await prisma.sesion.create({
      data: {
        tokenHash: hashToken(token),
        usuarioId: user.id,
        expiresAt,
        userAgent: userAgent || null,
        lastSeenAt: now,
      },
    })
    return { token, session, expiresAt }
  }

  return {
    async login({ username, password, userAgent }) {
      const normalized = normalizeUsername(username)
      if (!normalized || !password) {
        return { ok: false, status: 401, code: 'INVALID_CREDENTIALS' }
      }
      const user = await prisma.usuario.findUnique({
        where: { username: normalized },
        include: { sucursal: true },
      })
      if (!user?.activo || !(await verifyPassword(password, user.passwordHash))) {
        return { ok: false, status: 401, code: 'INVALID_CREDENTIALS' }
      }
      if (user.rol === 'OPERADOR' && !user.sucursal?.activa) {
        return { ok: false, status: 403, code: 'BRANCH_DISABLED' }
      }
      const { token, expiresAt } = await createSession({ user, userAgent })
      return { ok: true, token, expiresAt, user: publicUser(user) }
    },

    async authenticateToken(token) {
      if (!token || !prisma.sesion) return null
      const now = new Date()
      const session = await prisma.sesion.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { usuario: { include: { sucursal: true } } },
      })
      if (!session || session.revokedAt || session.expiresAt <= now) return null
      const user = session.usuario
      if (!user?.activo) return null
      if (user.rol === 'OPERADOR' && !user.sucursal?.activa) return null
      await prisma.sesion.update({
        where: { id: session.id },
        data: { lastSeenAt: now },
      })
      return { sessionId: session.id, user: publicUser(user) }
    },

    async revokeSession(sessionId) {
      if (!sessionId || !prisma.sesion) return
      await prisma.sesion.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    },

    async changePassword({ userId, sessionId, currentPassword, newPassword, requestId }) {
      if (!sessionId || !userId) return { ok: false, status: 403, code: 'SESSION_REQUIRED' }
      if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return { ok: false, status: 400, code: 'INVALID_PASSWORD_INPUT' }
      }
      try {
        return await prisma.$transaction(async (tx) => {
          const session = await tx.sesion.findUnique({ where: { id: sessionId }, select: { usuarioId: true, revokedAt: true, expiresAt: true } })
          if (!session || session.usuarioId !== userId || session.revokedAt || session.expiresAt <= new Date()) {
            return { ok: false, status: 403, code: 'SESSION_REQUIRED' }
          }
          const user = await tx.usuario.findUnique({ where: { id: userId }, select: { id: true, username: true, activo: true, passwordHash: true } })
          if (!user?.activo || !(await verifyPassword(currentPassword, user.passwordHash))) {
            return { ok: false, status: 400, code: 'INVALID_CURRENT_PASSWORD' }
          }
          if (await verifyPassword(newPassword, user.passwordHash)) {
            return { ok: false, status: 400, code: 'PASSWORD_UNCHANGED' }
          }
          const passwordHash = await hashPassword(newPassword)
          await tx.usuario.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } })
          await tx.sesion.updateMany({ where: { usuarioId: userId, revokedAt: null }, data: { revokedAt: new Date() } })
          await tx.cuentaAudit.create({ data: {
            actorId: user.id, actor: user.username, entidad: 'USUARIO', entidadId: user.id,
            accion: 'CAMBIAR_CLAVE_PROPIA', cambios: { passwordChanged: true }, requestId: requestId || null,
          } })
          return { ok: true }
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (error.code === 'P2034') return { ok: false, status: 409, code: 'PASSWORD_CONFLICT' }
        throw error
      }
    },
  }
}
