# Historial de entregas

## 03/10/2026 — UX-UI-02: limpieza visual y controles responsive publicada

Publicación posterior: frontend PR #53 `Polish responsive UX and admin layout` fue creado desde `ux-ui-professional-polish` y mergeado a `main` con squash `985732cc01333ec98e1937f656044017bcc6eab1`. Vercel responde 200 en `https://stockeador-client-1nll.vercel.app/` y sirve los assets generados por el build local: `/assets/index-CTQBiy8p.js` y `/assets/index-DxRY2PGW.css`. No hubo cambios backend, migraciones ni operaciones de datos. Queda pendiente QA autenticada completa con usuario real en Revisiones/Admin.

Se unificó el aspecto del frontend con tipografía, superficies, espaciado, foco y botones consistentes; Bootstrap se carga desde el paquete local. La navegación superior y de administración envuelve en móvil, el escaneo separa sus dos acciones, las campañas y formularios se distribuyen en tarjetas y las tablas anchas se desplazan dentro de su tarjeta. Catálogo distingue carga, error y vacío con reintento; Home evita mostrar “sin campaña” durante una falla de carga. Login acepta Enter y evita envíos mientras procesa. Confirmación y Consolidación muestran columnas alineadas; el botón de Confirmación ahora indica que mueve todos los ítems según su destino. Cerrar campaña exige una confirmación visual previa y bloquea doble clic mientras procesa; si el cierre se completó pero falla una descarga, el mensaje lo distingue. Se sustituyó el `alert()` de creación de campaña por un aviso en el panel.

Archivos: frontend `index.html`, `src/main.jsx`, `src/styles.css`, `src/components/{Topbar,CampaignSelector,ScanBox,IdentityModal,DiscrepanciasTabla,DiscrepanciasSucursalesTabla}.jsx`, `src/pages/{Home,Catalogo,Revisiones}.jsx`, `src/pages/admin/AdminPage.jsx`, módulos `AdminAuth`, `CampaignManagement`, `Imports` y `Exports`; documentación `docs/development/{STATUS,DECISIONS,CHANGELOG}.md`. Validación: frontend `npm.cmd run lint` 0 errores/38 advertencias preexistentes, `npm.cmd test` 11/11 PASS, build con `VITE_API_URL` explícita PASS. Navegador local a 360 y 390 px: `/`, `/catalogo`, `/admin` y `/auditoria` sin desborde horizontal. El navegador local no contó con credenciales de prueba para recorrer acciones autenticadas, por lo que queda pendiente QA visual del flujo completo en staging o producción con usuario autorizado. Próximo paso: revisar con una sesión de prueba autorizada la cola de Revisiones, importación, cierre y exportación en móvil y escritorio.

## 03/10/2026 — Importación de archivos reales sin vencimiento de transacción

Verificación productiva posterior: PR #30 fusionado en `975cac36bf6551218e0ad86b9478182884df5e28`; Backend CI #13 PASS. Render producción `dep-db0e7chsrm7s73f6vvd0` quedó Live con ese SHA, sin migraciones pendientes; `/health/live` y `/health/ready` correctos, smoke remoto 7/7 PASS con origen Vercel. Desde la pantalla autenticada se importaron `categorias2.csv`, `tipos.csv` y `clasificacion.csv` (50/28/16), `Maestro_ligth.csv` (8) y `Maestro.csv` (7.586 guardados, 7 omitidos reportados). GET público posterior confirmó 50/28/16 diccionarios y 7.586 artículos. Las omitidas son filas 1425, 1510, 3657, 3687, 3715, 4805 y 5445; cuatro SKU inválidos y tres filas sin códigos. Quedan para corrección de origen, sin inventar valores. No se ejecutó borrado, seed ni carga de prueba destructiva contra producción. Próximo paso: corregir esas 7 filas según el catálogo fuente y reimportarlas; no hay fallo de importación pendiente para las filas válidas.

El importador de diccionarios y maestro ahora ejecuta upsert SQL parametrizado en lotes de hasta 500 filas dentro de una transacción Serializable. Antes hacía un upsert secuencial por fila con el límite implícito de cinco segundos de Prisma; en producción vencía durante `dicTipo.upsert`. Se amplió el límite transaccional a 120 s y la espera de conexión a 10 s. El lote conserva atomicidad y la prevalidación/recuperación de filas de la entrega anterior.

Archivos: `src/services/maestro.service.js`, `test/import.real-files.test.js`, `test/import.postgres.test.js`, `docs/development/{STATUS,DECISIONS,CHANGELOG}.md`. Validación: `npm test` 77 PASS/4 SKIP en el workspace; prueba PostgreSQL 16 aislado con migraciones 10/10: tres diccionarios, maestro liviano, maestro completo y reimportación PASS. CI ejecuta un caso sintético de 1.201 filas y omite únicamente las pruebas de los CSV de la raíz cuando no están presentes en el checkout del backend. Archivos de raíz: 50 categorías, 28 tipos, 16 clasificaciones; maestro liviano 8/8 y maestro completo 7.586 importables/7 omitidas (cuatro SKU fuera de D-B01 y tres códigos vacíos). No se corrigieron valores inventando SKU/códigos. La validación local no escribió en producción.

## 02/10/2026 — Plantillas y recuperación de filas omitidas en importaciones

Se añadieron cuatro plantillas CSV con encabezados canónicos para categorías, tipos, clasificaciones y maestro. Backend ahora procesa cada fila por separado, persiste en una transacción las válidas y responde con número de fila, datos originales, campo y motivo de cada omisión; esto incluye códigos inexistentes en diccionarios y duplicados normalizados, conservando la primera aparición. Frontend muestra un cuadro separado por archivo, permite corregir y cargar una fila individualmente, y descarga las omitidas como CSV compatible con reimportación. Encabezados no reconocibles o CSV mal formado siguen generando error de archivo.

