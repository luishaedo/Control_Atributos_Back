import { ImportService } from '../services/import.service.js'
import { sendAdminError } from '../utils/http.js'

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
        sendAdminError(res, e.status || 500, e.message || 'Error importando diccionarios')
      }
    },

    maestro: async (req, res) => {
      try {
        const maestroBuf = req.files?.maestro?.[0]?.buffer || null
        const result = await svc.importarMaestroDesdeBuffer(maestroBuf)
        const skippedMessage = result.skipped?.length
          ? 'Artículos omitidos por datos vacíos'
          : null
        res.json({
          ok: true,
          ...result,
          skippedCount: result.skipped?.length || 0,
          skippedMessage
        })
      } catch (e) {
        console.error('Import maestro falló:', e)
        sendAdminError(res, e.status || 500, e.message || 'Error importando maestro')
      }
    },
  }
}
