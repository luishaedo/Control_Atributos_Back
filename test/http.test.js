import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createApp } from '../src/app.js'
import { hashPassword } from '../src/services/identity.service.js'

const token = 'test-token-not-a-real-secret'
const origin = 'https://stockeador-client-1nll.vercel.app'

test('R1.3/R1.4 transaction conflicts reach decision and close routes as 409 with request ID', async t => {
  let writes = 0
  const f = await fixture(t, { prisma: {
    skuStage: { findMany: async () => [] }, unknownSku: {},
    actualizacion: { findMany: async ({ where }) => {
      assert.equal(where.archivada, false)
      return [{ id: 1, sku: 'SKU' }]
    } },
    campania: { update: async () => { writes++ } },
    $transaction: async () => { throw Object.assign(new Error('private details'), { code: 'P2034' }) },
  } })
  for (const [path, body] of [
    ['/revisiones/decidir', { campaniaId: 1, sku: 'SKU', propuesta: { tipo_cod: '02' }, decision: 'aceptar', aplicarAhora: false }],
    ['/campanias/1/cerrar', {}],
  ]) {
    const res = await f.request(`/api/admin${path}`, { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(res.status, 409)
    assert.ok(['UPDATE_CONFLICT', 'CLOSE_CONFLICT'].includes(res.body.code))
    assert.equal(res.body.requestId, res.headers.get('x-request-id'))
    assert.doesNotMatch(JSON.stringify(res.body), /private details/)
  }
  assert.equal(writes, 0)
})

test('R1.4 direct application is disabled regardless of supplied IDs', async t => {
  const f = await fixture(t)
  const res = await f.request('/api/admin/actualizaciones/aplicar', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['1'] }) })
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'APPLY_REQUIRES_CLOSE')
})

test('R1.4 repeated close is an idempotent read of the closed result', async t => {
  const closedPrisma = {
    unknownSku: { count: async () => 0 },
    actualizacion: { count: async () => 0, findMany: async () => [] },
    campaniaMaestro: { count: async () => 0 },
    campania: { findUnique: async () => ({ id: 1, estado: 'CERRADA', closedAt: new Date(), activa: false }) },
  }
  closedPrisma.$transaction = async fn => fn(closedPrisma)
  const f = await fixture(t, { prisma: closedPrisma })
  const res = await f.request('/api/admin/campanias/1/cerrar', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(res.status, 200)
  assert.equal(res.body.applied, 0)
  assert.equal(res.body.alreadyClosed, true)
})

async function fixture(t, { prisma = {}, env = {} } = {}) {
  const logs = []
  const db = { $queryRaw: async () => [{ result: 1 }], ...prisma }
  const app = createApp({
    prisma: db,
    env: { NODE_ENV: 'production', ADMIN_TOKEN: token, APP_VERSION: 'test-build', ...env },
    logger: { info: entry => logs.push(entry), error: entry => logs.push(entry) },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  const base = `http://127.0.0.1:${server.address().port}`
  return {
    logs,
    async request(path, options = {}) {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(2000), ...options })
      const body = await res.text()
      return { status: res.status, headers: res.headers, body: body ? JSON.parse(body) : null }
    },
  }
}

test('legacy health stays compatible; liveness does not touch DB', async t => {
  let queries = 0
  const f = await fixture(t, { prisma: { $queryRaw: () => { queries++; throw new Error('DB down') } } })
  for (const path of ['/health', '/api/health']) {
    const res = await f.request(path)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true })
    assert.equal(res.headers.get('cache-control'), 'no-store')
  }
  for (const path of ['/health/live', '/api/health/live']) {
    const res = await f.request(path)
    assert.deepEqual(res.body, { ok: true, version: 'test-build' })
  }
  assert.equal(queries, 0)
})

test('readiness queries DB and exposes deployment SHA without caching', async t => {
  let queries = 0
  const f = await fixture(t, { env: { RENDER_GIT_COMMIT: 'render-sha' }, prisma: {
    $queryRaw: async strings => { assert.equal(strings[0], 'SELECT 1'); queries++; return [1] },
  } })
  for (const path of ['/health/ready', '/api/health/ready']) {
    const res = await f.request(path)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { ok: true, database: 'up', version: 'render-sha' })
    assert.equal(res.headers.get('cache-control'), 'no-store')
  }
  assert.equal(queries, 2)
})

test('readiness rejects failed DB without exposing connection details and recovers', async t => {
  let failed = true
  const f = await fixture(t, { prisma: { $queryRaw: async () => {
    if (failed) throw new Error('postgres://secret:password@private-host')
    return [1]
  } } })
  const first = await f.request('/api/health/ready')
  assert.equal(first.status, 503)
  assert.equal(first.body.code, 'DATABASE_UNAVAILABLE')
  assert.equal(first.body.requestId, first.headers.get('x-request-id'))
  assert.doesNotMatch(JSON.stringify(first.body), /password|private-host/)
  failed = false
  assert.equal((await f.request('/api/health/ready')).status, 200)
})

