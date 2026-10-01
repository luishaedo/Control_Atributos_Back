import test from 'node:test'
import assert from 'node:assert/strict'
import { buildConsensusReport } from '../src/services/consenso.service.js'

const baseScan = (overrides) => ({
  id: 1,
  ts: new Date('2026-10-01T10:00:00Z'),
  campaniaId: 33,
  sucursal: 'CENTRO',
  email: 'centro@example.com',
  sku: 'TEST-R33',
  asum_categoria_cod: '01',
  asum_tipo_cod: '01',
  asum_clasif_cod: '01',
  ...overrides,
})

test('R3.3 consenso usa la ultima observacion valida por sucursal, SKU y atributo', () => {
  const report = buildConsensusReport({
    snapshots: [{ sku: 'TEST-R33', categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' }],
    escaneos: [
      baseScan({ id: 1, sucursal: 'CENTRO', asum_categoria_cod: '02', ts: new Date('2026-10-01T10:00:00Z') }),
      baseScan({ id: 2, sucursal: 'CENTRO', asum_categoria_cod: '03', ts: new Date('2026-10-01T10:05:00Z') }),
      baseScan({ id: 3, sucursal: 'NORTE', email: 'norte@example.com', asum_categoria_cod: '02', ts: new Date('2026-10-01T10:03:00Z') }),
      baseScan({ id: 4, sucursal: 'NORTE', email: 'norte@example.com', asum_categoria_cod: '02', ts: new Date('2026-10-01T10:04:00Z') }),
    ],
  })

  const item = report.bySku.get('TEST-R33')
  const categoria = item.consensoAtributos.categoria_cod
  assert.equal(categoria.totalObservantes, 2)
  assert.equal(categoria.votosGanador, 1)
  assert.equal(categoria.consensoPct, 0.5)
  assert.equal(categoria.consensoPorcentaje, 50)
  assert.equal(categoria.estado, 'empate')
  assert.equal(categoria.hayEmpate, true)
  assert.deepEqual(
    categoria.valores.map((v) => [v.value, v.count, v.sucursales]),
    [
      ['02', 1, ['NORTE']],
      ['03', 1, ['CENTRO']],
    ],
  )
  assert.equal(report.eventosAuditados, 4)
  assert.equal(report.latestObservations.filter((obs) => obs.field === 'categoria_cod').length, 2)
})

test('R3.3 consenso separa conflicto sin empatar y mantiene porcentaje maximo 100', () => {
  const report = buildConsensusReport({
    snapshots: [{ sku: 'TEST-R33', categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' }],
    escaneos: [
      baseScan({ id: 1, sucursal: 'CENTRO', asum_tipo_cod: '04' }),
      baseScan({ id: 2, sucursal: 'NORTE', email: 'norte@example.com', asum_tipo_cod: '04' }),
      baseScan({ id: 3, sucursal: 'SUR', email: 'sur@example.com', asum_tipo_cod: '05' }),
    ],
  })

  const tipo = report.bySku.get('TEST-R33').consensoAtributos.tipo_cod
  assert.equal(tipo.totalObservantes, 3)
  assert.equal(tipo.votosGanador, 2)
  assert.equal(tipo.hayConflicto, true)
  assert.equal(tipo.hayEmpate, false)
  assert.equal(tipo.estado, 'conflicto')
  assert.equal(tipo.consensoPorcentaje, 66.67)
  assert.ok(tipo.consensoPorcentaje <= 100)
})

test('R3.3 consenso marca sin observacion por atributo sin inventar votos', () => {
  const report = buildConsensusReport({
    snapshots: [{ sku: 'TEST-R33', categoria_cod: '01', tipo_cod: '01', clasif_cod: '01' }],
    escaneos: [
      baseScan({ asum_clasif_cod: '' }),
      baseScan({ id: 2, sucursal: 'NORTE', email: 'norte@example.com', asum_clasif_cod: null }),
    ],
  })

  const clasif = report.bySku.get('TEST-R33').consensoAtributos.clasif_cod
  assert.equal(clasif.sinObservacion, true)
  assert.equal(clasif.totalObservantes, 0)
  assert.equal(clasif.consensoPorcentaje, 0)
})
