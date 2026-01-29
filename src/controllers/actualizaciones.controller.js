import { ActualizacionesService } from '../services/actualizaciones.service.js'

export function ActualizacionesController(prisma) {
  const { applyUpdates } = ActualizacionesService(prisma)

  return {
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
  }
}
