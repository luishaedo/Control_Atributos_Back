import test from 'node:test'
import assert from 'node:assert/strict'
import { runSmoke } from '../scripts/smoke.mjs'

const options = { base: 'https://backend.example', origin: 'https://frontend.example', expectedVersion: 'sha-test' }
function fakeFetch(overrides = {}) {
  return async (url, opts) => {
    assert.equal(opts.method, 'GET')
    assert.equal(opts.headers.Authorization, undefined)
    const path = new URL(url).pathname
    const data = {
      '/api/health': { ok: true },
      '/api/health/live': { ok: true, version: 'sha-test' },
      '/api/health/ready': { ok: true, version: 'sha-test', database: 'up' },
      '/api/campanias': { items: [{ nombre: 'PRIVATE_FIXTURE' }] },
      '/api/diccionarios': { categorias: [], tipos: [], clasif: [] },
      '/api/maestro': { items: [], total: 0 },
      '/api/admin/ping': { error: 'No autorizado' },
    }
    const custom = overrides[path] || {}
    return new Response(JSON.stringify(custom.body ?? data[path]), {
      status: custom.status ?? (path.endsWith('/ping') ? 401 : 200),
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': options.origin,
        'access-control-allow-credentials': 'true', ...custom.headers },
    })
  }
}

test('smoke validates all read-only contracts without saving business data', async () => {
  const result = await runSmoke({ ...options, fetchImpl: fakeFetch() })
  assert.equal(result.passed, true)
  assert.equal(result.results.length, 7)
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_FIXTURE/)
})

test('legacy build missing new health routes is not considered ready', async () => {
  const result = await runSmoke({ ...options, fetchImpl: fakeFetch({ '/api/health/ready': { status: 404, body: {} } }) })
  assert.equal(result.passed, false)
})

test('wrong release, bad CORS, HTML success and unprotected admin are failures', async () => {
  for (const overrides of [
    { '/api/health/live': { body: { ok: true, version: 'wrong-sha' } } },
    { '/api/health/ready': { body: { ok: true, version: 'unknown', database: 'up' } } },
    { '/api/campanias': { headers: { 'access-control-allow-origin': '*' } } },
    { '/api/campanias': { headers: { 'content-type': 'text/html' } } },
    { '/api/admin/ping': { status: 200 } },
  ]) {
    assert.equal((await runSmoke({ ...options, fetchImpl: fakeFetch(overrides) })).passed, false)
  }
})

test('smoke deadline includes a stalled response body', async () => {
  const result = await runSmoke({ ...options, timeoutMs: 10, fetchImpl: async (_url, opts) => ({
    status: 200, headers: new Headers({ 'content-type': 'application/json' }),
    json: () => new Promise((_resolve, reject) => opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  }) })
  assert.equal(result.passed, false)
  assert.ok(result.results.every(r => r.failure === 'TIMEOUT'))
})

test('rejects targets containing credentials or paths before network access', async () => {
  for (const base of ['https://user:secret@example.com', 'https://example.com/private', 'file:///tmp']) {
    await assert.rejects(runSmoke({ ...options, base, fetchImpl: () => { throw new Error('must not fetch') } }), /origen/)
  }
})
