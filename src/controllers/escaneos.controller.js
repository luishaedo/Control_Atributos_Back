import { EscaneosService } from '../services/escaneos.service.js'

export function EscaneosController(prisma) {
  const service = EscaneosService(prisma)
  return {
    crear: async (req, res) => {
      try {
        res.json(await service.crear(req.body || {}))
      } catch (error) {
        if (!error?.status) throw error
        res.status(error.status).json({
          error: error.publicMessage || 'Solicitud inválida',
          code: error.code,
          ...(error.details ? { errors: error.details } : {}),
          requestId: req.id,
        })
      }
    },
  }
}
