import test from 'node:test'
import assert from 'node:assert/strict'
import { UsuariosController } from '../src/controllers/usuarios.controller.js'
import { IdentityService, publicUser, verifyPassword } from '../src/services/identity.service.js'

function request(body, id = 'u1') {
  return { params: { id }, body, id: 'request-1', auth: { user: { id: 'admin-1', username: 'admin' } } }
}

test('ACCOUNTS-01 list exposes account status without password hash', () => {
  const user = publicUser({ id: 'u1', username: 'ana', nombre: 'Ana', rol: 'ADMIN', activo: false, passwordHash: 'secret', sucursal: null })
  assert.equal(user.activo, false)
  assert.equal(JSON.stringify(user).includes('secret'), false)
})

test('ACCOUNTS-01 password reset writes hash and revokes sessions in one transaction', async () => {
  const events = []
  const prisma = {
    $transaction: async (callback) => callback({
      usuario: { findUnique: async () => ({ nombre: 'Ana', rol: 'OPERADOR', activo: true, sucursalId: 's1', mustChangePassword: false }), update: async ({ data }) => {
        events.push('password updated')
        assert.equal(await verifyPassword('nuevaClave123', data.passwordHash), true)
        return { id: 'u1', username: 'ana', nombre: 'Ana', rol: 'OPERADOR', activo: true, sucursalId: 's1', mustChangePassword: data.mustChangePassword, sucursal: null }
      } },
      sucursal: { findUnique: async () => ({ activa: true }) },
      sesion: { updateMany: async ({ where }) => {
        assert.equal(where.usuarioId, 'u1')
        events.push('sessions revoked')
      } },
      cuentaAudit: { create: async ({ data }) => {
        assert.deepEqual(data.cambios, { mustChangePassword: { anterior: false, nuevo: true }, passwordReset: true })
        events.push('audit recorded')
      } },
    }),
  }
  let response
  const res = { json: (body) => { response = body } }
  await UsuariosController(prisma).updateUsuario(request({ password: 'nuevaClave123' }), res)
  assert.deepEqual(events, ['password updated', 'sessions revoked', 'audit recorded'])
  assert.equal(response.item.username, 'ana')
  assert.equal(JSON.stringify(response).includes('nuevaClave123'), false)
})

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

function accountDb({ current, adminCount = 2, branchActive = true, transactionError } = {}) {
  const events = []
  const tx = {
    usuario: {
      findUnique: async () => current,
      count: async () => adminCount,
      update: async ({ data }) => {
        events.push('user updated')
        return { id: 'u1', username: 'ana', nombre: 'Ana', ...current, ...data, sucursal: null }
      },
    },
    sucursal: { findUnique: async () => ({ activa: branchActive }) },
    sesion: { updateMany: async () => { events.push('sessions revoked') } },
    cuentaAudit: { create: async ({ data }) => {
      assert.equal(data.actorId, 'admin-1')
      assert.equal(JSON.stringify(data).includes('passwordHash'), false)
      events.push('audit recorded')
    } },
  }
  const prisma = {
    $transaction: async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable')
      if (transactionError) throw transactionError
      return callback(tx)
    },
  }
  return { prisma, events }
}

test('ACCOUNTS-02 rejects deactivating or demoting the last active admin', async () => {
  for (const body of [{ activo: false }, { rol: 'REVISOR' }]) {
    const { prisma, events } = accountDb({ current: { rol: 'ADMIN', activo: true, sucursalId: null }, adminCount: 1 })
    const res = response()
    await UsuariosController(prisma).updateUsuario(request(body), res)
    assert.equal(res.statusCode, 409)
    assert.match(res.body.error, /administrador activo/)
    assert.deepEqual(events, [])
  }
})

