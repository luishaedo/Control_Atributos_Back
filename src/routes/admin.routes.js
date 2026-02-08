// src/routes/admin.routes.js
import { Router } from 'express'
import { upload } from '../middlewares/upload.js'
import { authAdminOrDevBypass } from '../middlewares/authAdmin.js'
import { AdminController } from '../controllers/admin.controller.js'
import { AdminImportController } from '../controllers/admin.import.controller.js'
import { RevisionesController } from '../controllers/revisiones.controller.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { WorkflowController } from '../controllers/workflow.controller.js'
import { ActualizacionesController } from '../controllers/actualizaciones.controller.js'
import { CampaniasController } from '../controllers/campanias.controller.js'

export default function adminRouter(prisma) {
  const r = Router()
  const requireAdmin = authAdminOrDevBypass()
  const admin = AdminController(prisma)
  const imp = AdminImportController(prisma)
  const rev = RevisionesController(prisma)
  const dic = DiccionariosController(prisma)
  const mae = MaestroController(prisma)
  const flow = WorkflowController(prisma)
  const acts = ActualizacionesController(prisma)
  const camp = CampaniasController(prisma)

  // Salud
  r.get('/ping', requireAdmin, admin.ping)
  r.post('/login', admin.login)
  r.post('/logout', requireAdmin, admin.logout)

  // Campañas (mutaciones protegidas)
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
  r.get('/actualizaciones', requireAdmin, acts.listar)
  r.post('/actualizaciones/archivar', requireAdmin, acts.archivar)
  r.post('/actualizaciones/undo', requireAdmin, acts.undo)
  r.post('/actualizaciones/:id/revertir', requireAdmin, acts.revertir)
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
  r.get('/revisiones', requireAdmin, rev.listar)
  r.post('/revisiones/decidir', requireAdmin, rev.decidir)

  // Confirmación (Paso 2)
  r.get('/confirmaciones', requireAdmin, flow.listConfirmations)
  r.post('/etapas/mover', requireAdmin, flow.moveStage)

  // Desconocidos
  r.get('/desconocidos', requireAdmin, flow.listUnknowns)
  r.patch('/desconocidos/:sku', requireAdmin, flow.updateUnknown)
  r.post('/desconocidos/:sku/confirmar', requireAdmin, flow.confirmUnknown)
  r.post('/unknowns/:id/approve', requireAdmin, flow.approveUnknownById)
  r.post('/unknowns/:id/reject', requireAdmin, flow.rejectUnknownById)
  r.post('/unknowns/:id/merge', requireAdmin, flow.mergeUnknownById)

  // Consolidación
  r.get('/consolidacion/cambios', requireAdmin, flow.listConsolidationChanges)
  r.get('/consolidacion/resumen', requireAdmin, flow.consolidationSummary)
  r.post('/campanias/:id/cerrar', requireAdmin, flow.closeCampaign)

  // Maestro missing
  r.get('/maestro/missing', requireAdmin, mae.listMissing)

  // Discrepancias resumidas (para Admin/Auditoría)
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