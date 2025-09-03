import { pad2 } from '../utils/sku.js'

export function RevisionesController(prisma) {
  return {
    listar: async (req, res) => {
      const campaniaId = Number(req.query.campaniaId)
      if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

      const buscarSku = (req.query.sku || '').trim().toUpperCase()
      const filtroConsenso = req.query.consenso // 'true' | 'false' | undefined
      const soloConDiferencias = (req.query.soloConDiferencias ?? 'true') === 'true'

      const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } })
      const snapBySku = new Map(
        (await prisma.campaniaMaestro.findMany({ where: { campaniaId } }))
          .map(m => [m.sku, m])
      )

      const decisiones = await prisma.actualizacion.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } })
      const decKey = d => `${d.sku}|${d.new_categoria_cod}|${d.new_tipo_cod}|${d.new_clasif_cod}`
      const mapDec = new Map(decisiones.map(d => [decKey(d), d]))

      const porSku = new Map()
      for (const e of escaneos) {
        if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku)) continue
        const snap = snapBySku.get(e.sku) || null
        const dif = !snap || (
          e.asum_categoria_cod !== (snap?.categoria_cod || null) ||
          e.asum_tipo_cod !== (snap?.tipo_cod || null) ||
          e.asum_clasif_cod !== (snap?.clasif_cod || null)
        )
        if (soloConDiferencias && !dif) continue

        const grp = porSku.get(e.sku) || { sku: e.sku, maestro: snap ? { categoria_cod: snap.categoria_cod, tipo_cod: snap.tipo_cod, clasif_cod: snap.clasif_cod } : null, propuestas: new Map() }
        const cat = e.asum_categoria_cod || ''
        const tip = e.asum_tipo_cod || ''
        const cla = e.asum_clasif_cod || ''
        const key = `${cat}|${tip}|${cla}`
        const p = grp.propuestas.get(key) || { categoria_cod: cat, tipo_cod: tip, clasif_cod: cla, count: 0, usuarios: new Set(), sucursales: new Set() }
        p.count += 1
        if (e.email) p.usuarios.add(e.email)
        if (e.sucursal) p.sucursales.add(e.sucursal)
        grp.propuestas.set(key, p)
        porSku.set(e.sku, grp)
      }

      const items = []
      for (const grp of porSku.values()) {
        const propuestasArr = Array.from(grp.propuestas.values())
          .map(p => ({ ...p, usuarios: Array.from(p.usuarios), sucursales: Array.from(p.sucursales), decision: mapDec.get(`${grp.sku}|${p.categoria_cod}|${p.tipo_cod}|${p.clasif_cod}`) || null }))
          .sort((a,b)=> b.count - a.count)

        const total = propuestasArr.reduce((s, p) => s + p.count, 0)
        const top = propuestasArr[0]
        const consenso = top ? (top.count / Math.max(1, total)) : 0
        const hayConsenso = top ? (top.count >= 2 && top.count > (propuestasArr[1]?.count || 0)) : false

        if (filtroConsenso === 'true' && !hayConsenso) continue
        if (filtroConsenso === 'false' && hayConsenso) continue

        items.push({ sku: grp.sku, maestro: grp.maestro, propuestas: propuestasArr, totalVotos: total, consensoPct: Number(consenso.toFixed(2)), hayConsenso })
      }
      res.json({ items })
    },

    decidir: async (req, res) => {
      try {
        const { campaniaId, sku, propuesta, decision, decidedBy, aplicarAhora = false, notas = '' } = req.body || {}
        if (!campaniaId || !sku || !propuesta || !decision) return res.status(400).json({ error: 'Faltan campos' })
        if (!['aceptar', 'rechazar'].includes(decision)) return res.status(400).json({ error: 'decision inválida' })

        const snap = await prisma.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } } })
        const oldCat = snap?.categoria_cod ?? null
        const oldTip = snap?.tipo_cod ?? null
        const oldCla = snap?.clasif_cod ?? null
        const newCat = pad2(propuesta.categoria_cod || '')
        const newTip = pad2(propuesta.tipo_cod || '')
        const newCla = pad2(propuesta.clasif_cod || '')
        const estado = decision === 'aceptar' ? (aplicarAhora ? 'aplicada' : 'pendiente') : 'rechazada'

        await prisma.actualizacion.updateMany({ where: { campaniaId: Number(campaniaId), sku, estado: 'pendiente', archivada: false }, data: { archivada: true, archivadaAt: new Date(), archivadaBy: decidedBy || 'admin' } })

        const act = await prisma.actualizacion.create({
          data: {
            campaniaId: Number(campaniaId), sku,
            old_categoria_cod: oldCat, old_tipo_cod: oldTip, old_clasif_cod: oldCla,
            new_categoria_cod: newCat, new_tipo_cod: newTip, new_clasif_cod: newCla,
            estado, decidedBy: decidedBy || null, decidedAt: new Date(), notas,
            ...(aplicarAhora ? { appliedAt: new Date() } : {})
          }
        })

        if (decision === 'aceptar' && aplicarAhora) {
          await prisma.maestro.upsert({
            where: { sku },
            create: { sku, descripcion: snap?.descripcion || '', categoria_cod: newCat, tipo_cod: newTip, clasif_cod: newCla },
            update: { categoria_cod: newCat, tipo_cod: newTip, clasif_cod: newCla }
          })
        }
        res.json({ ok: true, actualizacion: act })
      } catch (e) {
        console.error(e)
        res.status(500).json({ error: 'Error al decidir revisión' })
      }
    },

    listarActualizaciones: async (req, res) => {
      try {
        const campaniaId = Number(req.query.campaniaId)
        if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
        const estado = (req.query.estado || '').trim()
        const arch = (req.query.archivada || '').trim()
        const where = { campaniaId }
        if (estado) where.estado = estado
        if (arch === 'true') where.archivada = true
        else if (arch === 'false' || arch === '') where.archivada = false
        const items = await prisma.actualizacion.findMany({ where, orderBy: { ts: 'desc' } })
        res.json({ items })
      } catch (e) {
        console.error(e)
        res.status(500).json({ error: 'Error listando actualizaciones' })
      }
    },

    aplicarLote: async (req, res) => {
      const { ids = [], decidedBy = '' } = req.body || {}
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids vacío' })
      const acts = await prisma.actualizacion.findMany({ where: { id: { in: ids } } })
      for (const a of acts) {
        await prisma.maestro.upsert({
          where: { sku: a.sku },
          create: { sku: a.sku, descripcion: '', categoria_cod: a.new_categoria_cod, tipo_cod: a.new_tipo_cod, clasif_cod: a.new_clasif_cod },
          update: { categoria_cod: a.new_categoria_cod, tipo_cod: a.new_tipo_cod, clasif_cod: a.new_clasif_cod }
        })
        await prisma.actualizacion.update({ where: { id: a.id }, data: { estado: 'aplicada', decidedBy: decidedBy || a.decidedBy, decidedAt: new Date(), appliedAt: new Date() } })
      }
      res.json({ ok: true, aplicadas: acts.length })
    },

    archivar: async (req, res) => {
      try {
        const { ids = [], archivada = true, archivadaBy = 'api' } = req.body || {}
        if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids vacío' })
        await prisma.actualizacion.updateMany({ where: { id: { in: ids } }, data: { archivada, archivadaBy, archivadaAt: new Date() } })
        res.json({ ok: true })
      } catch (e) {
        console.error(e)
        res.status(500).json({ error: 'Error al archivar/desarchivar' })
      }
    },

    undo: async (req, res) => {
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const act = await prisma.actualizacion.findUnique({ where: { id } })
      if (!act) return res.status(404).json({ error: 'Actualización no encontrada' })
      if (act.estado === 'aplicada') return res.status(400).json({ error: 'No se puede deshacer una actualización aplicada (use revertir)' })
      await prisma.actualizacion.delete({ where: { id } })
      res.json({ ok: true })
    },

    revertir: async (req, res) => {
      try {
        const { id, decidedBy = 'admin@local' } = req.body || {}
        if (!id) return res.status(400).json({ error: 'id requerido' })
        const act = await prisma.actualizacion.findUnique({ where: { id } })
        if (!act) return res.status(404).json({ error: 'Actualización no encontrada' })
        if (act.estado !== 'aplicada') return res.status(400).json({ error: 'Sólo se pueden revertir las aplicadas' })

        const new_categoria_cod = pad2(act.old_categoria_cod ?? act.new_categoria_cod)
        const new_tipo_cod      = pad2(act.old_tipo_cod      ?? act.new_tipo_cod)
        const new_clasif_cod    = pad2(act.old_clasif_cod    ?? act.new_clasif_cod)
        const old_categoria_cod = act.new_categoria_cod
        const old_tipo_cod      = act.new_tipo_cod
        const old_clasif_cod    = act.new_clasif_cod

        const revert = await prisma.actualizacion.create({
          data: { campaniaId: act.campaniaId, sku: act.sku, old_categoria_cod, old_tipo_cod, old_clasif_cod, new_categoria_cod, new_tipo_cod, new_clasif_cod, estado: 'pendiente', decidedBy, decidedAt: new Date() }
        })
        res.json({ ok: true, actualizacion: revert })
      } catch (e) {
        console.error(e)
        res.status(500).json({ error: 'Error al revertir' })
      }
    },
  }
}
