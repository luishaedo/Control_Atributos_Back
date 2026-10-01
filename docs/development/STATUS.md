# Estado de trabajo compartido

Actualizado: 01/10/2026. Coordinador: Codex, chat Corregir aplicación de atributos (01a0eef9).

## Última entrega y propiedad

| Tarea | Estado | Responsable | Alcance |
|---|---|---|---|
| R0.1 | VALIDADO_PRODUCCION (disponibilidad) | Codex/coordinador | Backend publicado; pruebas HTTP locales y smoke remoto |
| R0.2 | COMPLETADO: VALIDADO_STAGING + disponibilidad VALIDADO_PRODUCCION | Mismo coordinador | Render/Neon, scripts operativos y docs/development/* |
| R1.1 | COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL; no validado en staging | Codex/01a0f1e5, sin agentes delegados | normalización SKU/códigos backend y frontend; tests; docs/development/R11_VALIDATION.md |
| R1.2 | COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL; no validado en staging | Codex/01a0f1e5, sin agentes delegados | backend escaneos/servicio/tests; frontend ScanBox/API/tests; docs/development/R12_VALIDATION.md |
| R1.3 | VALIDADO_STAGING; no validado en producción | Codex/coordinador, sin agentes delegados | src/services/actualizaciones.service.js; controladores actualizaciones/revisiones/workflow; middleware de errores; test/*; scripts de validación; docs/development/* |
| R1.4 | VALIDADO_STAGING; no validado en producción | Codex/01a0f1e5, sin agentes delegados | campañas/cierre/reversión/workflow; esquema/migración; staging Render/Neon; tests PostgreSQL; docs/development/R14_VALIDATION.md |
| R2.1 | COMPLETADO_LOCAL; falta VALIDADO_LOCAL_POSTGRESQL y staging | Codex/01a0f1e5, sin agentes delegados | identidad, usuarios, sucursales, roles, sesiones, frontend sesión real, logout/revocación, 401/403; docs/development/R21_VALIDATION.md |
| R3.1 | INICIADO_LOCAL; D-B05 pendiente | Codex/01a0f1e5, sin agentes delegados | importación maestro/diccionarios atómica y prevalidada; docs/development/R31_VALIDATION.md |
| Coordinación | Actualizada localmente | Mismo coordinador | AGENTS y documentos canónicos |

No hay agentes delegados. Entrega staging completada por Codex/coordinador: servicio separado, DB aislada, tres smoke incluido reinicio y documentación. R1.3 finalizado localmente por Codex/01a0eef9 y validado remotamente por Codex/01a0f1e5. R1.1 y R1.2 quedaron completados y validados localmente con D-B01 aprobada. R1.4 quedó publicado y validado en staging por Codex/01a0f1e5 con D-B02/D-B03 aprobadas. No se modificó producción ni Vercel durante R1.4.

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

R0.2 COMPLETADO en su alcance de disponibilidad: servicio remoto control-atributos-staging (srv-datd8aek1f9s73fqp9fg) Live, conectado exclusivamente a r02-migration-validation/r02_prisma_validation. Tres smoke de 7/7, incluido reinicio real, SHA 487a0e9 completo confirmado. Configuración/evidencias en STAGING.md y smoke-staging-*.json. Plan Free, Auto-Deploy Off, token independiente; no cambios a producción/Vercel en esta entrega. R1.3 quedó VALIDADO_STAGING el 30/09/2026: 12/12 escenarios y 58 HTTP sobre SHA 520cd35, con campaña inactiva y 11 SKU TEST-R13 retenidos como evidencia en la base aislada. R1.4 quedó VALIDADO_STAGING el 30/09/2026: commit 594ce7a, deploy dep-daupn7c9v7es73ag7le0, migración 9/9, smoke 7/7 y validación funcional 9/9 checks con 32 HTTP. No volver a inicializar producción: ya tiene esquema.

- Render Free puede demorar más que los timeouts frontend al despertar/reiniciar. La recuperación en caliente está validada, no disponibilidad continua ni SLA para siete sucursales. Pendiente definir hosting/UX de arranque antes del piloto.
- H01 (tablas ausentes) resuelto en destino confirmado. H02: wrapper async probado localmente y publicado; no se indujeron errores DB deliberados en producción.
- GET/HEAD deadline 7000 ms; readiness 2000 ms y una query pendiente máxima; timeout no cancela DB. GET heredado con snapshot y mutaciones sin idempotencia siguen pendientes R1.
- Node soportado, dependencias/CI, integración GitHub y despliegue de migraciones siguen R5. No afirmar seguridad ni preparación completa para piloto.
- Auditoría histórica preservada. D-B01, D-B02, D-B03 y D-B04 están aprobadas; D-B05–D-B06 siguen pendientes. R1.1/R1.2/R1.4 están completos localmente y R1.3/R1.4 validados en staging; R2.1 queda completo localmente, pendiente de PostgreSQL aislado y staging.

## Inicio R2.1 — 01/10/2026

El usuario pidió avanzar con D-B04 para habilitar usuarios, sucursales, roles y sesiones. D-B04 quedó aprobada: cuentas individuales, sucursal asignada, roles `OPERADOR`, `REVISOR` y `ADMIN`, actor/rol/sucursal derivados exclusivamente de la sesión del servidor, logout con revocación, vencimiento de sesión y respuestas `401`/`403` consistentes.

Implementación local backend: nuevos modelos `Sucursal`, `Usuario` y `Sesion`; migración `20261001010000_r21_identity_sessions`; login usuario/password con cookie `cc_session`; logout revocable; administración básica de usuarios/sucursales; permisos por rol; escaneo autenticado con actor/sucursal derivados del servidor; mutaciones protegidas sobrescriben `decidedBy`, `updatedBy` y `closedBy` desde la sesión. El token `ADMIN_TOKEN` queda solo como bootstrap/compatibilidad controlada.

Validación: `npx prisma validate` OK y `npm test` 61 tests, 58 PASS, 3 SKIP. No se ejecutó migración en PostgreSQL aislado ni se publicó staging/producción. Próximo paso: validar R2.1 en PostgreSQL aislado, adaptar frontend a login/sesión/roles y luego publicar staging con autorización separada.

Continuación local: se agregó sesión pública `/api/session` para operación, login/logout de operador y frontend adaptado a usuario/password con cookie `HttpOnly`. El escáner ya no manda `email`/`sucursal` editables y la idempotencia del intento no depende de identidad local. Admin usa usuario/password y conserva `authOK` para proteger módulos. Validación actual: backend `npx prisma validate` OK y `npm test` 62 tests, 59 PASS, 3 SKIP; frontend `npm test` 7/7, `npm run build` OK y `npm run lint` 0 errores/42 advertencias heredadas. `psql` no está disponible en PATH, por lo que no se ejecutó PostgreSQL aislado R2.1. Sin staging/producción ni deploy.

## Inicio R3.1 — 01/10/2026

Sin aprobar todavía D-B05, se avanzó solo sobre base técnica no irreversible: importación JSON/CSV de maestro con la misma ruta de validación estricta, rechazo de duplicados dentro del lote, verificación de dominios antes de escribir y transacción Serializable para evitar parciales. Diccionarios también se escriben en transacción. Validación: `npx prisma validate --schema prisma\schema.prisma` OK y `npm test` 64 tests, 61 PASS, 3 SKIP. No se ejecutó PostgreSQL aislado, staging ni producción. Detalle: R31_VALIDATION.md.

## Cierre R1.1 y R1.2 — 30/09/2026

El usuario aprobó D-B01 y pidió aviso visible. Se implementó identidad SKU única: el primer `#`/`$` separa etiqueta, la base alfanumérica se usa en mayúsculas y el valor crudo se conserva. Escaneo e importación avisan la separación. Códigos de uno/dos dígitos se normalizan con cero inicial; formatos mayores/contaminados y valores fuera de diccionario se rechazan sin truncar y antes de escribir. Lookup, importación CSV/JSON, escaneo, revisión, desconocidos y exportación quedaron alineados. Detalle: R11_VALIDATION.md.

R1.2 se repitió contra ese contrato definitivo. Backend 79/79 PASS con PostgreSQL real en `r12_isolated` y `r13_isolated`, cero omitidas; frontend 7/7, build 389 módulos, lint 0 errores/42 advertencias heredadas. `r12_isolated` terminó 0/0/0/0 en sus tablas operativas, se eliminó y el clúster se detuvo. No hubo acceso remoto, commit, push ni deploy. R1.1 y R1.2 quedan COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL; no VALIDADO_STAGING.

R1.4 quedó completada después de la aprobación de D-B02/D-B03. Evidencia: R14_VALIDATION.md.

## Entrega R1.4 — 30/09/2026

El usuario aprobó D-B02/D-B03. Se implementó el ciclo `BORRADOR -> ACTIVA -> CERRANDO -> CERRADA`, una única campaña activa mediante restricción PostgreSQL, snapshot completo al activar y fechas informativas validadas. Las lecturas ya no completan snapshots ni escriben datos.

Aceptar solo propone; confirmar habilita; el cierre Serializable aplica únicamente decisiones vigentes confirmadas y desconocidos aprobados. Los rechazos, fusiones y pendientes sin confirmar permanecen. El cierre repetido es idempotente, una campaña cerrada no se reactiva y la reversión crea un evento compensatorio enlazado sin alterar el original.

Validación final: backend 90/90 PASS, 0 omitidas, en PostgreSQL 16.3 local con suites R1.2/R1.3/R1.4 completas; frontend 7/7, build 389 módulos y lint 0 errores/42 advertencias heredadas. Incluye rollback forzado, doble cierre y carrera cierre/escaneo. Bases R1.2/R1.4 sin fixtures y eliminadas; R1.3 preservada sin campañas activas; clúster detenido. Sin acceso remoto, commit, push o deploy; por eso el estado es `COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL`, no staging. Detalle: R14_VALIDATION.md.

Continuación staging: commit `594ce7aa4c01402b147f52383d0b7b733a1c974b` publicado en `r13-atributos-staging` y deploy manual `dep-daupn7c9v7es73ag7le0` Live. En Neon aislado se aplicó la migración R1.4 y el historial quedó 9/9. Smoke remoto 7/7 PASS. Validación funcional remota: 9/9 checks PASS, 32 HTTP, campañas 7/8/9 y SKUs `TESTR147EE8387FCA*` retenidos. Evidencia sanitizada: `r14-staging-validation-20260930.json`. Producción y Vercel no fueron consultados ni modificados. R1.4 queda `VALIDADO_STAGING`; no producción.

## Entrega R1.3 — 29/09/2026

Conservación por atributo; compare-and-set de valores propuestos; decisiones y aplicación Serializable; sustitución parcial conserva atributos restantes y original auditado; baseline de nuevas revisiones desde maestro vigente; 409 en tres caminos de aplicación. Sin cambios de esquema/frontend. Detalle, comandos y límites: R13_VALIDATION.md.

Pruebas: `npm test` con R13_TEST_DATABASE_URL apuntando exclusivamente a PostgreSQL 16.3 local dedicado (127.0.0.1:55439/r13_isolated): 57/57 PASS, cero omitidas, incluidas carreras reales de dos transacciones y rollback. Ocho migraciones históricas solo sobre cluster nuevo aislado; fixtures propios limpiados y cluster detenido. `git diff --check` correcto. Sin .env, DB remota, seed/reset ni carga real.

Archivos: src/services/actualizaciones.service.js; src/controllers/{actualizaciones,revisiones,workflow}.controller.js; src/middlewares/httpLifecycle.js; test/{actualizaciones,actualizaciones.postgres,http}.test.js; docs/development/{STATUS,CHANGELOG,DECISIONS,R13_VALIDATION}.md. El AGENTS.md no rastreado del frontend se preservó.

Límites registrados al cerrar R1.3: no versión de pantalla ni detección ABA; el cierre completo todavía pertenecía a R1.4; sin pruebas frontend/carga. El próximo paso de esa entrega era validar R1.3 en staging y abordar R1.4, pasos completados posteriormente como consta arriba. Sin commit/PR/push/deploy en aquella entrega.

## Continuación staging R1.3 — 29/09/2026

Commit 520cd35d33a3be2e7ca1d90adc745880d0d53eff publicado en rama r13-atributos-staging y desplegado manualmente solo en srv-datd8aek1f9s73fqp9fg (dep-dau2pc97lnhs73f705eg, Live). Staging sigue esa rama con Auto-Deploy Off. main remoto conserva 487a0e9; producción no se modificó. Smoke 7/7 PASS con SHA exacto.

Verificador de comportamiento preparado y validado localmente: 12 escenarios/58 HTTP más suite 57/57. Al cierre del 29/09, el preflight del entorno navegador no tenía acceso de red y la ejecución CLI mediante IPC efímero había quedado bloqueada antes de escribir; esa situación fue resuelta con la validación loopback del 30/09 documentada debajo. Cluster PostgreSQL local detenido; fixtures del smoke local conservados en base aislada.

## Cierre documental R1.3 e inicio de preparación R1.4 — 30/09/2026

Usuario pidió finalizar R1.3, documentar todo y avanzar a la siguiente etapa. Se releyeron AGENTS, roadmap, estado, decisiones, changelog y auditoría; se preservó el AGENTS.md no rastreado del frontend y no se modificó frontend. `npm test` ejecutado sin R13_TEST_DATABASE_URL: 41/41 PASS y 1 integración PostgreSQL omitida por falta de base aislada activa; no valida staging ni carreras reales remotas. No hay cambios de código en esta continuación.

R1.3 quedó VALIDADO_STAGING el 30/09/2026. Se recuperaron las credenciales mediante sesiones autorizadas de Neon y Render, se verificó el destino exacto `r02_prisma_validation` y se ejecutó la validación mediante un puente loopback efímero. Resultado: 12/12 escenarios PASS, 58 HTTP con estados esperados 200/409, SHA exacto 520cd35, campaña inactiva ID 1 y 11 SKU TEST-R13 retenidos. Evidencia sanitizada: `r13-staging-validation-20260930.json`; no contiene URL de conexión, token ni contraseña. Producción no fue consultada ni modificada.

En ese momento R1.4 quedó reservado solo para preparación: faltaban R1.2 y D-B02/D-B03. Esas dependencias fueron resueltas después y la implementación final está documentada en la sección R1.4 superior.

## Implementación técnica R1.2 — 30/09/2026

Escaneo refactorizado a servicio con transacción Serializable única; clave idempotente obligatoria, replay por payload, 409 por reutilización conflictiva, resolución de carrera por índice único y etapas monotónicas. Frontend genera y conserva la clave durante reintentos y la rota al cambiar el intento o completarlo. Sin migración: se usa el índice existente. Archivos y límites completos en R12_VALIDATION.md.

Validación: backend 54 PASS, 0 fallos, 1 omitida (integración R1.3 no activada); incluye PostgreSQL 16.3 real en base local nueva `r12_isolated`, dos solicitudes simultáneas, rollback forzado, desconocido idempotente, etapa consolidada y siete sucursales concurrentes con retry explícito. Frontend 6/6 PASS, build exitoso, lint 0 errores/42 advertencias heredadas. Fixtures en cero; base R1.2 eliminada y clúster detenido. Sin staging/producción, commit, push o deploy.

Este era el estado al finalizar la implementación técnica. Fue superado por el cierre del 30/09 documentado arriba: D-B01 aprobada, R1.1 implementada y suite R1.2 repetida; R1.2 quedó COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL.
