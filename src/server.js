// src/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { cleanSku, pad2, cumpleObjetivos } from './utils/sku.js'

const prisma = new PrismaClient()
const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' }))

// ---------------------------
// Auth / helpers
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

app.get('/api/diccionarios', async (_req, res) => {
  const [categorias, tipos, clasif] = await Promise.all([
    prisma.dicCategoria.findMany(),
    prisma.dicTipo.findMany(),
    prisma.dicClasif.findMany(),
  ])
  res.json({ categorias, tipos, clasif })
})

app.post('/api/diccionarios/import', async (req, res) => {
  const counts = await upsertDiccionarios(req.body || {})
  res.json({ ok: true, counts })
})

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

app.post('/api/campanias', async (req, res) => {
  try {
    const camp = await crearCampaniaConSnapshot(req.body || {})
    res.json(camp)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' })
  }
})

app.get('/api/maestro/:sku', async (req, res) => {
  const sku = cleanSku(req.params.sku || '')
  if (!sku) return res.status(400).json({ error: 'SKU inválido' })
  const item = await prisma.maestro.findUnique({ where: { sku } })
  if (!item) return res.status(404).json({ error: 'No encontrado' })
  res.json(item)
})

app.post('/api/maestro/import', async (req, res) => {
  const { items = [] } = req.body || {}
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items vacío' })
  const count = await upsertMaestro(items)
  res.json({ ok: true, count })
})

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
// Rutas ADMIN
// ---------------------------
const admin = express.Router()
admin.use(requireAdmin)

// Ping
admin.get('/ping', (_req, res) => res.json({ ok: true }))

// Import JSON
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

// Campañas
admin.post('/campanias', async (req, res) => {
  try {
    const camp = await crearCampaniaConSnapshot(req.body || {})
    res.json(camp)
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error' })
  }
})

