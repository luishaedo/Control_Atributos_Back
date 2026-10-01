# Validación R3.1

Fecha: 01/10/2026. Estado: `INICIADO_LOCAL`; D-B05 sigue pendiente y no se validó PostgreSQL real, staging ni producción.

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

## Pruebas

Comandos ejecutados:

```powershell
npx prisma validate --schema prisma\schema.prisma
npm test
```

Resultado backend: **64 tests, 61 PASS, 3 SKIP**.

Nuevas regresiones R3.1:

- un lote con una fila válida y otra con código fuera de diccionario responde 400 y no escribe la válida;
- un lote con SKU duplicado tras normalización/sufijo responde 400 y no escribe nada.

## Límites

No se aprobó D-B05. Por eso R3.1 todavía no decide si el sistema externo espera importación absoluta, cambios netos, altas/bajas explícitas, encoding definitivo, nombres finales de columnas, ni formato final de exportación R3.2. Tampoco se ejecutó PostgreSQL aislado ni staging.
