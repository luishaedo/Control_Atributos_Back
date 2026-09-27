// Recuperación R0.2 autorizada. Solo inicializa el destino verificado si sigue vacío.
// No usar para probar: las migraciones se validaron antes en la rama aislada.
import { readFile, writeFile, cp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

if (process.argv[2] !== '--initialize-verified-empty-production') throw new Error('Falta selector de operación explícito')
const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = path.join(root, '.r02-runtime')
const url = new URL((await readFile(path.join(runtime, 'production-connection.txt'), 'utf8')).trim())
if (url.hostname !== 'ep-spring-lake-ancg5c67.c-6.us-east-1.aws.neon.tech' || url.pathname !== '/neondb'
  || (url.searchParams.get('schema') || 'public') !== 'public') throw new Error('Destino inesperado')
const manifest = JSON.parse(await readFile(path.join(root, 'docs/development/migration-validation/manifest.json'), 'utf8'))
if (manifest.length !== 8) throw new Error('Manifest inesperado')
for (const migration of manifest) {
  const bytes = await readFile(path.join(root, 'prisma/migrations', migration.name, 'migration.sql'))
  if (createHash('sha256').update(bytes).digest('hex') !== migration.sha256) throw new Error('Migracion distinta a la validada')
}
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const report = { checkedAt: new Date().toISOString(), target: 'Neon production/neondb', operations: [] }
const env = { ...process.env, DATABASE_URL: url.toString(), DOTENV_CONFIG_PATH: path.join(runtime, 'unused.env') }
const schema = path.join(runtime, 'schema.prisma')
async function run(args) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...args],
      { cwd: runtime, env, windowsHide: true })
    let output = ''
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => child.kill(), 90000)
    child.once('error', () => { clearTimeout(timer); reject(new Error('Prisma no iniciado')) })
    child.once('exit', code => { clearTimeout(timer); resolve({ operation: args[0] + ' ' + args[1], exitCode: code,
      upToDate: /up to date/i.test(output), emptyDiff: /No difference detected/.test(output) }) })
  })
  report.operations.push(result)
  console.log(JSON.stringify(result))
  if (result.exitCode !== 0) throw new Error('Prisma fallo; no reintentar sin revisar estado')
}
try {
  const inventory = await prisma.$queryRaw`SELECT current_database() AS database,
    current_schema() AS schema, count(*)::int AS user_relations
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND c.relkind IN ('r','p','v','m','S','f')`
  report.before = inventory[0]
  if (report.before.database !== 'neondb' || report.before.schema !== 'public' || report.before.user_relations !== 0) {
    throw new Error('Base no vacia o esquema inesperado: recuperacion cancelada')
  }
  console.log('Preflight: destino verificado sin tablas/vistas/secuencias de usuario')
  await cp(path.join(root, 'prisma/schema.prisma'), schema)
  await cp(path.join(root, 'prisma/migrations'), path.join(runtime, 'migrations'), { recursive: true })
  await run(['migrate', 'deploy', '--schema', schema])
  await run(['migrate', 'status', '--schema', schema])
  await run(['migrate', 'diff', '--from-schema-datasource', schema, '--to-schema-datamodel', schema, '--exit-code'])
  report.after = await prisma.$queryRaw`SELECT count(*)::int AS migrations,
    count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)::int AS applied
    FROM public._prisma_migrations`
  if (report.after[0].migrations !== 8 || report.after[0].applied !== 8) throw new Error('Historial inesperado')
  report.passed = true
  console.log('Recuperacion de esquema confirmada: 8/8 migraciones')
} catch {
  report.passed = false
  process.exitCode = 1
  console.error('Recuperacion detenida; ver evidencia sanitizada. No reintentar automaticamente.')
} finally {
  await prisma.$disconnect()
  await writeFile(path.join(root, 'docs/development/production-recovery.json'), JSON.stringify(report, null, 2) + '\n')
}
