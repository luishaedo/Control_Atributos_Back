import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

import publicRouter from './routes/public.routes.js'
import adminRouter from './routes/admin.routes.js'

const prisma = new PrismaClient()
const app = express()

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
app.get('/api/health', (_, res) => res.json({ ok: true }))

// Routers
app.use('/api', publicRouter(prisma))
app.use('/api/admin', adminRouter(prisma))

// Boot
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`API modular en http://localhost:${PORT}`))