// ===================== AUDITORÍA: Discrepancias vs Maestro (RICA) =====================
admin.get('/discrepancias', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    const buscarSku = (req.query.sku || '').trim().toUpperCase()
    const minVotos = Number(req.query.minVotos || 1) // filtro opc.
    // si querés un “sólo conflicto con Maestro” del lado del server, podés leer ?soloConflicto=true

    // fetch en bloque
    const [escaneos, snaps] = await Promise.all([
      prisma.escaneo.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } }),
      prisma.campaniaMaestro.findMany({ where: { campaniaId } }),
    ])
    const snapBySku = new Map(snaps.map(s => [s.sku, s]))

    const firma = (c,t,cl) => `${c||''}|${t||''}|${cl||''}`

    // agrupamos por SKU
    const porSku = new Map()
    for (const e of escaneos) {
      if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku)) continue
      const grp = porSku.get(e.sku) || {
        sku: e.sku,
        maestro: snapBySku.get(e.sku) ? {
          categoria_cod: snapBySku.get(e.sku).categoria_cod,
          tipo_cod:      snapBySku.get(e.sku).tipo_cod,
          clasif_cod:    snapBySku.get(e.sku).clasif_cod,
        } : null,
        total: 0,
        ultimoTs: null,
        propuestas: new Map(),         // firma -> {cat,tipo,clasif,count,usuarios:Set,sucursales:Set}
        porSucursal: new Map(),        // sucursal -> Map(firma -> {count, ultimoTs, usuarios:Set})
        sucursalesSet: new Set(),
      }

      const cat = e.asum_categoria_cod || ''
      const tip = e.asum_tipo_cod || ''
      const cla = e.asum_clasif_cod || ''
      const key = firma(cat, tip, cla)

      // propuestas globales
      const p = grp.propuestas.get(key) || { categoria_cod: cat, tipo_cod: tip, clasif_cod: cla, count: 0, usuarios: new Set(), sucursales: new Set() }
      p.count += 1
      if (e.email) p.usuarios.add(e.email)
      if (e.sucursal) p.sucursales.add(e.sucursal)
      grp.propuestas.set(key, p)

      // por sucursal (tracking de “quién dijo qué”)
      if (e.sucursal) {
        const mapSuc = grp.porSucursal.get(e.sucursal) || new Map()
        const ps = mapSuc.get(key) || { count: 0, ultimoTs: null, usuarios: new Set() }
        ps.count += 1
        ps.ultimoTs = !ps.ultimoTs || e.ts > ps.ultimoTs ? e.ts : ps.ultimoTs
        if (e.email) ps.usuarios.add(e.email)
        mapSuc.set(key, ps)
        grp.porSucursal.set(e.sucursal, mapSuc)
        grp.sucursalesSet.add(e.sucursal)
      }

      grp.total += 1
      grp.ultimoTs = !grp.ultimoTs || e.ts > grp.ultimoTs ? e.ts : grp.ultimoTs
      porSku.set(e.sku, grp)
    }

    // armamos salida
    const items = []
    for (const grp of porSku.values()) {
      // propuestas ordenadas por count
      const propuestasArr = Array.from(grp.propuestas.values())
        .sort((a,b) => b.count - a.count)
        .map(p => ({
          categoria_cod: p.categoria_cod,
          tipo_cod:      p.tipo_cod,
          clasif_cod:    p.clasif_cod,
          count:         p.count,
          pct:           Number((p.count / Math.max(1, grp.total)).toFixed(2)),
          usuarios:      Array.from(p.usuarios),
          sucursales:    Array.from(p.sucursales),
        }))

      if ((propuestasArr[0]?.count || 0) < minVotos) continue

      // top propuesta
      const top = propuestasArr[0] || null

      // Por sucursal: la “mayoritaria” de esa sucursal
      const porSucursal = []
      for (const [suc, mapFirmas] of grp.porSucursal.entries()) {
        const arr = Array.from(mapFirmas.entries())
          .map(([k, v]) => {
            const [c,t,cl] = k.split('|')
            return {
              firma: k,
              categoria_cod: c, tipo_cod: t, clasif_cod: cl,
              count: v.count,
              ultimoTs: v.ultimoTs,
              usuarios: Array.from(v.usuarios)
            }
          })
          .sort((a,b)=> b.count - a.count)
        const mayoritaria = arr[0]
        porSucursal.push({
          sucursal: suc,
          count: mayoritaria?.count || 0,
          ultimoTs: mayoritaria?.ultimoTs || null,
          usuarios: mayoritaria?.usuarios || [],
          categoria_cod: mayoritaria?.categoria_cod || '',
          tipo_cod: mayoritaria?.tipo_cod || '',
          clasif_cod: mayoritaria?.clasif_cod || '',
          // si querés mostrar también “otras” reportadas por esa sucursal:
          variantes: arr.slice(1)
        })
      }

      items.push({
        sku: grp.sku,
        maestro: grp.maestro,                 // {categoria_cod,tipo_cod,clasif_cod} o null
        totalEscaneos: grp.total,
        sucursales: Array.from(grp.sucursalesSet),
        ultimoTs: grp.ultimoTs,
        topPropuesta: top,                    // {cat,tipo,clasif,count,pct,...}
        propuestas: propuestasArr,            // ranking completo
        porSucursal,                          // quién dijo qué
      })
    }

    res.json({ items })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error en auditoría de discrepancias' })
  }
})


