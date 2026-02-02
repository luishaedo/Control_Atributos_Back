import { cleanSku, pad2, cumpleObjetivos } from '../utils/sku.js'

export function EscaneosController(prisma) {
  const ensureModel = (model, name) => {
    if (!model) {
      const error = new Error(`Prisma client missing ${name}. Run prisma:generate.`)
      error.status = 500
      throw error
    }
    return model
  }

  const normalizeUnknownStatus = (status = '') => {
    const normalized = String(status || '').trim().toUpperCase()
    if (['APPROVED', 'REJECTED', 'MERGED', 'PENDING'].includes(normalized)) return normalized
    if (normalized === 'CONFIRMED') return 'APPROVED'
    return 'PENDING'
  }

  const buildResponse = ({ scan, snap, unknown, stage }) => {
    const maestroOut = snap ? {
      descripcion: snap.descripcion,
      categoria_cod: snap.categoria_cod,
      tipo_cod: snap.tipo_cod,
      clasif_cod: snap.clasif_cod,
    } : null
    const asumidos = {
      categoria_cod: scan.asum_categoria_cod || '',
      tipo_cod: scan.asum_tipo_cod || '',
      clasif_cod: scan.asum_clasif_cod || '',
    }
    return {
      estado: scan.estado,
      maestro: maestroOut,
      asumidos,
      skuNormalized: scan.skuNormalized || scan.sku,
      skuType: snap ? 'KNOWN' : 'UNKNOWN',
      unknown: unknown ? {
        id: unknown.id,
        status: unknown.status,
        seenCount: unknown.seenCount ?? 0,
        stage: stage?.stage || 'unknown',
      } : null,
      errors: [],
    }
  }

  return {
    crear: async (req, res) => {
      try {
        const {
          skuRaw = '',
          email = '',
          sucursal = '',
          campaniaId = null,
          sugeridos = {},
          idempotencyKey = null,
        } = req.body || {}
        const skuNormalized = cleanSku(skuRaw)
        if (!skuNormalized) return res.status(400).json({ error: 'skuRaw inválido' })
        if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

        const camp = await prisma.campania.findUnique({ where: { id: Number(campaniaId) } })
        if (!camp || !camp.activa) return res.status(400).json({ error: 'Campaña inexistente o no activa' })

        if (idempotencyKey) {
          const existingScan = await prisma.escaneo.findUnique({
            where: {
              campaniaId_idempotencyKey: {
                campaniaId: camp.id,
                idempotencyKey,
              },
            },
          })
          if (existingScan) {
            const snap = await prisma.campaniaMaestro.findUnique({
              where: { campaniaId_sku: { campaniaId: camp.id, sku: existingScan.sku } },
            })
            const unknown = await prisma.unknownSku.findUnique({
              where: { campaniaId_sku: { campaniaId: camp.id, sku: existingScan.sku } },
            })
            const stage = await prisma.skuStage.findUnique({
              where: { campaniaId_sku: { campaniaId: camp.id, sku: existingScan.sku } },
            })
            return res.json(buildResponse({ scan: existingScan, snap, unknown, stage }))
          }
        }

        let snap = await prisma.campaniaMaestro.findUnique({
          where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
        })
        if (!snap) {
          const maestroItem = await prisma.maestro.findUnique({ where: { sku: skuNormalized } })
          if (maestroItem) {
            snap = await prisma.campaniaMaestro.upsert({
              where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
              create: {
                campaniaId: camp.id,
                sku: maestroItem.sku,
                descripcion: maestroItem.descripcion,
                categoria_cod: maestroItem.categoria_cod,
                tipo_cod: maestroItem.tipo_cod,
                clasif_cod: maestroItem.clasif_cod,
              },
              update: {
                descripcion: maestroItem.descripcion,
                categoria_cod: maestroItem.categoria_cod,
                tipo_cod: maestroItem.tipo_cod,
                clasif_cod: maestroItem.clasif_cod,
              },
            })
          }
        }

        let estado = 'OK'
        if (!snap) {
          estado = 'NO_MAESTRO'
          if (!sugeridos?.categoria_cod || !sugeridos?.tipo_cod || !sugeridos?.clasif_cod) {
            return res.status(400).json({ error: 'Se requieren categoría/tipo/clasif sugeridos cuando no está en Maestro' })
          }
          const categoriaCod = pad2(sugeridos.categoria_cod)
          const tipoCod = pad2(sugeridos.tipo_cod)
          const clasifCod = pad2(sugeridos.clasif_cod)
          const [dicCat, dicTipo, dicClasif] = await Promise.all([
            prisma.dicCategoria.findUnique({ where: { cod: categoriaCod } }),
            prisma.dicTipo.findUnique({ where: { cod: tipoCod } }),
            prisma.dicClasif.findUnique({ where: { cod: clasifCod } }),
          ])
          const errors = []
          if (!dicCat) errors.push({ field: 'categoria_cod', code: 'INVALID_CATEGORIA' })
          if (!dicTipo) errors.push({ field: 'tipo_cod', code: 'INVALID_TIPO' })
          if (!dicClasif) errors.push({ field: 'clasif_cod', code: 'INVALID_CLASIF' })
          if (errors.length) {
            return res.status(422).json({
              code: 'INVALID_DICTIONARY',
              message: 'Diccionarios inválidos',
              errors,
            })
          }
        } else if (!cumpleObjetivos(camp, snap)) {
          estado = 'REVISAR'
        }

        const asumidos = {
          categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos?.categoria_cod) : (snap?.categoria_cod || ''),
          tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos?.tipo_cod) : (snap?.tipo_cod || ''),
          clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos?.clasif_cod) : (snap?.clasif_cod || ''),
        }

        const scan = await prisma.escaneo.create({
          data: {
            campaniaId: camp.id,
            sucursal,
            email,
            sku: skuNormalized,
            skuRaw: skuRaw || null,
            skuNormalized,
            idempotencyKey: idempotencyKey || null,
            estado,
            categoria_sug_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : null,
            tipo_sug_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : null,
            clasif_sug_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : null,
            asum_categoria_cod: asumidos.categoria_cod || null,
            asum_tipo_cod: asumidos.tipo_cod || null,
            asum_clasif_cod: asumidos.clasif_cod || null,
          }
        })

        let unknown = null
        let stage = null

        if (!snap) {
          ensureModel(prisma.unknownSku, 'unknownSku')
          ensureModel(prisma.skuStage, 'skuStage')
          await prisma.$transaction(async (tx) => {
            const existingUnknown = await tx.unknownSku.findUnique({
              where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
            })
            const currentStatus = normalizeUnknownStatus(existingUnknown?.status)
            const shouldUpdateStage = currentStatus === 'PENDING'
            if (!existingUnknown) {
              unknown = await tx.unknownSku.create({
                data: {
                  campaniaId: camp.id,
                  sku: skuNormalized,
                  skuRaw: skuRaw || null,
                  skuNormalized,
                  categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : null,
                  tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : null,
                  clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : null,
                  status: 'PENDING',
                  seenCount: 1,
                  firstSeenAt: new Date(),
                  lastSeenAt: new Date(),
                  updatedBy: email || null,
                },
              })
            } else {
              unknown = await tx.unknownSku.update({
                where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
                data: {
                  skuRaw: skuRaw || existingUnknown.skuRaw || null,
                  skuNormalized,
                  categoria_cod: sugeridos?.categoria_cod ? pad2(sugeridos.categoria_cod) : existingUnknown.categoria_cod,
                  tipo_cod: sugeridos?.tipo_cod ? pad2(sugeridos.tipo_cod) : existingUnknown.tipo_cod,
                  clasif_cod: sugeridos?.clasif_cod ? pad2(sugeridos.clasif_cod) : existingUnknown.clasif_cod,
                  status: currentStatus,
                  seenCount: { increment: 1 },
                  lastSeenAt: new Date(),
                  updatedBy: email || null,
                },
              })
            }
            if (shouldUpdateStage) {
              stage = await tx.skuStage.upsert({
                where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
                create: {
                  campaniaId: camp.id,
                  sku: skuNormalized,
                  stage: 'unknown',
                  updatedBy: email || null,
                },
                update: {
                  stage: 'unknown',
                  updatedBy: email || null,
                  updatedAt: new Date(),
                },
              })
            }
          })
        } else {
          ensureModel(prisma.skuStage, 'skuStage')
          const hasDif =
            asumidos.categoria_cod !== (snap?.categoria_cod || '') ||
            asumidos.tipo_cod !== (snap?.tipo_cod || '') ||
            asumidos.clasif_cod !== (snap?.clasif_cod || '')
          stage = await prisma.skuStage.upsert({
            where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
            create: {
              campaniaId: camp.id,
              sku: skuNormalized,
              stage: hasDif ? 'evaluate' : 'confirm',
              updatedBy: email || null,
            },
            update: {
              stage: hasDif ? 'evaluate' : 'confirm',
              updatedBy: email || null,
              updatedAt: new Date(),
            },
          })
        }

        if (unknown && !stage) {
          stage = await prisma.skuStage.findUnique({
            where: { campaniaId_sku: { campaniaId: camp.id, sku: skuNormalized } },
          })
        }

        res.json(buildResponse({ scan, snap, unknown, stage }))
      } catch (err) {
        console.error(err)
        if (res.headersSent) return
        const status = err?.status || 500
        const message = err?.status ? err.message : 'Error interno'
        res.status(status).json({ error: message })
      }
    }
  }
}
