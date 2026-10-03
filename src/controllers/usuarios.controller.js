import { hashPassword, normalizeRole, normalizeUsername, publicUser } from '../services/identity.service.js'
import { sendAdminError } from '../utils/http.js'

function cleanText(value) {
  return String(value || '').trim()
}

function accountRule(message) {
  const error = new Error(message)
  error.code = 'ACCOUNT_RULE'
  return error
}

function handleAccountConflict(error, res) {
  if (error.code === 'ACCOUNT_RULE') return sendAdminError(res, 409, error.message)
  if (error.code === 'P2034') return sendAdminError(res, 409, 'Cambio concurrente de cuentas; actualizá y volvé a intentarlo')
  throw error
}

function changes(before, after, fields) {
  return Object.fromEntries(fields
    .filter((field) => before?.[field] !== after?.[field])
    .map((field) => [field, { anterior: before?.[field] ?? null, nuevo: after?.[field] ?? null }]))
}

function recordAudit(tx, req, entidad, entidadId, accion, cambios) {
  return tx.cuentaAudit.create({ data: {
    actorId: req.auth.user.id,
    actor: req.auth.user.username,
    entidad,
    entidadId,
    accion,
    cambios,
    requestId: req.id || null,
  } })
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
      const item = await prisma.$transaction(async (tx) => {
        const created = await tx.sucursal.create({ data: { codigo, nombre } })
        await recordAudit(tx, req, 'SUCURSAL', created.id, 'CREAR', { codigo, nombre, activa: true })
        return created
      })
      res.json({ ok: true, item })
    },

    updateSucursal: async (req, res) => {
      const id = cleanText(req.params?.id)
      const data = {}
      if (req.body?.codigo !== undefined) data.codigo = cleanText(req.body.codigo).toUpperCase()
      if (req.body?.nombre !== undefined) data.nombre = cleanText(req.body.nombre)
      if (req.body?.activa !== undefined) {
        if (typeof req.body.activa !== 'boolean') return sendAdminError(res, 400, 'activa debe ser booleano')
        data.activa = req.body.activa
      }
      if (!id || !Object.keys(data).length) return sendAdminError(res, 400, 'id y cambios requeridos')
      const item = await prisma.$transaction(async (tx) => {
        const previous = await tx.sucursal.findUnique({ where: { id }, select: { codigo: true, nombre: true, activa: true } })
        if (!previous) throw Object.assign(new Error('Sucursal no encontrada'), { code: 'P2025' })
        const updated = await tx.sucursal.update({ where: { id }, data })
        if (previous?.activa && !updated.activa) {
          await tx.sesion.updateMany({
            where: { usuario: { is: { sucursalId: id } }, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        }
        await recordAudit(tx, req, 'SUCURSAL', id, 'ACTUALIZAR', changes(previous, updated, ['codigo', 'nombre', 'activa']))
        return updated
      })
      res.json({ ok: true, item })
    },

    listUsuarios: async (_req, res) => {
      const users = await prisma.usuario.findMany({
        orderBy: { username: 'asc' },
        include: { sucursal: true },
      })
      res.json({ items: users.map(publicUser) })
    },

    listAuditoria: async (_req, res) => {
      const items = await prisma.cuentaAudit.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      })
      res.json({ items })
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
      if (rol === 'OPERADOR') {
        const branch = await prisma.sucursal.findUnique({ where: { id: sucursalId }, select: { activa: true } })
        if (!branch?.activa) return sendAdminError(res, 409, 'El operador requiere una sucursal activa')
      }
      const passwordHash = await hashPassword(password)
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.usuario.create({
          data: { username, nombre, rol, sucursalId, passwordHash, mustChangePassword: true },
          include: { sucursal: true },
        })
        await recordAudit(tx, req, 'USUARIO', created.id, 'CREAR', { username, nombre, rol, sucursalId, activo: true, mustChangePassword: true })
        return created
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
      if (req.body?.activo !== undefined) {
        if (typeof req.body.activo !== 'boolean') return sendAdminError(res, 400, 'activo debe ser booleano')
        data.activo = req.body.activo
      }
      if (req.body?.sucursalId !== undefined) data.sucursalId = cleanText(req.body.sucursalId) || null
      if (req.body?.password !== undefined) {
        const password = String(req.body.password || '')
        if (password.length < 8) return sendAdminError(res, 400, 'password debe tener al menos 8 caracteres')
        data.passwordHash = await hashPassword(password)
        data.mustChangePassword = true
      }
      if (!id || !Object.keys(data).length) return sendAdminError(res, 400, 'id y cambios requeridos')
      let user
      try {
        user = await prisma.$transaction(async (tx) => {
              const current = await tx.usuario.findUnique({ where: { id }, select: { nombre: true, rol: true, activo: true, sucursalId: true, mustChangePassword: true } })
              if (!current) throw Object.assign(new Error('Usuario no encontrado'), { code: 'P2025' })
              const nextRole = data.rol ?? current.rol
              const nextActive = data.activo ?? current.activo
              const nextBranchId = Object.hasOwn(data, 'sucursalId') ? data.sucursalId : current.sucursalId
              if (current.rol === 'ADMIN' && current.activo && (nextRole !== 'ADMIN' || !nextActive)) {
                const activeAdmins = await tx.usuario.count({ where: { rol: 'ADMIN', activo: true } })
                if (activeAdmins <= 1) throw accountRule('Debe quedar al menos un administrador activo')
              }
              if (nextRole === 'OPERADOR' && nextActive) {
                if (!nextBranchId) throw accountRule('El operador activo requiere una sucursal activa')
                const branch = await tx.sucursal.findUnique({ where: { id: nextBranchId }, select: { activa: true } })
                if (!branch?.activa) throw accountRule('El operador activo requiere una sucursal activa')
              }
              const updated = await tx.usuario.update({ where: { id }, data, include: { sucursal: true } })
              if (data.passwordHash || nextRole !== current.rol || nextActive !== current.activo || nextBranchId !== current.sucursalId) {
                await tx.sesion.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: new Date() } })
              }
              const cambios = changes(current, updated, ['nombre', 'rol', 'activo', 'sucursalId', 'mustChangePassword'])
              if (data.passwordHash) cambios.passwordReset = true
              await recordAudit(tx, req, 'USUARIO', id, 'ACTUALIZAR', cambios)
              return updated
            }, { isolationLevel: 'Serializable' })
      } catch (error) {
        return handleAccountConflict(error, res)
      }
      res.json({ ok: true, item: publicUser(user) })
    },
  }
}
