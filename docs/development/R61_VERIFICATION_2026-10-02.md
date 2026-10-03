# R6.1 - Verificacion operativa del 02/10/2026

Responsable: Codex/01a0fd55.  
Resultado: GATES CI/RESTORE CERRADOS / FASE 0 PENDIENTE.

No se guardaron URLs de base, passwords, tokens ni cuerpos de datos. No se ejecuto seed, reset, migracion ni escritura sobre produccion.

## GitHub y CI

- Backend: `b24c23b2c596e8060f3ac7376104f7cbf4626c82` esta contenido en `main`. Al verificar, el head remoto ya era el merge posterior `5a228a11c1199a05092c002d77724c3f076c4d76`.
- Frontend: `ce8e812c83ec216341088632d858d619763d1c48` era el head de `main`.
- Frontend CI #2 para `ce8e812`: SUCCESS, duracion observada 19 s.
- Backend CI #4 para `b24c23b` y CI #5 para el head `5a228a1`: FAILURE en `prisma validate`; `npm test` y `npm audit --omit=dev` quedaban omitidos.
- Reproduccion local controlada: con `DATABASE_URL` vacia, Prisma 5.22.0 devuelve P1012 (`DATABASE_URL resolved to an empty string`).
- Correccion publicada y mergeada en `main` por PR #28: workflow backend con `DATABASE_URL` PostgreSQL ficticia/no secreta y export filename con timezone explicito Argentina para evitar diferencias Windows/Ubuntu.
- Backend CI pull request `37074644254`, head `4392ccd`, resultado SUCCESS. El merge resultante en `main` es `e165654`.

Conclusion CI: gate backend remoto verde para el PR de correccion; tests y audit llegaron a ejecutarse correctamente.

## Deploys y smoke

### Render

- Servicio: `srv-d62ji3ffte5s73b4iefg`.
- Deploy Live observado: `dep-davt3760tbcc73f9vlig`.
- SHA publicado: `5a228a11c1199a05092c002d77724c3f076c4d76`, posterior y contenedor de `b24c23b`.
- Trigger mostrado por Render: manual. No fue necesario disparar otro deploy.
- `/api/health/live`: 200, version exacta `5a228a1...`.
- `/api/health/ready`: 200, `database: up`, misma version.
- Smoke remoto de solo lectura con origen Vercel y version esperada `5a228a1...`: 7/7 PASS. Duraciones 245-845 ms.

### Vercel

- El estado publico del commit `ce8e812` en GitHub informa contexto `Vercel`, estado `success`, descripcion `Deployment has completed`, creado el 02/10/2026 07:31 ART.
- La URL publicada `https://stockeador-client-1nll.vercel.app/` responde 200 HTML.
- La aplicacion cargo y finalizo la consulta de campanias: mostro estado vacio controlado, login y escaneo deshabilitado sin campania; no hubo falso estado de carga permanente.
- Los assets JS/CSS publicados coinciden byte a byte por SHA-256 con los artefactos `dist` del checkout frontend en `ce8e812`.
- Un rebuild local adicional no completo en este sandbox porque `esbuild` recibio acceso denegado al resolver `vite.config.js`; no se interpreta como fallo del producto porque el CI remoto limpio de `ce8e812` si completo build y quedo verde.
- La consola Vercel directa requirio login en esta sesion. La evidencia de estado del commit, respuesta publica y equivalencia de bundle fue suficiente; no se disparo redeploy.

## Restore drill Neon

- Proyecto verificado: `control-atributos-db`, PostgreSQL 17, plan Free.
- Se creo la rama aislada `r61-restore-drill`, hija de `production`, con auto-delete el 03/10/2026 13:06 ART.
- Se creo en esa rama la DB destino `r61_restore_drill`; el nombre satisface el guardrail del runner.
- Guardrail probado con URLs ficticias iguales: rechazo correcto `Source and restore URLs must be different`, antes de abrir conexiones.
- Ejecucion real: el origen fue `production/neondb` solo para `pg_dump`; el destino fue la DB aislada. Las URLs se transfirieron en memoria y no se imprimieron ni persistieron.
- Primer intento: FAIL seguro en `pg_dump` (`exit 1`), antes de `pg_restore` y antes de validar tablas/migraciones, usando herramientas locales PostgreSQL 16.3 contra Neon PostgreSQL 17.
- Repeticion con herramientas PostgreSQL 17.11 y conexiones directas: PASS.
- Destino validado: rama aislada `r61-restore-drill`, DB `r61_restore_drill`.
- Resultado real sanitizado: `pg_dump` OK, `pg_restore` OK, tablas esperadas OK (`Campania`, `Maestro`, `Escaneo`, `Actualizacion`) y `prisma migrate status` OK con 10 migraciones; schema al dia.
- Ventana del drill exitoso: inicio `2026-10-02T23:26:34.540Z`, fin `2026-10-02T23:27:34.903Z`.
- Se ajusto `scripts/restore-drill.mjs` para ejecutar Prisma via `node node_modules/prisma/build/index.js`, evitando fallos de `spawn npx`/`.cmd` en Windows.
- No se altero produccion; se leyo solo como origen de `pg_dump`. La escritura/restauracion fue sobre DB aislada.
- El puente local efimero usado para no exponer credenciales fue detenido y eliminado. Las credenciales no quedaron en archivos ni documentacion.

## Fase 0 de piloto

No ejecutada. No se crearon productos, SKUs, sucursales, usuarios ni campania `PILOTO-STAGING-R61`/`TEST-R61`.

Los dos gates que bloqueaban Fase 0 quedaron cerrados despues de esta continuacion:

1. CI backend remoto verde en PR #28 y mergeado a `main`.
2. Restore drill real completado con PostgreSQL 17.11 contra DB aislada.

## Proximo paso seguro

1. Versionar la evidencia sanitizada y el fix Windows del runner.
2. Preparar datos ficticios `PILOTO-STAGING-R61` / `TEST-R61` en entorno aislado/controlado.
3. Ejecutar Fase 0 completa: activar campania, congelar snapshot, escanear, revisar, cerrar, verificar aplicacion y auditoria.
