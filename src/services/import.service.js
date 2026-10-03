// src/services/import.service.js
import { parseDicCSVReport, parseMaestroCSVReport } from '../utils/csvInput.js'
import { MaestroService } from './maestro.service.js'

export function ImportService(prisma) {
  const maestroSvc = MaestroService(prisma)

  return {
    // Diccionarios: recibe buffers de archivos individuales (opcional cada uno)
    async importarDiccionariosDesdeBuffers({ categoriasBuf = null, tiposBuf = null, clasifBuf = null } = {}) {
      const parse = buffer => buffer ? parseDicCSVReport(buffer) : { items: [], omittedRows: [] }
      const categoriasReport = parse(categoriasBuf)
      const tiposReport = parse(tiposBuf)
      const clasifReport = parse(clasifBuf)
      const stripRow = ({ sourceRow, ...item }) => item

      // upsert en lote
      const counts = await maestroSvc.upsertDiccionarios({
        categorias: categoriasReport.items.map(stripRow),
        tipos: tiposReport.items.map(stripRow),
        clasif: clasifReport.items.map(stripRow),
      })
      return {
        ...counts,
        omittedRows: {
          categorias: categoriasReport.omittedRows,
          tipos: tiposReport.omittedRows,
          clasif: clasifReport.omittedRows,
        },
      }
    },

    // Maestro: recibe un solo buffer de archivo
    async importarMaestroDesdeBuffer(maestroBuf) {
      if (!maestroBuf) return { count: 0, omittedRows: [] }
      const report = parseMaestroCSVReport(maestroBuf)
      const result = await maestroSvc.importMaestroItems(report.items, { allowPartial: true })
      return { ...result, omittedRows: [...report.omittedRows, ...result.omittedRows] }
    }
  }
}
