import { hashPassword, normalizeRole, normalizeUsername, publicUser } from '../services/identity.service.js'
import { sendAdminError } from '../utils/http.js'

function cleanText(value) {
  return String(value || '').trim()
}

export function UsuariosController(prisma) {
  return {
    listSucursales: async (_req, res) => {
      const items = await prisma.sucursal.findMany({ orderBy: { codigo: 'asc' } })
      res.json({ items })
    },

    createSucursal: async (req, res) => {
      const codigo = cleanText(req.body?.codigo).toUpperCase()
      const nombre = cleanText(req.body?.nombre)
      if (!codigo || !nombre) return sendAdminError(res, 400, 'codigo y nombre requeridos')
      const item = await prisma.sucursal.create({ data: { codigo, nombre } })
      res.json({ ok: true, item })
    },

    updateSucursal: async (req, res) => {
      const id = cleanText(req.params?.id)
      const data = {}
      if (req.body?.codigo !== undefined) data.codigo = cleanText(req.body.codigo).toUpperCase()
      if (req.body?.nombre !== undefined) data.nombre = cleanText(req.body.nombre)
      if (req.body?.activa !== undefined) data.activa = Boolean(req.body.activa)
      if (!id || !Object.keys(data).length) return sendAdminError(res, 400, 'id y cambios requeridos')
      const item = await prisma.sucursal.update({ where: { id }, data })
      res.json({ ok: true, item })
    },

    listUsuarios: async (_req, res) => {
      const users = await prisma.usuario.findMany({
        orderBy: { username: 'asc' },
        include: { sucursal: true },
      })
      res.json({ items: users.map(publicUser) })
    },

    createUsuario: async (req, res) => {
      const username = normalizeUsername(req.body?.username)
      const nombre = cleanText(req.body?.nombre)
      const rol = normalizeRole(req.body?.rol)
      const password = String(req.body?.password || '')
      const sucursalId = cleanText(req.body?.sucursalId) || null
      if (!username || !nombre || !rol || password.length < 8) {
        return sendAdminError(res, 400, 'username, nombre, rol y password de al menos 8 caracteres requeridos')
      }
      if (rol === 'OPERADOR' && !sucursalId) {
        return sendAdminError(res, 400, 'sucursalId requerido para OPERADOR')
      }
      const user = await prisma.usuario.create({
        data: {
          username,
          nombre,
          rol,
          sucursalId,
          passwordHash: await hashPassword(password),
        },
        include: { sucursal: true },
      })
      res.json({ ok: true, item: publicUser(user) })
    },

    updateUsuario: async (req, res) => {
      const id = cleanText(req.params?.id)
      const data = {}
      if (req.body?.nombre !== undefined) data.nombre = cleanText(req.body.nombre)
      if (req.body?.rol !== undefined) {
        const rol = normalizeRole(req.body.rol)
        if (!rol) return sendAdminError(res, 400, 'rol inválido')
        data.rol = rol
      }
      if (req.body?.activo !== undefined) data.activo = Boolean(req.body.activo)
      if (req.body?.sucursalId !== undefined) data.sucursalId = cleanText(req.body.sucursalId) || null
      if (req.body?.password !== undefined) {
        const password = String(req.body.password || '')
        if (password.length < 8) return sendAdminError(res, 400, 'password debe tener al menos 8 caracteres')
        data.passwordHash = await hashPassword(password)
        await prisma.sesion.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: new Date() } })
      }
      if (!id || !Object.keys(data).length) return sendAdminError(res, 400, 'id y cambios requeridos')
      const user = await prisma.usuario.update({ where: { id }, data, include: { sucursal: true } })
      res.json({ ok: true, item: publicUser(user) })
    },
  }
}
