import { ImportService } from '../services/import.service.js'

export function AdminImportController(prisma) {
  const svc = ImportService(prisma)

  return {
    diccionarios: async (req, res) => {
      try {
        const result = await svc.importarDiccionariosFromFiles({
          fileCategorias: req.files?.categorias?.[0],
          fileTipos: req.files?.tipos?.[0],
          fileClasif: req.files?.clasif?.[0],
        })
        res.json({ ok: true, ...result })
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message || 'Error importando diccionarios' })
      }
    },

    maestro: async (req, res) => {
      try {
        const result = await svc.importarMaestroFromFile({
          fileMaestro: req.files?.maestro?.[0],
          estricto: false // si querés exigir todos los códigos, ponelo en true
        })
        res.json(result)
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message || 'Error importando maestro' })
      }
    },
  }
}
