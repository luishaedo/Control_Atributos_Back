import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { cleanSku, pad2, cumpleObjetivos } from './utils/sku.js'

/**
 * API unificada (público + admin)
 */

const prisma = new PrismaClient()
const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' }))

// ---------------------------
// Utils / helpers
// ---------------------------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN no configurado en .env' })
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' })
  next()
}

function toCSV(rows) {
  const esc = (x) => {
    if (x == null) return ''
    const s = String(x)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const body = rows.map(r => r.map(esc).join(',')).join('\n')
  return '\ufeff' + body // BOM UTF-8 para Excel
}

async function upsertDiccionarios({ categorias = [], tipos = [], clasif = [] }) {
  for (const c of categorias) {
    await prisma.dicCategoria.upsert({ where: { cod: c.cod }, create: c, update: { nombre: c.nombre } })
  }
  for (const t of tipos) {
    await prisma.dicTipo.upsert({ where: { cod: t.cod }, create: t, update: { nombre: t.nombre } })
  }
  for (const cl of clasif) {
    await prisma.dicClasif.upsert({ where: { cod: cl.cod }, create: cl, update: { nombre: cl.nombre } })
  }
  return { categorias: categorias.length, tipos: tipos.length, clasif: clasif.length }
}

async function upsertMaestro(items = []) {
  let count = 0
  for (const it of items) {
    if (!it?.sku) continue
    await prisma.maestro.upsert({
      where: { sku: cleanSku(it.sku) },
      create: {
        sku: cleanSku(it.sku),
        descripcion: it.descripcion || '',
        categoria_cod: pad2(it.categoria_cod || ''),
        tipo_cod: pad2(it.tipo_cod || ''),
        clasif_cod: pad2(it.clasif_cod || ''),
      },
      update: {
        descripcion: it.descripcion || '',
        categoria_cod: pad2(it.categoria_cod || ''),
        tipo_cod: pad2(it.tipo_cod || ''),
        clasif_cod: pad2(it.clasif_cod || ''),
      }
    })
    count++
  }
  return count
}

async function crearCampaniaConSnapshot(payload = {}) {
  const {
    nombre, inicia, termina,
    categoria_objetivo_cod = null,
    tipo_objetivo_cod = null,
    clasif_objetivo_cod = null,
    activa = false
  } = payload

  if (!nombre || !inicia || !termina) {
    const err = new Error('Faltan campos: nombre, inicia, termina')
    err.status = 400
    throw err
  }

  const camp = await prisma.campania.create({
    data: {
      nombre,
      inicia: new Date(inicia),
      termina: new Date(termina),
      categoria_objetivo_cod,
      tipo_objetivo_cod,
      clasif_objetivo_cod,
      activa: !!activa
    }
  })

  const maestro = await prisma.maestro.findMany()
  if (maestro.length) {
    await prisma.campaniaMaestro.createMany({
      data: maestro.map(m => ({
        campaniaId: camp.id,
        sku: m.sku,
        descripcion: m.descripcion,
        categoria_cod: m.categoria_cod,
        tipo_cod: m.tipo_cod,
        clasif_cod: m.clasif_cod,
      }))
    })
  }
  return camp
}

// ---------------------------
// Rutas públicas
// ---------------------------
app.get('/api/health', (_, res) => res.json({ ok: true }))

// Diccionarios
app.get('/api/diccionarios', async (_req, res) => {
  const [categorias, tipos, clasif] = await Promise.all([
    prisma.dicCategoria.findMany(),
    prisma.dicTipo.findMany(),
    prisma.dicClasif.findMany(),
  ])
  res.json({ categorias, tipos, clasif })
})

// (PÚBLICA) Import diccionarios (podés cerrar en prod)
app.post('/api/diccionarios/import', async (req, res) => {
  const counts = await upsertDiccionarios(req.body || {})
  res.json({ ok: true, counts })
})

// Campañas
app.get('/api/campanias', async (_req, res) => {
  const list = await prisma.campania.findMany({ orderBy: { id: 'asc' } })
  res.json(list)
})

app.post('/api/campanias/:id/activar', async (req, res) => {
  const id = Number(req.params.id)
  if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' })
  await prisma.campania.updateMany({ data: { activa: false } })
  const activa = await prisma.campania.update({ where: { id }, data: { activa: true } })
  res.json(activa)
})

// (PÚBLICA) Crear campaña + snapshot (podés cerrar en prod)
app.post('/api/campanias', async (req, res) => {
  try {
    const camp = await crearCampaniaConSnapshot(req.body || {})
    res.json(camp)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' })
  }
})

// Maestro
app.get('/api/maestro/:sku', async (req, res) => {
  const sku = cleanSku(req.params.sku || '')
  if (!sku) return res.status(400).json({ error: 'SKU inválido' })
  const item = await prisma.maestro.findUnique({ where: { sku } })
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  res.json(item)
})

// (PÚBLICA) Import maestro (podés cerrar en prod)
app.post('/api/maestro/import', async (req, res) => {
  const { items = [] } = req.body || {}
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
  const count = await upsertMaestro(items)
  res.json({ ok: true, count })
})

// Escaneos
app.post('/api/escaneos', async (req, res) => {
  try {
    const { skuRaw = '', email = '', sucursal = '', campaniaId = null, sugeridos = {} } = req.body || {}
    const sku = cleanSku(skuRaw)
    if (!sku) return res.status(400).json({ error: 'skuRaw inválido' })
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    const camp = await prisma.campania.findUnique({ where: { id: Number(campaniaId) } })
    if (!camp || !camp.activa) return res.status(400).json({ error: 'Campaña inexistente o no activa' })

    const snap = await prisma.campaniaMaestro.findUnique({
      where: { campaniaId_sku: { campaniaId: camp.id, sku } }
    })

    let estado = 'OK'
    if (!snap) {
      estado = 'NO_MAESTRO'
      if (!sugeridos?.categoria_cod || !sugeridos?.tipo_cod || !sugeridos?.clasif_cod) {
        return res.status(400).json({ error: 'Se requieren categoría/tipo/clasif sugeridos cuando no está en Maestro' })
      }
    } else if (!cumpleObjetivos(camp, snap)) {
      estado = 'REVISAR'
    }

    const asumidos = {
      categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos?.categoria_cod) : (snap?.categoria_cod || ''),
      tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos?.tipo_cod) : (snap?.tipo_cod || ''),
      clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos?.clasif_cod) : (snap?.clasif_cod || ''),
    }

    await prisma.escaneo.create({
      data: {
        campaniaId: camp.id, sucursal, email, sku, estado,
        categoria_sug_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : null,
        tipo_sug_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : null,
        clasif_sug_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : null,
        asum_categoria_cod: asumidos.categoria_cod || null,
        asum_tipo_cod: asumidos.tipo_cod || null,
        asum_clasif_cod: asumidos.clasif_cod || null,
      }
    })

    const maestroOut = snap ? {
      descripcion: snap.descripcion,
      categoria_cod: snap.categoria_cod,
      tipo_cod: snap.tipo_cod,
      clasif_cod: snap.clasif_cod,
    } : null

    res.json({ estado, maestro: maestroOut, asumidos })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error interno' })
  }
})

