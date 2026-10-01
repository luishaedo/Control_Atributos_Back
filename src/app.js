import express from 'express'
import cors from 'cors'
import publicRouter from './routes/public.routes.js'
import adminRouter from './routes/admin.routes.js'
import { asyncHandler } from './utils/asyncRouter.js'
import { requestContext, readDeadline, errorHandler } from './middlewares/httpLifecycle.js'
import { createReadinessProbe } from './services/health.service.js'

function positiveTimeout(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 120000) {
    throw new Error(`${name} debe ser un entero entre 1 y 120000 ms`)
  }
  return n
}

// Importing this factory never loads dotenv, connects to DB or opens a port.
export function createApp({ prisma, env = process.env, logger = console } = {}) {
  if (!prisma) throw new Error('prisma requerido')
  const app = express()
  app.set('trust proxy', 1)
  const readTimeoutMs = positiveTimeout(env.READ_TIMEOUT_MS, 7000, 'READ_TIMEOUT_MS')
  const readyTimeoutMs = positiveTimeout(env.READINESS_TIMEOUT_MS, 2000, 'READINESS_TIMEOUT_MS')
  const version = env.RENDER_GIT_COMMIT || env.APP_VERSION || 'unknown'
  const configured = [env.CORS_ORIGINS, env.CORS_ORIGIN, env.FRONTEND_URL, env.APP_URL]
    .flatMap(value => String(value || '').split(',')).map(value => value.trim()).filter(Boolean)
  const defaults = env.NODE_ENV === 'production'
    ? ['https://stockeador-client-1nll.vercel.app']
    : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000']
  const origins = configured.length ? configured : defaults
  const allowAll = String(env.CORS_ALLOW_ALL || '').trim().toLowerCase() === 'true'
  const corsOptions = {
    origin: (origin, cb) => {
      if (!origin || allowAll || origins.includes(origin)) return cb(null, true)
      cb(Object.assign(new Error('Origen no permitido'), { code: 'CORS_DENIED' }))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
  }
  app.use(requestContext(logger))
  app.use(cors(corsOptions))
  app.options('*', cors(corsOptions))
  app.use(express.json({ limit: '20mb' }))

  app.get(['/health', '/api/health'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: true })
  })
  app.get(['/health/live', '/api/health/live'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.json({ ok: true, version })
  })
  const probe = createReadinessProbe(prisma, readyTimeoutMs)
  app.get(['/health/ready', '/api/health/ready'], asyncHandler(async (req, res) => {
    const ready = await probe()
    res.setHeader('Cache-Control', 'no-store')
    res.status(ready ? 200 : 503).json({
      ok: ready, database: ready ? 'up' : 'unavailable', version,
      ...(ready ? {} : { code: 'DATABASE_UNAVAILABLE', requestId: req.id }),
    })
  }))

  app.use('/api', readDeadline(readTimeoutMs))
  app.use('/api', publicRouter(prisma, env))
  app.use('/api/admin', adminRouter(prisma, env))
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada', code: 'NOT_FOUND' }))
  app.use(errorHandler(logger))
  return app
}
