import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

import publicRouter from './routes/public.routes.js'
import adminRouter from './routes/admin.routes.js'

const dbUrl = String(process.env.DATABASE_URL || '').trim()
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  console.error('DATABASE_URL debe usar PostgreSQL (postgresql:// o postgres://). SQLite no esta soportado.')
  process.exit(1)
}

const prisma = new PrismaClient()
const app = express()

app.set('trust proxy', 1)

// CORS
const isProd = process.env.NODE_ENV === 'production'
const allowAllCors = String(process.env.CORS_ALLOW_ALL || '').trim().toLowerCase() === 'true'
const configuredOriginVars = [
  process.env.CORS_ORIGINS,
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  process.env.APP_URL,
]
const configuredAllowList = configuredOriginVars
  .flatMap((value) => String(value || '').split(','))
  .map((value) => value.trim())
  .filter(Boolean)
const devFallbackAllowList = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]
const prodFallbackAllowList = [
  'https://stockeador-client-1nll.vercel.app',
]
const allowList = configuredAllowList.length
  ? configuredAllowList
  : (isProd ? prodFallbackAllowList : devFallbackAllowList)

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (allowAllCors) return cb(null, true)
    if (allowList.includes(origin)) return cb(null, true)
    return cb(new Error(`Origin no permitido por CORS: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

// Middlewares globales
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json({ limit: '20mb' }))

// Health
app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Routers
app.use('/api', publicRouter(prisma))
app.use('/api/admin', adminRouter(prisma))

// Error handler
app.use((err, _req, res, _next) => {
  if (String(err?.message || '').startsWith('Origin no permitido por CORS')) {
    return res.status(403).json({ error: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

// Boot
const PORT = Number(process.env.PORT)
if (!PORT) {
  console.error('PORT env var is required')
  process.exit(1)
}

const startServer = async () => {
  try {
    await prisma.$connect()
    console.log('DB connected')
  } catch (error) {
    console.error('DB connection failed', error)
    process.exit(1)
  }

  return app.listen(PORT, () => console.log(`API listening on port ${PORT}`))
}

const server = await startServer()

const shutdown = async (signal) => {
  console.log(`Received ${signal}, shutting down...`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception', err)
  shutdown('uncaughtException')
})