// ===================== AUDITORÍA: Entre sucursales (clustering por SKU) =====================
admin.get('/discrepancias-sucursales', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    const buscarSku = (req.query.sku || '').trim().toUpperCase()
    const minSucursales = Number(req.query.minSucursales || 2)

    const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } })

    const firma = (c,t,cl) => `${c||''}|${t||''}|${cl||''}`

    // agrupación por SKU y sucursal (contar “firmas”)
    const porSku = new Map()
    for (const e of escaneos) {
      if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku)) continue
      const grp = porSku.get(e.sku) || {
        sku: e.sku,
        porSucursal: new Map(), // suc -> Map(firma -> {count,ultimoTs,usuarios:Set})
        firmasSet: new Set(),
      }
      const k = firma(e.asum_categoria_cod, e.asum_tipo_cod, e.asum_clasif_cod)
      grp.firmasSet.add(k)

      if (e.sucursal) {
        const mapSuc = grp.porSucursal.get(e.sucursal) || new Map()
        const v = mapSuc.get(k) || { count: 0, ultimoTs: null, usuarios: new Set() }
        v.count += 1
        v.ultimoTs = !v.ultimoTs || e.ts > v.ultimoTs ? e.ts : v.ultimoTs
        if (e.email) v.usuarios.add(e.email)
        mapSuc.set(k, v)
        grp.porSucursal.set(e.sucursal, mapSuc)
      }
      porSku.set(e.sku, grp)
    }

    const items = []
    for (const grp of porSku.values()) {
      if (grp.porSucursal.size < minSucursales) continue

      // para cada sucursal, mayoritaria
      const detalle = []
      for (const [suc, map] of grp.porSucursal.entries()) {
        const arr = Array.from(map.entries())
          .map(([k,v]) => {
            const [c,t,cl] = k.split('|')
            return {
              sucursal: suc,
              firma: k,
              categoria_cod: c, tipo_cod: t, clasif_cod: cl,
              count: v.count,
              ultimoTs: v.ultimoTs,
              usuarios: Array.from(v.usuarios),
            }
          })
          .sort((a,b)=> b.count - a.count)

        const mayoritaria = arr[0]
        detalle.push({
          sucursal: mayoritaria.sucursal,
          categoria_cod: mayoritaria.categoria_cod,
          tipo_cod: mayoritaria.tipo_cod,
          clasif_cod: mayoritaria.clasif_cod,
          count: mayoritaria.count,
          ultimoTs: mayoritaria.ultimoTs,
          usuarios: mayoritaria.usuarios,
          variantes: arr.slice(1) // otras reportadas por la misma sucursal
        })
      }

      // ¿hay conflicto real? (más de una firma mayoritaria diferente entre sucursales)
      const firmasMayor = new Set(detalle.map(d => `${d.categoria_cod}|${d.tipo_cod}|${d.clasif_cod}`))
      const conflicto = firmasMayor.size > 1

      items.push({
        sku: grp.sku,
        conflicto,
        sucursales: detalle,         
        firmasDistintas: firmasMayor.size
      })
    }

    res.json({ items })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error en auditoría entre sucursales' })
  }
})


