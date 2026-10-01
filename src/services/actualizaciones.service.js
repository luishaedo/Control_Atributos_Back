import { parseCode } from '../utils/sku.js'

const fields = ['categoria_cod', 'tipo_cod', 'clasif_cod']
const isEmptyValue = value => value === undefined || value === null || String(value).trim() === ''
const conflict = () => Object.assign(new Error('La decisión o el maestro cambió. Actualizá la revisión antes de aplicar.'), {
  status: 409, code: 'UPDATE_CONFLICT',
})

export function ActualizacionesService(prisma, transaction = null) {
  const atomic = async fn => {
    try {
      return transaction ? await fn(transaction) : await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (error) {
      // A serialization/deadlock failure rolls back the transaction; never retry a human decision silently.
      if (error.code === 'P2034') throw conflict()
      throw error
    }
  }
  const applyUpdates = async ({ ids = [], decidedBy = '' } = {}) => {
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw Object.assign(new Error('ids debe contener enteros positivos'), { status: 400, code: 'INVALID_IDS' })
    }
    const uniqueIds = [...new Set(ids)]
    try {
      return await atomic(async tx => {
        // Read decisions inside the same snapshot as the conditional writes.
        const acts = await tx.actualizacion.findMany({
          where: { id: { in: uniqueIds } }, orderBy: [{ ts: 'asc' }, { id: 'asc' }],
        })
        if (acts.length !== uniqueIds.length || acts.some(a => a.estado !== 'pendiente' || a.archivada || a.appliedAt)) {
          throw conflict()
        }
        const touched = new Set()
        for (const a of acts) {
          const proposed = fields.filter(field => !isEmptyValue(a[`new_${field}`]))
          if (!proposed.length) throw conflict()
          // A single effective decision per campaign/SKU/attribute, with an ID tie-break.
          // A newer rejection also supersedes an older acceptance.
          const history = await tx.actualizacion.findMany({
            where: { campaniaId: a.campaniaId, sku: a.sku, archivada: false },
            orderBy: [{ ts: 'desc' }, { id: 'desc' }],
          })
          const data = {}
          const expected = { sku: a.sku }
          for (const field of proposed) {
            const key = `${a.sku}:${field}`
            if (touched.has(key)) throw conflict()
            touched.add(key)
            const latest = history.find(row => !isEmptyValue(row[`new_${field}`]))
            if (!latest || latest.id !== a.id) throw conflict()
            // Missing baseline cannot safely authorize an overwrite of a known SKU.
            if (a[`old_${field}`] === null || a[`old_${field}`] === undefined) throw conflict()
            data[field] = a[`new_${field}`]
            expected[field] = a[`old_${field}`]
          }
          // Compare only proposed attributes: unrelated accepted changes are preserved.
          const changed = await tx.maestro.updateMany({ where: expected, data })
          if (changed.count !== 1) throw conflict()
          const claimed = await tx.actualizacion.updateMany({
            where: { id: a.id, estado: 'pendiente', archivada: false, appliedAt: null },
            data: { estado: 'aplicada', decidedBy: decidedBy || a.decidedBy, appliedAt: new Date() },
          })
          if (claimed.count !== 1) throw conflict()
        }
        return { count: acts.length }
      })
    } catch (error) {
      // PostgreSQL serialization/deadlock failures roll back the complete transaction.
      // Do not silently retry a human decision against a changed baseline.
      if (error.code === 'P2034') throw conflict()
      throw error
    }
  }

  const normalizeCode = (value, field = 'código') => {
    if (isEmptyValue(value)) return ''
    const parsed = parseCode(value)
    if (!parsed.valid) {
      throw Object.assign(new Error(`${field} debe tener uno o dos dígitos; no se truncó el valor`), {
        status: 422, code: 'INVALID_CODE_FORMAT', field,
      })
    }
    return parsed.normalized
  }

  const recordDecision = async ({ campaniaId, sku, propuesta, decision, decidedBy, notas, aplicarAhora }) => atomic(async tx => {
    if (aplicarAhora) {
      throw Object.assign(new Error('La aplicación anticipada está deshabilitada; confirmá y cerrá la campaña'), {
        status: 409, code: 'APPLY_REQUIRES_CLOSE',
      })
    }
    const campaign = await tx.campania.findUnique({ where: { id: campaniaId } })
    if (!campaign?.activa || (campaign.estado && campaign.estado !== 'ACTIVA')) {
      throw Object.assign(new Error('La campaña no está activa'), { status: 409, code: 'CAMPAIGN_NOT_ACTIVE' })
    }
    const currentStage = await tx.skuStage.findUnique({ where: { campaniaId_sku: { campaniaId, sku } } })
    if (currentStage?.stage === 'consolidate') {
      throw Object.assign(new Error('El SKU ya está consolidado y no admite nuevas decisiones'), {
        status: 409, code: 'DECISION_ALREADY_CONFIRMED',
      })
    }
    const proposed = fields.filter(field => !isEmptyValue(propuesta?.[field]))
    const normalizedProposal = Object.fromEntries(fields.map(field => [field, normalizeCode(propuesta?.[field], field)]))
    const dictionaryModels = {
      categoria_cod: tx.dicCategoria,
      tipo_cod: tx.dicTipo,
      clasif_cod: tx.dicClasif,
    }
    const invalidDomain = (await Promise.all(proposed.map(async field => ({
      field,
      exists: Boolean(await dictionaryModels[field].findUnique({ where: { cod: normalizedProposal[field] } })),
    })))).filter(item => !item.exists)
    if (invalidDomain.length) {
      throw Object.assign(new Error('Uno o más códigos no existen en los diccionarios'), {
        status: 422, code: 'INVALID_DICTIONARY', details: invalidDomain.map(({ field }) => ({
          field, value: normalizedProposal[field],
        })),
      })
    }
    const snapshot = await tx.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId, sku } } })
    // A new review starts from the current master, not an immutable campaign snapshot.
    const master = await tx.maestro.findUnique({ where: { sku } })
    const history = proposed.length ? await tx.actualizacion.findMany({
      where: { campaniaId, sku, archivada: false },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
    }) : []
    const previous = history.filter(row => row.estado === 'pendiente' && !row.appliedAt)
    for (const row of previous) {
      if (!proposed.some(field => !isEmptyValue(row[`new_${field}`]))) continue
      // Keep the original intact for audit; carry forward its unaffected attributes.
      const remaining = fields.filter(field => !proposed.includes(field) && !isEmptyValue(row[`new_${field}`]) &&
        history.find(item => !isEmptyValue(item[`new_${field}`]))?.id === row.id)
      await tx.actualizacion.updateMany({ where: { id: row.id, estado: 'pendiente', archivada: false },
        data: { archivada: true, archivadaAt: new Date(), archivadaBy: decidedBy || 'admin' } })
      if (remaining.length) {
        await tx.actualizacion.create({ data: {
          campaniaId, sku, ts: row.ts, estado: 'pendiente', decidedBy: row.decidedBy,
          decidedAt: row.decidedAt, notas: `Continuación parcial de ${row.id}`,
          ...Object.fromEntries(fields.flatMap(field => [
            [`old_${field}`, row[`old_${field}`]],
            [`new_${field}`, remaining.includes(field) ? row[`new_${field}`] : ''],
          ])),
        } })
      }
    }
    const act = await tx.actualizacion.create({ data: {
      campaniaId, sku, estado: decision === 'aceptar' ? 'pendiente' : 'rechazada',
      decidedBy: decidedBy || null, decidedAt: new Date(), notas,
      ...Object.fromEntries(fields.flatMap(field => [
        [`old_${field}`, master?.[field] ?? snapshot?.[field] ?? null],
        [`new_${field}`, normalizedProposal[field]],
      ])),
    } })
    if (decision === 'aceptar') {
      await tx.skuStage.upsert({
        where: { campaniaId_sku: { campaniaId, sku } },
        create: { campaniaId, sku, stage: 'evaluate', updatedBy: decidedBy || null },
        update: { stage: 'evaluate', updatedBy: decidedBy || null, updatedAt: new Date() },
      })
    }
    return act
  })

  const revertApplied = async ({ id, decidedBy = '', notas = '' } = {}) => {
    if (!Number.isSafeInteger(id) || id < 1) {
      throw Object.assign(new Error('id debe ser un entero positivo'), { status: 400, code: 'INVALID_ID' })
    }
    try {
      return await atomic(async tx => {
        const original = await tx.actualizacion.findUnique({ where: { id } })
        if (!original) {
          throw Object.assign(new Error('Actualización no encontrada'), { status: 404, code: 'UPDATE_NOT_FOUND' })
        }
        if (original.estado !== 'aplicada' || !original.appliedAt || original.archivada) {
          throw Object.assign(new Error('Solo se puede revertir una actualización aplicada y vigente'), {
            status: 409, code: 'REVERSAL_NOT_ALLOWED',
          })
        }
        if (await tx.actualizacion.findUnique({ where: { reversalOfId: id } })) {
          throw Object.assign(new Error('La actualización ya tiene una reversión compensatoria'), {
            status: 409, code: 'REVERSAL_ALREADY_EXISTS',
          })
        }
        const master = await tx.maestro.findUnique({ where: { sku: original.sku } })
        if (!master) throw conflict()
        const changedFields = fields.filter(field =>
          !isEmptyValue(original[`new_${field}`]) && original[`new_${field}`] !== original[`old_${field}`])
        if (!changedFields.length) {
          throw Object.assign(new Error('La actualización no produjo cambios reversibles'), {
            status: 409, code: 'REVERSAL_NOT_ALLOWED',
          })
        }
        for (const field of changedFields) {
          if (master[field] !== original[`new_${field}`] || isEmptyValue(original[`old_${field}`])) throw conflict()
        }
        const reversal = await tx.actualizacion.create({ data: {
          campaniaId: original.campaniaId,
          sku: original.sku,
          estado: 'pendiente',
          decidedBy: decidedBy || null,
          decidedAt: new Date(),
          notas: notas || `Reversión compensatoria de ${original.id}`,
          reversalOfId: original.id,
          ...Object.fromEntries(fields.flatMap(field => [
            [`old_${field}`, master[field] ?? null],
            [`new_${field}`, changedFields.includes(field) ? original[`old_${field}`] : ''],
          ])),
        } })
        await ActualizacionesService(prisma, tx).applyUpdates({ ids: [reversal.id], decidedBy })
        return tx.actualizacion.findUnique({ where: { id: reversal.id } })
      })
    } catch (error) {
      if (error?.code === 'P2002') {
        throw Object.assign(new Error('La actualización ya tiene una reversión compensatoria'), {
          status: 409, code: 'REVERSAL_ALREADY_EXISTS',
        })
      }
      throw error
    }
  }

  return { applyUpdates, normalizeCode, recordDecision, revertApplied }
}
