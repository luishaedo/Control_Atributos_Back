import { pad2 } from '../utils/sku.js'

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

  const normalizeCode = value => isEmptyValue(value) ? '' : pad2(String(value).trim())

  const recordDecision = async ({ campaniaId, sku, propuesta, decision, decidedBy, notas, aplicarAhora }) => atomic(async tx => {
    const proposed = fields.filter(field => !isEmptyValue(propuesta?.[field]))
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
        [`new_${field}`, normalizeCode(propuesta?.[field])],
      ])),
    } })
    if (decision === 'aceptar') {
      await tx.skuStage.upsert({
        where: { campaniaId_sku: { campaniaId, sku } },
        create: { campaniaId, sku, stage: 'confirm', updatedBy: decidedBy || null },
        update: { stage: 'confirm', updatedBy: decidedBy || null, updatedAt: new Date() },
      })
      if (aplicarAhora) {
        await ActualizacionesService(prisma, tx).applyUpdates({ ids: [act.id], decidedBy })
        return tx.actualizacion.findUnique({ where: { id: act.id } })
      }
    }
    return act
  })
  return { applyUpdates, normalizeCode, recordDecision }
}
