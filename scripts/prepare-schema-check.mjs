import { readFile, writeFile } from 'node:fs/promises'

// Solo la sintaxis escalar actual del proyecto; falla ante tipos/mapeos nuevos.
const source = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')
if (/@map|@@map|@db\./.test(source)) throw new Error('Mapeos requieren ampliar el generador')
const quote = value => `'${String(value).replaceAll("'", "''")}'`
const types = { String: 'text', Int: 'integer', Boolean: 'boolean', DateTime: 'timestamp without time zone' }
const models = [...source.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g)]
const modelNames = new Set(models.map(m => m[1]))
const expected = models.flatMap(([, model, body]) => body.split('\n').flatMap(line => {
  const clean = line.split('//')[0].trim()
  if (!clean || clean.startsWith('@@')) return []
  const match = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(clean)
  if (!match) throw new Error(`Campo no reconocido: ${clean}`)
  const [, name, type, modifier] = match
  if (modelNames.has(type)) return []
  if (!types[type] || modifier === '[]') throw new Error(`Tipo sin soporte: ${type}`)
  return [`(${[model, name, types[type], modifier === '?' ? 'YES' : 'NO'].map(quote).join(',')})`]
}))
if (!expected.length) throw new Error('Esquema sin campos')
const sql = `-- Solo lectura; compara columnas/tipos/nulabilidad contra schema.prisma.
WITH expected(table_name,column_name,data_type,is_nullable) AS (VALUES
${expected.join(',\n')}
), actual AS (
 SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
 WHERE table_schema='public'
), missing_or_different AS (SELECT * FROM expected EXCEPT SELECT * FROM actual),
unexpected AS (SELECT * FROM actual EXCEPT SELECT * FROM expected)
SELECT (SELECT count(*) FROM expected) AS expected_columns,
 (SELECT count(*) FROM actual) AS actual_columns,
 (SELECT count(*) FROM missing_or_different) AS missing_or_different,
 (SELECT count(*) FROM unexpected) AS unexpected,
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
 (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='p') AS primary_keys,
 (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.contype='f') AS foreign_keys;
`
await writeFile(new URL('../docs/development/migration-validation/check-schema.sql', import.meta.url), sql)
console.log(`SQL preparado para ${expected.length} columnas, sin conexion DB`)
