import { parseCode, parseSku, cumpleObjetivos } from '../utils/sku.js'
import { actorFromAuth } from './identity.service.js'

const stageRank = new Map([
  ['unknown', 0],
  ['evaluate', 1],
  ['confirm', 2],
  ['consolidate', 3],
])

function appError(code, status, message, details) {
  return Object.assign(new Error(message), { code, status, publicMessage: message, details })
}

function normalizeUnknownStatus(status = '') {
  const normalized = String(status || '').trim().toUpperCase()
  if (['APPROVED', 'REJECTED', 'MERGED', 'PENDING'].includes(normalized)) return normalized
  if (normalized === 'CONFIRMED') return 'APPROVED'
  return 'PENDING'
}

function nextStage(current, proposed) {
  if (!current || !stageRank.has(current)) return proposed
  return stageRank.get(current) >= stageRank.get(proposed) ? current : proposed
}

function normalizedInput(payload = {}, auth = null) {
  const idempotencyKey = String(payload.idempotencyKey || '').trim()
  const campaniaId = Number(payload.campaniaId)
  const skuRaw = String(payload.skuRaw || '').trim()
  const parsedSku = parseSku(skuRaw)
  const skuNormalized = parsedSku.normalized
  const code = (field, value) => {
    if (!String(value ?? '').trim()) return null
    const parsed = parseCode(value)
    if (!parsed.valid) {
      throw appError('INVALID_CODE_FORMAT', 422,
        `${field} debe tener uno o dos dígitos; el valor no fue truncado`, [{ field, code: 'INVALID_FORMAT' }])
    }
    return parsed.normalized
  }

  if (!idempotencyKey || idempotencyKey.length > 128) {
    throw appError('IDEMPOTENCY_KEY_REQUIRED', 400, 'idempotencyKey requerido (máximo 128 caracteres)')
  }
  if (!Number.isInteger(campaniaId) || campaniaId < 1) {
    throw appError('INVALID_CAMPAIGN_ID', 400, 'campaniaId requerido')
  }
  if (!parsedSku.valid) {
    throw appError('INVALID_SKU', 400,
      'skuRaw inválido: usá una base alfanumérica y un sufijo opcional iniciado por # o $')
  }

  return {
    campaniaId,
    idempotencyKey,
    skuRaw,
    skuNormalized,
    email: actorFromAuth(auth) || String(payload.email || '').trim(),
    sucursal: auth?.user?.sucursal?.codigo || String(payload.sucursal || '').trim(),
    sugeridos: {
      categoria_cod: code('categoria_cod', payload.sugeridos?.categoria_cod),
      tipo_cod: code('tipo_cod', payload.sugeridos?.tipo_cod),
      clasif_cod: code('clasif_cod', payload.sugeridos?.clasif_cod),
    },
  }
}

function samePayload(scan, input) {
  return scan.campaniaId === input.campaniaId &&
    scan.idempotencyKey === input.idempotencyKey &&
    scan.sku === input.skuNormalized &&
    (scan.skuRaw || '') === input.skuRaw &&
    scan.sucursal === input.sucursal &&
    scan.email === input.email &&
    (scan.categoria_sug_cod || null) === input.sugeridos.categoria_cod &&
    (scan.tipo_sug_cod || null) === input.sugeridos.tipo_cod &&
    (scan.clasif_sug_cod || null) === input.sugeridos.clasif_cod
}