// ===================== CSV entre sucursales (opcional) =====================
admin.get('/export/discrepancias-sucursales.csv', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    // reutilizamos el handler anterior “internamente”
    const url = new URL(req.url, 'http://x/')
    url.searchParams.set('minSucursales', url.searchParams.get('minSucursales') || '2')
    req.query = Object.fromEntries(url.searchParams.entries())

    const { items } = await (async () => {
      const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } })
      const firma = (c,t,cl) => `${c||''}|${t||''}|${cl||''}`
      const porSku = new Map()
      for (const e of escaneos) {
        const grp = porSku.get(e.sku) || { porSucursal: new Map() }
        const k = firma(e.asum_categoria_cod, e.asum_tipo_cod, e.asum_clasif_cod)
        const map = grp.porSucursal.get(e.sucursal || '—') || new Map()
        const v = map.get(k) || { count: 0, ultimoTs: null }
        v.count += 1
        v.ultimoTs = !v.ultimoTs || e.ts > v.ultimoTs ? e.ts : v.ultimoTs
        map.set(k, v)
        grp.porSucursal.set(e.sucursal || '—', map)
        porSku.set(e.sku, grp)
      }
      const items = []
      for (const [sku, grp] of porSku.entries()) {
        const detalle = []
        for (const [suc, map] of grp.porSucursal.entries()) {
          const arr = Array.from(map.entries()).map(([k,v])=>{
            const [c,t,cl]=k.split('|'); return { sucursal:suc, c,t,cl, count:v.count, ultimo:v.ultimoTs }
          }).sort((a,b)=>b.count-a.count)
          const top = arr[0]
          detalle.push({ sucursal: suc, c: top?.c||'', t: top?.t||'', cl: top?.cl||'', count: top?.count||0, ultimo: top?.ultimo||null })
        }
        const firmas = new Set(detalle.map(d => `${d.c}|${d.t}|${d.cl}`))
        if (firmas.size > 1) {
          items.push({ sku, detalle })
        }
      }
      return { items }
    })()

    const rows = [['sku','sucursal','categoria','tipo','clasif','count','ultimo']]
    for (const it of items) {
      for (const d of it.sucursales || it.detalle) {
        rows.push([it.sku, d.sucursal, d.categoria_cod||d.c, d.tipo_cod||d.t, d.clasif_cod||d.cl, d.count, d.ultimoTs ? new Date(d.ultimoTs).toISOString() : ''])
      }
    }
    const csv = toCSV(rows)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="discrepancias_sucursales.csv"')
    res.send(csv)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error exportando CSV de sucursales' })
  }
})


// Exports CSV Diccionarios/Maestro
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

// Exports CSV discrepancias
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

// Revisiones agrupadas
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
    const dif = !snap || (
      e.asum_categoria_cod !== (snap?.categoria_cod || null) ||
      e.asum_tipo_cod !== (snap?.tipo_cod || null) ||
      e.asum_clasif_cod !== (snap?.clasif_cod || null)
    )
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

