import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSku, pad2, parseCode, parseSku } from '../src/utils/sku.js'

test('R1.1 separa sufijos #/$ y conserva una identidad base canónica', () => {
  assert.deepEqual(parseSku(' abC123#etiqueta '), {
    valid: true,
    normalized: 'ABC123',
    separator: '#',
    suffix: 'etiqueta',
    hadSuffix: true,
    reason: null,
  })
  assert.equal(cleanSku('xy9$precio'), 'XY9')
})

test('R1.1 rechaza formatos SKU no permitidos sin recortarlos', () => {
  assert.equal(parseSku('ABC-123').valid, false)
  assert.equal(cleanSku('ABC-123'), '')
  assert.equal(cleanSku('ABC 123'), '')
})

test('R1.1 normaliza códigos de uno o dos dígitos y no trunca otros valores', () => {
  assert.equal(pad2('7'), '07')
  assert.equal(pad2('09'), '09')
  assert.deepEqual(parseCode('123'), { valid: false, normalized: '', reason: 'INVALID_FORMAT' })
  assert.equal(pad2('A-9'), '')
})
