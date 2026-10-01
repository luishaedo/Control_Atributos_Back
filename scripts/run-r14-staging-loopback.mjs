import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { validateR14 } from './validate-r14-staging.mjs'

const [expectedVersion, output] = process.argv.slice(2)
if (!/^[a-f0-9]{40}$/.test(expectedVersion || '') || !output) {
  throw new Error('Usage: node scripts/run-r14-staging-loopback.mjs SHA output.json')
}

const nonce = randomUUID()
const route = `/r14-credentials/${nonce}`
let consumed = false
const redact = value => String(value || '')
  .replace(/postgresql:\/\/[^@\s]+@/g, 'postgresql://<redacted>@')
  .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer <redacted>')
  .replace(/[A-Za-z0-9._~+/=-]{24,}/g, '<redacted>')
const page = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Validación R1.4</title>
<form method="post" action="${route}" autocomplete="off">
<label>DATABASE_URL <input name="databaseUrl" type="password" autocomplete="new-password" required></label>
<label>Token staging <input name="token" type="password" autocomplete="new-password" required></label>
<button type="submit">Ejecutar validación</button></form></html>`

const server = createServer((req, res) => {
  if (req.url !== route || consumed) return res.writeHead(404).end()
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(page)
  }
  if (req.method !== 'POST') return res.writeHead(405).end()
  consumed = true
  let body = ''
  req.setEncoding('utf8')
  req.on('data', chunk => {
    body += chunk
    if (body.length > 8192) req.destroy()
  })
  req.on('end', async () => {
    clearTimeout(deadline)
    server.close()
    res.writeHead(202, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end('Validación R1.4 iniciada. Esta pestaña ya se puede cerrar.')
    let credentials
    try {
      const params = new URLSearchParams(body)
      body = ''
      credentials = { databaseUrl: params.get('databaseUrl'), token: params.get('token') }
      const result = await validateR14({
        ...credentials,
        expectedVersion,
        onProgress: item => console.log(JSON.stringify(item)),
      })
      await writeFile(output, JSON.stringify(result, null, 2) + '\n')
      console.log(JSON.stringify({
        passed: result.passed,
        checks: result.checks.length,
        requests: result.requests.length,
        campaignIds: result.campaignIds,
        output,
      }))
      if (!result.passed) process.exitCode = 1
    } catch (error) {
      await writeFile(output, JSON.stringify({
        checkedAt: new Date().toISOString(),
        passed: false,
        failureCode: error?.code || error?.name || 'FAILED',
        failureMessage: redact(error?.message),
      }, null, 2) + '\n')
      console.error('R14 validation failed; credentials and raw error deliberately omitted')
      process.exitCode = 1
    } finally {
      credentials = null
      body = ''
    }
  })
})

const deadline = setTimeout(() => {
  server.close()
  process.exitCode = 1
}, 180000)

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  console.log(JSON.stringify({ credentialUrl: `http://127.0.0.1:${address.port}${route}`, expiresInSeconds: 180 }))
})