Archivos principales: `Control_Atributos_Back/src/utils/csvInput.js`, servicios/controladores de importación, tests backend, `Control_Atributos_Front/src/pages/admin/modules/Imports/*`, cuatro CSV en `public/templates/` y test de plantillas. Decisión D-B05 actualizada por solicitud del usuario. Backend `npm test`: 77 pruebas, 74 PASS, 3 SKIP. Frontend `npm test`: 11/11 PASS; lint 0 errores/41 advertencias heredadas; build OK y cuatro plantillas presentes en `dist/templates`. Publicación: backend `c91b8ec` en PR #29 y frontend `788b807` en PR #52. Sin DB real, merge, staging ni deploy. Próximo paso: revisar CI, mergear ambos PR y verificar los despliegues coordinados de Render/Vercel.

## 02/10/2026 — R6.1 verificación operativa parcial

Se verificaron GitHub, Actions, Render, Vercel y la aplicación publicada. Backend `b24c23b` está en `main`, cuyo head remoto observado ya era `5a228a1`; frontend `ce8e812` es head de `main`. Frontend CI #2 está verde. Backend CI #4/#5 está rojo en `prisma validate` antes de tests/audit; con `DATABASE_URL` vacía se reproduce P1012 localmente.

Render está Live en `5a228a1` (deploy `dep-davt3760tbcc73f9vlig`), health live/ready 200 y smoke remoto 7/7 PASS. Vercel reporta deployment exitoso para `ce8e812`; la app responde 200 y sus assets publicados coinciden por SHA-256 con los artefactos del checkout. No se disparó redeploy.

Se creó en Neon la rama aislada autoexpirable `r61-restore-drill` y la DB `r61_restore_drill`. El guardrail de origen/destino iguales rechazó correctamente. El restore real falló seguro en `pg_dump` antes de escribir/restaurar; herramientas locales PostgreSQL 16.3 frente a Neon PostgreSQL 17 indican incompatibilidad mayor probable. No se guardaron secretos, el puente local efímero se eliminó y producción no fue modificada.

Fase 0 no se inició: no se crearon datos ficticios ni campaña porque CI backend y restore siguen bloqueando los gates. Evidencia y próximos pasos en `docs/development/R61_VERIFICATION_2026-10-02.md`.

Continuación: se corrigió el CI backend en PR #28 con `DATABASE_URL` PostgreSQL ficticia/no secreta y timezone explícito Argentina para nombres de exportación; el workflow del PR quedó verde y se mergeó a `main` (`e165654`). Se repitió el restore drill real con herramientas PostgreSQL 17.11 y conexiones directas: `pg_dump`, `pg_restore`, tablas esperadas y `prisma migrate status` OK contra la DB aislada `r61_restore_drill`. Se ajustó `scripts/restore-drill.mjs` para invocar Prisma vía Node local y evitar fallos `spawn npx` en Windows. No se guardaron URLs ni secretos; producción se usó solo como origen de dump.

## 02/10/2026 — R6.1 piloto preparado localmente

Antes de avanzar se dejaron backend y frontend limpios y publicados en GitHub: backend `61065da` documenta el workstream del prototipo y frontend `ce8e812` versiona `docs/PRODUCT_BRIEF_PROTOTIPO.md`.

Se agrego `docs/development/R61_PILOT_READINESS.md` con gates obligatorios, fases staging -> 1 sucursal -> 2 sucursales -> 7 sucursales, matriz minima de aceptacion, formato de incidencias y pendientes para habilitar piloto. R6.1 queda `PREPARADO_LOCAL`: no se marca validado porque faltan ejecucion de restore drill real, observacion de CI remoto, despliegue de ultimos SHAs si se usa app publicada, rotacion de contrasenas temporales, definicion de sucursal piloto y aprobacion operativa.

## 02/10/2026 — R5.2 operacion y recuperacion completado localmente

Se documento el runbook operativo R5.2 en `docs/development/R52_OPERATION_RECOVERY.md`: RPO/RTO iniciales para piloto, backups antes de importaciones/cierres/migraciones, restore drill aislado, rollback de codigo, rollback de datos, monitoreo minimo y checklist de habilitacion R6.1. Se agrego D-T15: restore siempre primero contra DB/rama aislada, rollback de datos no automatico y restore productivo completo solo con aceptacion explicita de perdida desde el backup elegido.

Se agrego `scripts/restore-drill.mjs` y los comandos `ops:smoke` / `ops:restore-drill`. El runner exige `SOURCE_DATABASE_URL` y `RESTORE_DATABASE_URL`, rechaza origen/destino iguales, exige que el destino parezca aislado, usa `pg_dump`/`pg_restore`, verifica tablas criticas y corre `prisma migrate status` contra el destino restaurado sin imprimir credenciales.

Validacion local: `node --check scripts/restore-drill.mjs`, guardrail sin credenciales falla cerrado, `npx.cmd prisma validate --schema prisma\schema.prisma`, `npm.cmd test` 71 tests, 68 PASS, 3 SKIP, y `git diff --check` OK. No se ejecuto restore real porque requiere credenciales Neon y una DB destino aislada. No se modifico produccion ni se publico Render/Vercel.

## 02/10/2026 — R5.1 runtime, dependencias y CI completado localmente

Se fijo Node `>=24 <25` en backend y frontend con `.nvmrc` y `engines`, alineando la app a una linea LTS activa y sacando el rango anterior que incluia Node EOL. Se agregaron workflows CI versionados para ambos repos: backend ejecuta `npm ci`, Prisma generate/validate, tests y audit productivo; frontend ejecuta `npm ci`, lint, tests, build con `VITE_API_URL` explicita y audit productivo.

Dependencias corregidas: backend actualizo `express` linea 4, `multer` linea 2.4 y `csv-parse` linea 7; frontend actualizo `react-router-dom`, `vite`, `vitest`, `@vitejs/plugin-react` y transitivas por `npm audit fix` sin `--force`. Auditorias finales: backend `npm audit --json` 0 vulnerabilidades; frontend `npm audit --json` 0 vulnerabilidades.

