# Validación R3.1

Fecha: 01/10/2026. Estado: `COMPLETADO_LOCAL`; D-B05 aprobada en continuidad operativa. No se validó PostgreSQL real aislado, staging ni producción en esta continuación.

## Alcance implementado

- Importación JSON y CSV de maestro comparten la misma ruta estricta en `MaestroService.importMaestroItems`.
- El lote se prevalida completo antes de escribir:
  - SKU inválido;
  - código de categoría/tipo/clasificación inválido o faltante;
  - código fuera de diccionario;
  - SKU duplicado dentro del mismo lote, incluso si llega con sufijo `#`/`$`.
- Si hay cualquier error, no se importa ningún registro.
- Las escrituras del maestro se ejecutan dentro de transacción Serializable cuando Prisma la ofrece.
- La importación de diccionarios también queda agrupada en transacción para evitar parciales entre categorías/tipos/clasificaciones.
- Los avisos de sufijo de SKU se preservan en CSV y JSON.
- El contrato D-B05 define importación absoluta por upsert, sin borrar artículos ausentes, CSV UTF-8 con BOM para exportación, entrada UTF-8/UTF-8 BOM/Latin-1, delimitador coma/punto y coma/tab, y equivalencia CSV/JSON.
- El parser CSV acepta los encabezados canónicos exportables `sku`, `descripcion`, `categoria_cod`, `tipo_cod`, `clasif_cod` y `cod,nombre` para diccionarios, además de variantes legibles existentes.

## Pruebas

Comandos ejecutados:

```powershell
npx prisma validate --schema prisma\schema.prisma
npm test
```

Resultado backend: **64 tests, 61 PASS, 3 SKIP**.

Nuevas regresiones R3.1:

- un lote con una fila válida y otra con código fuera de diccionario responde 400 y no escribe la válida;
- un lote con SKU duplicado tras normalización/sufijo responde 400 y no escribe nada;
- round-trip CSV con encabezados canónicos exportables conserva SKU y códigos normalizados.

## Límites

D-B05 resuelve el contrato de importación y deja explícito que las bajas no se infieren por ausencia. El formato final de exportación al receptor queda para R3.2 como paquete de cierre repetible. No se ejecutó PostgreSQL aislado ni staging en esta continuación.

## Ajuste de importación parcial — 02/10/2026

Por pedido del usuario, la importación de archivos ahora acepta encabezados canónicos mediante cuatro plantillas CSV del frontend: categorías, tipos, clasificaciones y maestro. Una fila inválida ya no cancela las demás: se cargan las válidas en una transacción y se devuelve el detalle de cada omitida (fila, valores originales, campo y motivo). En duplicados normalizados se conserva la primera fila. Los códigos del maestro que no existen en los diccionarios también se reportan para corregirlos.

La pantalla administrativa muestra un cuadro por archivo, permite corregir y cargar una fila manualmente por las rutas JSON administrativas existentes, y descargar las omitidas como CSV corregible/reimportable. Los archivos mal formados o con encabezados que no permiten identificar campos siguen rechazándose completos porque no se pueden interpretar con seguridad.

Validación local posterior: backend `npm test` 77 pruebas, 74 PASS y 3 SKIP; frontend `npm test` 11/11 PASS, `npm run lint` 0 errores/41 advertencias heredadas, `npm run build` OK (390 módulos). El build incluye los cuatro archivos en `dist/templates`. Sin base de datos real, staging, commit, push o deploy.
