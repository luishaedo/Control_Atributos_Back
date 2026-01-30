import { ActualizacionesService } from '../services/actualizaciones.service.js'
import { toCSV } from '../utils/csv.js'

export function ActualizacionesController(prisma) {
  const { applyUpdates, normalizeCode } = ActualizacionesService(prisma)
  const ensureModel = (model, name, res) => {
    if (!model) {
      res.status(500).json({ error: `Prisma client missing ${name}. Run prisma:generate.` })
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

  const buildTxtResponse = async ({
    campaniaId,
    attributeKey,
    filename,
    scope = 'applied',
  }, res) => {
    const fieldMap = {
      categoria: { newKey: 'new_categoria_cod', oldKey: 'old_categoria_cod' },
      tipo: { newKey: 'new_tipo_cod', oldKey: 'old_tipo_cod' },
      clasif: { newKey: 'new_clasif_cod', oldKey: 'old_clasif_cod' },
    }
    const fields = fieldMap[attributeKey]
    if (!fields) {
      return res.status(400).json({ error: 'atributo inválido' })
    }
    const lines = []
    if (scope !== 'applied' && scope !== 'unknown') {
      return res.status(400).json({ error: 'scope inválido' })
    }
    if (scope === 'applied') {
      const actualizaciones = await prisma.actualizacion.findMany({
        where: { campaniaId, estado: 'aplicada' },
        orderBy: { ts: 'desc' },
      })
      const seen = new Set()
      for (const act of actualizaciones) {
        if (seen.has(act.sku)) continue
        const newValue = act[fields.newKey]
        const oldValue = act[fields.oldKey] ?? ''
        if (!newValue || String(newValue) === String(oldValue)) continue
        seen.add(act.sku)
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
            status: 'confirmed',
          },
          orderBy: { updatedAt: 'desc' },
        })
        for (const item of unknowns) {
          const value = unknownField ? item[unknownField] : ''
          if (!value) continue
          lines.push(`${item.sku}\t${value}`)
        }
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    )
    res.send(lines.join('\n'))
  }

  const buildSummaryTxt = async ({ campaniaId }, res) => {
    const appliedCount = await prisma.actualizacion.count({
      where: { campaniaId, estado: 'aplicada' },
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
            status: 'confirmed',
          },
        })
      : 0
    const lines = [
      `applied_count\t${appliedCount}`,
      `unknown_count\t${unknownCount}`,
    ]
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="summary.txt"'
    )
    res.send(lines.join('\n'))
  }

  return {
    listar: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return res.status(400).json({ error: 'campaniaId requerido' })
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
      try {
        const { ids = [], decidedBy = '' } = req.body || {}
        if (!Array.isArray(ids) || ids.length === 0) {
          return res.status(400).json({ error: 'ids requeridos' })
        }
        const { count } = await applyUpdates({ ids, decidedBy })
        res.json({ ok: true, applied: count })
      } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'Error aplicando actualizaciones' })
      }
    },

    archivar: async (req, res) => {
      const { ids = [], archivada, archivadaBy = '' } = req.body || {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids requeridos' })
      }
      if (typeof archivada !== 'boolean') {
        return res.status(400).json({ error: 'archivada requerida' })
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
        where: { id: { in: ids } },
        data,
      })
      res.json({ ok: true, updated: result.count })
    },

    undo: async (req, res) => {
      const { ids, id } = req.body || {}
      const normalizedIds = Array.isArray(ids) ? ids : (id ? [id] : [])
      if (!Array.isArray(normalizedIds) || normalizedIds.length === 0) {
        return res.status(400).json({ error: 'ids requeridos' })
      }
      const result = await prisma.actualizacion.updateMany({
        where: { id: { in: normalizedIds } },
        data: {
          estado: 'pendiente',
          decidedBy: null,
          decidedAt: null,
          appliedAt: null,
          archivada: false,
          archivadaAt: null,
          archivadaBy: null,
        },
      })
      res.json({ ok: true, updated: result.count })
    },

    revertir: async (req, res) => {
      const id = Number(req.params.id || 0)
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const act = await prisma.actualizacion.findUnique({ where: { id } })
      if (!act) return res.status(404).json({ error: 'actualizacion no encontrada' })

      const nueva = await prisma.actualizacion.create({
        data: {
          campaniaId: act.campaniaId,
          sku: act.sku,
          old_categoria_cod: act.new_categoria_cod || null,
          old_tipo_cod: act.new_tipo_cod || null,
          old_clasif_cod: act.new_clasif_cod || null,
          new_categoria_cod: normalizeCode(act.old_categoria_cod),
          new_tipo_cod: normalizeCode(act.old_tipo_cod),
          new_clasif_cod: normalizeCode(act.old_clasif_cod),
          estado: 'pendiente',
          decidedBy: null,
          decidedAt: null,
          notas: `Reversion of ${act.id}`,
          archivada: false,
        },
      })
      res.json({ ok: true, actualizacion: nueva })
    },

    exportCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return res.status(400).json({ error: 'campaniaId requerido' })
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
        return res.status(400).json({ error: 'campaniaId requerido' })
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
        return res.status(400).json({ error: 'campaniaId requerido' })
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
        return res.status(400).json({ error: 'campaniaId requerido' })
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
        return res.status(400).json({ error: 'campaniaId requerido' })
      }
      await buildSummaryTxt({ campaniaId }, res)
    },
  }
}