// Decidir revisión (aceptar/rechazar)
admin.post('/revisiones/decidir', async (req, res) => {
  try {
    const { campaniaId, sku, propuesta, decision, decidedBy, aplicarAhora = false, notas = '' } = req.body || {}
    if (!campaniaId || !sku || !propuesta || !decision) return res.status(400).json({ error: 'Faltan campos' })
    if (!['aceptar', 'rechazar'].includes(decision)) return res.status(400).json({ error: 'decision inválida' })

    const snap = await prisma.campaniaMaestro.findUnique({
      where: { campaniaId_sku: { campaniaId: Number(campaniaId), sku } }
    })

    const oldCat = snap?.categoria_cod ?? null
    const oldTip = snap?.tipo_cod ?? null
    const oldCla = snap?.clasif_cod ?? null

    const newCat = pad2(propuesta.categoria_cod || '')
    const newTip = pad2(propuesta.tipo_cod || '')
    const newCla = pad2(propuesta.clasif_cod || '')

    const estado = decision === 'aceptar' ? (aplicarAhora ? 'aplicada' : 'pendiente') : 'rechazada'

    // Archivar otras pendientes del mismo SKU (evita duplicados colgando)
    await prisma.actualizacion.updateMany({
      where: { campaniaId: Number(campaniaId), sku, estado: 'pendiente', archivada: false },
      data: { archivada: true, archivadaAt: new Date(), archivadaBy: decidedBy || 'admin' }
    })

    const act = await prisma.actualizacion.create({
      data: {
        campaniaId: Number(campaniaId),
        sku,
        old_categoria_cod: oldCat,
        old_tipo_cod: oldTip,
        old_clasif_cod: oldCla,
        new_categoria_cod: newCat,
        new_tipo_cod: newTip,
        new_clasif_cod: newCla,
        estado,
        decidedBy: decidedBy || null,
        decidedAt: new Date(),
        notas,
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
})

// Cola de actualizaciones (listar) — con filtros
admin.get('/actualizaciones', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    const estado = (req.query.estado || '').trim() // '', 'pendiente', 'aplicada', 'rechazada'
    const arch = (req.query.archivada || '').trim() // '', 'true', 'false', 'todas'

    const where = { campaniaId }
    if (estado) where.estado = estado
    if (arch === 'true') where.archivada = true
    else if (arch === 'false' || arch === '') where.archivada = false
    // 'todas' => no filtra

    const items = await prisma.actualizacion.findMany({
      where,
      orderBy: { ts: 'desc' }
    })
    res.json({ items })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error listando actualizaciones' })
  }
})
// Export CSV de pendientes
admin.get('/export/actualizaciones.csv', async (req, res) => {
  const campaniaId = Number(req.query.campaniaId)
  if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
  const list = await prisma.actualizacion.findMany({
    where: { campaniaId, estado: 'pendiente', archivada: false },
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

// Export TXT por campo (aceptadas/aplicadas)
admin.get('/export/txt/:campo', async (req, res) => {
  try {
    const campaniaId = Number(req.query.campaniaId)
    const campo = String(req.params.campo || '').toLowerCase() // categoria|tipo|clasif
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
    // si está rechazada, la “aceptamos” y aplicamos
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

// Archivar / desarchivar
admin.post('/actualizaciones/archivar', async (req, res) => {
  try {
    const { ids = [], archivada = true, archivadaBy = 'api' } = req.body || {}
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'ids vacío' })
    }
    await prisma.actualizacion.updateMany({
      where: { id: { in: ids } },
      data: { archivada, archivadaBy, archivadaAt: new Date() }
    })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error al archivar/desarchivar' })
  }
})

// Deshacer (borra decisión no aplicada)
admin.post('/actualizaciones/undo', async (req, res) => {
  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'id requerido' })
  const act = await prisma.actualizacion.findUnique({ where: { id } })
  if (!act) return res.status(404).json({ error: 'Actualización no encontrada' })
  if (act.estado === 'aplicada') {
    return res.status(400).json({ error: 'No se puede deshacer una actualización aplicada (use revertir)' })
  }
  await prisma.actualizacion.delete({ where: { id } })
  res.json({ ok: true })
})

// Revertir una aplicada (crea “pendiente” inversa)
admin.post('/actualizaciones/revertir', async (req, res) => {
  try {
    const { id, decidedBy = 'admin@local' } = req.body || {}
    if (!id) return res.status(400).json({ error: 'id requerido' })

    const act = await prisma.actualizacion.findUnique({ where: { id } })
    if (!act) return res.status(404).json({ error: 'Actualización no encontrada' })
    if (act.estado !== 'aplicada') {
      return res.status(400).json({ error: 'Sólo se pueden revertir las aplicadas' })
    }

    // Construimos la “propuesta” de reversión: sin nulls en new_*
    const new_categoria_cod = pad2(act.old_categoria_cod ?? act.new_categoria_cod)
    const new_tipo_cod      = pad2(act.old_tipo_cod      ?? act.new_tipo_cod)
    const new_clasif_cod    = pad2(act.old_clasif_cod    ?? act.new_clasif_cod)

    // Guardamos desde dónde estamos volviendo (los valores actualmente aplicados)
    const old_categoria_cod = act.new_categoria_cod
    const old_tipo_cod      = act.new_tipo_cod
    const old_clasif_cod    = act.new_clasif_cod

    const revert = await prisma.actualizacion.create({
      data: {
        campaniaId: act.campaniaId,
        sku: act.sku,
        old_categoria_cod,
        old_tipo_cod,
        old_clasif_cod,
        new_categoria_cod,
        new_tipo_cod,
        new_clasif_cod,
        estado: 'pendiente',
        decidedBy,
        decidedAt: new Date()
      }
    })

    res.json({ ok: true, actualizacion: revert })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Error al revertir' })
  }
})

app.use('/api/admin', admin)

// ---------------------------
// Boot
// ---------------------------
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`API unificada en http://localhost:${PORT}`))
