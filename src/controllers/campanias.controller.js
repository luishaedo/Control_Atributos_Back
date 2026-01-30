import { CampaniasService } from '../services/campanias.service.js'

export function CampaniasController(prisma) {
  const svc = CampaniasService(prisma)
  return {
    listar: async (req, res) => {
      const items = await svc.listar()
      const wantsRaw = String(req.query.raw || '').toLowerCase() === 'true'
      if (wantsRaw) {
        return res.json(items)
      }
      return res.json({ items })
    },
    crear: async (req, res) => {
      try { res.json(await svc.crearCampaniaConSnapshot(req.body || {})) }
      catch (e) { res.status(e.status || 500).json({ error: e.message || 'Error' }) }
    },
    activar: async (req, res) => {
      const id = Number(req.params.id)
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' })
      res.json(await svc.activar(id))
    },
  }
}
