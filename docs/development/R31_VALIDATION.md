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
