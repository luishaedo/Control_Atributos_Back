import { MaestroService } from '../services/maestro.service.js'
import { cleanSku } from '../utils/sku.js'
import { toCSV } from '../utils/csv.js'
import { sendAdminError } from '../utils/http.js'


export function MaestroController(prisma) {
  const svc = MaestroService(prisma)
  return {
    listar: async (req, res) => {
      const q = String(req.query.q || '').trim().toUpperCase()
      const page = Math.max(1, parseInt(req.query.page || '1', 10))
      const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '50', 10)))
      
      const where = q ? {
        OR: [
          { sku: { contains: q } },
          { descripcion: { contains: q } },
        ]
      } : {}

       const [items, total] = await Promise.all([
    prisma.maestro.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.maestro.count({ where })
  ])
  res.json({ page, pageSize, total, items })
},

    getUno: async (req, res) => {
      try {
        const sku = cleanSku(req.params.sku || '')
        if (!sku) {
          return res.status(400).json({
            code: 'INVALID_SKU',
            message: 'SKU inválido',
          })
        }
        const item = await prisma.maestro.findUnique({ where: { sku } })
        if (!item) {
          return res.status(404).json({
            code: 'MAESTRO_NOT_FOUND',
            message: 'SKU no encontrado en Maestro',
          })
        }
        res.json(item)
      } catch (error) {
        console.error(error)
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Error interno',
        })
      }
    },
    getUnoCampania: async (req, res) => {
      try {
        const campaniaId = Number(req.params?.id || 0)
        if (!campaniaId) {
          return res.status(400).json({
            code: 'INVALID_CAMPANIA',
            message: 'campaniaId invÃ¡lido',
          })
        }
        const sku = cleanSku(req.params.sku || '')
        if (!sku) {
          return res.status(400).json({
            code: 'INVALID_SKU',
            message: 'SKU invÃ¡lido',
          })
        }
        let item = await prisma.campaniaMaestro.findUnique({
          where: { campaniaId_sku: { campaniaId, sku } },
        })
        if (!item) {
          return res.status(404).json({
            code: 'MAESTRO_NOT_FOUND',
            message: 'SKU no encontrado en Maestro de campaÃ±a',
          })
        }
        res.json(item)
      } catch (error) {
        console.error(error)
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Error interno',
        })
      }
    },
    importar: async (req, res) => {
      const { items = [] } = req.body || {}
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
      let result
      try {
        result = await svc.importMaestroItems(items, { allowPartial: true })
      } catch (error) {
        return res.status(error.status || 500).json({
          error: error.message || 'Error importando maestro',
          code: error.code || 'INTERNAL_ERROR',
          invalidCount: error.details?.length || 0,
          invalidItems: error.details || [],
        })
      }
      const { count, skipped = [], omittedRows = [], warnings = [] } = result
      const allOmitted = omittedRows.length ? omittedRows : skipped
      const skippedMessage = allOmitted.length ? 'Algunas filas se omitieron; revisá el detalle para corregirlas.' : null
      res.json({
        ok: true,
        count,
        skippedCount: allOmitted.length,
        omittedCount: allOmitted.length,
        skippedMessage,
        skipped: allOmitted,
        omittedRows: allOmitted,
        warningCount: result.warningCount ?? warnings.length,
        warnings,
      })
    },
     exportCSV: async (_req, res) => {
      const list = await prisma.maestro.findMany({ orderBy: { sku: 'asc' } })
      const rows = [['sku','descripcion','categoria_cod','tipo_cod','clasif_cod']]
      for (const m of list) rows.push([m.sku, m.descripcion, m.categoria_cod, m.tipo_cod, m.clasif_cod])
      const { toCSV } = await import('../utils/csv.js')
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="maestro.csv"')
      res.send(csv)
    },

    listMissing: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId || 0)
      if (!campaniaId) {
        return sendAdminError(res, 400, 'campaniaId requerido')
      }
      const items = await prisma.unknownSku.findMany({
        where: {
          campaniaId,
          OR: [
            { status: { notIn: ['APPROVED', 'confirmed', 'CONFIRMED'] } },
            { status: null },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      })
      res.json({ items })
    },
  }
}
