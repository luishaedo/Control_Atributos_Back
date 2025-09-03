import { toCSV } from '../utils/csv.js'

export function AuditoriaService(prisma) {
  const firma = (c,t,cl) => `${c||''}|${t||''}|${cl||''}`

  return {
    async discrepanciasRica({ campaniaId, buscarSku = '', minVotos = 1 }) {
      const [escaneos, snaps] = await Promise.all([
        prisma.escaneo.findMany({ where: { campaniaId }, orderBy: { ts: 'desc' } }),
        prisma.campaniaMaestro.findMany({ where: { campaniaId } }),
      ])
      const snapBySku = new Map(snaps.map(s => [s.sku, s]))

      const porSku = new Map()
      for (const e of escaneos) {
        if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku.toUpperCase())) continue
        const grp = porSku.get(e.sku) || {
          sku: e.sku,
          maestro: snapBySku.get(e.sku) ? {
            categoria_cod: snapBySku.get(e.sku).categoria_cod,
            tipo_cod:      snapBySku.get(e.sku).tipo_cod,
            clasif_cod:    snapBySku.get(e.sku).clasif_cod,
          } : null,
          total: 0,
          ultimoTs: null,
          propuestas: new Map(),
          porSucursal: new Map(),
          sucursalesSet: new Set(),
        }
        const cat = e.asum_categoria_cod || ''
        const tip = e.asum_tipo_cod || ''
        const cla = e.asum_clasif_cod || ''
        const key = firma(cat, tip, cla)

        const p = grp.propuestas.get(key) || { categoria_cod: cat, tipo_cod: tip, clasif_cod: cla, count: 0, usuarios: new Set(), sucursales: new Set() }
        p.count += 1
        if (e.email) p.usuarios.add(e.email)
        if (e.sucursal) p.sucursales.add(e.sucursal)
        grp.propuestas.set(key, p)

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

      const items = []
      for (const grp of porSku.values()) {
        const propuestasArr = Array.from(grp.propuestas.values())
          .sort((a,b) => b.count - a.count)
          .map(p => ({
            categoria_cod: p.categoria_cod,
            tipo_cod: p.tipo_cod,
            clasif_cod: p.clasif_cod,
            count: p.count,
            pct: Number((p.count / Math.max(1, grp.total)).toFixed(2)),
            usuarios: Array.from(p.usuarios),
            sucursales: Array.from(p.sucursales),
          }))
        if ((propuestasArr[0]?.count || 0) < Number(minVotos)) continue

        const porSucursal = []
        for (const [suc, mapFirmas] of grp.porSucursal.entries()) {
          const arr = Array.from(mapFirmas.entries())
            .map(([k, v]) => {
              const [c,t,cl] = k.split('|')
              return { sucursal: suc, categoria_cod: c, tipo_cod: t, clasif_cod: cl, count: v.count, ultimoTs: v.ultimoTs, usuarios: Array.from(v.usuarios) }
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
            variantes: arr.slice(1)
          })
        }

        items.push({
          sku: grp.sku,
          maestro: grp.maestro,
          totalEscaneos: grp.total,
          sucursales: Array.from(grp.sucursalesSet),
          ultimoTs: grp.ultimoTs,
          topPropuesta: propuestasArr[0] || null,
          propuestas: propuestasArr,
          porSucursal,
        })
      }
      return { items }
    },

    async discrepanciasSucursales({ campaniaId, buscarSku = '', minSucursales = 2 }) {
      const escaneos = await prisma.escaneo.findMany({ where: { campaniaId } })
      const firma = (c,t,cl) => `${c||''}|${t||''}|${cl||''}`
      const porSku = new Map()
      for (const e of escaneos) {
        if (buscarSku && !String(e.sku).toUpperCase().includes(buscarSku.toUpperCase())) continue
        const grp = porSku.get(e.sku) || { sku: e.sku, porSucursal: new Map() }
        const k = firma(e.asum_categoria_cod, e.asum_tipo_cod, e.asum_clasif_cod)
        const mapSuc = grp.porSucursal.get(e.sucursal || '—') || new Map()
        const v = mapSuc.get(k) || { count: 0, ultimoTs: null, usuarios: new Set() }
        v.count += 1
        v.ultimoTs = !v.ultimoTs || e.ts > v.ultimoTs ? e.ts : v.ultimoTs
        if (e.email) v.usuarios.add(e.email)
        mapSuc.set(k, v)
        grp.porSucursal.set(e.sucursal || '—', mapSuc)
        porSku.set(e.sku, grp)
      }

      const items = []
      for (const [sku, grp] of porSku.entries()) {
        if (grp.porSucursal.size < Number(minSucursales)) continue
        const detalle = []
        for (const [suc, map] of grp.porSucursal.entries()) {
          const arr = Array.from(map.entries()).map(([k,v])=>{
            const [c,t,cl]=k.split('|'); return { sucursal:suc, categoria_cod:c, tipo_cod:t, clasif_cod:cl, count:v.count, ultimoTs:v.ultimoTs, usuarios:Array.from(v.usuarios) }
          }).sort((a,b)=>b.count-a.count)
          const top = arr[0]
          detalle.push({
            sucursal: suc,
            categoria_cod: top?.categoria_cod || '',
            tipo_cod: top?.tipo_cod || '',
            clasif_cod: top?.clasif_cod || '',
            count: top?.count || 0,
            ultimoTs: top?.ultimoTs || null,
            usuarios: top?.usuarios || [],
            variantes: arr.slice(1)
          })
        }
        const firmasMayor = new Set(detalle.map(d => `${d.categoria_cod}|${d.tipo_cod}|${d.clasif_cod}`))
        const conflicto = firmasMayor.size > 1
        items.push({ sku, conflicto, sucursales: detalle, firmasDistintas: firmasMayor.size })
      }
      return { items }
    },
  }
}
