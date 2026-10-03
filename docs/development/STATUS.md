# Estado de trabajo compartido

Actualizado: 03/10/2026. Coordinador de esta entrega: Codex, chat actual de recuperación de importaciones.

## Trabajo activo 03/10/2026

| Tarea | Estado | Responsable | Alcance |
|---|---|---|---|
| IMPORT-BULK-RECOVERY | VALIDADO_PRODUCCION para importación de archivos | Codex, chat actual; sin agentes delegados | Backend PR #30, merge `975cac3`; Render deploy `dep-db0e7chsrm7s73f6vvd0` Live (03/10/2026). `npm test`: 77 PASS/4 SKIP local; CI #13 PASS; PostgreSQL 16 aislado: archivos reales y reimportación PASS. Carga autenticada en producción: diccionarios 50/28/16, maestro liviano 8/8, maestro completo 7.586 importados y 7 omitidos por formato SKU/códigos vacíos. GET posterior confirmó 50/28/16 y 7.586 artículos; smoke remoto 7/7 PASS. Sin borrados ni seed en producción. |

Las 7 filas omitidas del maestro completo requieren decisión/corrección del origen antes de reimportar: 1425, 1510, 3657 y 3715 tienen SKU fuera del contrato D-B01; 3687, 4805 y 5445 carecen de códigos. El panel permite descargarlas y corregirlas individualmente. No asignar SKU o códigos por inferencia. No se probó en producción una falla forzada de DB; el rollback se verificó con dobles y la importación completa con PostgreSQL aislado.

## Última entrega y propiedad

