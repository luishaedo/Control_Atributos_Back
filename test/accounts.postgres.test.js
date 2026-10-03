import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { PrismaClient } from '@prisma/client'
import { UsuariosController } from '../src/controllers/usuarios.controller.js'
import { IdentityService, hashPassword, verifyPassword } from '../src/services/identity.service.js'
import { createApp } from '../src/app.js'

// Explicit opt-in for a fresh local cluster. Never use DATABASE_URL or load .env.
const url = process.env.ACCOUNTS_TEST_DATABASE_URL

function barrier() {
  let arrivals = 0
  let release
  const ready = new Promise((resolve) => { release = resolve })
  return async () => { if (++arrivals === 2) release(); await ready }
}

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body } }
}

test('ACCOUNTS-02 PostgreSQL aislado: dos administradores no pueden degradarse a la vez', { skip: !url }, async (t) => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55440')
  assert.equal(parsed.pathname, '/accounts_isolated')
  assert.equal(parsed.username, 'accountstest')

  const db = new PrismaClient({ datasources: { db: { url } } })
  const prefix = `acct${randomUUID().replaceAll('-', '').slice(0, 12)}`
  const ids = []
  t.after(async () => {
    if (ids.length) {
      await db.cuentaAudit.deleteMany({ where: { entidad: 'USUARIO', entidadId: { in: ids } } })
      await db.sesion.deleteMany({ where: { usuarioId: { in: ids } } })
      await db.usuario.deleteMany({ where: { id: { in: ids } } })
    }
    await db.$disconnect()
  })
  assert.equal(await db.usuario.count(), 0, 'La base de prueba debe estar vacía')
  for (const suffix of ['a', 'b']) {
    const user = await db.usuario.create({ data: { username: `${prefix}${suffix}`, nombre: `Test ${suffix}`, rol: 'ADMIN', activo: true, passwordHash: 'fixture-only' } })
    ids.push(user.id)
  }

  const wait = barrier()
  const gated = {
    $transaction: (callback, options) => db.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== 'usuario') return target[key]
        return new Proxy(target.usuario, { get(delegate, method) {
          if (method !== 'count') return delegate[method]
          return async (args) => { const result = await delegate.count(args); await wait(); return result }
        } })
      } })
      return callback(proxy)
    }, { ...options, timeout: 10000 }),
  }
  const controller = UsuariosController(gated)
  const results = await Promise.all(ids.map(async (id) => {
    const res = response()
    await controller.updateUsuario({ params: { id }, body: { rol: 'REVISOR' }, id: 'isolated-test', auth: { user: { id: 'test-admin', username: 'test-admin' } } }, res)
    return res.statusCode
  }))
  assert.deepEqual(results.sort(), [200, 409])
  assert.equal(await db.usuario.count({ where: { rol: 'ADMIN', activo: true } }), 1)
  assert.equal(await db.cuentaAudit.count({ where: { entidad: 'USUARIO', entidadId: { in: ids } } }), 1)
})

