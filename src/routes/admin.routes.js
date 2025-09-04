// src/routes/admin.routes.js
import { Router } from 'express'
import { upload } from '../middlewares/upload.js'
import { authAdmin } from '../middlewares/authAdmin.js'
import { AdminController } from '../controllers/admin.controller.js'
import { AdminImportController } from '../controllers/admin.import.controller.js'
import { RevisionesController } from '../controllers/revisiones.controller.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'

export default function adminRouter(prisma) {
  const r = Router()
  const admin = AdminController(prisma)
  const imp = AdminImportController(prisma)
  const rev = RevisionesController(prisma)
  const dic = DiccionariosController(prisma)
  const mae = MaestroController(prisma)

  // Salud
  r.get('/ping', admin.ping) // activar auth en prod: r.get('/ping', authAdmin(), admin.ping)

  // Import por archivo (multer)
  r.post('/diccionarios/import-file',
    // authAdmin(),
    upload.fields([{ name:'categorias', maxCount:1 }, { name:'tipos', maxCount:1 }, { name:'clasif', maxCount:1 }]),
    imp.diccionarios
  )
  r.post('/maestro/import-file',
    // authAdmin(),
    upload.fields([{ name:'maestro', maxCount:1 }]),
    imp.maestro
  )

  // Import por JSON (lo proveen tus controllers de diccionarios/maestro)
  r.post('/diccionarios/import-json', /*authAdmin(),*/ dic.importar)
  r.post('/maestro/import-json',      /*authAdmin(),*/ mae.importar)

  // Export CSV
  r.get('/export/categorias.csv', /*authAdmin(),*/ admin.exportCategorias)
  r.get('/export/tipos.csv',      /*authAdmin(),*/ admin.exportTipos)
  r.get('/export/clasif.csv',     /*authAdmin(),*/ admin.exportClasif)
  r.get('/export/maestro.csv',    /*authAdmin(),*/ mae.exportCSV) // <— agregar método abajo

  // Revisiones (tarjetas)
  r.get('/revisiones',            /*authAdmin(),*/ rev.listar)
  r.post('/revisiones/decidir',   /*authAdmin(),*/ rev.decidir)

  // Discrepancias resumidas (para Admin/Auditoría: maestro vs top propuesta, y entre sucursales)
  r.get('/discrepancias',              /*authAdmin(),*/ rev.discrepancias)          // <— agregar método abajo
  r.get('/discrepancias-sucursales',   /*authAdmin(),*/ rev.discrepanciasSuc)      // <— agregar método abajo
  r.get('/export/discrepancias.csv',   /*authAdmin(),*/ rev.exportDiscrepanciasCSV) // <— opcional/export

  // aliases usados por Auditoría (mantener por compatibilidad)
r.get('/revisiones/discrepancias',            /*authAdmin(),*/ rev.discrepancias)
r.get('/revisiones/discrepancias-sucursales', /*authAdmin(),*/ rev.discrepanciasSuc)

  // Cola de actualizaciones
  r.get('/actualizaciones',                /*authAdmin(),*/ rev.listarActualizaciones)   // <— agregar
  r.post('/actualizaciones/aplicar',       /*authAdmin(),*/ rev.aplicar)                  // <— agregar
  r.post('/actualizaciones/archivar',      /*authAdmin(),*/ rev.archivar)                 // <— agregar
  r.post('/actualizaciones/undo',          /*authAdmin(),*/ rev.undo)                     // <— agregar
  r.post('/actualizaciones/:id/revertir',  /*authAdmin(),*/ rev.revertir)                 // <— agregar
  r.get('/export/actualizaciones.csv',     /*authAdmin(),*/ rev.exportActualizacionesCSV) // <— opcional

  return r
}
