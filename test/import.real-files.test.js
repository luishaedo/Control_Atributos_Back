import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { ImportService } from '../src/services/import.service.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const file = name => readFile(resolve(root, name))
const hasWorkspaceFiles = ['categorias2.csv', 'tipos.csv', 'clasificacion.csv', 'Maestro_ligth.csv', 'Maestro.csv']
  .every(name => existsSync(resolve(root, name)))

function database({ failAt = Infinity } = {}) {
  let state = Object.fromEntries(['DicCategoria', 'DicTipo', 'DicClasif', 'Maestro'].map(name => [name, new Map()]))
  let statements = 0
  const prisma = {
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'Serializable')
      assert.ok(options.timeout >= 120000)
      const snapshot = Object.fromEntries(Object.entries(state).map(([name, rows]) => [name, new Map(rows)]))
      try { return await callback(prisma) } catch (error) { state = snapshot; throw error }
    },
    async $executeRawUnsafe(sql, ...values) {
      statements++
      if (statements === failAt) throw new Error('simulated database failure')
      const match = /^INSERT INTO "(DicCategoria|DicTipo|DicClasif|Maestro)" \(([^)]+)\) VALUES /.exec(sql)
      assert.ok(match, 'only fixed, quoted table names are accepted')
      assert.match(sql, /ON CONFLICT \("(?:cod|sku)"\) DO UPDATE SET/)
      const columns = [...match[2].matchAll(/"([^"]+)"/g)].map(([, name]) => name)
      assert.ok(values.length <= 2500)
      for (let offset = 0; offset < values.length; offset += columns.length) {
        const row = Object.fromEntries(columns.map((name, index) => [name, values[offset + index]]))
        state[match[1]].set(row[columns[0]], row)
      }
    },
    ...Object.fromEntries([['dicCategoria', 'DicCategoria'], ['dicTipo', 'DicTipo'], ['dicClasif', 'DicClasif']].map(([model, name]) => [model, {
      async findMany({ where }) { return [...state[name].values()].filter(row => where.cod.in.includes(row.cod)) },
    }])),
  }
  return { service: ImportService(prisma), rows: name => state[name], countStatements: () => statements }
}

test('los CSV entregados cargan diccionarios y ambos maestros en lotes acotados', { skip: !hasWorkspaceFiles }, async () => {
  const db = database()
  const dictionaries = await db.service.importarDiccionariosDesdeBuffers({
    categoriasBuf: await file('categorias2.csv'),
    tiposBuf: await file('tipos.csv'),
    clasifBuf: await file('clasificacion.csv'),
  })
  assert.deepEqual([dictionaries.categorias, dictionaries.tipos, dictionaries.clasif], [50, 28, 16])
  assert.equal(db.rows('DicCategoria').get('01').nombre, 'JEAN')
  const light = await db.service.importarMaestroDesdeBuffer(await file('Maestro_ligth.csv'))
  assert.equal(light.count, 8)
  assert.equal(light.omittedRows.length, 0)
  const full = await db.service.importarMaestroDesdeBuffer(await file('Maestro.csv'))
  assert.equal(full.count, 7586)
  assert.equal(full.omittedRows.length, 7)
  assert.deepEqual(full.omittedRows.reduce((counts, row) => ({ ...counts, [row.reason]: (counts[row.reason] || 0) + 1 }), {}), {
    invalid_sku: 4, invalid_code: 3,
  })
  assert.equal(db.rows('Maestro').size, 7586)
  assert.ok(db.countStatements() <= 22)
  const again = await db.service.importarMaestroDesdeBuffer(await file('Maestro_ligth.csv'))
  assert.equal(again.count, 8)
  assert.equal(db.rows('Maestro').size, 7586)
})

test('si falla un lote, la transacción revierte también los lotes anteriores', { skip: !hasWorkspaceFiles }, async () => {
  const db = database({ failAt: 5 })
  await db.service.importarDiccionariosDesdeBuffers({
    categoriasBuf: await file('categorias2.csv'),
    tiposBuf: await file('tipos.csv'),
    clasifBuf: await file('clasificacion.csv'),
  })
  await assert.rejects(db.service.importarMaestroDesdeBuffer(await file('Maestro.csv')), /simulated database failure/)
  assert.equal(db.rows('Maestro').size, 0)
})

test('CI: un maestro grande se divide en lotes de 500 y conserva el upsert', async () => {
  const db = database()
  const dictionary = Buffer.from('cod,nombre\n01,Prueba\n')
  await db.service.importarDiccionariosDesdeBuffers({
    categoriasBuf: dictionary, tiposBuf: dictionary, clasifBuf: dictionary,
  })
  const rows = Array.from({ length: 1201 }, (_, index) => `SKU${index + 1},Artículo ${index + 1},01,01,01`)
  const csv = Buffer.from(`sku,descripcion,categoria_cod,tipo_cod,clasif_cod\n${rows.join('\n')}\n`)
  const imported = await db.service.importarMaestroDesdeBuffer(csv)
  assert.equal(imported.count, 1201)
  assert.equal(db.rows('Maestro').size, 1201)
  assert.equal(db.countStatements(), 6) // three dictionaries and three master batches
  await db.service.importarMaestroDesdeBuffer(csv)
  assert.equal(db.rows('Maestro').size, 1201)
})
