import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'

import publicRouter from './routes/public.routes.js'
import adminRouter from './routes/admin.routes.js'

const prisma = new PrismaClient()
const app = express()

// Middlewares globales
app.use(cors())
app.use(express.json({ limit: '20mb' }))

// Health
app.get('/api/health', (_, res) => res.json({ ok: true }))

// Routers
app.use('/api', publicRouter(prisma))
app.use('/api/admin', adminRouter(prisma))

// Boot
const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`API modular en http://localhost:${PORT}`))
