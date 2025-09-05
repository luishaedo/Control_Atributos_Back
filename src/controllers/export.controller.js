export function ExportController(prisma) {
  async function common(campo, req, res) {
    const campaniaId = Number(req.query.campaniaId)
    if (!campaniaId) return res.status(400).json({ error: 'campaniaId requerido' })

    // estado: 'aceptadas' => aplicadas; 'pendientes' => pendientes; 'todas' => sin filtro
    const estadoQ = String(req.query.estado || 'aceptadas')
    const incluirArchivadas = req.query.incluirArchivadas === 'true'

    const where = { campaniaId }
    if (estadoQ === 'aceptadas') where.estado = 'aplicada'
    else if (estadoQ === 'pendientes') where.estado = 'pendiente'
    // 'todas' => no filtra estado
    if (!incluirArchivadas) where.archivada = false

    const acts = await prisma.actualizacion.findMany({
      where,
      orderBy: [{ sku: 'asc' }, { ts: 'asc' }],
      select: {
        sku: true,
        old_categoria_cod: true, old_tipo_cod: true, old_clasif_cod: true,
        new_categoria_cod: true, new_tipo_cod: true, new_clasif_cod: true,
      }
    })

    const fieldMap = {
      categoria: { old: 'old_categoria_cod', nu: 'new_categoria_cod' },
      tipo:      { old: 'old_tipo_cod',      nu: 'new_tipo_cod'      },
      clasif:    { old: 'old_clasif_cod',    nu: 'new_clasif_cod'    },
    }
    const fm = fieldMap[campo]
    if (!fm) return res.status(400).json({ error: 'campo inválido' })

    // Solo líneas con cambio real hacia un "new_*" definido
    const lines = []
    for (const a of acts) {
      const newCode = a[fm.nu]
      const oldCode = a[fm.old]
      if (!newCode) continue
      if (oldCode && String(oldCode) === String(newCode)) continue
      lines.push(`${a.sku}\t${newCode}`)
    }

    const txt = lines.join('\n')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${campo}_${campaniaId}.txt"`)
    res.send(txt)
  }

  return {
    exportTxtCategoria: (req, res) => common('categoria', req, res),
    exportTxtTipo:      (req, res) => common('tipo',      req, res),
    exportTxtClasif:    (req, res) => common('clasif',    req, res),
  }
}