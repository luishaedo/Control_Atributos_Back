import { toCSV } from '../utils/csv.js'
import { AuditoriaService } from '../services/auditoria.service.js'

export function AdminController(prisma) {
  const auditoria = AuditoriaService(prisma)
  return {
    ping: (_req, res) => res.json({ ok: true }),

    // Diccionarios/Maestro CSV
    exportCategorias: async (_req, res) => {
      const list = await prisma.dicCategoria.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"')
      res.send(csv)
    },
    exportTipos: async (_req, res) => {
      const list = await prisma.dicTipo.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="tipos.csv"')
      res.send(csv)
    },
    exportClasif: async (_req, res) => {
      const list = await prisma.dicClasif.findMany({ orderBy: { cod: 'asc' } })
      const rows = [['cod','nombre'], ...list.map(it => [it.cod, it.nombre])]
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="clasif.csv"')
      res.send(csv)
    },

    exportDiscrepanciasCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId)
      if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
      const escaneos = await prisma.escaneo.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } })
      const rows = [['sku','sucursal','email','estado','cat_maestro','tipo_maestro','clasif_maestro','cat_asumido','tipo_asumido','clasif_asumido','ts']]
      for (const e of escaneos) {
        const m = await prisma.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId, sku: e.sku } } })
        const diff = !m || (e.asum_categoria_cod !== (m?.categoria_cod || null) || e.asum_tipo_cod !== (m?.tipo_cod || null) || e.asum_clasif_cod !== (m?.clasif_cod || null))
        if (!diff) continue
        rows.push([ e.sku, e.sucursal, e.email, e.estado, m?.categoria_cod || '', m?.tipo_cod || '', m?.clasif_cod || '', e.asum_categoria_cod || '', e.asum_tipo_cod || '', e.asum_clasif_cod || '', e.ts.toISOString() ])
      }
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="discrepancias.csv"')
      res.send(csv)
    },

    exportDiscrepanciasSucursalesCSV: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId)
      if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
      const { items } = await auditoria.discrepanciasSucursales({ campaniaId, minSucursales: Number(req.query.minSucursales || 2) })
      const rows = [['sku','sucursal','categoria','tipo','clasif','count','ultimo']]
      for (const it of items) {
        for (const d of it.sucursales) {
          rows.push([it.sku, d.sucursal, d.categoria_cod, d.tipo_cod, d.clasif_cod, d.count, d.ultimoTs ? new Date(d.ultimoTs).toISOString() : '' ])
        }
      }
      const csv = toCSV(rows)
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="discrepancias_sucursales.csv"')
      res.send(csv)
    },

    exportTxtCampo: async (req, res) => {
      try {
        const campaniaId = Number(req.query.campaniaId)
        const campo = String(req.params.campo || '').toLowerCase() // categoria|tipo|clasif
        const estadoParam = String(req.query.estado || 'aceptadas').toLowerCase() // aplicada | aceptadas
        const incluirArchivadas = String(req.query.incluirArchivadas || 'false').toLowerCase() === 'true'
        if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
        if (!['categoria', 'tipo', 'clasif'].includes(campo)) return res.status(400).json({ error: 'campo inválido (use: categoria | tipo | clasif)' })
        const estados = estadoParam === 'aplicada' ? ['aplicada'] : ['pendiente', 'aplicada']
        const acts = await prisma.actualizacion.findMany({ where: { campaniaId, estado: { in: estados }, ...(incluirArchivadas ? {} : { archivada: false }) }, orderBy: [{ decidedAt: 'desc' }, { ts: 'desc' }] })
        const snaps = await prisma.campaniaMaestro.findMany({ where: { campaniaId } })
        const snapBySku = new Map(snaps.map(s => [s.sku, s]))
        const NEW  = { categoria: 'new_categoria_cod', tipo: 'new_tipo_cod', clasif: 'new_clasif_cod' }[campo]
        const OLD  = { categoria: 'old_categoria_cod', tipo: 'old_tipo_cod', clasif: 'old_clasif_cod' }[campo]
        const SNAP = { categoria: 'categoria_cod',    tipo: 'tipo_cod',    clasif: 'clasif_cod' }[campo]
        const ultimaPorSku = new Map()
        for (const a of acts) {
          if (ultimaPorSku.has(a.sku)) continue
          const newCode = a[NEW]; if (!newCode) continue
          ultimaPorSku.set(a.sku, { newCode, oldFromDecision: a[OLD] || null, snapCode: snapBySku.get(a.sku)?.[SNAP] || null })
        }
        const lines = []
        for (const [sku, info] of ultimaPorSku.entries()) {
          const before = info.snapCode ?? info.oldFromDecision
          if (before && String(before) === String(info.newCode)) continue
          lines.push(`${sku}\t${info.newCode}`)
        }
        const body = '\ufeff' + lines.join('\n') + (lines.length ? '\n' : '')
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="${campo}_campania_${campaniaId}_${estadoParam}.txt"`)
        res.send(body)
      } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Error generando TXT' })
      }
    },
  }
}
