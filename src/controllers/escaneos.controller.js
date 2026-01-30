import { cleanSku, pad2, cumpleObjetivos } from '../utils/sku.js'

export function EscaneosController(prisma) {
  const ensureModel = (model, name, res) => {
    if (!model) {
      res.status(500).json({ error: `Prisma client missing ${name}. Run prisma:generate.` })
      return null
    }
    return model
  }

  return {
    crear: async (req, res) => {
      try {
        const { skuRaw = '', email = '', sucursal = '', campaniaId = null, sugeridos = {} } = req.body || {}
        const sku = cleanSku(skuRaw)
        if (!sku) return res.status(400).json({ error: 'skuRaw inválido' })
        if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

        const camp = await prisma.campania.findUnique({ where: { id: Number(campaniaId) } })
        if (!camp || !camp.activa) return res.status(400).json({ error: 'Campaña inexistente o no activa' })

        const snap = await prisma.campaniaMaestro.findUnique({ where: { campaniaId_sku: { campaniaId: camp.id, sku } } })

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

        if (!snap) {
          const unknownSku = ensureModel(prisma.unknownSku, 'unknownSku', res)
          const skuStage = ensureModel(prisma.skuStage, 'skuStage', res)
          if (!unknownSku || !skuStage) return
          await prisma.$transaction(async (tx) => {
            await tx.unknownSku.upsert({
              where: { campaniaId_sku: { campaniaId: camp.id, sku } },
              create: {
                campaniaId: camp.id,
                sku,
                categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : null,
                tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : null,
                clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : null,
                status: 'detected',
                updatedBy: email || null,
              },
              update: {
                categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : null,
                tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : null,
                clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : null,
                status: 'detected',
                updatedBy: email || null,
                updatedAt: new Date(),
              },
            })
            await tx.skuStage.upsert({
              where: { campaniaId_sku: { campaniaId: camp.id, sku } },
              create: {
                campaniaId: camp.id,
                sku,
                stage: 'unknown',
                updatedBy: email || null,
              },
              update: {
                stage: 'unknown',
                updatedBy: email || null,
                updatedAt: new Date(),
              },
            })
          })
        }

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
    }
  }
}
