import { Router } from 'express'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { CampaniasController } from '../controllers/campanias.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { EscaneosController } from '../controllers/escaneos.controller.js'

export default function publicRouter(prisma) {
  const r = Router()
  const dic = DiccionariosController(prisma)
  const camp = CampaniasController(prisma)
  const mae = MaestroController(prisma)
  const esc = EscaneosController(prisma)

  r.get('/diccionarios', dic.listar)
  r.get('/maestro', mae.listar)
  r.post('/diccionarios/import', dic.importar)

  r.get('/campanias', camp.listar)
  r.post('/campanias', camp.crear)
  r.post('/campanias/:id/activar', camp.activar)

  r.get('/maestro/:sku', mae.getUno)
  r.post('/maestro/import', mae.importar)

  r.post('/escaneos', esc.crear)

  return r
}
