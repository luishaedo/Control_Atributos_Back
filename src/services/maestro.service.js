import { parseCode, parseSku } from '../utils/sku.js'

export function MaestroService(prisma) {
  const normalizeValue = (value) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const runInTransaction = async (fn) => {
    if (typeof prisma.$transaction === 'function') {
      return prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    }
    return fn(prisma)
  }

  const invalidImport = (message, details = []) => Object.assign(new Error(message), {
    status: 400,
    code: 'INVALID_IMPORT_DATA',
    details,
  })

  const normalizeRequiredItem = (item, index) => {
    const parsedSku = parseSku(item?.sku || '')
    const sku = parsedSku.normalized
    const fields = [
      ['categoria_cod', item?.categoria_cod],
      ['tipo_cod', item?.tipo_cod],
      ['clasif_cod', item?.clasif_cod],
    ]
    const parsedCodes = Object.fromEntries(fields.map(([field, value]) => [field, parseCode(value)]))
    const invalidField = Object.entries(parsedCodes).find(([, parsed]) => !parsed.valid)?.[0]
    if (!parsedSku.valid || invalidField) {
      return {
        invalid: {
          row: index + 1,
          sku: sku || item?.sku || null,
          field: !parsedSku.valid ? 'sku' : invalidField,
          reason: !parsedSku.valid ? 'invalid_sku' : 'invalid_code_or_missing_fields',
        },
      }
    }
    return {
      item: {
        sku,
        descripcion: normalizeValue(item?.descripcion) || '',
        categoria_cod: parsedCodes.categoria_cod.normalized,
        tipo_cod: parsedCodes.tipo_cod.normalized,
        clasif_cod: parsedCodes.clasif_cod.normalized,
      },
      warning: item?.skuWarning || (parsedSku.hadSuffix ? {
        code: 'SKU_SUFFIX_IGNORED',
        skuRaw: String(item.sku || ''),
        skuNormalized: sku,
        separator: parsedSku.separator,
      } : null),
    }
  }

  const validateMaestroImport = async (items = []) => {
    const invalidItems = []
    const warnings = []
    const normalized = []
    const seen = new Set()
    for (const [index, raw] of items.entries()) {
      const result = normalizeRequiredItem(raw, index)
      if (result.invalid) {
        invalidItems.push(result.invalid)
        continue
      }
      if (seen.has(result.item.sku)) {
        invalidItems.push({
          row: index + 1,
          sku: result.item.sku,
          field: 'sku',
          reason: 'duplicate_sku_in_batch',
        })
        continue
      }
      seen.add(result.item.sku)
      normalized.push(result.item)
      if (result.warning) warnings.push(result.warning)
    }
    if (invalidItems.length) {
      throw invalidImport('items inválidos; no se importó ningún registro', invalidItems)
    }

    const unique = field => [...new Set(normalized.map(item => item[field]))]
    const [categorias, tipos, clasif] = await Promise.all([
      prisma.dicCategoria.findMany({ where: { cod: { in: unique('categoria_cod') } } }),
      prisma.dicTipo.findMany({ where: { cod: { in: unique('tipo_cod') } } }),
      prisma.dicClasif.findMany({ where: { cod: { in: unique('clasif_cod') } } }),
    ])
    const domains = {
      categoria_cod: new Set(categorias.map(item => item.cod)),
      tipo_cod: new Set(tipos.map(item => item.cod)),
      clasif_cod: new Set(clasif.map(item => item.cod)),
    }
    const domainErrors = normalized.flatMap((item, index) => Object.entries(domains)
      .filter(([field, domain]) => !domain.has(item[field]))
      .map(([field]) => ({ row: index + 1, sku: item.sku, field, value: item[field], reason: 'invalid_dictionary_code' })))
    if (domainErrors.length) {
      throw Object.assign(new Error(
        `El maestro contiene ${domainErrors.length} código(s) fuera de los diccionarios; no se importó ningún registro`), {
        status: 400, code: 'INVALID_DICTIONARY', details: domainErrors,
      })
    }

    return { items: normalized, warnings }
  }

  return {
    async upsertDiccionarios({ categorias = [], tipos = [], clasif = [] }) {
      const normalizeEntries = (items, field) => items.map((item, index) => {
        const parsed = parseCode(item?.cod)
        if (!parsed.valid) {
          throw Object.assign(new Error(`${field}[${index}].cod debe tener uno o dos dígitos; no se truncó el valor`), {
            status: 400, code: 'INVALID_CODE_FORMAT',
          })
        }
        return { ...item, cod: parsed.normalized }
      })
      const normalizedCategorias = normalizeEntries(categorias, 'categorias')
      const normalizedTipos = normalizeEntries(tipos, 'tipos')
      const normalizedClasif = normalizeEntries(clasif, 'clasif')
      await runInTransaction(async tx => {
        for (const c of normalizedCategorias) {
          await tx.dicCategoria.upsert({ where: { cod: c.cod }, create: c, update: { nombre: c.nombre } })
        }
        for (const t of normalizedTipos) {
          await tx.dicTipo.upsert({ where: { cod: t.cod }, create: t, update: { nombre: t.nombre } })
        }
        for (const cl of normalizedClasif) {
          await tx.dicClasif.upsert({ where: { cod: cl.cod }, create: cl, update: { nombre: cl.nombre } })
        }
      })
      return { categorias: normalizedCategorias.length, tipos: normalizedTipos.length, clasif: normalizedClasif.length }
    },

    async importMaestroItems(items = []) {
      const { items: normalized, warnings } = await validateMaestroImport(items)
      await runInTransaction(async tx => {
        for (const item of normalized) {
          await tx.maestro.upsert({
            where: { sku: item.sku },
            create: item,
            update: {
              descripcion: item.descripcion,
              categoria_cod: item.categoria_cod,
              tipo_cod: item.tipo_cod,
              clasif_cod: item.clasif_cod,
            },
          })
        }
      })
      return { count: normalized.length, skipped: [], warningCount: warnings.length, warnings }
    },

    async upsertMaestro(items = []) {
      let count = 0
      const skipped = []
      const operations = []
      for (const it of items) {
        if (!it?.sku) continue
        const parsedSku = parseSku(it.sku)
        if (!parsedSku.valid) {
          skipped.push({ sku: it.sku, reason: 'invalid_sku' })
          continue
        }
        const sku = parsedSku.normalized
        const descripcion = normalizeValue(it.descripcion)
        const categoriaCod = normalizeValue(it.categoria_cod)
        const tipoCod = normalizeValue(it.tipo_cod)
        const clasifCod = normalizeValue(it.clasif_cod)
        const updateData = {}
        if (descripcion !== null) updateData.descripcion = descripcion
        const parsedCodes = Object.fromEntries([
          ['categoria_cod', categoriaCod], ['tipo_cod', tipoCod], ['clasif_cod', clasifCod],
        ].map(([field, value]) => [field, value === null ? null : parseCode(value)]))
        const invalidField = Object.entries(parsedCodes).find(([, parsed]) => parsed && !parsed.valid)?.[0]
        if (invalidField) {
          skipped.push({ sku, reason: `invalid_${invalidField}` })
          continue
        }
        if (categoriaCod !== null) updateData.categoria_cod = parsedCodes.categoria_cod.normalized
        if (tipoCod !== null) updateData.tipo_cod = parsedCodes.tipo_cod.normalized
        if (clasifCod !== null) updateData.clasif_cod = parsedCodes.clasif_cod.normalized
        if (Object.keys(updateData).length === 0) {
          skipped.push({ sku, reason: 'empty_payload' })
          continue
        }
        operations.push({
          where: { sku },
          create: {
            sku,
            descripcion: descripcion ?? '',
            categoria_cod: parsedCodes.categoria_cod?.normalized || '',
            tipo_cod: parsedCodes.tipo_cod?.normalized || '',
            clasif_cod: parsedCodes.clasif_cod?.normalized || '',
          },
          update: updateData
        })
        count++
      }
      await runInTransaction(async tx => {
        for (const operation of operations) await tx.maestro.upsert(operation)
      })
      return { count, skipped }
    },
  }
}