test('ACCOUNTS-02 PostgreSQL aislado: auditoría y revocación son atómicas y no guardan claves', { skip: !url }, async (t) => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55440')
  assert.equal(parsed.pathname, '/accounts_isolated')
  assert.equal(parsed.username, 'accountstest')
  const db = new PrismaClient({ datasources: { db: { url } } })
  const unique = randomUUID().replaceAll('-', '')
  const originalHash = 'fixture-only-original-hash'
  const user = await db.usuario.create({ data: { username: `acct${unique.slice(0, 14)}`, nombre: 'Test', rol: 'REVISOR', activo: true, passwordHash: originalHash } })
  const session = await db.sesion.create({ data: { usuarioId: user.id, tokenHash: unique, expiresAt: new Date(Date.now() + 3600000) } })
  t.after(async () => {
    await db.cuentaAudit.deleteMany({ where: { entidad: 'USUARIO', entidadId: user.id } })
    await db.sesion.deleteMany({ where: { usuarioId: user.id } })
    await db.usuario.delete({ where: { id: user.id } })
    await db.$disconnect()
  })
  const req = { params: { id: user.id }, body: { password: 'claveNueva123' }, id: 'isolated-test', auth: { user: { id: 'test-admin', username: 'test-admin' } } }
  const failureDb = { $transaction: (callback, options) => db.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
    if (key !== 'cuentaAudit') return target[key]
    return { create: async () => { throw new Error('forced audit failure') } }
  } })), options) }
  await assert.rejects(UsuariosController(failureDb).updateUsuario(req, response()), /forced audit failure/)
  assert.equal((await db.usuario.findUnique({ where: { id: user.id } })).passwordHash, originalHash)
  assert.equal((await db.sesion.findUnique({ where: { id: session.id } })).revokedAt, null)
  assert.equal(await db.cuentaAudit.count({ where: { entidadId: user.id } }), 0)

  const res = response()
  await UsuariosController(db).updateUsuario(req, res)
  assert.equal(res.statusCode, 200)
  assert.notEqual((await db.usuario.findUnique({ where: { id: user.id } })).passwordHash, originalHash)
  assert.ok((await db.sesion.findUnique({ where: { id: session.id } })).revokedAt)
  const events = await db.cuentaAudit.findMany({ where: { entidadId: user.id } })
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].cambios, { mustChangePassword: { anterior: false, nuevo: true }, passwordReset: true })
  assert.doesNotMatch(JSON.stringify(events), /claveNueva123|passwordHash|fixture-only-original-hash/)
})

test('ACCOUNTS-03 PostgreSQL aislado: cambio propio verifica clave y revierte si falla auditoría', { skip: !url }, async (t) => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55440')
  assert.equal(parsed.pathname, '/accounts_isolated')
  assert.equal(parsed.username, 'accountstest')
  const db = new PrismaClient({ datasources: { db: { url } } })
  const unique = randomUUID().replaceAll('-', '')
  const originalHash = await hashPassword('claveAnterior123')
  const user = await db.usuario.create({ data: { username: `self${unique.slice(0, 14)}`, nombre: 'Test', rol: 'REVISOR', activo: true, passwordHash: originalHash, mustChangePassword: true } })
  const session = await db.sesion.create({ data: { usuarioId: user.id, tokenHash: unique, expiresAt: new Date(Date.now() + 3600000) } })
  t.after(async () => {
    await db.cuentaAudit.deleteMany({ where: { entidad: 'USUARIO', entidadId: user.id } })
    await db.sesion.deleteMany({ where: { usuarioId: user.id } })
    await db.usuario.delete({ where: { id: user.id } })
    await db.$disconnect()
  })
  const input = { userId: user.id, sessionId: session.id, currentPassword: 'claveAnterior123', newPassword: 'claveNueva456', requestId: 'isolated-test' }
  const wrong = await IdentityService(db).changePassword({ ...input, currentPassword: 'incorrecta' })
  assert.equal(wrong.code, 'INVALID_CURRENT_PASSWORD')
  assert.equal((await db.usuario.findUnique({ where: { id: user.id } })).passwordHash, originalHash)

  const failureDb = { $transaction: (callback, options) => db.$transaction((tx) => callback(new Proxy(tx, { get(target, key) {
    if (key !== 'cuentaAudit') return target[key]
    return { create: async () => { throw new Error('forced audit failure') } }
  } })), options) }
  await assert.rejects(IdentityService(failureDb).changePassword(input), /forced audit failure/)
  assert.equal((await db.usuario.findUnique({ where: { id: user.id } })).passwordHash, originalHash)
  assert.equal((await db.sesion.findUnique({ where: { id: session.id } })).revokedAt, null)

  assert.deepEqual(await IdentityService(db).changePassword(input), { ok: true })
  assert.equal(await verifyPassword('claveNueva456', (await db.usuario.findUnique({ where: { id: user.id } })).passwordHash), true)
  assert.equal((await db.usuario.findUnique({ where: { id: user.id } })).mustChangePassword, false)
  assert.ok((await db.sesion.findUnique({ where: { id: session.id } })).revokedAt)
  const audit = await db.cuentaAudit.findMany({ where: { entidadId: user.id } })
  assert.equal(audit.length, 1)
  assert.equal(audit[0].accion, 'CAMBIAR_CLAVE_PROPIA')
  assert.deepEqual(audit[0].cambios, { passwordChanged: true })
  assert.doesNotMatch(JSON.stringify(audit), /claveAnterior123|claveNueva456|passwordHash/)
})

