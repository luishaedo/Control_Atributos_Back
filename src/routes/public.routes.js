import { createAsyncRouter as Router } from '../utils/asyncRouter.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { CampaniasController } from '../controllers/campanias.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { EscaneosController } from '../controllers/escaneos.controller.js'
import { SessionController } from '../controllers/session.controller.js'
import { authSession } from '../middlewares/authAdmin.js'

export default function publicRouter(prisma, env = process.env) {
  const r = Router()
  const dic = DiccionariosController(prisma)
  const camp = CampaniasController(prisma)
  const mae = MaestroController(prisma)
  const esc = EscaneosController(prisma)
  const session = SessionController(prisma, env)
  const requireSession = authSession({ prisma, env, roles: ['OPERADOR', 'REVISOR', 'ADMIN'] })

  r.get('/diccionarios', dic.listar)
  r.get('/maestro', mae.listar)

  r.get('/campanias', camp.listar)
  r.get('/campanias/:id/maestro/:sku', mae.getUnoCampania)

  r.get('/maestro/:sku', mae.getUno)

  r.post('/session/login', session.login)
  r.get('/session', requireSession, session.current)
  r.post('/session/logout', requireSession, session.logout)

  r.post('/escaneos', requireSession, esc.crear)

  return r
}