Validacion local: backend `npx prisma validate --schema prisma\schema.prisma` OK y `npm test` 71 tests, 68 PASS, 3 SKIP. Frontend `npm run lint` 0 errores/41 advertencias heredadas, `npm test` 7 PASS, `VITE_API_URL=https://control-atributos-back.onrender.com npm run build` OK. Vitest/build frontend requirieron ejecucion fuera del sandbox por bloqueo ambiental de esbuild leyendo `vite.config.js`; con permisos pasaron. No se publico Render/Vercel ni se ejecuto CI remoto todavia. Evidencia: R51_VALIDATION.md.

## 01/10/2026 — R4.2 rendimiento medido completado localmente

Se agrego `scripts/benchmark-r42.mjs` y el comando `npm run benchmark:r42` para medir localmente los puntos marcados por H14 sin usar DB real, `.env`, secretos ni datos productivos. El runner genera un dataset ficticio `TEST-R42` de 7.594 SKUs x 7 sucursales, 53.158 escaneos, 7.594 snapshots y 584 decisiones, invoca los controladores reales de revisiones con Prisma falso en memoria y mide p95 en caliente.

Resultado completo guardado en `docs/development/r42-benchmark-20261001.json`: `revisiones.listar` p95 693,35 ms, `revisiones.discrepancias` p95 970,38 ms, `revisiones.discrepanciasSuc` p95 591,59 ms y `revisiones.resumenAuditoria` p95 663,82 ms. La rafaga simulada de 21 sesiones sobre `resumenAuditoria` tardo 14.057,32 ms de pared, promedio 669,40 ms por sesion. Chequeos logicos: 53.158 escaneos, 159.474 observaciones logicas, 7.594 items y porcentajes de consenso dentro de 0..100; todo PASS.

Documentacion nueva: `docs/development/R42_VALIDATION.md`. Estado: `COMPLETADO_LOCAL`; no se publico Render/Vercel ni se ejecuto prueba contra PostgreSQL/Neon real. Limite registrado: esta evidencia mide agregacion/controladores en proceso local; antes del piloto conviene repetir con staging/PostgreSQL real y datos ficticios si se desea validar latencia completa de red/DB.

## 01/10/2026 — R4.1 UX operativa completada localmente

Frontend: el escáner mantiene foco al cambiar campaña y tras registrar una observación, ignora respuestas obsoletas de lookup y corrige mensajes para describir el efecto real: registrar observación, no aplicar cambios al maestro. Revisiones ahora descarta respuestas obsoletas al cambiar filtros/campaña en evaluación, cola, faltantes, confirmación y consolidación.

Build/config: se agregó `scripts/validate-env.mjs` y `prebuild`; el build falla temprano si `VITE_API_URL` falta, no es HTTP(S), incluye credenciales o termina en `/api`.

Validación local: frontend `npm.cmd test` 7/7 PASS; `npm.cmd run lint` 0 errores/41 advertencias heredadas; `npm.cmd run build` sin `VITE_API_URL` falla temprano como se espera; `VITE_API_URL=https://control-atributos-back.onrender.com npm.cmd run build` OK. Publicación: frontend `f4014d3` en `origin/main`; Vercel sirve `/assets/index-gsCTPEJn.js`, el bundle generado por el build local. No se hizo prueba visual móvil/pistola física todavía. Evidencia: R41_VALIDATION.md.

## 01/10/2026 — R3.3 consenso y métricas completado localmente

D-B06 quedó aprobada: el consenso cuenta la última observación válida por sucursal, SKU y atributo; cada sucursal pesa una vez por atributo; todos los eventos se conservan para auditoría; el porcentaje se calcula sobre sucursales observantes con máximo 100 y estados separados para sin observación, conflicto y empate.

Código: nuevo `src/services/consenso.service.js`, uso compartido desde revisiones, discrepancias, exportes CSV y resumen de auditoría. `consensoPct` permanece como ratio para compatibilidad con el frontend actual y se agrega `consensoPorcentaje` como porcentaje 0..100. Las propuestas históricas de revisión se mantienen, pero sus conteos ahora representan sucursales observantes, no cantidad cruda de escaneos.

Validación local: `npm.cmd test` 71 tests, 68 PASS, 3 SKIP; `npx.cmd prisma validate --schema prisma\schema.prisma` OK. Publicación: commit `98431bb842e3378ad91efed441286c6b503f16dd` desplegado manualmente en Render (`dep-davdbue7bikc73dkdrmg`), sin migraciones pendientes, API viva y smoke remoto 7/7 PASS contra el SHA esperado. No se ejecutó PostgreSQL aislado. Evidencia: R33_VALIDATION.md y smoke-r33-production-20261001.json.

## 01/10/2026 — R3.2 exportación final publicada en producción

Las exportaciones TXT finales ahora requieren campaña cerrada y se vuelven repetibles por cierre: los nombres de archivo usan `closedAt`, no el instante de descarga. `scope=applied` exporta solo decisiones aplicadas con `appliedAt` y último evento por SKU/atributo; `scope=unknown` exporta solo desconocidos aprobados y aplicados al maestro. El resumen TXT informa campaña, cierre, aplicados, altas aplicadas, pendientes, rechazos y desconocidos rechazados/fusionados.

Validación local: `npx prisma validate --schema prisma\schema.prisma` OK; `npm test` 68 tests, 65 PASS, 3 SKIP; `git diff --check` OK. Publicación: commit funcional `348c40f72e6965fadd5235764709136f24b0b98c` desplegado manualmente en Render (`dep-davd0ifpn0mc73cicqe0`), sin migraciones pendientes, API viva y smoke remoto 7/7 PASS contra el SHA esperado. No se ejecutó PostgreSQL aislado. Evidencia: R32_VALIDATION.md.

## 01/10/2026 — R3.1 completado y publicado en producción

