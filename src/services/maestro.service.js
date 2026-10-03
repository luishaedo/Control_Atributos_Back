import { parseCode, parseSku } from '../utils/sku.js'

export function MaestroService(prisma) {
  const normalizeValue = (value) => {
    if (value === undefined || value === null) return null
    const trimmed = String(value).trim()
    return trimmed === '' ? null : trimmed
  }

  const runInTransaction = async (fn) => {
    if (typeof prisma.$transaction === 'function') {
      return prisma.$transaction(fn, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 120000 })
    }
    return fn(prisma)
  }

  const invalidImport = (message, details = []) => Object.assign(new Error(message), {
    status: 400,
    code: 'INVALID_IMPORT_DATA',
    details,
  })

  // A single parameterized statement per batch avoids thousands of round trips inside
  // Prisma's interactive transaction (which otherwise expires after five seconds).
  const bulkUpsert = async (tx, table, columns, items, model) => {
    if (!items.length) return
    if (typeof tx.$executeRawUnsafe !== 'function') {
      // In-memory Prisma doubles used by older service tests.
      for (const item of items) {
        await tx[model].upsert({ where: { [columns[0]]: item[columns[0]] }, create: item,
          update: Object.fromEntries(columns.slice(1).map(column => [column, item[column]])) })
      }
      return
    }
    const quotedColumns = columns.map(column => `"${column}"`).join(', ')
    const update = columns.slice(1).map(column => `"${column}" = EXCLUDED."${column}"`).join(', ')
    for (let start = 0; start < items.length; start += 500) {
      const batch = items.slice(start, start + 500)
      const values = batch.flatMap(item => columns.map(column => item[column]))
      const placeholders = batch.map((_, row) => `(${columns.map((_, col) => `$${row * columns.length + col + 1}`).join(', ')})`).join(', ')
      await tx.$executeRawUnsafe(
        `INSERT INTO "${table}" (${quotedColumns}) VALUES ${placeholders} ON CONFLICT ("${columns[0]}") DO UPDATE SET ${update}`,
        ...values,
      )
    }
  }

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

  const validateMaestroImport = async (items = [], { allowPartial = false } = {}) => {
    const omittedRows = []
    const warnings = []
    const normalized = []
    const seen = new Set()
    for (const [index, raw] of items.entries()) {
      const result = normalizeRequiredItem(raw, index)
      if (result.invalid) {
        omittedRows.push({
          row: raw?.sourceRow ?? index + 1,
          field: result.invalid.field,
          reason: result.invalid.reason,
          message: result.invalid.reason === 'invalid_sku' ? 'El SKU está vacío o tiene caracteres inválidos.' : 'Falta un código válido de categoría, tipo o clasificación.',
          value: raw?.[result.invalid.field] ?? null,
          raw: raw?.rawRow ?? raw,
        })
        continue
      }
      if (seen.has(result.item.sku)) {
        omittedRows.push({
          row: raw?.sourceRow ?? index + 1,
          sku: result.item.sku,
          field: 'sku',
          reason: 'duplicate_sku_in_batch',
          message: `El SKU ${result.item.sku} ya aparece en una fila anterior.`,
          value: raw?.rawRow?.sku ?? raw?.sku ?? null,
          raw: raw?.rawRow ?? raw,
        })
        continue
      }
      seen.add(result.item.sku)
      normalized.push({ ...result.item, sourceRow: raw?.sourceRow ?? index + 1, rawRow: raw?.rawRow ?? raw })
      if (result.warning) warnings.push(result.warning)
    }
    if (!allowPartial && omittedRows.length) {
      throw invalidImport('items inválidos; no se importó ningún registro', omittedRows)
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
    const invalidBySku = new Map()
    for (const item of normalized) {
      const invalidFields = Object.entries(domains).filter(([field, domain]) => !domain.has(item[field]))
      if (!invalidFields.length) continue
      invalidBySku.set(item.sku, true)
      const labels = { categoria_cod: 'categoría', tipo_cod: 'tipo', clasif_cod: 'clasificación' }
      omittedRows.push({
        row: item.sourceRow,
        sku: item.sku,
        field: invalidFields.map(([field]) => field).join(', '),
        value: invalidFields.map(([field]) => item[field]).join(', '),
        reason: 'invalid_dictionary_code',
        message: invalidFields.map(([field]) => `El código ${item[field]} no existe en el diccionario de ${labels[field]}.`).join(' '),
        raw: item.rawRow,
      })
    }

    if (!allowPartial && omittedRows.length) {
      throw Object.assign(new Error(`El maestro tiene ${omittedRows.length} fila(s) inválida(s); no se importó ningún registro`), {
        status: 400, code: 'INVALID_DICTIONARY', details: omittedRows,
      })
    }
    const validItems = normalized.filter(item => !invalidBySku.has(item.sku)).map(({ sourceRow, rawRow, ...item }) => item)
    return { items: validItems, warnings, omittedRows }
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
        await bulkUpsert(tx, 'DicCategoria', ['cod', 'nombre'], normalizedCategorias, 'dicCategoria')
        await bulkUpsert(tx, 'DicTipo', ['cod', 'nombre'], normalizedTipos, 'dicTipo')
        await bulkUpsert(tx, 'DicClasif', ['cod', 'nombre'], normalizedClasif, 'dicClasif')
      })
      return { categorias: normalizedCategorias.length, tipos: normalizedTipos.length, clasif: normalizedClasif.length }
    },

    async importMaestroItems(items = [], options = {}) {
      const { items: normalized, warnings, omittedRows } = await validateMaestroImport(items, options)
      await runInTransaction(async tx => {
        await bulkUpsert(tx, 'Maestro', ['sku', 'descripcion', 'categoria_cod', 'tipo_cod', 'clasif_cod'], normalized, 'maestro')
      })
      return { count: normalized.length, skipped: omittedRows, omittedRows, warningCount: warnings.length, warnings }
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