test('slow readiness is bounded, coalesces queries after timeout and can recover', async t => {
  let release
  let queries = 0
  const pending = new Promise(resolve => { release = resolve })
  const f = await fixture(t, { env: { READINESS_TIMEOUT_MS: '25' }, prisma: {
    $queryRaw: () => { queries++; return pending },
  } })
  const responses = await Promise.all(Array.from({ length: 4 }, () => f.request('/health/ready')))
  assert.ok(responses.every(res => res.status === 503))
  assert.equal(queries, 1)
  assert.equal((await f.request('/health/ready')).status, 503)
  assert.equal(queries, 1)
  release([1])
  await delay(5)
  assert.equal((await f.request('/health/ready')).status, 200)
  assert.equal(queries, 2)
})

test('public async rejection reaches JSON handler with matching request ID', async t => {
  const f = await fixture(t, { prisma: { campania: { findMany: async () => {
    throw Object.assign(new Error('private database details'), { code: 'P1001' })
  } } } })
  const res = await f.request('/api/campanias?secret=do-not-log')
  assert.equal(res.status, 503)
  assert.equal(res.body.code, 'DATABASE_UNAVAILABLE')
  assert.equal(res.body.requestId, res.headers.get('x-request-id'))
  assert.ok(f.logs.some(entry => entry.event === 'http_error' && entry.requestId === res.body.requestId))
  assert.doesNotMatch(JSON.stringify(f.logs), /do-not-log|private database details/)
})

test('administrative async rejection is forwarded after authorization', async t => {
  const f = await fixture(t, { prisma: { actualizacion: { findMany: async () => { throw new Error('secret') } } } })
  const res = await f.request('/api/admin/actualizaciones?campaniaId=1', {
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(res.status, 500)
  assert.equal(res.body.code, 'INTERNAL_ERROR')
  assert.doesNotMatch(JSON.stringify(res.body), /secret/)
})

test('auth remains mandatory in production even with dev bypass flag', async t => {
  const f = await fixture(t, { env: { ADMIN_AUTH_BYPASS_DEV: 'true' } })
  assert.equal((await f.request('/api/admin/ping')).status, 401)
  assert.equal((await f.request('/api/admin/ping', { headers: { Authorization: `Bearer ${token}` } })).status, 200)
})

test('login cookie still authorizes administrative requests', async t => {
  const f = await fixture(t)
  const login = await f.request('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=None/)
  assert.equal((await f.request('/api/admin/ping', { headers: { Cookie: cookie.split(';')[0] } })).status, 200)
})

test('R2.1 user login creates a revocable session cookie with server-side identity', async t => {
  let sessionRecord
  const passwordHash = await hashPassword('operativo123')
  const user = {
    id: 'u-admin',
    username: 'ana',
    nombre: 'Ana Admin',
    rol: 'ADMIN',
    activo: true,
    passwordHash,
    sucursal: { id: 's1', codigo: 'SUC1', nombre: 'Sucursal 1', activa: true },
  }
  const f = await fixture(t, { prisma: {
    usuario: { findUnique: async () => user },
    sesion: {
      create: async ({ data }) => {
        sessionRecord = { id: 'sess-1', ...data }
        return sessionRecord
      },
      findUnique: async () => ({ ...sessionRecord, usuario: user }),
      update: async () => sessionRecord,
      updateMany: async ({ data }) => { sessionRecord.revokedAt = data.revokedAt; return { count: 1 } },
    },
  } })
  const login = await f.request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ana', password: 'operativo123' }),
  })
  assert.equal(login.status, 200)
  assert.equal(login.body.user.username, 'ana')
  assert.equal(login.body.user.rol, 'ADMIN')
  const cookie = login.headers.get('set-cookie')
  assert.match(cookie, /cc_session=/)
  const ping = await f.request('/api/admin/ping', { headers: { Cookie: cookie.split(';')[0] } })
  assert.equal(ping.status, 200)
  assert.equal(ping.body.user.username, 'ana')
  const logout = await f.request('/api/admin/logout', {
    method: 'POST',
    headers: { Cookie: cookie.split(';')[0] },
  })
  assert.equal(logout.status, 200)
  assert.ok(sessionRecord.revokedAt)
})

test('R2.1 reviewer session cannot use admin-only user management routes', async t => {
  let sessionRecord
  const passwordHash = await hashPassword('revisor123')
  const user = {
    id: 'u-reviewer',
    username: 'revisor',
    nombre: 'Rita Revisora',
    rol: 'REVISOR',
    activo: true,
    passwordHash,
    sucursal: { id: 's1', codigo: 'SUC1', nombre: 'Sucursal 1', activa: true },
  }
  const f = await fixture(t, { prisma: {
    usuario: { findUnique: async () => user },
    sesion: {
      create: async ({ data }) => { sessionRecord = { id: 'sess-2', ...data }; return sessionRecord },
      findUnique: async () => ({ ...sessionRecord, usuario: user }),
      update: async () => sessionRecord,
    },
  } })
  const login = await f.request('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'revisor', password: 'revisor123' }),
  })
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await f.request('/api/admin/ping', { headers: { Cookie: cookie } })).status, 200)
  const denied = await f.request('/api/admin/usuarios', { headers: { Cookie: cookie } })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.code, 'FORBIDDEN')
})