// ---------------------------
// Rutas ADMIN (token)
// ---------------------------
const admin = express.Router()
admin.use(requireAdmin)

// Ping
admin.get('/ping', (_req, res) => res.json({ ok: true }))

// Import JSON (admin)
admin.post('/diccionarios/import', async (req, res) => {
  const counts = await upsertDiccionarios(req.body || {})
  res.json({ ok: true, counts })
})
admin.post('/maestro/import', async (req, res) => {
  const { items = [] } = req.body || {}
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
  const count = await upsertMaestro(items)
  res.json({ ok: true, count })
})

// Crear campaña + snapshot (admin)
admin.post('/campanias', async (req, res) => {
  try {
    const camp = await crearCampaniaConSnapshot(req.body || {})
    res.json(camp)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' })
  }
})

// Auditoría — discrepancias vs snapshot y entre sucursales
admin.get('/discrepancias', async (req, res) => {
  const campaniaId = Number(req.query.campaniaId)
  if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

  const escaneos = await prisma.escaneo.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } })
  const items = []
  for (const e of escaneos) {
    const m = await prisma.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId, sku: e.sku } } })
    const diff = !m || (e.asum_categoria_cod !== (m?.categoria_cod || null) || e.asum_tipo_cod !== (m?.tipo_cod || null) || e.asum_clasif_cod !== (m?.clasif_cod || null))
    if (diff) {
      items.push({
        sku: e.sku, sucursal: e.sucursal, email: e.email, estado: e.estado,
        maestro: m ? { categoria_cod: m.categoria_cod, tipo_cod: m.tipo_cod, clasif_cod: m.clasif_cod } : null,
        asumidos: { categoria_cod: e.asum_categoria_cod, tipo_cod: e.asum_tipo_cod, clasif_cod: e.asum_clasif_cod },
        ts: e.ts
      })
    }
  }
  res.json({ items })
})