test('ACCOUNTS-02 revokes sessions after role and status changes, and not after name edit', async () => {
  for (const body of [{ rol: 'REVISOR' }, { activo: false }, { sucursalId: 's2' }]) {
    const { prisma, events } = accountDb({ current: { rol: 'OPERADOR', activo: true, sucursalId: 's1' } })
    const res = response()
    await UsuariosController(prisma).updateUsuario(request(body), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(events, ['user updated', 'sessions revoked', 'audit recorded'])
  }
  const { prisma, events } = accountDb({ current: { nombre: 'Ana', rol: 'OPERADOR', activo: true, sucursalId: 's1' } })
  await UsuariosController(prisma).updateUsuario(request({ nombre: 'Ana' }), response())
  assert.deepEqual(events, ['user updated', 'audit recorded'])
})

test('ACCOUNTS-02 rejects active operator without an active branch', async () => {
  for (const branch of [null, 's2']) {
    const { prisma, events } = accountDb({ current: { rol: 'REVISOR', activo: true, sucursalId: null }, branchActive: false })
    const res = response()
    await UsuariosController(prisma).updateUsuario(request({ rol: 'OPERADOR', sucursalId: branch }), res)
    assert.equal(res.statusCode, 409)
    assert.deepEqual(events, [])
  }
})

test('ACCOUNTS-07 rejects empty account and branch fields before writing', async () => {
  let transactionCalls = 0
  const prisma = { $transaction: async () => { transactionCalls++ } }
  const controller = UsuariosController(prisma)
  for (const [action, body] of [
    ['updateSucursal', { codigo: '   ' }],
    ['updateSucursal', { nombre: '   ' }],
    ['updateUsuario', { nombre: '   ' }],
  ]) {
    const res = response()
    await controller[action](request(body), res)
    assert.equal(res.statusCode, 400)
    assert.match(res.body.error, /vacío/)
  }
  assert.equal(transactionCalls, 0)
})

test('ACCOUNTS-02 does not create an operator for an inactive branch', async () => {
  let created = false
  const prisma = {
    sucursal: { findUnique: async () => ({ activa: false }) },
    usuario: { create: async () => { created = true } },
  }
  const res = response()
  await UsuariosController(prisma).createUsuario({ body: { username: 'operador', nombre: 'Operador', rol: 'OPERADOR', sucursalId: 's1', password: 'claveNueva123' } }, res)
  assert.equal(res.statusCode, 409)
  assert.equal(created, false)
})

test('ACCOUNTS-02 reports serializable conflict without automatic retry', async () => {
  let calls = 0
  const prisma = { $transaction: async () => { calls++; throw Object.assign(new Error('conflict'), { code: 'P2034' }) } }
  const res = response()
  await UsuariosController(prisma).updateUsuario(request({ activo: false }), res)
  assert.equal(calls, 1)
  assert.equal(res.statusCode, 409)
})

test('ACCOUNTS-02 disabling a branch revokes its sessions', async () => {
  const events = []
  const prisma = { $transaction: async (callback) => callback({
    sucursal: { findUnique: async () => ({ codigo: 'CENTRO', nombre: 'Centro', activa: true }), update: async () => { events.push('branch disabled'); return { id: 's1', codigo: 'CENTRO', nombre: 'Centro', activa: false } } },
    sesion: { updateMany: async ({ where }) => { assert.equal(where.usuario.is.sucursalId, 's1'); events.push('sessions revoked') } },
    cuentaAudit: { create: async ({ data }) => { assert.deepEqual(data.cambios.activa, { anterior: true, nuevo: false }); events.push('audit recorded') } },
  }) }
  const res = response()
  await UsuariosController(prisma).updateSucursal(request({ activa: false }, 's1'), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(events, ['branch disabled', 'sessions revoked', 'audit recorded'])
})

test('ACCOUNTS-02 account and branch creation audit only allowed fields', async () => {
  const audit = []
  const tx = {
    sucursal: { create: async () => ({ id: 's1', codigo: 'CENTRO', nombre: 'Centro', activa: true }) },
    usuario: { create: async ({ data }) => ({ id: 'u1', ...data, activo: true, sucursal: null }) },
    cuentaAudit: { create: async ({ data }) => { audit.push(data) } },
  }
  const prisma = { $transaction: async (callback) => callback(tx) }
  await UsuariosController(prisma).createSucursal(request({ codigo: 'centro', nombre: 'Centro' }), response())
  await UsuariosController(prisma).createUsuario(request({ username: 'ana', nombre: 'Ana', rol: 'ADMIN', password: 'claveNueva123' }), response())
  assert.equal(audit.length, 2)
  assert.deepEqual(audit.map(({ entidad, accion }) => [entidad, accion]), [['SUCURSAL', 'CREAR'], ['USUARIO', 'CREAR']])
  assert.equal(audit[1].actorId, 'admin-1')
  assert.equal(audit[1].cambios.mustChangePassword, true)
  assert.doesNotMatch(JSON.stringify(audit), /claveNueva123|passwordHash/)
})

test('ACCOUNTS-03 refuses a session revoked after the HTTP authentication check', async () => {
  let userRead = false
  const prisma = { $transaction: async (callback) => callback({
    sesion: { findUnique: async () => ({ usuarioId: 'u1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }) },
    usuario: { findUnique: async () => { userRead = true } },
  }) }
  const result = await IdentityService(prisma).changePassword({ userId: 'u1', sessionId: 's1', currentPassword: 'anterior123', newPassword: 'nuevaClave456' })
  assert.equal(result.code, 'SESSION_REQUIRED')
  assert.equal(userRead, false)
})