function buildResponse({ scan, snap, unknown, stage }) {
  const parsedSku = parseSku(scan.skuRaw || scan.sku)
  const maestro = snap ? {
    descripcion: snap.descripcion,
    categoria_cod: snap.categoria_cod,
    tipo_cod: snap.tipo_cod,
    clasif_cod: snap.clasif_cod,
  } : null
  return {
    estado: scan.estado,
    maestro,
    asumidos: {
      categoria_cod: scan.asum_categoria_cod || '',
      tipo_cod: scan.asum_tipo_cod || '',
      clasif_cod: scan.asum_clasif_cod || '',
    },
    skuNormalized: scan.skuNormalized || scan.sku,
    skuType: snap ? 'KNOWN' : 'UNKNOWN',
    unknown: unknown ? {
      id: unknown.id,
      status: unknown.status,
      seenCount: unknown.seenCount ?? 0,
      stage: stage?.stage || 'unknown',
    } : null,
    warnings: parsedSku.hadSuffix ? [{
      code: 'SKU_SUFFIX_IGNORED',
      field: 'skuRaw',
      separator: parsedSku.separator,
      skuNormalized: parsedSku.normalized,
      message: `Se usó el SKU base ${parsedSku.normalized}; el sufijo iniciado por ${parsedSku.separator} no forma parte de la identidad.`,
    }] : [],
    errors: [],
  }
}

async function loadResult(db, scan) {
  const key = { campaniaId: scan.campaniaId, sku: scan.sku }
  const [snap, unknown, stage] = await Promise.all([
    db.campaniaMaestro.findUnique({ where: { campaniaId_sku: key } }),
    db.unknownSku.findUnique({ where: { campaniaId_sku: key } }),
    db.skuStage.findUnique({ where: { campaniaId_sku: key } }),
  ])
  return buildResponse({ scan, snap, unknown, stage })
}