D-B05 quedó definida para importación externa: foto absoluta por SKU mediante upsert, sin borrar ausentes; CSV y JSON equivalentes; CSV UTF-8 con BOM para salida; entrada UTF-8/UTF-8 BOM/Latin-1 con coma, punto y coma o tab; encabezados canónicos `sku`, `descripcion`, `categoria_cod`, `tipo_cod`, `clasif_cod` y diccionarios `cod,nombre`. Cualquier fila inválida, duplicada o fuera de diccionario rechaza el lote completo sin escritura parcial.

Código: `csvInput` ahora acepta encabezados canónicos exportables para round-trip y mantiene variantes legibles previas. Pruebas nuevas cubren reimportación CSV de maestro/diccionarios. Validación local: `npx prisma validate --schema prisma\schema.prisma` OK; `npm test` 65 tests, 62 PASS, 3 SKIP. Publicación: commit funcional `bea43bd6b940f1eb23c1343d3d507f2e5150e773` desplegado manualmente en Render (`dep-dav7u2o473hc73e1npa0`), sin migraciones pendientes, API viva y smoke remoto 7/7 PASS contra el SHA esperado. No se ejecutó PostgreSQL aislado.

## 01/10/2026 — Bootstrap de usuarios iniciales en producción

Con aprobación explícita del usuario, se creó la sucursal `CENTRO` y los usuarios iniciales `admin`, `revisor` y `operador` en la API publicada de Render. Se usó el token bootstrap en memoria, sin escribir credenciales ni volcarlas a evidencias. No se ejecutaron seeds, resets ni migraciones en esta operación.

Validación: `/api/health/live` confirmó backend `86c2fff6701c9500329ad3141c8459fc7338041c`; login real por `/api/session/login` exitoso para `admin` (`ADMIN`), `revisor` (`REVISOR`) y `operador` (`OPERADOR`, sucursal `CENTRO`). Pendiente: rotar la contraseña temporal antes de uso operativo real y completar pruebas funcionales de escaneo/admin desde frontend publicado.

## 01/10/2026 — Main publicado y producción actualizada

Se mergeó el trabajo acumulado de `r13-atributos-staging` a `main`, se publicó backend `86d4bc57798f3b5b9bbd5338cdf2efbffcc38b19` y frontend `ecdda7ea70752c8f4b675106502703f0bd5d5985`. Render productivo se desplegó manualmente desde Dashboard en `dep-dav7ji60tbcc73e0ucdg`.

El start productivo ahora ejecuta `prisma migrate deploy && node src/server.js`. En el deploy productivo se aplicaron correctamente las migraciones `20260930220000_r14_campaign_lifecycle` y `20261001010000_r21_identity_sessions`; luego la API levantó en puerto 10000. Smoke remoto `smoke-main-20261001-after-deploy.json`: 7/7 PASS, SHA exacto, readiness DB up, CORS correcto y admin 401. Frontend Vercel responde 200 y el bundle publicado contiene las rutas nuevas `session/login` y `session/logout`.

No se crearon cuentas iniciales: el intento fue detenido por revisión automática porque crear/rotar usuarios productivos con contraseña persistente requiere aprobación explícita separada. Próximo paso operativo: aprobar credenciales iniciales o proveer usuario/password de arranque; luego validar login/escaneo/admin sobre la app publicada.

## 01/10/2026 — Inicio R3.1 importación validada

Se avanzó con una base técnica segura de R3.1 sin cerrar D-B05: la importación JSON y CSV de maestro ahora comparte una ruta estricta, prevalidada y transaccional. Se rechazan lotes con SKU inválido, códigos inválidos/fuera de diccionario o SKU duplicado tras normalización; ante cualquier error no se escribe ningún registro. La importación de diccionarios también queda en transacción. Validación: `npx prisma validate --schema prisma\schema.prisma` OK y `npm test` 64 tests, 61 PASS, 3 SKIP. Estado: `INICIADO_LOCAL`; pendiente definir D-B05, PostgreSQL aislado y staging.

## 01/10/2026 — D-B04 aprobada e inicio R2.1

El usuario pidió avanzar con el paso natural posterior a R1.4: definir/aprobar D-B04 para entrar en R2.1. Se aprobó el contrato de identidad: cuenta individual por persona, sucursal asignada, roles `OPERADOR`, `REVISOR` y `ADMIN`, actor/rol/sucursal derivados desde la sesión del servidor, logout con revocación, sesiones con vencimiento y respuestas `401`/`403` consistentes. El cliente no podrá suplantar actor o sucursal mediante body/query. Se admite bootstrap inicial de administrador solo en entornos controlados; los tokens compartidos no quedan como identidad operativa normal.

Se implementó R2.1 local backend: modelos `Sucursal`, `Usuario` y `Sesion`; migración `20261001010000_r21_identity_sessions`; servicio de identidad con `scrypt` y tokens de sesión hasheados; login por usuario/password; logout revocable; administración básica de sucursales y usuarios; roles por ruta; escaneo autenticado; actor/sucursal derivados del servidor; y sobrescritura server-side de `decidedBy`, `updatedBy` y `closedBy`.

Validación local: `npx prisma validate` OK; `npm test` 61 tests, 58 PASS, 3 SKIP. Estado: `IMPLEMENTADO_LOCAL`. No se ejecutó migración en PostgreSQL aislado, no se modificó staging ni producción y el frontend todavía debe adaptarse al nuevo login/sesión/roles. Evidencia: R21_VALIDATION.md.

Continuación R2.1: se agregó sesión pública para operadores (`/api/session/login`, `/api/session`, `/api/session/logout`) y se adaptó el frontend a sesión real por usuario/password. El escáner usa cookie `HttpOnly`, no envía `email`/`sucursal` desde el body y la idempotencia ya no depende de identidad editable local; el panel admin también usa usuario/password. Validación actual: backend 62 tests, 59 PASS, 3 SKIP y Prisma válido; frontend 7/7 PASS, build Vite correcto y lint 0 errores/42 advertencias heredadas. Estado: `COMPLETADO_LOCAL`; pendiente `VALIDADO_LOCAL_POSTGRESQL` porque `psql` no está disponible en PATH, y pendiente staging con autorización separada.

