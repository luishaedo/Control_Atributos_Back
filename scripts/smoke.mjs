import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const checks = [
  { path: '/api/health', status: 200, valid: b => object(b) && b.ok === true },
  { path: '/api/health/live', status: 200, version: true, valid: b => object(b) && b.ok === true },
  { path: '/api/health/ready', status: 200, version: true, valid: b => object(b) && b.ok === true && b.database === 'up' },
  { path: '/api/campanias', status: 200, valid: b => object(b) && Array.isArray(b.items) },
  { path: '/api/diccionarios', status: 200, valid: b => object(b) && ['categorias', 'tipos', 'clasif'].every(k => Array.isArray(b[k])) },
  { path: '/api/maestro?page=1&pageSize=1', status: 200, valid: b => object(b) && Array.isArray(b.items) && Number.isInteger(b.total) && b.total >= 0 },
  { path: '/api/admin/ping', status: 401, valid: b => object(b) && typeof b.error === 'string' },
]

function cleanOrigin(value) {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') {
    throw new Error('Se requiere un origen HTTP(S) sin credenciales, path ni query')
  }
  return url.origin
}

// Read-only endpoints only; never loads dotenv or sends credentials. No response data is persisted.
export async function runSmoke({ base, origin, expectedVersion, timeoutMs = 10000, fetchImpl = fetch }) {
  base = cleanOrigin(base)
  origin = cleanOrigin(origin)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('timeout inválido')
  const results = []
  // Bounded batches: at most three simultaneous requests, no automatic retries.
  for (let offset = 0; offset < checks.length; offset += 3) {
    results.push(...await Promise.all(checks.slice(offset, offset + 3).map(async check => {
      const started = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${base}${check.path}`, {
          method: 'GET', headers: { Origin: origin }, redirect: 'error', signal: controller.signal,
        })
        const contentType = res.headers.get('content-type') || ''
        let body = null
        try { body = await res.json() } catch (error) { if (controller.signal.aborted) throw error }
        const json = contentType.includes('application/json')
        const contractOK = json && check.valid(body)
        const version = check.version && typeof body?.version === 'string' ? body.version : null
        const versionOK = !check.version || Boolean(version && version !== 'unknown' && (!expectedVersion || version === expectedVersion))
        const corsOK = res.headers.get('access-control-allow-origin') === origin && res.headers.get('access-control-allow-credentials') === 'true'
        return {
          path: check.path, status: res.status, expectedStatus: check.status,
          durationMs: Date.now() - started, contractOK, corsOK,
          ...(check.version ? { version, versionOK } : {}),
          requestId: res.headers.get('x-request-id'),
          passed: res.status === check.status && contractOK && corsOK && versionOK,
        }
      } catch {
        return { path: check.path, status: null, durationMs: Date.now() - started, passed: false,
          failure: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_REDIRECT_ERROR' }
      } finally { clearTimeout(timer) }
    })))
  }
  return { checkedAt: new Date().toISOString(), base, origin, expectedVersion: expectedVersion || null,
    timeoutMs, passed: results.every(r => r.passed), results }
}

async function main() {
  const args = process.argv.slice(2)
  const options = {}
  for (let i = 0; i < args.length; i += 2) {
    if (!['--base', '--origin', '--expected-version', '--timeout', '--out'].includes(args[i]) || !args[i + 1]) {
      throw new Error('Uso: npm run smoke -- --base URL --origin URL [--expected-version SHA] [--timeout MS] [--out archivo.json]')
    }
    options[args[i]] = args[i + 1]
  }
  if (!options['--base'] || !options['--origin']) throw new Error('--base y --origin son obligatorios')
  const report = await runSmoke({ base: options['--base'], origin: options['--origin'],
    expectedVersion: options['--expected-version'], timeoutMs: Number(options['--timeout'] || 10000) })
  const output = JSON.stringify(report, null, 2)
  if (options['--out']) await writeFile(options['--out'], `${output}\n`, 'utf8')
  console.log(output)
  if (!report.passed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
