import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { createApp } from './app.js'

const dbUrl = String(process.env.DATABASE_URL || '').trim()
if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  console.error('DATABASE_URL debe usar PostgreSQL (postgresql:// o postgres://). SQLite no esta soportado.')
  process.exit(1)
}

const prisma = new PrismaClient()
const app = createApp({ prisma })

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
