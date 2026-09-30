import { ActualizacionesService } from './actualizaciones.service.js'

const fields = ['categoria_cod', 'tipo_cod', 'clasif_cod']
const isEmpty = value => value === undefined || value === null || String(value).trim() === ''
const appError = (code, status, message) => Object.assign(new Error(message), { code, status })

function effectivePendingIds(rows) {
  const seen = new Set()
  const ids = new Set()
  for (const row of rows) {
    for (const field of fields) {
      if (isEmpty(row[`new_${field}`])) continue
      const key = `${row.sku}:${field}`
      if (seen.has(key)) continue
      seen.add(key)
      if (row.estado === 'pendiente' && !row.appliedAt) ids.add(row.id)
    }
  }
  return [...ids]
}

async function applyApprovedUnknown(tx, unknown, closedBy) {
  if (unknown.appliedToMaestroAt) return false
  await tx.maestro.upsert({
    where: { sku: unknown.sku },
    create: {
      sku: unknown.sku,
      descripcion: unknown.descripcion || '',
      categoria_cod: unknown.categoria_cod,
      tipo_cod: unknown.tipo_cod,
      clasif_cod: unknown.clasif_cod,
    },
    update: {
      descripcion: unknown.descripcion || '',
      categoria_cod: unknown.categoria_cod,
      tipo_cod: unknown.tipo_cod,
      clasif_cod: unknown.clasif_cod,
    },
  })
  const claimed = await tx.unknownSku.updateMany({
    where: { id: unknown.id, status: 'APPROVED', appliedToMaestroAt: null },
    data: { appliedToMaestroAt: new Date(), appliedToMaestroBy: closedBy || null },
  })
  if (claimed.count !== 1) throw appError('CLOSE_CONFLICT', 409, 'El desconocido cambió durante el cierre')
  return true
}

export function CampaignClosureService(prisma) {
  return {
    async close({ campaniaId, closedBy = '' }) {
      if (!Number.isSafeInteger(campaniaId) || campaniaId < 1) {
        throw appError('INVALID_CAMPAIGN_ID', 400, 'campaniaId requerido')
      }
      try {
        return await prisma.$transaction(async tx => {
          const campaign = await tx.campania.findUnique({ where: { id: campaniaId } })
          if (!campaign) throw appError('CAMPAIGN_NOT_FOUND', 404, 'Campaña no encontrada')
          if (campaign.estado === 'CERRADA' || campaign.closedAt) {
            return {
              alreadyClosed: true,
              applied: await tx.actualizacion.count({ where: { campaniaId, estado: 'aplicada' } }),
              unknownApplied: await tx.unknownSku.count({ where: { campaniaId, appliedToMaestroAt: { not: null } } }),
            }
          }
          if (!campaign.activa || campaign.estado !== 'ACTIVA') {
            throw appError('CAMPAIGN_NOT_ACTIVE', 409, 'Solo una campaña activa puede cerrarse')
          }
          const claimed = await tx.campania.updateMany({
            where: { id: campaniaId, activa: true, estado: 'ACTIVA', closedAt: null },
            data: { estado: 'CERRANDO' },
          })
          if (claimed.count !== 1) throw appError('CLOSE_CONFLICT', 409, 'La campaña cambió durante el cierre')

          const stages = await tx.skuStage.findMany({
            where: { campaniaId, stage: 'consolidate' },
            select: { sku: true },
          })
          const confirmedSkus = stages.map(item => item.sku)
          const decisions = confirmedSkus.length ? await tx.actualizacion.findMany({
            where: { campaniaId, sku: { in: confirmedSkus }, archivada: false },
            orderBy: [{ ts: 'desc' }, { id: 'desc' }],
          }) : []
          const ids = effectivePendingIds(decisions)
          const { count: applied } = ids.length
            ? await ActualizacionesService(prisma, tx).applyUpdates({ ids, decidedBy: closedBy })
            : { count: 0 }

          const unknowns = confirmedSkus.length ? await tx.unknownSku.findMany({
            where: {
              campaniaId,
              sku: { in: confirmedSkus },
              status: 'APPROVED',
              appliedToMaestroAt: null,
            },
          }) : []
          let unknownApplied = 0
          for (const unknown of unknowns) {
            if (!unknown.categoria_cod || !unknown.tipo_cod || !unknown.clasif_cod) {
              throw appError('INVALID_UNKNOWN', 409, `El SKU ${unknown.sku} no tiene atributos completos`)
            }
            if (await applyApprovedUnknown(tx, unknown, closedBy)) unknownApplied += 1
          }

          await tx.campania.update({
            where: { id: campaniaId },
            data: {
              activa: false,
              estado: 'CERRADA',
              closedAt: new Date(),
              closedBy: closedBy || null,
            },
          })
          return { alreadyClosed: false, applied, unknownApplied }
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (error?.code === 'P2034') {
          throw appError('CLOSE_CONFLICT', 409, 'El cierre cambió en simultáneo; actualizá y reintentá')
        }
        throw error
      }
    },
  }
}

export { effectivePendingIds }