## 30/09/2026 — R1.4 publicado y validado en staging

Se publicó R1.4 únicamente en staging: rama `r13-atributos-staging`, commit `594ce7aa4c01402b147f52383d0b7b733a1c974b`, deploy manual Render `dep-daupn7c9v7es73ag7le0` Live. Auto-Deploy sigue Off. Producción, main productivo y Vercel no fueron modificados.

En Neon aislado `r02-migration-validation` / `r02_prisma_validation` se aplicó manualmente la migración `20260930220000_r14_campaign_lifecycle`; el historial quedó 9/9. Smoke remoto `smoke-r14-staging.json`: 7/7 PASS con SHA exacto, readiness DB up y auth/CORS correctos.

Validación funcional remota: `scripts/run-r14-staging-loopback.mjs` con credenciales solo en memoria y evidencia `r14-staging-validation-20260930.json`. Resultado: 9/9 checks PASS y 32 requests HTTP. Se probaron borrador, activación/snapshot, GET sin escritura, segunda activa 409, aplicación anticipada bloqueada, desconocidos aprobado/rechazado, cierre selectivo, cierre repetido, no reactivación, reversión compensatoria única y doble cierre concurrente con una sola aplicación. Campañas 7/8/9 y SKUs `TESTR147EE8387FCA*` quedan retenidos en la base aislada. La evidencia fue revisada sin URL de conexión, token, contraseña ni encabezados de autorización. Estado: R1.4 `VALIDADO_STAGING`; no producción.

## 30/09/2026 — R1.4 completada y validada localmente

El usuario aprobó D-B02/D-B03. Se agregó ciclo explícito de campaña, restricción de una única activa, snapshot congelado al activar, validación de fechas, cierre atómico e idempotente, aplicación exclusiva de decisiones confirmadas, preservación de rechazos y reversión compensatoria trazable. GET y escaneo dejaron de completar snapshots. Editar, aprobar, rechazar o fusionar desconocidos exige campaña activa y actualiza estado/etapa atómicamente. El modal frontend usa el arreglo estable de estadísticas por usuario devuelto por el cierre.

Nueva migración `20260930220000_r14_campaign_lifecycle`: estado y marcas de activación/cierre, vínculo único de reversión e índice parcial de campaña activa. La aplicación anticipada queda deshabilitada; confirmar y cerrar es el único camino normal de aplicación.

Validación PostgreSQL 16.3 local: backend 90/90 PASS, cero omitidas, con suites R1.2/R1.3/R1.4 completas. Los diez escenarios R1.4 incluyen fechas/objetivos, snapshot/GET, segunda activa, cierre selectivo, rechazo, idempotencia, no reactivación, reversión, rollback forzado, doble cierre y carrera cierre/escaneo. Frontend 7/7, build 389 módulos y lint 0 errores/42 advertencias heredadas. Bases R1.2/R1.4 terminaron sin fixtures y se eliminaron; R1.3 quedó preservada sin campañas activas; clúster detenido. Sin staging/producción, commit, push o deploy. Estado: `COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL`; evidencia en R14_VALIDATION.md.

## 30/09/2026 — R1.1 y R1.2 completados y validados localmente

El usuario aprobó D-B01: `#`/`$` separan el sufijo de etiqueta y el sistema debe avisarlo; códigos fuera de formato/dominio se rechazan completos. Se unificó normalización backend/frontend para lookup, importación, escaneo, revisión y exportación. La base SKU alfanumérica se convierte a mayúsculas; el raw se conserva cuando el modelo lo permite. Códigos de uno/dos dígitos conservan ceros y ningún valor se limpia o trunca silenciosamente. Escaneo/importación muestran avisos y los errores identifican formato/dominio antes de escribir.

R1.2 se repitió contra el contrato final: backend 79/79 PASS con PostgreSQL 16.3 real en bases locales aisladas R1.2/R1.3, 0 omitidas; incluye concurrencia con `#ETIQUETA`, rollback, idempotencia y regresión de aplicación. Frontend 7/7, build 389 módulos, lint 0 errores/42 advertencias heredadas. `r12_isolated` terminó sin fixtures, se eliminó y el clúster se detuvo; `r13_isolated` se preservó. Sin staging/producción, commit, push o deploy. Evidencia: R11_VALIDATION.md y R12_VALIDATION.md.

Estado: R1.1 y R1.2 `COMPLETADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL`. R1.4 queda bloqueada únicamente por D-B02/D-B03.

## 30/09/2026 — R1.2 implementado y validado localmente; dependencia R1.1 pendiente

El usuario pidió terminar R1.2 para avanzar. Se refactorizó `escaneos.controller.js` a `escaneos.service.js`: clave idempotente obligatoria, comparación de payload, replay sin nueva escritura, 409 por reutilización conflictiva, transacción Serializable única para snapshot/escaneo/desconocido/contador/etapa y preservación de etapas avanzadas. No se añadió migración; se reutiliza el índice único compuesto existente. El frontend ahora genera una clave por intento, la conserva tras error y la rota al cambiar/completar el payload.

Pruebas: backend 54 PASS, 0 fallos y 1 omitida (integración R1.3 separada). PostgreSQL 16.3 real local, DB nueva `r12_isolated`, ocho migraciones existentes, sin seed/reset/db push: misma clave concurrente produce una fila; payload conflictivo 409; fallo de etapa revierte todo; replay desconocido no incrementa; consolidate no retrocede; siete sucursales convergen mediante retry explícito con la misma clave. Fixtures 0/0/0/0, DB R1.2 eliminada y clúster detenido. Frontend 6/6 PASS, build 389 módulos, lint 0 errores/42 advertencias heredadas. Primer Vitest sandbox bloqueado por acceso a vite.config; repetición autorizada pasó. Sin acceso remoto, commit, push ni deploy.

