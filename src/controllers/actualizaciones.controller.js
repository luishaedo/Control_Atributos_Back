import { ActualizacionesService } from '../services/actualizaciones.service.js'
import { toCSV } from '../utils/csv.js'
import { sendAdminError } from '../utils/http.js'

export function ActualizacionesController(prisma) {
  const { revertApplied } = ActualizacionesService(prisma)
  const ensureModel = (model, name, res) => {
    if (!model) {
      sendAdminError(res, 500, `Prisma client missing ${name}. Run prisma:generate.`)
      return null
    }
    return model
  }

  const parseArchivada = (value) => {
    if (value === undefined || value === null) return undefined
    const normalized = String(value).trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    return undefined
  }

  const formatTimestamp = (date) => {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const hh = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${yyyy}${mm}${dd}_${hh}${min}`
  }

  const sanitizeFilenamePart = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return 'campania'
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'campania'
  }

  const ensureClosedCampaign = async (campaniaId, res) => {
    const camp = await prisma.campania.findUnique({
      where: { id: campaniaId },
      select: { id: true, nombre: true, estado: true, closedAt: true },
    })
    if (!camp) {
      sendAdminError(res, 404, 'Campaña no encontrada')
      return null
    }
    if (camp.estado !== 'CERRADA' || !camp.closedAt) {
      sendAdminError(res, 409, 'La exportación final requiere una campaña cerrada')
      return null
    }
    return camp
  }

  const buildTxtResponse = async ({
    campaniaId,
    attributeKey,
    filename,
    scope = 'applied',
  }, res) => {
    const camp = await ensureClosedCampaign(campaniaId, res)
    if (!camp) return
    const fieldMap = {
      categoria: { newKey: 'new_categoria_cod', oldKey: 'old_categoria_cod' },
      tipo: { newKey: 'new_tipo_cod', oldKey: 'old_tipo_cod' },
      clasif: { newKey: 'new_clasif_cod', oldKey: 'old_clasif_cod' },
    }
    const fields = fieldMap[attributeKey]
    if (!fields) {
      return sendAdminError(res, 400, 'atributo inválido')
    }
    const lines = []
    if (scope !== 'applied' && scope !== 'unknown') {
      return sendAdminError(res, 400, 'scope inválido')
    }
    if (scope === 'applied') {
      const actualizaciones = await prisma.actualizacion.findMany({
        where: { campaniaId, estado: 'aplicada', appliedAt: { not: null } },
        orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
      })
      const seen = new Set()
      for (const act of actualizaciones) {
        const key = `${act.sku}:${attributeKey}`
        if (seen.has(key)) continue
        const newValue = act[fields.newKey]
        const oldValue = act[fields.oldKey] ?? ''
        if (!newValue || String(newValue) === String(oldValue)) continue
        seen.add(key)
        lines.push(`${act.sku}\t${newValue}`)
      }
    } else if (scope === 'unknown') {
      const unknownFieldMap = {
        categoria: 'categoria_cod',
        tipo: 'tipo_cod',
        clasif: 'clasif_cod',
      }
      const unknownField = unknownFieldMap[attributeKey]
      const skuStage = ensureModel(prisma.skuStage, 'skuStage', res)
      const unknownSku = ensureModel(prisma.unknownSku, 'unknownSku', res)
      if (!skuStage || !unknownSku) return
      const stages = await skuStage.findMany({
        where: { campaniaId, stage: 'consolidate' },
        select: { sku: true },
      })
      const skuList = stages.map((row) => row.sku)
      if (skuList.length) {
        const unknowns = await unknownSku.findMany({
          where: {
            campaniaId,
            sku: { in: skuList },
            status: 'APPROVED',
            appliedToMaestroAt: { not: null },
          },
          orderBy: [{ appliedToMaestroAt: 'desc' }, { id: 'desc' }],
        })
        for (const item of unknowns) {
          const value = unknownField ? item[unknownField] : ''
          if (!value) continue
          lines.push(`${item.sku}\t${value}`)
        }
      }
    }
    const safeName = sanitizeFilenamePart(camp?.nombre || `campania_${campaniaId}`)
    const timestamp = formatTimestamp(new Date(camp.closedAt))
    const exportName = `${safeName}_${attributeKey}_${timestamp}.txt`
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportName}"`
    )
    res.send(lines.join('\n'))
  }

  const buildSummaryTxt = async ({ campaniaId }, res) => {
    const camp = await ensureClosedCampaign(campaniaId, res)
    if (!camp) return
    const appliedCount = await prisma.actualizacion.count({
      where: { campaniaId, estado: 'aplicada', appliedAt: { not: null } },
    })
    const pendingCount = await prisma.actualizacion.count({
      where: { campaniaId, estado: 'pendiente', archivada: false, appliedAt: null },
    })
    const rejectedCount = await prisma.actualizacion.count({
      where: { campaniaId, estado: 'rechazada' },
    })
    const skuStage = ensureModel(prisma.skuStage, 'skuStage', res)
    const unknownSku = ensureModel(prisma.unknownSku, 'unknownSku', res)
    if (!skuStage || !unknownSku) return
    const stages = await skuStage.findMany({
      where: { campaniaId, stage: 'consolidate' },
      select: { sku: true },
    })
    const skuList = stages.map((row) => row.sku)
    const unknownCount = skuList.length
      ? await unknownSku.count({
          where: {
            campaniaId,
            sku: { in: skuList },
            status: 'APPROVED',
            appliedToMaestroAt: { not: null },
          },
        })
      : 0
    const unknownRejectedCount = await unknownSku.count({
      where: { campaniaId, status: { in: ['REJECTED', 'MERGED'] } },
    })
    const lines = [
      `campania_id\t${campaniaId}`,
      `estado\t${camp.estado}`,
      `closed_at\t${new Date(camp.closedAt).toISOString()}`,
      `applied_count\t${appliedCount}`,
      `unknown_count\t${unknownCount}`,
      `pending_count\t${pendingCount}`,
      `rejected_count\t${rejectedCount}`,
      `unknown_rejected_or_merged_count\t${unknownRejectedCount}`,
    ]
    const safeName = sanitizeFilenamePart(camp?.nombre || `campania_${campaniaId}`)
    const timestamp = formatTimestamp(new Date(camp.closedAt))
    const exportName = `${safeName}_summary_${timestamp}.txt`
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exportName}"`
    )
    res.send(lines.join('\n'))
  }

  return {
    listar: async (req, res) => {
    const campaniaId = Number(req.query.campaniaId || 0)
    if (!campaniaId) {
      return sendAdminError(res, 400, 'campaniaId requerido')
    }
      const estado = req.query.estado ? String(req.query.estado) : null
      const archivadaValue = parseArchivada(req.query.archivada)
      const where = { campaniaId }
      if (estado) where.estado = estado
      if (archivadaValue !== undefined) where.archivada = archivadaValue

      const items = await prisma.actualizacion.findMany({
        where,
        orderBy: { ts: 'desc' },
      })
      res.json({ items })
    },

    aplicar: async (req, res) => {
      return res.status(409).json({
        error: 'La aplicación directa está deshabilitada; confirmá las decisiones y cerrá la campaña',
        code: 'APPLY_REQUIRES_CLOSE',
        requestId: req.id,
      })
    },

    archivar: async (req, res) => {
      const { ids = [], archivada, archivadaBy = '' } = req.body || {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return sendAdminError(res, 400, 'ids requeridos')
      }
      if (typeof archivada !== 'boolean') {
        return sendAdminError(res, 400, 'archivada requerida')
      }
      const data = archivada
        ? {
            archivada: true,
            archivadaAt: new Date(),
            archivadaBy: archivadaBy || null,
          }
        : {
            archivada: false,
            archivadaAt: null,
            archivadaBy: null,
          }
      const result = await prisma.actualizacion.updateMany({
        where: { id: { in: ids }, estado: { not: 'aplicada' }, appliedAt: null },
        data,
      })
      res.json({ ok: true, updated: result.count })
    },

    undo: async (req, res) => {
      const { ids, id } = req.body || {}
      const normalizedIds = Array.isArray(ids) ? ids : (id ? [id] : [])
      if (!Array.isArray(normalizedIds) || normalizedIds.length === 0) {
        return sendAdminError(res, 400, 'ids requeridos')
      }
      const result = await prisma.actualizacion.updateMany({
        where: { id: { in: normalizedIds }, estado: 'pendiente', appliedAt: null, archivada: false },
        data: {
          archivada: true,
          archivadaAt: new Date(),
          archivadaBy: req.body?.archivadaBy || null,
        },
      })
      res.json({ ok: true, updated: result.count })
    },

    revertir: async (req, res) => {
      const id = Number(req.params.id || 0)
      if (!id) return sendAdminError(res, 400, 'id requerido')
      try {
        const nueva = await revertApplied({
          id,
          decidedBy: req.body?.decidedBy || '',
          notas: req.body?.notas || '',
        })
        res.json({ ok: true, actualizacion: nueva })
      } catch (error) {
        if (error?.status) {
          return res.status(error.status).json({ error: error.message, code: error.code, requestId: req.id })
        }
        throw error
      }
    },

    exportCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      const estado = req.query.estado ? String(req.query.estado) : null
      const archivadaValue = parseArchivada(req.query.archivada)
      const where = { campaniaId }
      if (estado) where.estado = estado
      if (archivadaValue !== undefined) where.archivada = archivadaValue

      const items = await prisma.actualizacion.findMany({
        where,
        orderBy: { ts: 'desc' },
      })
      const rows = [
        [
          'id',
          'sku',
          'estado',
          'archivada',
          'old_categoria_cod',
          'new_categoria_cod',
          'old_tipo_cod',
          'new_tipo_cod',
          'old_clasif_cod',
          'new_clasif_cod',
          'decidedBy',
          'decidedAt',
          'appliedAt',
        ],
      ]
      for (const item of items) {
        rows.push([
          item.id,
          item.sku,
          item.estado,
          item.archivada ? 'true' : 'false',
          item.old_categoria_cod || '',
          item.new_categoria_cod || '',
          item.old_tipo_cod || '',
          item.new_tipo_cod || '',
          item.old_clasif_cod || '',
          item.new_clasif_cod || '',
          item.decidedBy || '',
          item.decidedAt || '',
          item.appliedAt || '',
        ])
      }
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="actualizaciones.csv"'
      )
      res.send(csv)
    },

    exportTxtCategoria: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      const scope = req.query.scope ? String(req.query.scope) : 'applied'
      await buildTxtResponse(
        {
          campaniaId,
          attributeKey: 'categoria',
          filename: 'categoria.txt',
          scope,
        },
        res
      )
    },

    exportTxtTipo: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      const scope = req.query.scope ? String(req.query.scope) : 'applied'
      await buildTxtResponse(
        {
          campaniaId,
          attributeKey: 'tipo',
          filename: 'tipo.txt',
          scope,
        },
        res
      )
    },

    exportTxtClasif: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      const scope = req.query.scope ? String(req.query.scope) : 'applied'
      await buildTxtResponse(
        {
          campaniaId,
          attributeKey: 'clasif',
          filename: 'clasif.txt',
          scope,
        },
        res
      )
    },

    exportTxtSummary: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      await buildSummaryTxt({ campaniaId }, res)
    },
  }
}
