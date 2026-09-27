# R0.2 — validación PostgreSQL aislada

Fecha: 27/09/2026. Responsable: Codex/coordinador. Autorización explícita del usuario para crear y conservar rama y ejecutar pruebas. Sin cambio de plan Free.

## Entorno y resultado

Neon, proyecto control-atributos-db, rama `r02-migration-validation` (`br-crimson-poetry-an1ipez1`), PostgreSQL 17, sin expiración. No es la rama production.

1. En `neondb`: ocho migraciones originales concatenadas, en orden, dentro de transacción; 50 sentencias, COMMIT exitoso. SHA256 de cada archivo en manifest.json. No se alteraron las migraciones originales.
2. Comparación de columnas contra schema.prisma: 90 esperadas y 90 reales, cero faltantes/diferentes y cero inesperadas. Tipos y nulabilidad coinciden. 10 tablas, 10 claves primarias y 5 claves foráneas.
3. Fixtures sintéticos con IDs explícitos negativos: defaults Campania/UnknownSku/Actualizacion, rechazo de idempotencyKey duplicada, aceptación de claves nulas, rechazo de FK huérfana, rechazo de UnknownSku duplicado y cascadas de las cinco relaciones. DO exitoso, ROLLBACK exitoso; no se avanzaron secuencias mediante IDs automáticos.
4. En otra base vacía de la misma rama, `r02_prisma_validation`: Prisma 5.22 ejecutó migrate deploy con éxito; segunda ejecución sin pendientes; migrate status actualizado; migrate diff frente al datamodel sin diferencias (exit 0). Consulta al historial: 8 migraciones, 8 terminadas y no revertidas.
5. API local real `src/server.js`, NODE_ENV=production, token sintético, versión declarada `r02-local-working-tree`, Prisma conectado a esa base aislada. Tres smoke completos (21 consultas), todos PASS; tercero después de terminar y arrancar un nuevo proceso Node. Cada ronda comprueba health/live/ready, campañas, diccionarios, maestro, admin 401, CORS y versión. Evidencia sanitizada en prisma-api-results.json.
6. `npm test`: 22/22. `git diff --check`: sin errores, solo advertencias LF/CRLF.

## Reproducción

- `node scripts/prepare-migration-validation.mjs`: prepara manifiesto y SQL; no conecta DB.
- `node scripts/prepare-schema-check.mjs`: prepara comparación para la sintaxis actual del esquema, falla ante mapeos/tipos no soportados; no conecta DB.
- Los SQL validate-isolated/check-schema/check-constraints se ejecutaron desde el editor Neon únicamente en la rama aislada.
- `node scripts/validate-isolated-prisma.mjs`: exige endpoint y nombre exactos de la base de pruebas, lee conexión privada desde `.r02-runtime/connection.txt` y omite salida sensible de Prisma. Copia schema/migraciones a directorio ignorado, no usa seed/reset. La conexión temporal fue eliminada tras la prueba; para repetir se debe obtener nuevamente desde el panel seguro. No publicar credenciales en el chat.

## Límites y próximo paso

Esto valida migraciones e integración API local con PostgreSQL real. No constituye VALIDADO_STAGING de un servicio Render desplegado, ni VALIDADO_PRODUCCION. No hubo push/deploy ni modificación de production. Falta confirmar exactamente destino DB de Render, preparar recuperación de esquema en ese destino y publicar código validado con su SHA; después smoke remoto y frontend. R0.2 global sigue EN_CURSO.

No se probaron todavía carga, concurrencia de negocio, restore completo ni las reglas de R1. Las credenciales no se incorporaron a evidencia. Una comparación estricta inicial con el schema del cliente generado falló solo por formato/orden de índices; se verificó el diff y se construyó la comparación directamente desde schema.prisma.
