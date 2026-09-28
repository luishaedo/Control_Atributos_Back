# Historial de entregas

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