export function EscaneosService(prisma) {
  async function replay(db, input) {
    const scan = await db.escaneo.findUnique({
      where: { campaniaId_idempotencyKey: {
        campaniaId: input.campaniaId,
        idempotencyKey: input.idempotencyKey,
      } },
    })
    if (!scan) return null
    if (!samePayload(scan, input)) {
      throw appError('SCAN_IDEMPOTENCY_CONFLICT', 409,
        'La clave idempotente ya fue usada con otro contenido')
    }
    return loadResult(db, scan)
  }

  async function createInTransaction(tx, input) {
    const previous = await replay(tx, input)
    if (previous) return previous

    const camp = await tx.campania.findUnique({ where: { id: input.campaniaId } })
    if (!camp || !camp.activa || (camp.estado && camp.estado !== 'ACTIVA')) {
      throw appError('CAMPAIGN_NOT_ACTIVE', 400, 'Campaña inexistente o no activa')
    }

    const key = { campaniaId: camp.id, sku: input.skuNormalized }
    const snap = await tx.campaniaMaestro.findUnique({ where: { campaniaId_sku: key } })

    let estado = 'OK'
    if (!snap) {
      estado = 'NO_MAESTRO'
      if (!input.sugeridos.categoria_cod || !input.sugeridos.tipo_cod || !input.sugeridos.clasif_cod) {
        throw appError('MISSING_UNKNOWN_CODES', 400,
          'Se requieren categoría/tipo/clasif sugeridos cuando no está en Maestro')
      }
    } else if (!cumpleObjetivos(camp, snap)) {
      estado = 'REVISAR'
    }

    const requestedCodes = [
      ['categoria_cod', 'INVALID_CATEGORIA', tx.dicCategoria],
      ['tipo_cod', 'INVALID_TIPO', tx.dicTipo],
      ['clasif_cod', 'INVALID_CLASIF', tx.dicClasif],
    ].filter(([field]) => input.sugeridos[field])
    const dictionaryRows = await Promise.all(requestedCodes.map(([field, , model]) =>
      model.findUnique({ where: { cod: input.sugeridos[field] } })))
    const dictionaryErrors = requestedCodes.flatMap(([field, errorCode], index) =>
      dictionaryRows[index] ? [] : [{ field, code: errorCode, value: input.sugeridos[field] }])
    if (dictionaryErrors.length) {
      throw appError('INVALID_DICTIONARY', 422,
        'Uno o más códigos no existen en los diccionarios; no se modificaron ni truncaron', dictionaryErrors)
    }

    const asumidos = {
      categoria_cod: input.sugeridos.categoria_cod || snap?.categoria_cod || '',
      tipo_cod: input.sugeridos.tipo_cod || snap?.tipo_cod || '',
      clasif_cod: input.sugeridos.clasif_cod || snap?.clasif_cod || '',
    }
    const scan = await tx.escaneo.create({ data: {
      campaniaId: camp.id,
      sucursal: input.sucursal,
      email: input.email,
      sku: input.skuNormalized,
      skuRaw: input.skuRaw || null,
      skuNormalized: input.skuNormalized,
      idempotencyKey: input.idempotencyKey,
      estado,
      categoria_sug_cod: input.sugeridos.categoria_cod,
      tipo_sug_cod: input.sugeridos.tipo_cod,
      clasif_sug_cod: input.sugeridos.clasif_cod,
      asum_categoria_cod: asumidos.categoria_cod || null,
      asum_tipo_cod: asumidos.tipo_cod || null,
      asum_clasif_cod: asumidos.clasif_cod || null,
    } })

    let unknown = null
    let stage = await tx.skuStage.findUnique({ where: { campaniaId_sku: key } })
    if (!snap) {
      const existing = await tx.unknownSku.findUnique({ where: { campaniaId_sku: key } })
      const status = normalizeUnknownStatus(existing?.status)
      unknown = existing
        ? await tx.unknownSku.update({
          where: { campaniaId_sku: key },
          data: {
            skuRaw: input.skuRaw || existing.skuRaw || null,
            skuNormalized: input.skuNormalized,
            categoria_cod: input.sugeridos.categoria_cod || existing.categoria_cod,
            tipo_cod: input.sugeridos.tipo_cod || existing.tipo_cod,
            clasif_cod: input.sugeridos.clasif_cod || existing.clasif_cod,
            status,
            seenCount: { increment: 1 },
            lastSeenAt: new Date(),
            updatedBy: input.email || null,
          },
        })
        : await tx.unknownSku.create({ data: {
          campaniaId: camp.id,
          sku: input.skuNormalized,
          skuRaw: input.skuRaw || null,
          skuNormalized: input.skuNormalized,
          categoria_cod: input.sugeridos.categoria_cod,
          tipo_cod: input.sugeridos.tipo_cod,
          clasif_cod: input.sugeridos.clasif_cod,
          status: 'PENDING',
          seenCount: 1,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          updatedBy: input.email || null,
        } })
      if (status === 'PENDING') {
        const desired = nextStage(stage?.stage, 'unknown')
        stage = await tx.skuStage.upsert({
          where: { campaniaId_sku: key },
          create: { ...key, stage: desired, updatedBy: input.email || null },
          update: { stage: desired, updatedBy: input.email || null, updatedAt: new Date() },
        })
      }
    } else {
      const hasDif = Object.entries(asumidos).some(([field, value]) => value !== (snap[field] || ''))
      const desired = nextStage(stage?.stage, hasDif ? 'evaluate' : 'confirm')
      stage = await tx.skuStage.upsert({
        where: { campaniaId_sku: key },
        create: { ...key, stage: desired, updatedBy: input.email || null },
        update: { stage: desired, updatedBy: input.email || null, updatedAt: new Date() },
      })
    }
    return buildResponse({ scan, snap, unknown, stage })
  }

  return {
    async crear(payload, auth = null) {
      const input = normalizedInput(payload, auth)
      if (!input.email || !input.sucursal) {
        throw appError('SESSION_BRANCH_REQUIRED', 403,
          'La sesión debe tener actor y sucursal asignados para escanear')
      }
      try {
        return await prisma.$transaction(tx => createInTransaction(tx, input), {
          isolationLevel: 'Serializable',
        })
      } catch (error) {
        if (!['P2002', 'P2034'].includes(error?.code)) throw error
        const previous = await replay(prisma, input)
        if (previous) return previous
        throw appError('SCAN_CONFLICT', 409,
          'El escaneo cambió en simultáneo. Reintentá con la misma clave idempotente.')
      }
    },
  }
}
