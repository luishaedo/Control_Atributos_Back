# R1.2 — escaneo atómico e idempotente

30/09/2026. Responsable: Codex/01a0f1e5, sin agentes delegados. Estado: COMPLETADO_LOCAL y VALIDADO_LOCAL_POSTGRESQL tras aprobar e implementar D-B01/R1.1. Sin commit, push, deploy ni acceso a bases remotas.

## Contrato implementado

- `idempotencyKey` es obligatoria por intento lógico, hasta 128 caracteres, y queda acotada por campaña mediante el índice existente `@@unique([campaniaId, idempotencyKey])`.
- El frontend conserva la misma clave después de un error o pérdida de respuesta. Cambiar campaña, identidad, SKU o sugerencias crea una clave nueva; una respuesta exitosa descarta la anterior.
- Repetir la misma clave con el mismo payload devuelve el resultado persistido sin crear otro escaneo ni incrementar `seenCount`. Reutilizarla con contenido diferente responde `409 SCAN_IDEMPOTENCY_CONFLICT`.
- Campaña, snapshot faltante, escaneo, desconocido, contador y etapa se resuelven dentro de una sola transacción `Serializable`. Un fallo posterior al insert revierte todo.
- Las carreras de la misma clave convergen por el índice único. Un conflicto serializable distinto devuelve `409 SCAN_CONFLICT`; no hay retry automático de escrituras. El cliente reintenta explícitamente con la misma clave.
- El escaneo no hace retroceder etapas: orden técnico `unknown → evaluate → confirm → consolidate`. Una fila ya consolidada permanece consolidada.
- El snapshot creado durante un escaneo de un SKU conocido usa `upsert` con actualización vacía; no reescribe un snapshot existente.

No hubo migración: el esquema ya contenía `Escaneo.idempotencyKey` y el índice único compuesto. Identidad autenticada y transiciones administrativas finales de desconocidos pertenecen a R2.1/R1.4. El contrato definitivo de SKU/códigos quedó implementado en R1.1; ver R11_VALIDATION.md.

El despliegue futuro debe coordinar backend y frontend: publicar solo el backend haría que el frontend actualmente desplegado, que todavía no envía `idempotencyKey`, reciba 400. Esta entrega no publica ninguno de los dos.

## Evidencia

Suite final con `R12_TEST_DATABASE_URL` y `R13_TEST_DATABASE_URL` apuntando solo a las dos bases locales aisladas: 79 PASS, 0 omitidas y 0 fallos. Esto repitió R1.2 y la regresión R1.3 contra el contrato R1.1 definitivo.

PostgreSQL 16.3 local dedicado en `127.0.0.1:55439`, usuario `r13test`, base nueva `r12_isolated`. Se aplicaron las ocho migraciones existentes sobre esa base vacía, sin seed/reset/db push. Casos reales:

- dos solicitudes simultáneas con la misma clave: dos respuestas equivalentes y una fila;
- misma clave con payload distinto: 409 y una fila;
- fallo forzado al actualizar etapa: cero escaneos, desconocidos y etapas;
- replay de desconocido: una fila y `seenCount=1`;
- etapa `consolidate` preservada;
- siete sucursales concurrentes: conflictos serializables explícitos reintentados con la misma clave y siete observaciones únicas.

Los fixtures se eliminaron mediante el `t.after`; consulta final: Campania/Escaneo/UnknownSku/SkuStage = 0/0/0/0. Luego se eliminó exclusivamente `r12_isolated` y se detuvo el clúster. `r13_isolated` y sus archivos se preservaron.

Frontend: Vitest 7/7 PASS, incluida reutilización/rotación de clave y normalización estricta; build Vite exitoso, 389 módulos. ESLint: 0 errores y 42 advertencias heredadas; una advertencia existente en `ScanBox.jsx`, ninguna introducida por R1.2. Vitest dentro del sandbox falló al cargar `vite.config.js` por acceso del entorno; la repetición autorizada fuera del sandbox pasó.

## Cierre y límite restante

ROADMAP declara R1.2 dependiente de R1.1. D-B01 fue aprobada, R1.1 implementada y esta suite repetida con la normalización definitiva; por eso R1.2 queda formalmente completada en local. R1.1/R1.2 aún no fueron desplegadas ni validadas en staging.
