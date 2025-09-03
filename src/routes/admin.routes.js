import { Router } from 'express'
import { authAdmin } from '../middlewares/authAdmin.js'
import { DiccionariosController } from '../controllers/diccionarios.controller.js'
import { MaestroController } from '../controllers/maestro.controller.js'
import { CampaniasController } from '../controllers/campanias.controller.js'
import { RevisionesController } from '../controllers/revisiones.controller.js'
import { AdminController } from '../controllers/admin.controller.js'
import { AuditoriaService } from '../services/auditoria.service.js'
import { AdminImportController } from '../controllers/admin.import.controller.js'
import { upload } from '../middlewares/upload.js'
import { ImportService } from '../services/import.service.js'




export default function adminRouter(prisma) {
  const r = Router()
  r.use(authAdmin())

  const importer = ImportService(prisma)
  const imp = AdminImportController(prisma)
  const dic = DiccionariosController(prisma)
  const mae = MaestroController(prisma)
  const camp = CampaniasController(prisma)
  const rev = RevisionesController(prisma)
  const admin = AdminController(prisma)
  const auditoria = AuditoriaService(prisma)
  

  // Ping
  r.get('/ping', admin.ping)

  // Imports
 r.post('/import/diccionarios',
    upload.fields([
      { name: 'categorias', maxCount: 1 },
      { name: 'tipos', maxCount: 1 },
      { name: 'clasif', maxCount: 1 },
    ]),
    imp.diccionarios)

   r.post('/import/maestro', upload.single('maestro'), async (req, res) => {
    try {
      const out = await importer.importarMaestroDesdeBuffer(req.file?.buffer || null)
      res.json(out)
    } catch (e) {
      console.error('[import/maestro]', e)
      res.status(400).json({ error: e.message || 'Error importando maestro' })
    }
  })


  r.post('/campanias', camp.crear)

   r.post(
    '/diccionarios/import-file',
    upload.fields([
      { name: 'categorias', maxCount: 1 },
      { name: 'tipos', maxCount: 1 },
      { name: 'clasif', maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const categoriasBuf = req.files?.categorias?.[0]?.buffer || null
        const tiposBuf      = req.files?.tipos?.[0]?.buffer      || null
        const clasifBuf     = req.files?.clasif?.[0]?.buffer     || null

        const out = await importer.importarDiccionariosDesdeBuffers({ categoriasBuf, tiposBuf, clasifBuf })
        res.json(out)
      } catch (e) {
        console.error('[diccionarios/import-file]', e)
        res.status(400).json({ error: e.message || 'Error importando diccionarios' })
      }
    }
  )

  // POST /api/admin/maestro/import-file  (multipart/form-data)
  r.post(
    '/maestro/import-file',
    upload.single('maestro'),
    async (req, res) => {
      try {
        const maestroBuf = req.file?.buffer || null
        const out = await importer.importarMaestroDesdeBuffer(maestroBuf)
        res.json(out) // { count }
      } catch (e) {
        console.error('[maestro/import-file]', e)
        res.status(400).json({ error: e.message || 'Error importando maestro' })
      }
    }
  )

  // Auditorías
  r.get('/discrepancias', async (req, res) => {
    try {
      const campaniaId = Number(req.query.campaniaId)
      if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
      const buscarSku = (req.query.sku || '').trim()
      const minVotos = Number(req.query.minVotos || 1)
      const data = await auditoria.discrepanciasRica({ campaniaId, buscarSku, minVotos })
      res.json(data)
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Error en auditoría de discrepancias' })
    }
  })

  r.get('/discrepancias-sucursales', async (req, res) => {
    try {
      const campaniaId = Number(req.query.campaniaId)
      if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })
      const buscarSku = (req.query.sku || '').trim()
      const minSucursales = Number(req.query.minSucursales || 2)
      const data = await auditoria.discrepanciasSucursales({ campaniaId, buscarSku, minSucursales })
      res.json(data)
    } catch (e) {
      console.error(e); res.status(500).json({ error: 'Error en auditoría entre sucursales' })
    }
  })

  // Exports
  r.get('/export/maestro.csv', mae.exportCSV)
  r.get('/export/categorias.csv', admin.exportCategorias)
  r.get('/export/tipos.csv', admin.exportTipos)
  r.get('/export/clasif.csv', admin.exportClasif)
  r.get('/export/discrepancias.csv', admin.exportDiscrepanciasCSV)
  r.get('/export/discrepancias-sucursales.csv', admin.exportDiscrepanciasSucursalesCSV)
  r.get('/export/txt/:campo', admin.exportTxtCampo)

  // Revisiones / decisiones / cola
  r.get('/revisiones', rev.listar)
  r.post('/revisiones/decidir', rev.decidir)
  r.get('/actualizaciones', rev.listarActualizaciones)
  r.post('/actualizaciones/aplicar', rev.aplicarLote)
  r.post('/actualizaciones/archivar', rev.archivar)
  r.post('/actualizaciones/undo', rev.undo)
  r.post('/actualizaciones/revertir', rev.revertir)

  // Ruta de debug para listar endpoints (opcional)
  r.get('/_debug/routes', (_req, res) => {
    res.json({
      ok: true,
      routes: [
        'POST /api/admin/diccionarios/import-file',
        'POST /api/admin/maestro/import-file',
        'POST /api/admin/import/maestro (alias)',
      ]
    })
  })

  r.get('/maestro', mae.listar)


  return r
}