Estado: IMPLEMENTADO_LOCAL + VALIDADO_LOCAL_POSTGRESQL, todavía no COMPLETADO porque ROADMAP exige R1.1 y D-B01 no fue aprobada. No se cambió normalización SKU/códigos. Evidencia: R12_VALIDATION.md. Próximo: confirmar D-B01, implementar/validar R1.1 y repetir R1.2; luego R1.4 requiere además D-B02/D-B03.

## 30/09/2026 — Cierre documental R1.3 y preparación de R1.4

Pedido del usuario: finalizar R1.3, documentar todo y avanzar a la siguiente etapa. Se releyeron instrucciones de workspace/backend/frontend, roadmap, STATUS, DECISIONS, CHANGELOG y auditoría histórica. Repos revisados con `git -c safe.directory=...` por bloqueo de ownership; backend estaba limpio antes de documentar y frontend conserva `AGENTS.md` no rastreado. No se modificó frontend ni código de negocio.

R1.3 quedó VALIDADO_STAGING de comportamiento. Las sesiones autorizadas de Neon y Render permitieron recuperar en memoria la `DATABASE_URL` exacta de `r02_prisma_validation` y el token independiente de staging. El primer traspaso desde el portapapeles aislado del navegador falló antes de parsear credenciales, sin conexión ni escrituras. Se agregó `scripts/run-r13-staging-loopback.mjs`: formulario loopback en `127.0.0.1`, ruta aleatoria, un solo uso, `no-store`, cierre inmediato y sin persistencia ni impresión de secretos.

Validación remota final: `node scripts/run-r13-staging-loopback.mjs 520cd35d33a3be2e7ca1d90adc745880d0d53eff docs/development/r13-staging-validation-20260930.json`. Resultado 12/12 escenarios PASS y 58 HTTP, incluidos seis órdenes de atributos, sustitución parcial, doble aplicación paralela 200/409, rechazo posterior, rollback total por baseline y aplicación inmediata. Campaña inactiva ID 1 y 11 SKU TEST-R13 retenidos en la base aislada. Evidencia sanitizada sin secretos. Producción, frontend y reglas de negocio no se modificaron. La suite local de esta continuación fue 41/41 PASS con 1 integración PostgreSQL omitida; la evidencia previa real sigue 57/57. `node --check scripts/run-r13-staging-loopback.mjs` y `git diff --check` finalizaron correctamente; el escaneo de secretos solo encontró nombres de campos en el runner, ninguno en la evidencia. Próximo: R1.4 solo tras resolver R1.2 y D-B02/D-B03.

## 29/09/2026 — R1.3 publicada y desplegada exclusivamente en staging

Commit 520cd35d33a3be2e7ca1d90adc745880d0d53eff en rama r13-atributos-staging, deploy dep-dau2pc97lnhs73f705eg Live tras 43,3 s. Render staging sigue esa rama con Auto-Deploy Off; main remoto permanece 487a0e9, sin despliegue productivo. Cambios de negocio de R1.3 publicados junto con evidencia local anterior.

scripts/validate-r13-staging.mjs: verificador con destinos permitidos exactos, SHA obligatorio, fixtures nuevos y sin eliminación/reintentos. 12 escenarios/58 HTTP pasan primero en API local+PostgreSQL aislado; suite 57/57 PASS. Smoke remoto read-only pasa 7/7 (smoke-r13-staging.json). Captura r13-staging-deployed.png. Preflight remoto del entorno navegador falla por EACCES antes de escribir, evidencia sanitizada preservada. scripts/run-r13-staging-memory.mjs recibe credenciales una vez por pipe Windows, en memoria y sin archivos; su ejecución fue rechazada por revisión automática por requerir autorización explícita de fixtures remotos. Consulta enviada al usuario; pruebas remotas de comportamiento pendientes, sin fixtures remotos creados. No se guardaron archivos de credenciales.

Archivos de esta continuación: dos scripts de validación; STAGING, STATUS, CHANGELOG y DECISIONS; evidencia JSON/PNG. Estado: DESPLEGADO_STAGING + disponibilidad validada; no VALIDADO_STAGING de comportamiento R1.3 todavía. Próximo: con autorización específica, ejecutar 12 escenarios en rama Neon aislada; no avanzar R1.4 automáticamente. Sin PR ni merge.
## 29/09/2026 — R1.3, conservación por atributo y conflictos validada localmente

Codex/01a0eef9 retomó cambios locales del chat anterior, confirmado por historial y usuario; sin agentes adicionales. Aplicación por parches y comparación del baseline por atributo, Serializable, decisión vigente determinista y rollback del lote completo ante conflicto. 409 con request ID en aplicación directa, revisión inmediata y cierre. Creación de decisión/sustitución/etapa/aplicación inmediata atómicas; sustitución parcial conserva atributos restantes y original auditado; nuevas revisiones usan maestro actual, sin modificar snapshot. Cierre excluye archivadas y conserva el caso vacío; su atomicidad completa sigue R1.4.

Archivos: servicio actualizaciones; controladores actualizaciones/revisiones/workflow; middleware httpLifecycle; tests actualizaciones/actualizaciones.postgres/http; STATUS, DECISIONS y nuevo R13_VALIDATION.md. Frontend y esquema intactos.

Validación: `npm test` con R13_TEST_DATABASE_URL al cluster nuevo PostgreSQL 16.3 en 127.0.0.1:55439/r13_isolated: 57/57 PASS, cero omitidas; seis órdenes, carreras reales, rechazos/archivado/vigencia, sustitución parcial, rollback y HTTP. Ocho migraciones existentes aplicadas exclusivamente en esa base vacía; fixtures propios limpiados y cluster detenido. Sin .env, DB remota, seed/reset ni datos reales. `git diff --check` correcto. Evidencia y reproducción: R13_VALIDATION.md.

