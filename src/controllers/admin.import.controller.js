import { ImportService } from '../services/import.service.js'

export function AdminImportController(prisma) {
  const svc = ImportService(prisma)

  return {
    diccionarios: async (req, res) => {
      try {
        const categoriasBuf = req.files?.categorias?.[0]?.buffer || null
        const tiposBuf      = req.files?.tipos?.[0]?.buffer      || null
        const clasifBuf     = req.files?.clasif?.[0]?.buffer     || null

        const result = await svc.importarDiccionariosDesdeBuffers({ categoriasBuf, tiposBuf, clasifBuf })
        res.json({ ok: true, ...result })
      } catch (e) {
        res.status(e.status || 500).json({ error: e.message || 'Error importando diccionarios' })
      }
    },

    maestro: async (req, res) => {
      try {
        const maestroBuf = req.files?.maestro?.[0]?.buffer || null
        const result = await svc.importarMaestroDesdeBuffer(maestroBuf)
        res.json({ ok: true, ...result })
      } catch (e) {
        console.error('Import maestro falló:', e)
  res.status(e.status || 500).json({ error: e.message || 'Error importando maestro' })
      }
    },
  }
}
