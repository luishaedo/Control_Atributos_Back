import { createServer } from 'node:net'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { validateR13 } from './validate-r13-staging.mjs'

// Windows local IPC only: accept credentials once in memory, never from disk or CLI args.
const [expectedVersion, output] = process.argv.slice(2)
if (process.platform !== 'win32' || !/^[a-f0-9]{40}$/.test(expectedVersion || '') || !output) {
  throw new Error('Usage: node scripts/run-r13-staging-memory.mjs SHA output.json (Windows)')
}
const pipe = `\\\\.\\pipe\\control-atributos-r13-${randomUUID()}`
const server = createServer(socket => {
  server.close()
  socket.setEncoding('utf8')
  let buffer = ''
  socket.on('data', chunk => {
    buffer += chunk
    if (buffer.length > 8192) socket.destroy()
  })
  socket.on('end', async () => {
    clearTimeout(deadline)
    let credentials
    try {
      credentials = JSON.parse(buffer)
      buffer = ''
      const result = await validateR13({ ...credentials, expectedVersion,
        onProgress: item => console.log(JSON.stringify(item)) })
      await writeFile(output, JSON.stringify(result, null, 2) + '\n')
      console.log(JSON.stringify({ passed: result.passed, checks: result.checks.length,
        requests: result.requests.length, campaignId: result.campaignId, output }))
      if (!result.passed) process.exitCode = 1
    } catch {
      console.error('R13 validation failed; credentials and raw error deliberately omitted')
      process.exitCode = 1
    } finally {
      credentials = null
      buffer = ''
      socket.destroy()
    }
  })
})
server.maxConnections = 1
const deadline = setTimeout(() => { server.close(); process.exitCode = 1 }, 60000)
server.listen(pipe, () => console.log(JSON.stringify({ credentialPipe: pipe, expiresInSeconds: 60 })))