test('CORS retains configured aliases, credentials and rejects other origins', async t => {
  const f = await fixture(t, { env: { CORS_ORIGIN: origin, FRONTEND_URL: 'https://other.example' } })
  for (const allowed of [origin, 'https://other.example']) {
    const res = await f.request('/api/health', { headers: { Origin: allowed } })
    assert.equal(res.headers.get('access-control-allow-origin'), allowed)
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
    assert.match(res.headers.get('access-control-expose-headers'), /X-Request-Id/)
  }
  const denied = await f.request('/api/health', { headers: { Origin: 'https://untrusted.example' } })
  assert.equal(denied.status, 403)
  assert.equal(denied.body.code, 'CORS_DENIED')
  const preflight = await f.request('/api/admin/login', {
    method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
})

test('invalid JSON returns 400 instead of internal server error', async t => {
  const f = await fixture(t)
  const res = await f.request('/api/escaneos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'INVALID_JSON')
})

test('R1.2 scan requires an idempotency key before database access', async t => {
  const f = await fixture(t, { prisma: {
    $transaction: async () => assert.fail('invalid scan must not open a transaction'),
  } })
  const res = await f.request('/api/escaneos', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ campaniaId: 1, skuRaw: 'SKU1' }),
  })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'IDEMPOTENCY_KEY_REQUIRED')
  assert.equal(res.body.requestId, res.headers.get('x-request-id'))
})

test('administrative validation errors use JSON readable by both frontend clients', async t => {
  const f = await fixture(t)
  const res = await f.request('/api/admin/actualizaciones', { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(res.status, 400)
  assert.equal(res.body.error, 'campaniaId requerido')
  assert.equal(res.body.requestId, res.headers.get('x-request-id'))
})

test('multipart middleware still forwards errors through the async router', async t => {
  const f = await fixture(t)
  const form = new FormData()
  form.append('unexpected', new Blob(['fixture']), 'test.csv')
  const res = await f.request('/api/admin/maestro/import-file', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'INVALID_UPLOAD')
})

test('a stalled read returns 503; late completion does not destabilize app', async t => {
  let release
  const pending = new Promise(resolve => { release = resolve })
  const f = await fixture(t, { env: { READ_TIMEOUT_MS: '25' }, prisma: { campania: { findMany: () => pending } } })
  const res = await f.request('/api/campanias')
  assert.equal(res.status, 503)
  assert.equal(res.body.code, 'READ_TIMEOUT')
  release([])
  await delay(10)
  assert.equal((await f.request('/health/live')).status, 200)
})

test('deadline does not claim cancellation of a slow mutation', async t => {
  let writes = 0
  const f = await fixture(t, { env: { READ_TIMEOUT_MS: '10' }, prisma: { actualizacion: { updateMany: async () => {
    await delay(40); writes++; return { count: 1 }
  } } } })
  const res = await f.request('/api/admin/actualizaciones/archivar', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [1], archivada: true }),
  })
  assert.equal(res.status, 200)
  assert.equal(writes, 1)
})

test('invalid timeout configuration fails before app starts', () => {
  for (const value of ['abc', '0', '-1', '2.5', '120001']) {
    assert.throws(() => createApp({ prisma: {}, env: { READ_TIMEOUT_MS: value } }), /READ_TIMEOUT_MS/)
  }
})

test('Prisma validation failures are controlled 400 responses', async t => {
  const f = await fixture(t, { prisma: { maestro: {
    findMany: async () => { throw Object.assign(new Error('private payload'), { name: 'PrismaClientValidationError' }) },
    count: async () => 0,
  } } })
  const res = await f.request('/api/maestro?page=abc')
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'INVALID_PARAMETERS')
})

test('success routes preserve payloads and unknown routes return JSON', async t => {
  const f = await fixture(t, { prisma: { campania: { findMany: async () => [{ id: 1, nombre: 'Fixture' }] } } })
  assert.deepEqual((await f.request('/api/campanias')).body, { items: [{ id: 1, nombre: 'Fixture' }] })
  const missing = await f.request('/api/not-a-route')
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'NOT_FOUND')
})
