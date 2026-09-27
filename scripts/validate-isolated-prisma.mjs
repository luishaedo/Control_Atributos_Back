// Operación manual R0.2, exclusivamente para el endpoint/base de pruebas autorizados.
import { readFile, writeFile, cp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { runSmoke } from './smoke.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = path.join(root, '.r02-runtime')
const url = new URL((await readFile(path.join(runtime, 'connection.txt'), 'utf8')).trim())
if (url.hostname !== 'ep-curly-shape-anyk4jwe.c-6.us-east-1.aws.neon.tech' || url.pathname !== '/r02_prisma_validation') {
  throw new Error('Destino no autorizado: requiere endpoint y base aislados R0.2')
}
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'production',
  ADMIN_TOKEN: randomBytes(24).toString('hex'), APP_VERSION: 'r02-local-working-tree',
  RENDER_GIT_COMMIT: '', PORT: '43127', CORS_ORIGINS: 'https://stockeador-client-1nll.vercel.app',
  CORS_ORIGIN: '', FRONTEND_URL: '', APP_URL: '', CORS_ALLOW_ALL: 'false',
  DOTENV_CONFIG_PATH: path.join(runtime, 'unused.env') }
await cp(path.join(root, 'prisma/schema.prisma'), path.join(runtime, 'schema.prisma'))
await cp(path.join(root, 'prisma/migrations'), path.join(runtime, 'migrations'), { recursive: true })
const cli = path.join(root, 'node_modules/prisma/build/index.js')
const schema = path.join(runtime, 'schema.prisma')
const commands = []
function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: runtime, env, windowsHide: true })
    let output = ''
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => child.kill(), 90000)
    child.on('error', () => { clearTimeout(timer); reject(new Error('No se pudo iniciar Prisma')) })
    child.on('exit', code => {
      clearTimeout(timer)
      // No persistir salida cruda: puede contener información de conexión.
      const result = { operation: args[0] + ' ' + args[1], exitCode: code,
        noPending: /No pending migrations/.test(output),
        upToDate: /up to date/i.test(output), emptyDiff: /No difference detected/.test(output) }
      commands.push(result)
      console.log(JSON.stringify(result))
      if (code !== 0) reject(new Error('Prisma fallo; salida sensible omitida'))
      else resolve(result)
    })
  })
}
let server
async function start() {
  await new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(root, 'src/server.js')], { cwd: runtime, env, windowsHide: true })
    const timer = setTimeout(() => reject(new Error('Arranque API excedio plazo')), 30000)
    let output = ''
    server.stdout.on('data', d => {
      output += d
      if (output.includes('API listening on port')) { clearTimeout(timer); resolve() }
    })
    server.stderr.on('data', () => {})
    server.once('error', () => { clearTimeout(timer); reject(new Error('API no pudo iniciarse')) })
    server.once('exit', () => { clearTimeout(timer); reject(new Error('API termino antes de validar')) })
  })
}
async function stop() {
  if (!server || server.exitCode !== null) return
  await new Promise(resolve => { server.once('exit', resolve); server.kill() })
}
const reports = []
try {
  await command(['migrate', 'deploy', '--schema', schema])
  const second = await command(['migrate', 'deploy', '--schema', schema])
  if (!second.noPending) throw new Error('Segunda ejecucion no confirma ausencia de pendientes')
  await command(['migrate', 'status', '--schema', schema])
  await command(['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code'])
  await start()
  for (let i = 0; i < 3; i++) {
    if (i === 2) { await stop(); await start() }
    const report = await runSmoke({ base: 'http://127.0.0.1:43127', origin: env.CORS_ORIGINS,
      expectedVersion: env.APP_VERSION })
    reports.push({ ...report, afterProcessRestart: i === 2 })
    console.log(`Smoke ${i + 1}: ${report.passed ? 'PASS' : 'FAIL'}`)
    if (!report.passed) throw new Error('Smoke fallido')
  }
} finally {
  await stop()
  await writeFile(path.join(root, 'docs/development/migration-validation/prisma-api-results.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'API local + Neon isolated branch', commands, reports }, null, 2) + '\n')
}
