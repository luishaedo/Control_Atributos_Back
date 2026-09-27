# Estado de trabajo compartido

Actualizado: 27/09/2026. Coordinador actual: Codex, chat de roadmap y primera entrega.

## Última entrega y propiedad

| Tarea | Estado | Responsable | Archivos reservados |
|---|---|---|---|
| R0.1 | IMPLEMENTADO_LOCAL | Codex/coordinador de este chat | Backend app/server, routers, lifecycle/auth, health service, asyncRouter/http, test/http.test.js, package.json, .env.example, README y runbook |
| Documentación de coordinación | COMPLETADA_LOCAL | Mismo coordinador | AGENTS.md raíz y ambos repos; ROADMAP.md raíz; docs/development/* |
| R0.2 | EN_CURSO | Codex/coordinador de este chat | Recuperación y verificación Render/Neon productivos autorizada por usuario; scripts de operación, publicación backend y docs/development/* |

No hay otros agentes delegados por este chat. R0.2 iniciado por pedido del usuario de avanzar al siguiente paso; reservado diagnóstico remoto de lectura, scripts/test de smoke y documentación de coordinación. Esta tabla no es un bloqueo automático de archivos.

## Base y ambiente

Recuperación productiva autorizada explícitamente por el usuario al pedir continuar con el despliegue Render. Destino Render/Neon confirmado por endpoint, base neondb y esquema public. Preflight real: cero tablas/vistas/secuencias de usuario. Se aplicaron las ocho migraciones validadas mediante Prisma: status actualizado, diff vacío e historial 8/8. Evidencia production-recovery.json. No seed/reset ni borrado de datos. Publicación del backend y smoke remoto EN_CURSO; los bullets históricos siguientes describen la base previa.

- Backend: se hizo fetch y fast-forward limpio de 266cea5 a b56e2dd antes de implementar; las modificaciones R0.1 están encima de b56e2dd, sin commit/push todavía.
- Frontend local/main auditado: a361e7e. No se planifican cambios de aplicación frontend en R0.1.
- Producción: Vercel `https://stockeador-client-1nll.vercel.app`, Render `https://control-atributos-back.onrender.com`.
- Render live confirmado: 266cea59f089fd1bc42aa4850d924de51dce5167, plan Free, build sin migraciones. Logs P2021 por tablas Campania/DicCategoria/DicClasif ausentes y rechazos async no manejados. Health 200, admin 401, consultas funcionales timeout incluso con proceso activo. Ver DIAGNOSTICO_RENDER_2026-09-27.md y dos smoke JSON.
- Neon: proyecto control-atributos-db, rama production, neondb, PostgreSQL 17. Dos SELECT de metadatos confirman public, cero tablas de usuario visibles y ausencia de public._prisma_migrations. Falta correspondencia exacta con DATABASE_URL; credenciales no reveladas.
- Producción no modificada. Sí se ejecutaron migraciones y fixtures sintéticos en la rama Neon aislada autorizada; ver migration-validation/RESULTS.md. Sin seed ni reset.

## Pendientes externos

27/09, continuación R0.2: usuario autorizó expresamente crear/conservar rama Neon y probar migraciones; pidió autonomía para continuar desarrollo. Bloqueo anterior de aprobación resuelto. Rama `r02-migration-validation` creada (`br-crimson-poetry-an1ipez1`), sin expiración, plan Free sin cambio de plan. En su neondb se ejecutaron ocho migraciones SQL: 10 tablas/90 columnas, cero diferencias de tipos/nulabilidad, 10 PK y 5 FK. Fixtures de restricciones ejecutados con ROLLBACK exitoso. Base adicional `r02_prisma_validation` creada SOLO en esa rama para validar migrate deploy e integración API. Operación en curso; no es validación productiva.

Validación aislada completada: SQL y Prisma deploy dos veces/status/diff exitosos; 8 migraciones aplicadas; API local con DB Neon real pasa tres smoke (21 consultas), incluido reinicio de proceso. R0.2 requiere confirmar destino Render y verificar despliegue remoto; staging Render no creado. R0.1 sigue sin publicar. Credencial temporal de pruebas eliminada tras uso.

## Validación R0.1

- `npm test`: 22/22 pasan el 27/09 (17 HTTP + 5 del smoke), Node v24.20.0; loopback/Prisma y fetch simulados. Sin `.env`, DB externa ni nuevas dependencias en estos tests.
- `node --check`: 27 archivos JS de src/test, cero errores.
- `git diff --check`: limpio después de quitar una línea vacía final; Git informa solamente conversión de LF/CRLF propia del entorno.
- No se ejecutó suite frontend porque no cambió código de aplicación frontend; solo se agregó su AGENTS.md.
- Integración PostgreSQL y migraciones validadas en Neon aislado el 27/09; no seed/publicación. Runtime local Node 24.20.0; runtime declarado >=18 <21 sigue pendiente en R5.1.

## Límites relevantes para el siguiente agente

- GET/HEAD API: deadline 7000 ms por defecto; no cancela consultas. Readiness: 2000 ms y máximo una query pendiente por proceso.
- Los handlers que ya capturan errores conservan su política propia. El middleware nuevo protege los rechazos antes no capturados; no afirmar uniformidad total de códigos de error o logs.
- Sigue pendiente el GET heredado que puede escribir snapshot (R1.4), y las mutaciones sin idempotencia completa (R1.2/R1.4).
- H01: tablas ausentes confirmadas por logs; reparación pendiente. H02 tiene corrección local de propagación async; no marcarlo validado en producción.
- La auditoría histórica y sus evidencias no se sobrescribieron. Las reglas D-B01–D-B06 siguen pendientes.
- Documentos y código aún locales: un agente en otra máquina/checkout necesita estos cambios o su publicación antes de asumir el contexto actualizado.

## Siguiente acción

R0.2: confirmar correspondencia DATABASE_URL Render con rama/db Neon, preparar inicialización correcta usando Prisma y publicación de código, verificar smoke remoto y frontend. No repetir aprobación ya concedida para pruebas aisladas. Ver migration-validation/RESULTS.md para evidencia y límites. R1–R6: NO_INICIADO; reservar alcance y revisar decisiones antes de tomarlas.
