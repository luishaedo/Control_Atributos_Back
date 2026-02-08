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

  r.get('/campanias', camp.listar)
  r.get('/campanias/:id/maestro/:sku', mae.getUnoCampania)

  r.get('/maestro/:sku', mae.getUno)

  r.post('/escaneos', esc.crear)

  return r
}
