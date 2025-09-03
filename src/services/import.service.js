// src/services/import.service.js
import { parseDicCSV, parseMaestroCSV } from '../utils/csvInput.js'
import { MaestroService } from './maestro.service.js'

export function ImportService(prisma) {
  const maestroSvc = MaestroService(prisma)

  return {
    // Diccionarios: recibe buffers de archivos individuales (opcional cada uno)
    async importarDiccionariosDesdeBuffers({ categoriasBuf = null, tiposBuf = null, clasifBuf = null } = {}) {
      const categorias = categoriasBuf ? parseDicCSV(categoriasBuf) : []
      const tipos      = tiposBuf ? parseDicCSV(tiposBuf) : []
      const clasif     = clasifBuf ? parseDicCSV(clasifBuf) : []

      // upsert en lote
      const res = await maestroSvc.upsertDiccionarios({ categorias, tipos, clasif })
      return res // { categorias: n, tipos: n, clasif: n }
    },

    // Maestro: recibe un solo buffer de archivo
    async importarMaestroDesdeBuffer(maestroBuf) {
      if (!maestroBuf) return { count: 0 }
      const items = parseMaestroCSV(maestroBuf) // normaliza 01/02, encabes, delimitador, etc.
      const count = await maestroSvc.upsertMaestro(items)
      return { count }
    }
  }
}