test('ACCOUNTS-04 PostgreSQL aislado: ciclo HTTP de cuentas, cookies, roles y recuperación', { skip: !url }, async (t) => {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, '127.0.0.1')
  assert.equal(parsed.port, '55440')
  assert.equal(parsed.pathname, '/accounts_isolated')
  assert.equal(parsed.username, 'accountstest')

  const db = new PrismaClient({ datasources: { db: { url } } })
  const unique = randomUUID().replaceAll('-', '').slice(0, 14)
  assert.equal(await db.usuario.count(), 0, 'La base aislada debe estar vacía antes del ciclo HTTP')
  const adminPassword = `admin-${unique}`
  const initialPassword = `initial-${unique}`
  const ownPassword = `own-${unique}`
  const resetPassword = `reset-${unique}`
  const recoveredPassword = `recovered-${unique}`
  const admin = await db.usuario.create({ data: {
    username: `admin${unique}`, nombre: 'Admin fixture', rol: 'ADMIN',
    passwordHash: await hashPassword(adminPassword),
  } })
  const userIds = [admin.id]
  const branchIds = []
  const app = createApp({ prisma: db, env: { NODE_ENV: 'test', ADMIN_TOKEN: `bootstrap-${unique}`, CORS_ORIGIN: 'http://localhost:5173' }, logger: { info() {}, warn() {}, error() {}, log() {} } })
  const server = app.listen(0, '127.0.0.1')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await db.cuentaAudit.deleteMany({ where: { OR: [
      { entidad: 'USUARIO', entidadId: { in: userIds } },
      { entidad: 'SUCURSAL', entidadId: { in: branchIds } },
    ] } })
    await db.sesion.deleteMany({ where: { usuarioId: { in: userIds } } })
    await db.usuario.deleteMany({ where: { id: { in: userIds } } })
    await db.sucursal.deleteMany({ where: { id: { in: branchIds } } })
    await db.$disconnect()
  })
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`

  async function request(path, { method = 'GET', cookie, body } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Origin: 'http://localhost:5173', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], cors: response.headers.get('access-control-allow-origin'), credentials: response.headers.get('access-control-allow-credentials') }
  }

  const adminLogin = await request('/api/admin/login', { method: 'POST', body: { username: admin.username, password: adminPassword } })
  assert.equal(adminLogin.status, 200)
  assert.match(adminLogin.cookie, /^cc_session=/)
  assert.equal(adminLogin.cors, 'http://localhost:5173')
  assert.equal(adminLogin.credentials, 'true')
  const adminCookie = adminLogin.cookie

  const branch = await request('/api/admin/sucursales', { method: 'POST', cookie: adminCookie, body: { codigo: `T${unique.slice(0, 8)}`, nombre: 'Sucursal fixture' } })
  assert.equal(branch.status, 200)
  branchIds.push(branch.body.item.id)
  const created = await request('/api/admin/usuarios', { method: 'POST', cookie: adminCookie, body: {
    username: `operator${unique}`, nombre: 'Operador fixture', rol: 'OPERADOR', sucursalId: branch.body.item.id, password: initialPassword,
  } })
  assert.equal(created.status, 200)
  assert.equal(created.body.item.mustChangePassword, true)
  assert.equal(created.body.item.passwordHash, undefined)
  const userId = created.body.item.id
  userIds.push(userId)

  const initialLogin = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: initialPassword } })
  assert.equal(initialLogin.status, 200)
  assert.equal(initialLogin.body.user.mustChangePassword, true)
  const firstCookie = initialLogin.cookie
  assert.equal((await request('/api/session', { cookie: firstCookie })).status, 200)
  assert.equal((await request('/api/escaneos', { method: 'POST', cookie: firstCookie, body: {} })).body.code, 'PASSWORD_CHANGE_REQUIRED')
  assert.equal((await request('/api/session/password', { method: 'POST', cookie: firstCookie, body: { currentPassword: initialPassword, newPassword: ownPassword } })).status, 200)
  assert.equal((await request('/api/session', { cookie: firstCookie })).status, 401)

  const regularLogin = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: ownPassword } })
  assert.equal(regularLogin.body.user.mustChangePassword, false)
  const regularCookie = regularLogin.cookie
  const reset = await request(`/api/admin/usuarios/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { password: resetPassword } })
  assert.equal(reset.status, 200)
  assert.equal(reset.body.item.mustChangePassword, true)
  assert.equal((await request('/api/session', { cookie: regularCookie })).status, 401)
  assert.equal((await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: ownPassword } })).status, 401)
  const resetLogin = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: resetPassword } })
  assert.equal(resetLogin.body.user.mustChangePassword, true)
  assert.equal((await request('/api/session/password', { method: 'POST', cookie: resetLogin.cookie, body: { currentPassword: resetPassword, newPassword: recoveredPassword } })).status, 200)

  const recovered = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })
  assert.equal(recovered.status, 200)
  assert.equal(recovered.body.user.mustChangePassword, false)
  assert.equal((await request(`/api/admin/usuarios/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { rol: 'REVISOR' } })).status, 200)
  assert.equal((await request('/api/session', { cookie: recovered.cookie })).status, 401)
  const reviewer = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })
  assert.equal(reviewer.body.user.rol, 'REVISOR')
  assert.equal((await request('/api/admin/usuarios', { cookie: reviewer.cookie })).status, 403)
  assert.equal((await request('/api/admin/ping', { cookie: reviewer.cookie })).status, 200)

  assert.equal((await request(`/api/admin/usuarios/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { activo: false } })).status, 200)
  assert.equal((await request('/api/session', { cookie: reviewer.cookie })).status, 401)
  assert.equal((await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })).status, 401)
  assert.equal((await request(`/api/admin/usuarios/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { activo: true } })).status, 200)

  const restored = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })
  assert.equal(restored.status, 200)
  const tokenHash = (await db.sesion.findFirst({ where: { usuarioId: userId, revokedAt: null }, orderBy: { createdAt: 'desc' } })).tokenHash
  await db.sesion.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } })
  assert.equal((await request('/api/session', { cookie: restored.cookie })).status, 401)
  assert.equal((await request(`/api/admin/usuarios/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { rol: 'OPERADOR' } })).status, 200)
  const branchOperator = await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })
  assert.equal(branchOperator.status, 200)
  assert.equal((await request(`/api/admin/sucursales/${branch.body.item.id}`, { method: 'PATCH', cookie: adminCookie, body: { activa: false } })).status, 200)
  assert.equal((await request('/api/session', { cookie: branchOperator.cookie })).status, 401)
  assert.equal((await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })).body.code, 'BRANCH_DISABLED')
  assert.equal((await request(`/api/admin/sucursales/${branch.body.item.id}`, { method: 'PATCH', cookie: adminCookie, body: { activa: true } })).status, 200)
  assert.equal((await request('/api/session/login', { method: 'POST', body: { username: created.body.item.username, password: recoveredPassword } })).status, 200)
  const lastAdmin = await request(`/api/admin/usuarios/${admin.id}`, { method: 'PATCH', cookie: adminCookie, body: { activo: false } })
  assert.equal(lastAdmin.status, 409)
  const audit = await request('/api/admin/cuentas/auditoria', { cookie: adminCookie })
  assert.equal(audit.status, 200)
  assert.ok(audit.body.items.some((item) => item.accion === 'CAMBIAR_CLAVE_PROPIA'))
  assert.doesNotMatch(JSON.stringify(audit.body), new RegExp([adminPassword, initialPassword, ownPassword, resetPassword, recoveredPassword].join('|')))
})