Estado IMPLEMENTADO_LOCAL; no VALIDADO_STAGING/PRODUCCION para R1.3. Límites: comparación por valor (sin ABA/token de pantalla), sin carga/UI, cierre y reversión pendientes R1.4. Próximo: publicación/validación staging autorizadas y R1.4 con D-B02/B03. Sin commit, PR, push o deploy; SHA remoto permanece 487a0e9.

## 28/09/2026 — R0.2, staging remoto desplegado y validado

Creado por autorización explícita control-atributos-staging en Render Free/Oregon, servicio srv-datd8aek1f9s73fqp9fg, deploy dep-datd8amk1f9s73fqpaf0 Live en 46,9 s. SHA 487a0e9e9ee97ab306f133aee7b3792d68e75783 desde main público; Node 20.20.2, Prisma 5.22.0. Build npm ci && npx prisma generate, start npm run start, health /api/health, Auto-Deploy Off. DATABASE_URL apunta exclusivamente a Neon r02-migration-validation/r02_prisma_validation, con esquema ya validado; token admin independiente y CORS localhost:5173. Sin seed/reset/migraciones adicionales ni cambios productivos.

Validación: npm test 22/22; node scripts/smoke.mjs con base staging, origin localhost:5173 y expected-version SHA completo: tres rondas 7/7, incluida posterior a reinicio real confirmado a las 17:57 ART. Contratos JSON, CORS, versión, DB/consultas y admin 401 correctos; 241–925 ms. Evidencia smoke-staging-1.json, smoke-staging-2.json, smoke-staging-3-restart.json y staging-render-verified.png. Credenciales no volcadas a disco/logs; clipboard y variables temporales limpiados.

Documentación: STAGING.md nuevo, STATUS y DECISIONS actualizados. R0.2 COMPLETADO / VALIDADO_STAGING, junto con recuperación productiva previa. Límite: API únicamente, sin nuevo frontend ni pruebas de escritura/carga; suspensión Free, runtime/seguridad/CI y reglas de negocio siguen pendientes. Próximo desarrollo: R1.3. Documentación de esta entrega registrada localmente; no se efectuó push ni otro deploy de producción.

## 28/09/2026 — R0.2, recuperación Render verificada tras reinicio

Código y evidencia previa publicados en main y desplegados manualmente como 487a0e9e9ee97ab306f133aee7b3792d68e75783; Render Live (dep-dasq9nh7lnhs73ab3vd0), Node 20.20.2 / Prisma 5.22.0. Esquema productivo inicializado el 27/09 según entrada previa. Dos smoke productivos exitosos ese día.

Reinicio controlado confirmado por evento Render 28/09 17:41 ART. Primer smoke conserva tres timeouts health durante arranque; cuatro rutas restantes respondieron correctamente. Segundo intento en caliente pasa 7/7 con SHA exacto, CORS/contratos y admin 401 (248–760 ms). Frontend recargado muestra estado vacío de campañas y escaneo deshabilitado, sin errores/warnings capturados. No se crearon datos de negocio ni se probaron escrituras productivas.

Archivos: STATUS reescrito para eliminar estado obsoleto; CHANGELOG; render-recovered.png, render-restarted.png; smoke-recovered-1.json, -2.json, -3-restart.json (FAIL conservado), -4-restart-warm.json (PASS). Comando: node scripts/smoke.mjs con base Render, origen Vercel, expected-version 487a0e9 completo y salida específica por intento. Suite previa npm test 22/22; sin cambios de código en esta continuación.

R0.1 disponibilidad publicada y verificada; R0.2 sigue abierto por staging Render pendiente. Límites: demora de arranque Free, despliegue automático GitHub no demostrado, migración operativa manual, runtime/dependencias R5 y flujos de negocio R1–R6. Próximo: staging remoto aislado. Documentación/evidencia de este cierre local; el SHA productivo es el indicado arriba.

## 27/09/2026 — R0.2, inicialización productiva autorizada

Confirmada correspondencia entre DATABASE_URL de Render y endpoint de Neon production/neondb/public. Preflight PostgreSQL sin tablas/vistas/secuencias de usuario. scripts/recover-production-schema.mjs verifica destino exacto, base vacía y SHA256 de las ocho migraciones ensayadas antes de ejecutar migrate deploy. Resultado: deploy correcto, status actualizado, diff vacío, historial 8/8. Evidencia sanitizada production-recovery.json. Sin seed/reset ni borrado. Credencial temporal fuera de Git; se elimina al terminar. Publicación y smoke remoto todavía en curso. npm test 22/22 previo a publicar.

## 27/09/2026 — R0.2, migraciones e integración PostgreSQL verificadas

Usuario autorizó explícitamente rama persistente y pruebas; rechazo anterior resuelto. Creada r02-migration-validation en Neon sin cambiar plan. Ocho migraciones SQL correctas en neondb; comparación 10 tablas/90 columnas sin diferencias y pruebas de integridad con rollback exitosas. Base r02_prisma_validation en la misma rama: Prisma deploy correcto, segundo deploy sin pendientes, status actualizado y diff vacío; historial 8/8. API local real: tres smoke PASS (21 consultas), incluido reinicio del proceso. npm test 22/22; diff --check sin errores.

Archivos: .gitignore protege .r02-runtime; scripts/prepare-schema-check.mjs, scripts/validate-isolated-prisma.mjs; migration-validation/check-schema.sql, check-constraints.sql, prisma-api-results.json, capturas y RESULTS.md; STATUS y DECISIONS actualizados. Conexión de pruebas manejada en archivo ignorado, eliminada al terminar; ninguna credencial en evidencias. No cambio de código de negocio, no seed/reset ni publicación. Producción permanece sin reparar. R0.2 continúa para confirmar destino Render y desplegar/verificar remotamente; integración local+Neon no equivale a staging Render.

## 27/09/2026 — R0.2, preparación de validación aislada

