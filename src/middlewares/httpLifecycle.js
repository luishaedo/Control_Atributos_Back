import { randomUUID } from 'node:crypto'

export function requestContext(logger) {
  return (req, res, next) => {
    const started = Date.now()
    req.id = randomUUID()
    res.setHeader('X-Request-Id', req.id)
    res.once('finish', () => {
      logger.info({
        event: 'http_request', requestId: req.id, method: req.method,
        route: req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched',
        status: res.statusCode, durationMs: Date.now() - started,
      })
    })
    next()
  }
}

export function readDeadline(timeoutMs) {
  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next()
    const timer = setTimeout(() => {
      if (res.headersSent || res.writableEnded || res.destroyed) return
      res.status(503).json({
        error: 'El servicio no respondió a tiempo',
        code: 'READ_TIMEOUT', requestId: req.id,
      })
    }, timeoutMs)
    const clear = () => clearTimeout(timer)
    res.once('finish', clear)
    res.once('close', clear)
    next()
  }
}

export function errorHandler(logger) {
  return (err, req, res, next) => {
    // HTTP can finish while the original database operation is still running.
    if (res.writableEnded || res.destroyed) return
    if (res.headersSent) return next(err)
    let status = 500
    let code = 'INTERNAL_ERROR'
    let message = 'Error interno del servidor'
    if (err.code === 'CORS_DENIED') {
      status = 403; code = 'CORS_DENIED'; message = 'Origen no permitido'
    } else if (err.code === 'UPDATE_CONFLICT') {
      status = 409; code = 'UPDATE_CONFLICT'; message = 'La decisión o el maestro cambió. Actualizá la revisión antes de aplicar.'
    } else if (err.code === 'INVALID_IDS') {
      status = 400; code = 'INVALID_IDS'; message = 'ids debe contener enteros positivos'
    } else if (err.type === 'entity.parse.failed') {
      status = 400; code = 'INVALID_JSON'; message = 'JSON inválido'
    } else if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Contenido demasiado grande'
    } else if (err.name === 'MulterError') {
      status = 400; code = 'INVALID_UPLOAD'; message = 'Archivo o campo de carga inválido'
    } else if (err.name === 'PrismaClientValidationError') {
      status = 400; code = 'INVALID_PARAMETERS'; message = 'Parámetros inválidos'
    } else if (err.code === 'P2002') {
      status = 409; code = 'CONFLICT'; message = 'El registro ya existe'
    } else if (err.code === 'P2025') {
      status = 404; code = 'NOT_FOUND'; message = 'Registro no encontrado'
    } else if (['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(err.code)) {
      status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Base de datos no disponible'
    }
    // Raw Prisma errors can contain parameters or connection details.
    logger.error({ event: 'http_error', requestId: req.id, code, status })
    res.status(status).json({ error: message, code, requestId: req.id })
  }
}
