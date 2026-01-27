import { cleanSku, pad2 } from '../utils/sku.js'

export function CampaniasService(prisma) {
  return {
    async crearCampaniaConSnapshot(payload = {}) {
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

      return prisma.$transaction(async (tx) => {
        const camp = await tx.campania.create({
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

        const maestro = await tx.maestro.findMany()
        if (maestro.length) {
          await tx.campaniaMaestro.createMany({
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
      })
    },

    async activar(id) {
      return prisma.$transaction(async (tx) => {
        await tx.campania.updateMany({ data: { activa: false } })
        return tx.campania.update({ where: { id: Number(id) }, data: { activa: true } })
      })
    },

    listar() {
      return prisma.campania.findMany({ orderBy: { id: 'asc' } })
    },
  }
}
