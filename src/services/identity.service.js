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
  }
}
