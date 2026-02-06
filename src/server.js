import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

import publicRouter from './routes/public.routes.js'
import adminRouter from './routes/admin.routes.js'

const prisma = new PrismaClient()
const app = express()

app.set('trust proxy', 1)

// CORS
const rawOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || ''
const allowList = rawOrigins.split(',').map(s => s.trim()).filter(Boolean)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (!allowList.length) return cb(null, true)
    return cb(null, allowList.includes(origin))
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}

// Middlewares globales
app.use(cors(corsOptions))
app.use(express.json({ limit: '20mb' }))

// Health
app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/api/health', (_, res) => res.json({ ok: true }))

// Routers
app.use('/api', publicRouter(prisma))
app.use('/api/admin', adminRouter(prisma))

// Error handler
app.use((err, _req, res, _next) => {
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
    console.log('✅ DB connected')
  } catch (error) {
    console.error('❌ DB connection failed', error)
    process.exit(1)
  }

  return app.listen(PORT, () => console.log(`API listening on port ${PORT}`))
}

const server = await startServer()

const shutdown = async signal => {
  console.log(`Received ${signal}, shutting down...`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('unhandledRejection', err => {
  console.error('Unhandled rejection', err)
})
process.on('uncaughtException', err => {
  console.error('Uncaught exception', err)
  shutdown('uncaughtException')
})
