// src/routes/admin.routes.js
import { createAsyncRouter as Router } from '../utils/asyncRouter.js'
import { upload } from '../middlewares/upload.js'
import { authAdminOrDevBypass, bindServerActor } from '../middlewares/authAdmin.js'
import { AdminController } from '../controllers/admin.controller.js'
import { AdminImportController } from '../controllers/admin.import.controller.js'
import { RevisionesController } from '../controllers/revisiones.controller.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { WorkflowController } from '../controllers/workflow.controller.js'
import { ActualizacionesController } from '../controllers/actualizaciones.controller.js'
import { CampaniasController } from '../controllers/campanias.controller.js'
import { UsuariosController } from '../controllers/usuarios.controller.js'

export default function adminRouter(prisma, env = process.env) {
  const r = Router()
  const requireAdmin = authAdminOrDevBypass({ prisma, env, roles: ['ADMIN'] })
  const requireReviewer = authAdminOrDevBypass({ prisma, env, roles: ['ADMIN', 'REVISOR'] })
  const requireReviewerForSession = authAdminOrDevBypass({ prisma, env, roles: ['ADMIN', 'REVISOR'], allowPasswordChange: true })
  const admin = AdminController(prisma, env)
  const imp = AdminImportController(prisma)
  const rev = RevisionesController(prisma)
  const dic = DiccionariosController(prisma)
  const mae = MaestroController(prisma)
  const flow = WorkflowController(prisma)
  const acts = ActualizacionesController(prisma)
  const camp = CampaniasController(prisma)
  const users = UsuariosController(prisma)

  // Salud
  r.get('/ping', requireReviewerForSession, admin.ping)
  r.post('/login', admin.login)
  r.post('/logout', requireReviewerForSession, admin.logout)

  // Identidad R2.1
  r.get('/sucursales', requireAdmin, users.listSucursales)
  r.post('/sucursales', requireAdmin, users.createSucursal)
  r.patch('/sucursales/:id', requireAdmin, users.updateSucursal)
  r.get('/usuarios', requireAdmin, users.listUsuarios)
  r.get('/cuentas/auditoria', requireAdmin, users.listAuditoria)
  r.post('/usuarios', requireAdmin, users.createUsuario)
  r.patch('/usuarios/:id', requireAdmin, users.updateUsuario)

  r.use(requireReviewer, bindServerActor)

  // Campa�as (mutaciones protegidas)
  r.post('/campanias', requireAdmin, camp.crear)
  r.post('/campanias/:id/activar', requireAdmin, camp.activar)
  r.patch('/campanias/:id', requireAdmin, camp.actualizar)

  // Import por archivo (multer)
  r.post('/diccionarios/import-file',
    requireAdmin,
    upload.fields([{ name: 'categorias', maxCount: 1 }, { name: 'tipos', maxCount: 1 }, { name: 'clasif', maxCount: 1 }]),
    imp.diccionarios
  )
  r.post('/maestro/import-file',
    requireAdmin,
    upload.fields([{ name: 'maestro', maxCount: 1 }]),
    imp.maestro
  )

  // Import por JSON
  r.post('/diccionarios/import-json', requireAdmin, dic.importar)
  r.post('/maestro/import-json', requireAdmin, mae.importar)

  // Actualizaciones (compatibilidad con front)
  r.get('/actualizaciones', requireReviewer, acts.listar)
  r.post('/actualizaciones/archivar', requireReviewer, acts.archivar)
  r.post('/actualizaciones/undo', requireReviewer, acts.undo)
  r.post('/actualizaciones/:id/revertir', requireReviewer, acts.revertir)
  r.post('/actualizaciones/aplicar', requireAdmin, acts.aplicar)

  // Export CSV
  r.get('/export/categorias.csv', requireAdmin, admin.exportCategorias)
  r.get('/export/tipos.csv', requireAdmin, admin.exportTipos)
  r.get('/export/clasif.csv', requireAdmin, admin.exportClasif)
  r.get('/export/maestro.csv', requireAdmin, mae.exportCSV)
  r.get('/export/actualizaciones.csv', requireAdmin, acts.exportCSV)

  // Export TXT
  r.get('/export/txt/categoria', requireAdmin, acts.exportTxtCategoria)
  r.get('/export/txt/tipo', requireAdmin, acts.exportTxtTipo)
  r.get('/export/txt/clasif', requireAdmin, acts.exportTxtClasif)
  r.get('/export/txt/summary', requireAdmin, acts.exportTxtSummary)

  // Revisiones (tarjetas)
  r.get('/revisiones', requireReviewer, rev.listar)
  r.post('/revisiones/decidir', requireReviewer, rev.decidir)

  // Confirmaci�n (Paso 2)
  r.get('/confirmaciones', requireReviewer, flow.listConfirmations)
  r.post('/etapas/mover', requireReviewer, flow.moveStage)

  // Desconocidos
  r.get('/desconocidos', requireReviewer, flow.listUnknowns)
  r.patch('/desconocidos/:sku', requireReviewer, flow.updateUnknown)
  r.post('/desconocidos/:sku/confirmar', requireReviewer, flow.confirmUnknown)
  r.post('/unknowns/:id/approve', requireReviewer, flow.approveUnknownById)
  r.post('/unknowns/:id/reject', requireReviewer, flow.rejectUnknownById)
  r.post('/unknowns/:id/merge', requireReviewer, flow.mergeUnknownById)

  // Consolidaci�n
  r.get('/consolidacion/cambios', requireReviewer, flow.listConsolidationChanges)
  r.get('/consolidacion/resumen', requireReviewer, flow.consolidationSummary)
  r.post('/campanias/:id/cerrar', requireAdmin, flow.closeCampaign)

  // Maestro missing
  r.get('/maestro/missing', requireAdmin, mae.listMissing)

  // Discrepancias resumidas (para Admin/Auditor�a)
  r.get('/discrepancias', requireAdmin, rev.discrepancias)
  r.get('/discrepancias-sucursales', requireAdmin, rev.discrepanciasSuc)
  r.get('/export/discrepancias.csv', requireAdmin, rev.exportDiscrepanciasCSV)
  r.get('/export/discrepancias-sucursales.csv', requireAdmin, rev.exportDiscrepanciasSucCSV)
  r.get('/auditoria/resumen', requireAdmin, rev.resumenAuditoria)

  // Aliases por compatibilidad
  r.get('/revisiones/discrepancias', requireAdmin, rev.discrepancias)
  r.get('/revisiones/discrepancias-sucursales', requireAdmin, rev.discrepanciasSuc)

  return r
}