admin.get('/discrepancias-sucursales', async (req, res) => {
  const campaniaId = Number(req.query.campaniaId)
  if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

  const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } })
  const bySku = new Map()
  for (const e of escaneos) {
    const list = bySku.get(e.sku) || []
    list.push(e)
    bySku.set(e.sku, list)
  }
  const items = []
  for (const [sku, list] of bySku.entries()) {
    const setCat = new Set(list.map(x => x.asum_categoria_cod).filter(Boolean))
    const setTipo = new Set(list.map(x => x.asum_tipo_cod).filter(Boolean))
    const setCla = new Set(list.map(x => x.asum_clasif_cod).filter(Boolean))
    if (setCat.size > 1 || setTipo.size > 1 || setCla.size > 1) {
      items.push({
        sku,
        categorias: Array.from(setCat),
        tipos: Array.from(setTipo),
        clasif: Array.from(setCla)
      })
    }
  }
  res.json({ items })
})

// Exports CSV varios
admin.get('/export/maestro.csv', async (_req, res) => {
  const list = await prisma.maestro.findMany({ orderBy: { sku: 'asc' } })
  const rows = [['sku','descripcion','categoria_cod','tipo_cod','clasif_cod']]
  for (const m of list) rows.push([m.sku, m.descripcion, m.categoria_cod, m.tipo_cod, m.clasif_cod])
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="maestro.csv"')
  res.send(csv)
})
admin.get('/export/categorias.csv', async (_req, res) => {
  const list = await prisma.dicCategoria.findMany({ orderBy: { cod: 'asc' } })
  const rows = [['cod','nombre']]
  for (const it of list) rows.push([it.cod, it.nombre])
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="categorias.csv"')
  res.send(csv)
})
admin.get('/export/tipos.csv', async (_req, res) => {
  const list = await prisma.dicTipo.findMany({ orderBy: { cod: 'asc' } })
  const rows = [['cod','nombre']]
  for (const it of list) rows.push([it.cod, it.nombre])
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="tipos.csv"')
  res.send(csv)
})
admin.get('/export/clasif.csv', async (_req, res) => {
  const list = await prisma.dicClasif.findMany({ orderBy: { cod: 'asc' } })
  const rows = [['cod','nombre']]
  for (const it of list) rows.push([it.cod, it.nombre])
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="clasif.csv"')
  res.send(csv)
})
admin.get('/export/discrepancias.csv', async (req, res) => {
  const campaniaId = Number(req.query.campaniaId)
  if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
  const escaneos = await prisma.escaneo.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } })
  const rows = [['sku','sucursal','email','estado','cat_maestro','tipo_maestro','clasif_maestro','cat_asumido','tipo_asumido','clasif_asumido','ts']]
  for (const e of escaneos) {
    const m = await prisma.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId, sku: e.sku } } })
    const diff = !m || (e.asum_categoria_cod !== (m?.categoria_cod || null) || e.asum_tipo_cod !== (m?.tipo_cod || null) || e.asum_clasif_cod !== (m?.clasif_cod || null))
    if (!diff) continue
    rows.push([
      e.sku, e.sucursal, e.email, e.estado,
      m?.categoria_cod || '', m?.tipo_cod || '', m?.clasif_cod || '',
      e.asum_categoria_cod || '', e.asum_tipo_cod || '', e.asum_clasif_cod || '', e.ts.toISOString()
    ])
  }
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="discrepancias.csv"')
  res.send(csv)
})

