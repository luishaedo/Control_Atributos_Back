# Estado de trabajo compartido

Actualizado: 29/09/2026. Coordinador: Codex, chat Corregir aplicación de atributos (01a0eef9).

## Última entrega y propiedad

| Tarea | Estado | Responsable | Alcance |
|---|---|---|---|
| R0.1 | VALIDADO_PRODUCCION (disponibilidad) | Codex/coordinador | Backend publicado; pruebas HTTP locales y smoke remoto |
| R0.2 | COMPLETADO: VALIDADO_STAGING + disponibilidad VALIDADO_PRODUCCION | Mismo coordinador | Render/Neon, scripts operativos y docs/development/* |
| R1.3 | IMPLEMENTADO_LOCAL; DESPLEGADO_STAGING, escrituras pendientes | Codex/coordinador, sin agentes delegados | src/services/actualizaciones.service.js; controladores actualizaciones/revisiones/workflow; middleware de errores; test/*; docs/development/* |
| Coordinación | Actualizada localmente | Mismo coordinador | AGENTS y documentos canónicos |

No hay agentes delegados. Entrega staging completada por Codex/coordinador: servicio separado, DB aislada, tres smoke incluido reinicio y documentación. R1.3 finalizado localmente por Codex/01a0eef9, continuando cambios del chat anterior interrumpido. Reserva activa: validación staging R1.3 por Codex/01a0eef9, sin agentes adicionales. Alcance: scripts/test de smoke R1.3, docs/development/*, rama de publicación exclusiva y configuración de staging Render. No se modificó código frontend ni reglas de negocio en esta continuación.

## Despliegue real

- Backend publicado en main y desplegado manualmente: `487a0e9e9ee97ab306f133aee7b3792d68e75783`. Incluye R0.1 y scripts/evidencias previas de R0.2. Base anterior b56e2dd; Render antes ejecutaba 266cea5.
- Render: https://control-atributos-back.onrender.com, servicio srv-d62ji3ffte5s73b4iefg, deploy dep-dasq9nh7lnhs73ab3vd0, estado Live. Build observado: Node 20.20.2, Prisma 5.22.0. Plan Free, sin cambio de plan.
- Build `npm ci && npx prisma generate`, start `npm run start`, health `/api/health`. No paso automático de migración. Auto Deploy muestra On Commit, pero el push anterior no disparó despliegue; se usó Manual Deploy. Integración GitHub pendiente de revisar.
- Neon production/neondb/public: destino cotejado con Render, preflight cero relaciones de usuario, ocho migraciones aplicadas con Prisma, status al día, diff vacío e historial 8/8. Evidencia production-recovery.json. Producción SÍ fue modificada el 27/09 para recuperar esquema y backend; sin seed/reset ni borrado de datos.
- Frontend https://stockeador-client-1nll.vercel.app/: el 28/09, tras recarga con backend disponible, muestra «No hay campañas disponibles» y deshabilita escaneo sin campaña. Sin errores/warnings capturados en esa revisión. No es una prueba de flujos de negocio ni del panel autenticado. SHA local auditado a361e7e; no se verificó SHA Vercel.

## Validación y evidencia

- `npm test`: 22/22 el 27/09, antes de publicar (17 HTTP y 5 smoke, dobles sin DB). Node local 24.20.0. Suite repetida durante despliegue staging el 28/09: 22/22 PASS.
- Rama Neon aislada persistente `r02-migration-validation`, sin expiración: SQL 10 tablas/90 columnas sin diferencias, 10 PK/5 FK, fixtures con ROLLBACK; DB r02_prisma_validation: migrate deploy dos veces/status/diff correctos, historial 8/8. API local con Neon real: tres smoke exitosos incluido reinicio. Ver migration-validation/RESULTS.md.
- Producción: smoke-recovered-1.json y -2.json exitosos el 27/09, siete comprobaciones cada uno.
- Reinicio real solicitado y confirmado por evento Render el 28/09 a las 17:41 ART; captura render-restarted.png. Primer smoke tras reinicio (-3-restart.json) falló por timeout de 10 s en tres health; consultas funcionales y admin sí respondieron. Se conserva el fallo.
- Repetición después del arranque: smoke-recovered-4-restart-warm.json, 20:43:03 UTC, 7/7 PASS, SHA exacto, JSON/CORS válidos y admin 401. Latencias 248–760 ms. Son tres smoke productivos exitosos en total, uno después del reinicio; no tres intentos consecutivos sin fallos.
- Credenciales temporales de pruebas y producción eliminadas; no reutilizar archivos de conexión ni imprimir variables de entorno.

## Límites y siguiente acción

R0.2 COMPLETADO en su alcance de disponibilidad: servicio remoto control-atributos-staging (srv-datd8aek1f9s73fqp9fg) Live, conectado exclusivamente a r02-migration-validation/r02_prisma_validation. Tres smoke de 7/7, incluido reinicio real, SHA 487a0e9 completo confirmado. Configuración/evidencias en STAGING.md y smoke-staging-*.json. Plan Free, Auto-Deploy Off, token independiente; no cambios a producción/Vercel en esta entrega. R1.3 implementado localmente el 29/09; próximo: validación de escrituras en staging y R1.4, sujeto a D-B02/B03. No volver a inicializar producción: ya tiene esquema.

- Render Free puede demorar más que los timeouts frontend al despertar/reiniciar. La recuperación en caliente está validada, no disponibilidad continua ni SLA para siete sucursales. Pendiente definir hosting/UX de arranque antes del piloto.
- H01 (tablas ausentes) resuelto en destino confirmado. H02: wrapper async probado localmente y publicado; no se indujeron errores DB deliberados en producción.
- GET/HEAD deadline 7000 ms; readiness 2000 ms y una query pendiente máxima; timeout no cancela DB. GET heredado con snapshot y mutaciones sin idempotencia siguen pendientes R1.
- Node soportado, dependencias/CI, integración GitHub y despliegue de migraciones siguen R5. No afirmar seguridad ni preparación completa para piloto.
- Auditoría histórica preservada. D-B01–D-B06 siguen pendientes; autorización operativa no aprueba sus reglas de negocio. R1.3 implementado localmente; otras entregas R1–R6 pendientes.

## Entrega R1.3 — 29/09/2026

Conservación por atributo; compare-and-set de valores propuestos; decisiones y aplicación Serializable; sustitución parcial conserva atributos restantes y original auditado; baseline de nuevas revisiones desde maestro vigente; 409 en tres caminos de aplicación. Sin cambios de esquema/frontend. Detalle, comandos y límites: R13_VALIDATION.md.

Pruebas: `npm test` con R13_TEST_DATABASE_URL apuntando exclusivamente a PostgreSQL 16.3 local dedicado (127.0.0.1:55439/r13_isolated): 57/57 PASS, cero omitidas, incluidas carreras reales de dos transacciones y rollback. Ocho migraciones históricas solo sobre cluster nuevo aislado; fixtures propios limpiados y cluster detenido. `git diff --check` correcto. Sin .env, DB remota, seed/reset ni carga real.

Archivos: src/services/actualizaciones.service.js; src/controllers/{actualizaciones,revisiones,workflow}.controller.js; src/middlewares/httpLifecycle.js; test/{actualizaciones,actualizaciones.postgres,http}.test.js; docs/development/{STATUS,CHANGELOG,DECISIONS,R13_VALIDATION}.md. El AGENTS.md no rastreado del frontend se preservó.

Límites: no versión de pantalla ni detección ABA; cierre completo aún no atómico (R1.4); sin pruebas frontend/carga ni validación remota R1.3. Próximo: validar esta versión en staging tras publicación autorizada y abordar R1.4/D-B02/B03. Despliegue real sin cambios: SHA 487a0e9 en Render. Sin commit/PR/push/deploy de esta entrega.

## Continuación staging R1.3 — 29/09/2026

Commit 520cd35d33a3be2e7ca1d90adc745880d0d53eff publicado en rama r13-atributos-staging y desplegado manualmente solo en srv-datd8aek1f9s73fqp9fg (dep-dau2pc97lnhs73f705eg, Live). Staging sigue esa rama con Auto-Deploy Off. main remoto conserva 487a0e9; producción no se modificó. Smoke 7/7 PASS con SHA exacto.

Verificador de comportamiento preparado y validado localmente: 12 escenarios/58 HTTP más suite 57/57. Remoto: preflight del entorno navegador sin acceso de red, cero fixtures; ejecución CLI mediante IPC efímero bloqueada por auto-review antes de iniciar escrituras. Usuario consultado para autorización explícita de campaña inactiva y 11 artículos ficticios en base aislada. R1.3 aún NO VALIDADO_STAGING en comportamiento. Detalles y evidencia en STAGING.md. Cluster PostgreSQL local detenido; fixtures del nuevo smoke local conservados en base aislada.