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
      if (!maestroBuf) return { count: 0, skipped: [] }
      const items = parseMaestroCSV(maestroBuf) // normaliza 01/02, encabes, delimitador, etc.
      const warnings = items.flatMap(item => item.skuWarning ? [item.skuWarning] : [])
      const [categorias, tipos, clasif] = await Promise.all([
        prisma.dicCategoria.findMany({ where: { cod: { in: [...new Set(items.map(item => item.categoria_cod))] } } }),
        prisma.dicTipo.findMany({ where: { cod: { in: [...new Set(items.map(item => item.tipo_cod))] } } }),
        prisma.dicClasif.findMany({ where: { cod: { in: [...new Set(items.map(item => item.clasif_cod))] } } }),
      ])
      const domains = {
        categoria_cod: new Set(categorias.map(item => item.cod)),
        tipo_cod: new Set(tipos.map(item => item.cod)),
        clasif_cod: new Set(clasif.map(item => item.cod)),
      }
      const invalid = items.flatMap(item => Object.entries(domains)
        .filter(([field, domain]) => !domain.has(item[field]))
        .map(([field]) => ({ sku: item.sku, field, value: item[field] })))
      if (invalid.length) {
        throw Object.assign(new Error(
          `El maestro contiene ${invalid.length} código(s) fuera de los diccionarios; no se importó ningún registro`), {
          status: 400, code: 'INVALID_DICTIONARY', details: invalid,
        })
      }
      const { count, skipped } = await maestroSvc.upsertMaestro(items)
      return { count, skipped, warningCount: warnings.length, warnings }
    }
  }
}