| Tarea | Estado | Responsable | Alcance |
|---|---|---|---|
| IMPORT-ROW-RECOVERY | PUBLICADO_EN_PR; validación local completa | Codex/coordinador | Backend `c91b8ec`, PR #29; frontend `788b807`, PR #52. Parser, servicios, controladores, panel de importación, corrección manual, descarga, cuatro plantillas y tests. Backend 74 PASS/3 SKIP; frontend 11/11 PASS, lint sin errores y build OK. Sin merge, staging ni deploy |
| R0.1 | VALIDADO_PRODUCCION (disponibilidad) | Codex/coordinador | Backend publicado; pruebas HTTP locales y smoke remoto |
| R0.2 | COMPLETADO: VALIDADO_STAGING + disponibilidad VALIDADO_PRODUCCION | Mismo coordinador | Render/Neon, scripts operativos y docs/development/* |
| R1.1 | COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL; no validado en staging | Codex/01a0f1e5, sin agentes delegados | normalización SKU/códigos backend y frontend; tests; docs/development/R11_VALIDATION.md |
| R1.2 | COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL; no validado en staging | Codex/01a0f1e5, sin agentes delegados | backend escaneos/servicio/tests; frontend ScanBox/API/tests; docs/development/R12_VALIDATION.md |
| R1.3 | PUBLICADO_PRODUCCION; validado staging previamente | Codex/coordinador, sin agentes delegados | src/services/actualizaciones.service.js; controladores actualizaciones/revisiones/workflow; middleware de errores; test/*; scripts de validación; docs/development/* |
| R1.4 | PUBLICADO_PRODUCCION; validado staging previamente | Codex/01a0f1e5, sin agentes delegados | campañas/cierre/reversión/workflow; esquema/migración aplicada en producción; docs/development/R14_VALIDATION.md |
| R2.1 | VALIDADO_PRODUCCION parcial: usuarios iniciales y login real | Codex/01a0f1e5, sin agentes delegados | identidad, usuarios, sucursales, roles, sesiones, frontend sesión real, logout/revocación, 401/403; docs/development/R21_VALIDATION.md |
| R3.1 | PUBLICADO_PRODUCCION; smoke remoto 7/7 | Codex/01a0f1e5, sin agentes delegados | importación maestro/diccionarios atómica, prevalidada y round-trip CSV/JSON; docs/development/R31_VALIDATION.md |
| R3.2 | PUBLICADO_PRODUCCION; smoke remoto 7/7 | Codex/01a0f1e5, sin agentes delegados | exportación final por campaña cerrada, TXT repetibles y resumen de conciliación; docs/development/R32_VALIDATION.md |
| R3.3 | PUBLICADO_PRODUCCION; smoke remoto 7/7 | Codex/01a0f1e5, sin agentes delegados | consenso por última observación válida por sucursal/SKU/atributo, métricas y CSV; docs/development/R33_VALIDATION.md |
| R4.1 | PUBLICADO_PRODUCCION; verificación bundle Vercel | Codex/01a0f1e5, sin agentes delegados | UX operativa frontend: foco escáner, respuestas obsoletas, mensajes fieles, validación build config; docs/development/R41_VALIDATION.md |
| R4.2 | COMPLETADO_LOCAL; benchmark PASS | Codex/01a0f1e5, sin agentes delegados | benchmark reproducible backend con dataset ficticio 7.594 SKUs x 7 sucursales, p95 local <2s y cero pérdida lógica; docs/development/R42_VALIDATION.md |
| R5.1 | COMPLETADO_LOCAL; audits 0 vulns | Codex/01a0f1e5, sin agentes delegados | Node 24, dependencias backend/frontend actualizadas, CI versionado, quality checks; docs/development/R51_VALIDATION.md |
| R5.2 | COMPLETADO_LOCAL; restore drill preparado | Codex/01a0f1e5, sin agentes delegados | operación/backup/restore/rollback/monitoreo, RPO/RTO iniciales y runner de restore aislado; docs/development/R52_OPERATION_RECOVERY.md |
| R6.1 | PREPARADO_LOCAL; piloto no ejecutado | Codex/01a0f1e5, sin agentes delegados | gates, fases staging/1/2/7 sucursales, matriz de aceptación e incidencias; docs/development/R61_PILOT_READINESS.md |
| R6.1-VERIFY | COMPLETADO; GATES CI/RESTORE VERDES | Codex/01a0fd55, sin agentes delegados | SHAs/deploys verificados y smoke 7/7; CI backend corregido y mergeado; restore aislado PASS con PostgreSQL 17.11; Fase 0 no iniciada; docs/development/R61_VERIFICATION_2026-10-02.md |
| UX-PROTOTIPO-01 | EN_CURSO | Codex/01a0f985, sin agentes delegados | análisis integral de producto para prototipo frontend; `Control_Atributos_Front/docs/PRODUCT_BRIEF_PROTOTIPO.md` y documentación canónica |
| Coordinación | Actualizada localmente | Mismo coordinador | AGENTS y documentos canónicos |

No hay agentes delegados. Entrega staging completada por Codex/coordinador: servicio separado, DB aislada, tres smoke incluido reinicio y documentación. R1.3 finalizado localmente por Codex/01a0eef9 y validado remotamente por Codex/01a0f1e5. R1.1 y R1.2 quedaron completados y validados localmente con D-B01 aprobada. R1.4 quedó publicado y validado en staging por Codex/01a0f1e5 con D-B02/D-B03 aprobadas. No se modificó producción ni Vercel durante R1.4.

Publicación main 01/10/2026: backend `86c2fff6701c9500329ad3141c8459fc7338041c` desplegado manualmente en Render producción (`dep-dav7ljnlk1mc73f8fijg`) y frontend `ecdda7ea70752c8f4b675106502703f0bd5d5985` publicado en Vercel. Render aplicó `20260930220000_r14_campaign_lifecycle` y `20261001010000_r21_identity_sessions` mediante `prisma migrate deploy` durante el start. Smoke remoto final: 7/7 PASS. Cuentas iniciales `admin`, `revisor` y `operador` creadas con aprobación explícita del usuario; login real validado para los tres usuarios contra producción. No registrar contraseñas en documentación.

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

Verificación R6.1 del 02/10/2026: GitHub contiene `b24c23b` y `ce8e812`; frontend CI verde; backend CI fue corregido en PR #28 y mergeado a `main` (`e165654`) con workflow verde. Render está Live en el SHA posterior `5a228a1` y smoke productivo 7/7 PASS. Vercel registra deploy exitoso de `ce8e812` y el bundle publicado coincide con los artefactos locales. Restore real completado con PostgreSQL 17.11 desde `production/neondb` hacia rama Neon aislada `r61-restore-drill` / DB `r61_restore_drill`: `pg_dump`, `pg_restore`, tablas esperadas y `prisma migrate status` OK, sin guardar secretos. No se inició el dataset/piloto Fase 0. Ver `R61_VERIFICATION_2026-10-02.md`.

R0.2 COMPLETADO en su alcance de disponibilidad: servicio remoto control-atributos-staging (srv-datd8aek1f9s73fqp9fg) Live, conectado exclusivamente a r02-migration-validation/r02_prisma_validation. Tres smoke de 7/7, incluido reinicio real, SHA 487a0e9 completo confirmado. Configuración/evidencias en STAGING.md y smoke-staging-*.json. Plan Free, Auto-Deploy Off, token independiente; no cambios a producción/Vercel en esta entrega. R1.3 quedó VALIDADO_STAGING el 30/09/2026: 12/12 escenarios y 58 HTTP sobre SHA 520cd35, con campaña inactiva y 11 SKU TEST-R13 retenidos como evidencia en la base aislada. R1.4 quedó VALIDADO_STAGING el 30/09/2026: commit 594ce7a, deploy dep-daupn7c9v7es73ag7le0, migración 9/9, smoke 7/7 y validación funcional 9/9 checks con 32 HTTP. No volver a inicializar producción: ya tiene esquema.

- Render Free puede demorar más que los timeouts frontend al despertar/reiniciar. La recuperación en caliente está validada, no disponibilidad continua ni SLA para siete sucursales. Pendiente definir hosting/UX de arranque antes del piloto.
- H01 (tablas ausentes) resuelto en destino confirmado. H02: wrapper async probado localmente y publicado; no se indujeron errores DB deliberados en producción.
- GET/HEAD deadline 7000 ms; readiness 2000 ms y una query pendiente máxima; timeout no cancela DB. GET heredado con snapshot y mutaciones sin idempotencia siguen pendientes R1.
- Node soportado, dependencias/CI, integración GitHub y despliegue de migraciones siguen R5. No afirmar seguridad ni preparación completa para piloto.
- Auditoría histórica preservada. D-B01, D-B02, D-B03, D-B04, D-B05 y D-B06 están aprobadas. R1.1/R1.2/R1.4 están completos localmente y R1.3/R1.4 validados en staging; R2.1 queda completo localmente, pendiente de PostgreSQL aislado y staging.

## Inicio R2.1 — 01/10/2026

El usuario pidió avanzar con D-B04 para habilitar usuarios, sucursales, roles y sesiones. D-B04 quedó aprobada: cuentas individuales, sucursal asignada, roles `OPERADOR`, `REVISOR` y `ADMIN`, actor/rol/sucursal derivados exclusivamente de la sesión del servidor, logout con revocación, vencimiento de sesión y respuestas `401`/`403` consistentes.

Implementación local backend: nuevos modelos `Sucursal`, `Usuario` y `Sesion`; migración `20261001010000_r21_identity_sessions`; login usuario/password con cookie `cc_session`; logout revocable; administración básica de usuarios/sucursales; permisos por rol; escaneo autenticado con actor/sucursal derivados del servidor; mutaciones protegidas sobrescriben `decidedBy`, `updatedBy` y `closedBy` desde la sesión. El token `ADMIN_TOKEN` queda solo como bootstrap/compatibilidad controlada.

Validación: `npx prisma validate` OK y `npm test` 61 tests, 58 PASS, 3 SKIP. No se ejecutó migración en PostgreSQL aislado ni se publicó staging/producción. Próximo paso: validar R2.1 en PostgreSQL aislado, adaptar frontend a login/sesión/roles y luego publicar staging con autorización separada.

Continuación local: se agregó sesión pública `/api/session` para operación, login/logout de operador y frontend adaptado a usuario/password con cookie `HttpOnly`. El escáner ya no manda `email`/`sucursal` editables y la idempotencia del intento no depende de identidad local. Admin usa usuario/password y conserva `authOK` para proteger módulos. Validación actual: backend `npx prisma validate` OK y `npm test` 62 tests, 59 PASS, 3 SKIP; frontend `npm test` 7/7, `npm run build` OK y `npm run lint` 0 errores/42 advertencias heredadas. `psql` no está disponible en PATH, por lo que no se ejecutó PostgreSQL aislado R2.1. Sin staging/producción ni deploy.

## Inicio R3.1 — 01/10/2026

R3.1 quedó completado y publicado en producción con D-B05 aprobada: importación absoluta por upsert sin borrar ausentes, CSV/JSON equivalentes, encabezados canónicos exportables, códigos normalizados, rechazo total del lote ante errores y transacciones Serializable cuando Prisma las ofrece. Se corrigió el round-trip CSV para aceptar `sku`, `descripcion`, `categoria_cod`, `tipo_cod`, `clasif_cod` y `cod,nombre`. Validación local: `npx prisma validate --schema prisma\schema.prisma` OK y `npm test` 65 tests, 62 PASS, 3 SKIP. Publicación Render manual del código `bea43bd6b940f1eb23c1343d3d507f2e5150e773`, deploy `dep-dav7u2o473hc73e1npa0`, sin migraciones pendientes y smoke remoto 7/7 PASS. No se ejecutó PostgreSQL aislado. Detalle: R31_VALIDATION.md.

## Inicio R3.2 — 01/10/2026

R3.2 quedó completado y publicado en producción: las exportaciones TXT finales exigen campaña cerrada, usan `closedAt` para nombres repetibles, separan cambios aplicados (`scope=applied`) de altas desconocidas aprobadas y aplicadas (`scope=unknown`), y el resumen diferencia aplicados, altas, pendientes, rechazos y desconocidos rechazados/fusionados. Validación local: `npx prisma validate --schema prisma\schema.prisma` OK, `npm test` 68 tests, 65 PASS, 3 SKIP, y `git diff --check` OK. Publicación Render manual del código `348c40f72e6965fadd5235764709136f24b0b98c`, deploy `dep-davd0ifpn0mc73cicqe0`, sin migraciones pendientes y smoke remoto 7/7 PASS. No se ejecutó PostgreSQL aislado. Detalle: R32_VALIDATION.md.

## Inicio R3.3 — 01/10/2026

R3.3 quedó completado localmente con D-B06 aprobada: consenso y métricas usan la última observación válida por sucursal, SKU y atributo; cada sucursal pesa una vez por atributo; los eventos crudos se conservan para auditoría; el consenso se informa por atributo con porcentaje acotado a 100 y estados `sin_observacion`, `consenso`, `conflicto` o `empate`. La decisión final sigue siendo del revisor/admin.

Implementación: nuevo `src/services/consenso.service.js`, integración en revisiones, discrepancias, exportes CSV y resumen de auditoría. `consensoPct` se conserva como ratio por compatibilidad frontend y se agrega `consensoPorcentaje` para consumidores nuevos. Validación local: `npm.cmd test` 71 tests, 68 PASS, 3 SKIP; `npx.cmd prisma validate --schema prisma\schema.prisma` OK. Publicación Render manual del código `98431bb842e3378ad91efed441286c6b503f16dd`, deploy `dep-davdbue7bikc73dkdrmg`, sin migraciones pendientes y smoke remoto 7/7 PASS. No se ejecutó PostgreSQL aislado. Detalle: R33_VALIDATION.md.

## Inicio R4.1 — 01/10/2026

R4.1 quedó completado localmente en frontend: el escáner mantiene foco operativo al cambiar campaña y después de registrar observaciones, ignora respuestas obsoletas de lookup, y sus mensajes ya no prometen aplicar cambios al maestro. Revisiones descarta respuestas obsoletas al cambiar filtros/campaña para evitar datos viejos pisando la vista actual. H18 queda cubierto con `prebuild`: el build falla temprano si `VITE_API_URL` falta, no es HTTP(S), incluye credenciales o termina en `/api`.

Validación local: `npm.cmd test` 7/7 PASS; `npm.cmd run lint` 0 errores/41 advertencias heredadas; `npm.cmd run build` sin `VITE_API_URL` falla temprano como se espera; `VITE_API_URL=https://control-atributos-back.onrender.com npm.cmd run build` OK con 388 módulos. Frontend `f4014d3` publicado en `origin/main`; Vercel sirve `/assets/index-gsCTPEJn.js`, el bundle generado por el build local. No se hizo auditoría visual móvil ni prueba con pistola física. Detalle: R41_VALIDATION.md.

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
