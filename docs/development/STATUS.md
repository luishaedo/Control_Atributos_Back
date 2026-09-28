# Estado de trabajo compartido

Actualizado: 28/09/2026. Coordinador: Codex, chat de roadmap y recuperación R0.2.

## Última entrega y propiedad

| Tarea | Estado | Responsable | Alcance |
|---|---|---|---|
| R0.1 | VALIDADO_PRODUCCION (disponibilidad) | Codex/coordinador | Backend publicado; pruebas HTTP locales y smoke remoto |
| R0.2 | EN_CURSO; recuperación productiva VALIDADA | Mismo coordinador | Render/Neon, scripts operativos y docs/development/* |
| Coordinación | Actualizada localmente | Mismo coordinador | AGENTS y documentos canónicos |

No hay agentes delegados. Reserva actual: cierre documental de recuperación R0.2. No se modificó código frontend ni reglas de negocio en esta continuación.

## Despliegue real

- Backend publicado en main y desplegado manualmente: `487a0e9e9ee97ab306f133aee7b3792d68e75783`. Incluye R0.1 y scripts/evidencias previas de R0.2. Base anterior b56e2dd; Render antes ejecutaba 266cea5.
- Render: https://control-atributos-back.onrender.com, servicio srv-d62ji3ffte5s73b4iefg, deploy dep-dasq9nh7lnhs73ab3vd0, estado Live. Build observado: Node 20.20.2, Prisma 5.22.0. Plan Free, sin cambio de plan.
- Build `npm ci && npx prisma generate`, start `npm run start`, health `/api/health`. No paso automático de migración. Auto Deploy muestra On Commit, pero el push anterior no disparó despliegue; se usó Manual Deploy. Integración GitHub pendiente de revisar.
- Neon production/neondb/public: destino cotejado con Render, preflight cero relaciones de usuario, ocho migraciones aplicadas con Prisma, status al día, diff vacío e historial 8/8. Evidencia production-recovery.json. Producción SÍ fue modificada el 27/09 para recuperar esquema y backend; sin seed/reset ni borrado de datos.
- Frontend https://stockeador-client-1nll.vercel.app/: el 28/09, tras recarga con backend disponible, muestra «No hay campañas disponibles» y deshabilita escaneo sin campaña. Sin errores/warnings capturados en esa revisión. No es una prueba de flujos de negocio ni del panel autenticado. SHA local auditado a361e7e; no se verificó SHA Vercel.

## Validación y evidencia

- `npm test`: 22/22 el 27/09, antes de publicar (17 HTTP y 5 smoke, dobles sin DB). Node local 24.20.0. No se repitió suite por esta entrega documental.
- Rama Neon aislada persistente `r02-migration-validation`, sin expiración: SQL 10 tablas/90 columnas sin diferencias, 10 PK/5 FK, fixtures con ROLLBACK; DB r02_prisma_validation: migrate deploy dos veces/status/diff correctos, historial 8/8. API local con Neon real: tres smoke exitosos incluido reinicio. Ver migration-validation/RESULTS.md.
- Producción: smoke-recovered-1.json y -2.json exitosos el 27/09, siete comprobaciones cada uno.
- Reinicio real solicitado y confirmado por evento Render el 28/09 a las 17:41 ART; captura render-restarted.png. Primer smoke tras reinicio (-3-restart.json) falló por timeout de 10 s en tres health; consultas funcionales y admin sí respondieron. Se conserva el fallo.
- Repetición después del arranque: smoke-recovered-4-restart-warm.json, 20:43:03 UTC, 7/7 PASS, SHA exacto, JSON/CORS válidos y admin 401. Latencias 248–760 ms. Son tres smoke productivos exitosos en total, uno después del reinicio; no tres intentos consecutivos sin fallos.
- Credenciales temporales de pruebas y producción eliminadas; no reutilizar archivos de conexión ni imprimir variables de entorno.

## Límites y siguiente acción

R0.2 sigue abierto porque no existe staging Render desplegado: integración API local + Neon aislado no equivale a VALIDADO_STAGING remoto. Próximo tramo: preparar/desplegar servicio staging con DB aislada y repetir smoke/reinicio, manteniendo separados credenciales y destinos. No volver a inicializar producción: ya tiene esquema y el script de recuperación exige base vacía.

- Render Free puede demorar más que los timeouts frontend al despertar/reiniciar. La recuperación en caliente está validada, no disponibilidad continua ni SLA para siete sucursales. Pendiente definir hosting/UX de arranque antes del piloto.
- H01 (tablas ausentes) resuelto en destino confirmado. H02: wrapper async probado localmente y publicado; no se indujeron errores DB deliberados en producción.
- GET/HEAD deadline 7000 ms; readiness 2000 ms y una query pendiente máxima; timeout no cancela DB. GET heredado con snapshot y mutaciones sin idempotencia siguen pendientes R1.
- Node soportado, dependencias/CI, integración GitHub y despliegue de migraciones siguen R5. No afirmar seguridad ni preparación completa para piloto.
- Auditoría histórica preservada. D-B01–D-B06 siguen pendientes; autorización operativa no aprueba sus reglas de negocio. R1–R6 no iniciados.
