import { parseCode } from '../utils/sku.js'

export function CampaniasService(prisma) {
  const appError = (code, status, message) => Object.assign(new Error(message), { code, status })
  const parseDates = (inicia, termina) => {
    const start = new Date(inicia)
    const end = new Date(termina)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw appError('INVALID_CAMPAIGN_DATES', 400, 'inicia y termina deben ser fechas válidas')
    }
    if (start > end) {
      throw appError('INVALID_CAMPAIGN_DATES', 400, 'inicia no puede ser posterior a termina')
    }
    return { inicia: start, termina: end }
  }

  const normalizeTargets = async (db, values) => {
    const definitions = [
      ['categoria_objetivo_cod', db.dicCategoria],
      ['tipo_objetivo_cod', db.dicTipo],
      ['clasif_objetivo_cod', db.dicClasif],
    ]
    const normalized = {}
    for (const [field, model] of definitions) {
      if (!(field in values)) continue
      const value = values[field]
      if (value === undefined || value === null || String(value).trim() === '') {
        normalized[field] = null
        continue
      }
      const parsed = parseCode(value)
      if (!parsed.valid) {
        throw appError('INVALID_CODE_FORMAT', 422, `${field} debe tener uno o dos dígitos; no se truncó el valor`)
      }
      if (!await model.findUnique({ where: { cod: parsed.normalized } })) {
        throw appError('INVALID_DICTIONARY', 422, `${field} no existe en el diccionario`)
      }
      normalized[field] = parsed.normalized
    }
    return normalized
  }

  const mapActivationConflict = error => {
    if (['P2002', 'P2034'].includes(error?.code)) {
      return appError('CAMPAIGN_ACTIVATION_CONFLICT', 409,
        'La activación cambió en simultáneo; actualizá la lista y reintentá')
    }
    return error
  }

  const activateInTransaction = async (tx, campaniaId) => {
    const camp = await tx.campania.findUnique({ where: { id: campaniaId } })
    if (!camp) throw appError('CAMPAIGN_NOT_FOUND', 404, 'Campaña no encontrada')
    if (camp.estado === 'CERRADA' || (camp.activatedOnce && !camp.activa)) {
      throw appError('CAMPAIGN_CLOSED', 409, 'La campaña cerrada no puede reactivarse')
    }
    if (camp.activa && camp.estado === 'ACTIVA') return camp
    const otherActive = await tx.campania.findFirst({ where: { activa: true, id: { not: campaniaId } } })
    if (otherActive) {
      throw appError('ACTIVE_CAMPAIGN_EXISTS', 409,
        `Ya existe una campaña activa (${otherActive.id}); cerrala antes de activar otra`)
    }

    const maestro = await tx.maestro.findMany()
    await tx.campaniaMaestro.deleteMany({ where: { campaniaId } })
    if (maestro.length) {
      await tx.campaniaMaestro.createMany({ data: maestro.map(item => ({
        campaniaId,
        sku: item.sku,
        descripcion: item.descripcion,
        categoria_cod: item.categoria_cod,
        tipo_cod: item.tipo_cod,
        clasif_cod: item.clasif_cod,
      })) })
    }
    return tx.campania.update({
      where: { id: campaniaId },
      data: { activa: true, activatedOnce: true, estado: 'ACTIVA', activatedAt: new Date() },
    })
  }

  return {
    async crearCampaniaConSnapshot(payload = {}) {
      const {
        nombre, inicia, termina,
        categoria_objetivo_cod = null,
        tipo_objetivo_cod = null,
        clasif_objetivo_cod = null,
        activa = false
      } = payload

      if (!nombre || !inicia || !termina) throw appError('INVALID_CAMPAIGN', 400, 'Faltan campos: nombre, inicia, termina')
      const dates = parseDates(inicia, termina)

      try {
        return await prisma.$transaction(async (tx) => {
          const targets = await normalizeTargets(tx, {
            categoria_objetivo_cod, tipo_objetivo_cod, clasif_objetivo_cod,
          })
          const camp = await tx.campania.create({
            data: {
              nombre,
              ...dates,
              ...targets,
              activa: false,
              activatedOnce: false,
              estado: 'BORRADOR',
            }
          })
          return activa ? activateInTransaction(tx, camp.id) : camp
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        throw mapActivationConflict(error)
      }
    },

    async activar(id) {
      const campaniaId = Number(id)
      if (!Number.isSafeInteger(campaniaId) || campaniaId < 1) {
        throw appError('INVALID_CAMPAIGN_ID', 400, 'id inválido')
      }
      try {
        return await prisma.$transaction(tx => activateInTransaction(tx, campaniaId), {
          isolationLevel: 'Serializable',
        })
      } catch (error) {
        throw mapActivationConflict(error)
      }
    },

    listar() {
      return prisma.campania.findMany({ orderBy: { id: 'asc' } })
    },

    async actualizar(id, payload = {}) {
      const campaniaId = Number(id)
      if (!campaniaId) {
        throw appError('INVALID_CAMPAIGN_ID', 400, 'id inválido')
      }
      try {
        return await prisma.$transaction(async tx => {
          const camp = await tx.campania.findUnique({ where: { id: campaniaId } })
          if (!camp) throw appError('CAMPAIGN_NOT_FOUND', 404, 'Campaña no encontrada')
          if (camp.activatedOnce) {
            throw appError('CAMPAIGN_NOT_EDITABLE', 409, 'La campaña ya fue activada y no puede editarse')
          }
          const dates = parseDates(payload.inicia ?? camp.inicia, payload.termina ?? camp.termina)
          const targets = await normalizeTargets(tx, payload)
          const data = {
            ...(payload.nombre ? { nombre: payload.nombre } : {}),
            ...(payload.inicia !== undefined ? { inicia: dates.inicia } : {}),
            ...(payload.termina !== undefined ? { termina: dates.termina } : {}),
            ...targets,
          }
          const updated = await tx.campania.updateMany({
            where: { id: campaniaId, activatedOnce: false, estado: 'BORRADOR' }, data,
          })
          if (updated.count !== 1) {
            throw appError('CAMPAIGN_EDIT_CONFLICT', 409, 'La campaña cambió durante la edición')
          }
          return tx.campania.findUnique({ where: { id: campaniaId } })
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (error?.code === 'P2034') {
          throw appError('CAMPAIGN_EDIT_CONFLICT', 409, 'La campaña cambió durante la edición')
        }
        throw error
      }
    },
  }
}