// Revisiones: lista agrupada por SKU/propuesta con consenso
admin.get('/revisiones', async (req, res) => {
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

  const decisiones = await prisma.actualizacion.findMany({
    where: { campaniaId },
    orderBy: { ts: 'desc' }
  })
  const decKey = d => `${d.sku}|${d.new_categoria_cod}|${d.new_tipo_cod}|${d.new_clasif_cod}`
  const mapDec = new Map(decisiones.map(d => [decKey(d), d]))

  const porSku = new Map()
  for (const e of escaneos) {
    if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku)) continue

    const snap = snapBySku.get(e.sku) || null
    const dif = !snap || (e.asum_categoria_cod !== (snap?.categoria_cod || null)
      || e.asum_tipo_cod !== (snap?.tipo_cod || null)
      || e.asum_clasif_cod !== (snap?.clasif_cod || null))

    if (soloConDiferencias && !dif) continue

    const grp = porSku.get(e.sku) || {
      sku: e.sku,
      maestro: snap ? {
        categoria_cod: snap.categoria_cod, tipo_cod: snap.tipo_cod, clasif_cod: snap.clasif_cod
      } : null,
      propuestas: new Map()
    }

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
      .map(p => ({
        categoria_cod: p.categoria_cod,
        tipo_cod: p.tipo_cod,
        clasif_cod: p.clasif_cod,
        count: p.count,
        usuarios: Array.from(p.usuarios),
        sucursales: Array.from(p.sucursales),
        decision: mapDec.get(`${grp.sku}|${p.categoria_cod}|${p.tipo_cod}|${p.clasif_cod}`) || null
      }))
      .sort((a, b) => b.count - a.count)

    const total = propuestasArr.reduce((s, p) => s + p.count, 0)
    const top = propuestasArr[0]
    const consenso = top ? (top.count / Math.max(1, total)) : 0
    const hayConsenso = top ? (top.count >= 2 && top.count > (propuestasArr[1]?.count || 0)) : false

    if (filtroConsenso === 'true' && !hayConsenso) continue
    if (filtroConsenso === 'false' && hayConsenso) continue

    items.push({
      sku: grp.sku,
      maestro: grp.maestro,
      propuestas: propuestasArr,
      totalVotos: total,
      consensoPct: Number(consenso.toFixed(2)),
      hayConsenso
    })
  }

  res.json({ items })
})

// Revisiones: decidir (aceptar / rechazar)
admin.post('/revisiones/decidir', async (req, res) => {
  try {
    const { campaniaId, sku, decision, propuesta, decidedBy = 'admin@local', aplicarAhora = false } = req.body
    if (!campaniaId || !sku) return res.status(400).json({ error: 'campaniaId y sku requeridos' })

    const snap = await prisma.campaniaMaestro.findUnique({
      where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } }
    })

    if (decision === 'aceptar') {
      // Evitar múltiples 'pendiente' por el mismo SKU en la campaña: archiva otras
      await prisma.actualizacion.updateMany({
        where: { campaniaId: Number(campaniaId), sku, estado: 'pendiente', archivada: false },
        data: { archivada: true, archivadaAt: new Date(), archivadaBy: decidedBy || 'admin' }
      })

      const nueva = await prisma.actualizacion.create({
        data: {
          campaniaId: Number(campaniaId),
          sku,
          old_categoria_cod: snap?.categoria_cod ?? null,
          old_tipo_cod:      snap?.tipo_cod ?? null,
          old_clasif_cod:    snap?.clasif_cod ?? null,
          new_categoria_cod: pad2(propuesta?.categoria_cod || ''),
          new_tipo_cod:      pad2(propuesta?.tipo_cod || ''),
          new_clasif_cod:    pad2(propuesta?.clasif_cod || ''),
          estado: aplicarAhora ? 'aplicada' : 'pendiente',
          decidedBy,
          decidedAt: new Date(),
          ...(aplicarAhora ? { appliedAt: new Date() } : {})
        }
      })

      return res.json({ ok: true, actualizacion: nueva })
    }

    if (decision === 'rechazar') {
      const rej = await prisma.actualizacion.create({
        data: {
          campaniaId: Number(campaniaId),
          sku,
          old_categoria_cod: snap?.categoria_cod ?? null,
          old_tipo_cod:      snap?.tipo_cod ?? null,
          old_clasif_cod:    snap?.clasif_cod ?? null,
          new_categoria_cod: pad2(propuesta?.categoria_cod || ''),
          new_tipo_cod:      pad2(propuesta?.tipo_cod || ''),
          new_clasif_cod:    pad2(propuesta?.clasif_cod || ''),
          estado: 'rechazada',
          decidedBy,
          decidedAt: new Date()
        }
      })
      return res.json({ ok: true, actualizacion: rej })
    }

    return res.status(400).json({ error: 'decision inválida' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error al decidir revisión' })
  }
})

// Cola de actualizaciones (listar)
admin.get('/actualizaciones', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    const estado = String(req.query.estado || '').toLowerCase() // opcional: pendiente/aplicada/rechazada
    const arch = String(req.query.archivada ?? 'false').toLowerCase() // default: sólo activas

    const where = { campaniaId }

    if (['pendiente', 'aplicada', 'rechazada'].includes(estado)) {
      where.estado = estado
    }
    if (arch === 'false') where.archivada = false
    else if (arch === 'true') where.archivada = true
    // 'todas' => sin filtro de archivada

    const items = await prisma.actualizacion.findMany({
      where,
      orderBy: [{ ts: 'desc' }]
    })

    res.json({ items })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error listando actualizaciones' })
  }
})

