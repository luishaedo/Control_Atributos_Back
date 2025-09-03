import { MaestroService } from '../services/maestro.service.js'

export function DiccionariosController(prisma) {
  const maestroSvc = MaestroService(prisma)
  return {
    listar: async (_req, res) => {
      const [categorias, tipos, clasif] = await Promise.all([
        prisma.dicCategoria.findMany(),
        prisma.dicTipo.findMany(),
        prisma.dicClasif.findMany(),
      ])
      res.json({ categorias, tipos, clasif })
    },
    importar: async (req, res) => {
      const counts = await maestroSvc.upsertDiccionarios(req.body || {})
      res.json({ ok: true, counts })
    }
  }
}