Codex reservó validación SQL aislada y preparó `scripts/prepare-migration-validation.mjs` más salida en `docs/development/migration-validation/`: manifiesto SHA256 de ocho migraciones, SQL concatenado en orden dentro de transacción, verificación previa de public sin tablas y timeout SQL. No lee .env ni conecta DB. `node scripts/prepare-migration-validation.mjs` terminó correctamente y encontró ocho migraciones. No acredita ejecución PostgreSQL ni Prisma migrate deploy.

Formulario Neon preparado para rama `r02-migration-validation`, padre production, conservación sin borrado automático. Revisión automática rechazó Create por recurso persistente/posible costo sin autorización explícita. Se solicitó aprobación específica al usuario; no se reintentó ni creó recurso. Captura guardada en la carpeta de validación. Producción y configuración Render sin cambios. Próximo: con aprobación, crear rama y validar SQL; luego validar Prisma y preparar reparación productiva por separado.

## 27/09/2026 — R0.2, diagnóstico remoto y smoke local

Responsable: Codex/coordinador. Render live sigue en 266cea5; sin commit/push/deploy ni modificación remota. Se confirmaron errores P2021 por tablas ausentes, arranque con DB conectada y build/start sin migraciones. Usuario identifica Neon; proyecto control-atributos-db, rama production, PostgreSQL 17. No se revelaron secretos ni ejecutaron migraciones.

Nuevos: scripts/smoke.mjs, test/smoke.test.js, scripts/inspect-schema.sql, docs/development/DIAGNOSTICO_RENDER_2026-09-27.md y dos evidencias smoke JSON. Actualizados: package.json (comando smoke), STATUS y RUNBOOK_RENDER. Smoke verifica siete GET, contratos/CORS/auth/versión, deadline inclusive del cuerpo, sin guardar datos de negocio.

`npm test`: 22/22 pasan. Smoke público inicial y con proceso activo fallan: health y admin responden después del arranque; live/ready no existen en build antiguo y campañas/diccionarios/maestro agotan 10 s. Primer intento de red restringida no se interpretó como fallo productivo; evidencia se obtuvo con acceso de red autorizado.

R0.2 sigue EN_CURSO, sin validación staging/producción. Se ejecutaron dos SELECT de metadatos en Neon: neondb/public, cero tablas de usuario visibles, Campania e historial Prisma ausentes. scripts/inspect-schema.sql queda como inventario ampliado reutilizable; no se ejecutó ese archivo completo. Próximo: confirmar destino Render, validar las ocho migraciones en PostgreSQL aislado y preparar reparación/publicación autorizadas. PostgreSQL/psql/Docker no disponibles en PATH local. `git diff --check` sin errores (solo avisos LF/CRLF).

## 26/09/2026 — Plan declarado antes de comenzar R0.1

- Se crearon roadmap por tareas/dependencias/aceptación, estado compartido y decisiones separando técnica de negocio pendiente.
- Se crearon AGENTS.md raíz/backend/frontend, protocolo de reserva de archivos e integración y enlace al roadmap canónico.
- Autorización: preparar coordinación y avanzar con primer paso. Sin deploy ni cambios de reglas de negocio.
- Base: auditoría histórica con 31 hallazgos/riesgos y 13 reproducciones. No se marcaron corregidos por crear este plan.

## 26/09/2026 — R0.1 implementado y validado localmente

Responsable: Codex/coordinador. Base Git: b56e2dd, incorporado por fast-forward desde origin/main; conserva correcciones CORS remotas. Sin commit/PR/push/deploy de esta entrega todavía.

### Comportamiento

- Se separó fábrica Express (`src/app.js`) del arranque (`src/server.js`), con Prisma, entorno y logger inyectables.
- Ambos routers usan `createAsyncRouter`: propagan errores de handlers y middleware async en Express 4.
- Contexto HTTP genera X-Request-Id, log de estado/latencia y errores centrales JSON sanitizados; el helper administrativo ahora devuelve JSON compatible con ambos clientes frontend.
- GET/HEAD de API tienen deadline de 7 s por defecto. No se agrega retry ni cancelación falsa de escrituras.
- Health legado conserva `{ok:true}`. Live nuevo agrega versión y readiness consulta SELECT 1, responde 503 ante fallo/timeout y comparte una única query pendiente para evitar acumulación de probes.
- CORS conserva orígenes/aliases de main y expone X-Request-Id. Auth sigue obligatoria en producción; inyección de env facilita probarla sin credenciales reales.
- Se documentaron variables, límites, diagnóstico, smoke y rollback. Ningún cambio de esquema o regla de negocio.

### Archivos y comprobaciones

Nuevos: src/app.js, src/utils/asyncRouter.js, src/middlewares/httpLifecycle.js, src/services/health.service.js, test/http.test.js y docs/development/RUNBOOK_RENDER.md. Modificados: src/server.js, ambos routers, authAdmin.js, admin.controller.js, utils/http.js, package.json, .env.example y README.md.

`npm test`: 17 pasan, 0 fallan. Cobertura funcional: health/versión, DB fallida/lenta y recuperación, probes concurrentes, rechazo async público/admin, auth y cookie, CORS/preflight, JSON/multipart inválidos, deadline y respuesta tardía, mutación lenta sin cancelación ficticia, configuración inválida, error Prisma y payload compatible. `node --check`: 27 archivos sin errores. `git diff --check`: limpio. Runtime de prueba Node 24.20.0; no validación PostgreSQL real ni runtime productivo.

### Riesgos residuales / entrega siguiente

Producción sin modificar. Incidente de campañas no diagnosticado con logs privados; R0.2 pendiente. El timeout no cancela DB; handlers heredados con catch/log propio y GET con escritura siguen documentados como pendientes. D-B01–D-B06 no aprobadas aún. Siguiente integrador debe leer STATUS antes de continuar y publicar/compartir estos cambios si trabajará desde otro checkout.