// Export CSV de pendientes
admin.get('/export/actualizaciones.csv', async (req, res) => {
  const campaniaId = Number(req.query.campaniaId)
  if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
  const list = await prisma.actualizacion.findMany({
    where: { campaniaId, estado: 'pendiente' },
    orderBy: { ts: 'asc' }
  })
  const rows = [['sku','old_categoria','old_tipo','old_clasif','new_categoria','new_tipo','new_clasif','estado','decidido_por','decidido_en','notas']]
  for (const a of list) {
    rows.push([
      a.sku,
      a.old_categoria_cod || '', a.old_tipo_cod || '', a.old_clasif_cod || '',
      a.new_categoria_cod, a.new_tipo_cod, a.new_clasif_cod,
      a.estado, a.decidedBy || '', a.decidedAt?.toISOString() || '', a.notas || ''
    ])
  }
  const csv = toCSV(rows)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="actualizaciones_pendientes.csv"')
  res.send(csv)
})

// Export TXT por campo (única versión)
admin.get('/export/txt/:campo', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    const campo = String(req.params.campo || '').toLowerCase() // categoria | tipo | clasif
    const estadoParam = String(req.query.estado || 'aceptadas').toLowerCase() // aplicada | aceptadas
    const incluirArchivadas = String(req.query.incluirArchivadas || 'false').toLowerCase() === 'true'

    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
    if (!['categoria', 'tipo', 'clasif'].includes(campo)) {
      return res.status(400).json({ error: 'campo inválido (use: categoria | tipo | clasif)' })
    }

    const estados = estadoParam === 'aplicada' ? ['aplicada'] : ['pendiente', 'aplicada']

    const acts = await prisma.actualizacion.findMany({
      where: {
        campaniaId,
        estado: { in: estados },
        ...(incluirArchivadas ? {} : { archivada: false })
      },
      orderBy: [{ decidedAt: 'desc' }, { ts: 'desc' }]
    })

    const snaps = await prisma.campaniaMaestro.findMany({ where: { campaniaId } })
    const snapBySku = new Map(snaps.map(s => [s.sku, s]))

    const NEW  = { categoria: 'new_categoria_cod', tipo: 'new_tipo_cod', clasif: 'new_clasif_cod' }[campo]
    const OLD  = { categoria: 'old_categoria_cod', tipo: 'old_tipo_cod', clasif: 'old_clasif_cod' }[campo]
    const SNAP = { categoria: 'categoria_cod',    tipo: 'tipo_cod',    clasif: 'clasif_cod' }[campo]

    const ultimaPorSku = new Map()
    for (const a of acts) {
      if (ultimaPorSku.has(a.sku)) continue
      const newCode = a[NEW]
      if (!newCode) continue
      ultimaPorSku.set(a.sku, {
        newCode,
        oldFromDecision: a[OLD] || null,
        snapCode: snapBySku.get(a.sku)?.[SNAP] || null
      })
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
})

// Aplicar en lote
admin.post('/actualizaciones/aplicar', async (req, res) => {
  const { ids = [], decidedBy = '' } = req.body || {}
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids vacío' })

  const acts = await prisma.actualizacion.findMany({ where: { id: { in: ids } } })
  for (const a of acts) {
    await prisma.maestro.upsert({
      where: { sku: a.sku },
      create: {
        sku: a.sku, descripcion: '',
        categoria_cod: a.new_categoria_cod, tipo_cod: a.new_tipo_cod, clasif_cod: a.new_clasif_cod
      },
      update: { categoria_cod: a.new_categoria_cod, tipo_cod: a.new_tipo_cod, clasif_cod: a.new_clasif_cod }
    })
    await prisma.actualizacion.update({
      where: { id: a.id },
      data: { estado: 'aplicada', decidedBy: decidedBy || a.decidedBy, decidedAt: new Date(), appliedAt: new Date() }
    })
  }
  res.json({ ok: true, aplicadas: acts.length })
})

// Archivar / desarchivar actualizaciones (fix)
admin.post('/actualizaciones/archivar', async (req, res) => {
  const { ids = [], archivada = true, archivadaBy = '' } = req.body || {}
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids vacío' })

  const data = archivada
    ? { archivada: true, archivadaBy: archivadaBy || null, archivadaAt: new Date() }
    : { archivada: false, archivadaBy: null, archivadaAt: null }

  const r = await prisma.actualizacion.updateMany({
    where: { id: { in: ids } },
    data
  })
  res.json({ ok: true, updated: r.count })
})

// Montar router admin
app.use('/api/admin', admin)

// ---------------------------
// Boot
// ---------------------------
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`API unificada en http://localhost:${PORT}`))
