// Genera evidencia local; no abre conexiones ni lee .env.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(root, 'prisma/migrations')
const output = path.join(root, 'docs/development/migration-validation')
const names = (await readdir(source, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
const manifest = []
const sections = []
for (const name of names) {
  const bytes = await readFile(path.join(source, name, 'migration.sql'))
  manifest.push({ name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
  sections.push(`-- Migration: ${name}\n${bytes.toString('utf8')}`)
}
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
await writeFile(path.join(output, 'validate-isolated.sql'), `-- SOLO rama aislada r02-migration-validation, base neondb.
-- Validación SQL: NO sustituye prisma migrate deploy ni crea historial Prisma.
-- Revisar la rama en la consola antes de ejecutar: SQL no identifica la rama Neon.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public') THEN
    RAISE EXCEPTION 'Validacion requiere public sin tablas';
  END IF;
END $$;
${sections.join('\n\n')}
SELECT count(*) AS application_tables FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
COMMIT;
`)
console.log(`Preparadas ${manifest.length} migraciones; sin conexion DB. Salida: docs/development/migration-validation`)
