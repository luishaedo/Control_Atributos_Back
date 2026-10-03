import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { ImportService } from '../src/services/import.service.js'

test('CSV entregados: upsert real y reimportación en PostgreSQL aislado', {
  skip: !process.env.IMPORT_TEST_DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.IMPORT_TEST_DATABASE_URL } } })
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const file = name => readFile(resolve(root, name))
  try {
    const service = ImportService(prisma)
    const dictionaries = await service.importarDiccionariosDesdeBuffers({
      categoriasBuf: await file('categorias2.csv'),
      tiposBuf: await file('tipos.csv'),
      clasifBuf: await file('clasificacion.csv'),
    })
    assert.deepEqual([dictionaries.categorias, dictionaries.tipos, dictionaries.clasif], [50, 28, 16])
    assert.equal(await prisma.dicCategoria.count(), 50)
    assert.equal(await prisma.dicTipo.count(), 28)
    assert.equal(await prisma.dicClasif.count(), 16)
    const light = await service.importarMaestroDesdeBuffer(await file('Maestro_ligth.csv'))
    assert.deepEqual([light.count, light.omittedRows.length], [8, 0])
    const full = await service.importarMaestroDesdeBuffer(await file('Maestro.csv'))
    assert.deepEqual([full.count, full.omittedRows.length], [7586, 7])
    assert.equal(await prisma.maestro.count(), 7586)
    await service.importarMaestroDesdeBuffer(await file('Maestro.csv'))
    assert.equal(await prisma.maestro.count(), 7586)
  } finally {
    await prisma.$disconnect()
  }
})
