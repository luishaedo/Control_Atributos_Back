// src/routes/admin.routes.js
import { Router } from 'express'
import { upload } from '../middlewares/upload.js'
import { authAdmin } from '../middlewares/authAdmin.js'
import { AdminController } from '../controllers/admin.controller.js'
import { AdminImportController } from '../controllers/admin.import.controller.js'
import { RevisionesController } from '../controllers/revisiones.controller.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { WorkflowController } from '../controllers/workflow.controller.js'
import { ActualizacionesController } from '../controllers/actualizaciones.controller.js'

const authIfProd = () => (process.env.NODE_ENV === 'production' ? authAdmin() : (_req, _res, next) => next())

export default function adminRouter(prisma) {
  const r = Router()
  const admin = AdminController(prisma)
  const imp = AdminImportController(prisma)
  const rev = RevisionesController(prisma)
  const dic = DiccionariosController(prisma)
  const mae = MaestroController(prisma)
  const flow = WorkflowController(prisma)
  const acts = ActualizacionesController(prisma)

  // Salud
  r.get('/ping', authIfProd(), admin.ping)

  // Import por archivo (multer)
  r.post('/diccionarios/import-file',
    authIfProd(),
    upload.fields([{ name:'categorias', maxCount:1 }, { name:'tipos', maxCount:1 }, { name:'clasif', maxCount:1 }]),
    imp.diccionarios
  )
  r.post('/maestro/import-file',
    authIfProd(),
    upload.fields([{ name:'maestro', maxCount:1 }]),
    imp.maestro
  )

  // Import por JSON (lo provee tu controller de diccionarios)
  r.post('/diccionarios/import-json', authIfProd(), dic.importar)
  r.post('/maestro/import-json', authIfProd(), mae.importar)

  // Actualizaciones (compatibilidad con front)
  r.get('/actualizaciones', authIfProd(), acts.listar)
  r.post('/actualizaciones/archivar', authIfProd(), acts.archivar)
  r.post('/actualizaciones/undo', authIfProd(), acts.undo)
  r.post('/actualizaciones/:id/revertir', authIfProd(), acts.revertir)
  r.post('/actualizaciones/aplicar', authIfProd(), acts.aplicar)

  // Export CSV
  r.get('/export/categorias.csv', authIfProd(), admin.exportCategorias)
  r.get('/export/tipos.csv', authIfProd(), admin.exportTipos)
  r.get('/export/clasif.csv', authIfProd(), admin.exportClasif)
  r.get('/export/maestro.csv', authIfProd(), mae.exportCSV)
  r.get('/export/actualizaciones.csv', authIfProd(), acts.exportCSV)

  // Export TXT
  r.get('/export/txt/categoria', authIfProd(), acts.exportTxtCategoria)
  r.get('/export/txt/tipo', authIfProd(), acts.exportTxtTipo)
  r.get('/export/txt/clasif', authIfProd(), acts.exportTxtClasif)

  // Revisiones (tarjetas)
  r.get('/revisiones', authIfProd(), rev.listar)
  r.post('/revisiones/decidir', authIfProd(), rev.decidir)

  // Confirmación (Paso 2)
  r.get('/confirmaciones', authIfProd(), flow.listConfirmations)
  r.post('/etapas/mover', authIfProd(), flow.moveStage)

  // Desconocidos
  r.get('/desconocidos', authIfProd(), flow.listUnknowns)
  r.patch('/desconocidos/:sku', authIfProd(), flow.updateUnknown)
  r.post('/desconocidos/:sku/confirmar', authIfProd(), flow.confirmUnknown)

  // Consolidación
  r.get('/consolidacion/cambios', authIfProd(), flow.listConsolidationChanges)
  r.get('/consolidacion/resumen', authIfProd(), flow.consolidationSummary)
  r.post('/campanias/:id/cerrar', authIfProd(), flow.closeCampaign)

  // Maestro missing
  r.get('/maestro/missing', authIfProd(), mae.listMissing)

  // Discrepancias resumidas (para Admin/Auditoría: maestro vs top propuesta, y entre sucursales)
  r.get('/discrepancias', authIfProd(), rev.discrepancias)
  r.get('/discrepancias-sucursales', authIfProd(), rev.discrepanciasSuc)
  r.get('/export/discrepancias.csv', authIfProd(), rev.exportDiscrepanciasCSV)
  r.get('/export/discrepancias-sucursales.csv', authIfProd(), rev.exportDiscrepanciasSucCSV)

  // aliases usados por Auditoría (mantener por compatibilidad)
  r.get('/revisiones/discrepancias', authIfProd(), rev.discrepancias)
  r.get('/revisiones/discrepancias-sucursales', authIfProd(), rev.discrepanciasSuc)

  return r
}
