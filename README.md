# Backend - Control de Campana (Express + Prisma + PostgreSQL)

## Setup
Solo para una base local/de prueba identificada. `npm run seed` borra datos y no debe ejecutarse en producción.
```bash
npm install
npm run prisma:generate
npm run migrate:local
npm run seed
npm run dev
```
API: `http://localhost:4000`

## Migraciones segun entorno
- Local/desarrollo (crea nuevas migraciones): `npm run migrate:local -- --name nombre_cambio`
- Render/produccion (solo aplica migraciones existentes): `npm run migrate:render`
- Ver estado: `npm run prisma:status`

## Variables de entorno
- `DATABASE_URL`: obligatorio y debe ser PostgreSQL (`postgresql://...` o `postgres://...`).
- `ADMIN_TOKEN`: token administrador.
- `PORT`: puerto del servidor.
- `CORS_ORIGIN` o `CORS_ORIGINS`: origen/es permitidos para frontend (separados por coma).
- También se combinan `FRONTEND_URL` y `APP_URL`, manteniendo compatibilidad con la configuración remota.
- `READ_TIMEOUT_MS`: deadline HTTP de GET/HEAD bajo `/api`, 7000 ms por defecto (antes de los timeouts 8/10 s del frontend).
- `READINESS_TIMEOUT_MS`: límite de espera de readiness, 2000 ms por defecto. Ambos límites aceptan enteros de 1 a 120000 ms.
- `RENDER_GIT_COMMIT` o `APP_VERSION`: versión pública del build; si no existen se informa `unknown`. No colocar secretos aquí.
- `CORS_ALLOW_ALL=true`: opcional, permite cualquier origen (no recomendado).
- `ADMIN_AUTH_BYPASS_DEV=true`: opcional para desarrollo, omite auth admin cuando `NODE_ENV != production`.

## Seguridad aplicada
- Rutas de escritura critica (campanas/imports/admin) solo bajo `/api/admin/*`.
- En produccion, auth admin siempre obligatoria.
- En desarrollo, solo hay bypass si se habilita explicitamente `ADMIN_AUTH_BYPASS_DEV=true`.
- CORS no queda abierto por defecto: usa allowlist configurada (o localhost en desarrollo).

## Endpoints publicos
- `GET /api/health`
- `GET /api/diccionarios`
- `GET /api/campanias`
- `GET /api/campanias/:id/maestro/:sku`
- `GET /api/maestro`
- `GET /api/maestro/:sku`
- `POST /api/escaneos`

## Endpoints admin (mutaciones)
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `POST /api/admin/campanias`
- `POST /api/admin/campanias/:id/activar`
- `PATCH /api/admin/campanias/:id`
- `POST /api/admin/diccionarios/import-file`
- `POST /api/admin/maestro/import-file`
- `POST /api/admin/diccionarios/import-json`
- `POST /api/admin/maestro/import-json`

## Disponibilidad y pruebas

`src/app.js` exporta `createApp({ prisma, env, logger })` sin conectar DB ni abrir puerto al importar. `src/server.js` conserva el arranque con Prisma y dotenv.

- `/health` y `/api/health`: alias existentes, responden `{ "ok": true }`; solo liveness.
- `/health/live` y `/api/health/live`: liveness con versión del build.
- `/health/ready` y `/api/health/ready`: `SELECT 1` real, 200 si responde y 503 ante error o timeout; no se cachean. No validan todas las tablas/migraciones.
- `X-Request-Id` identifica cada petición y se expone mediante CORS. Los errores propagados al middleware central incluyen `error`, `code` y `requestId`; el helper de errores administrativos devuelve JSON compatible con el frontend.
- Los routers capturan rechazos async en Express 4. Los logs del middleware omiten bodies, queries y mensajes Prisma crudos. Algunos controladores heredados aún tienen captura/logging propio; su migración completa queda pendiente.
- El deadline devuelve 503 para lecturas pendientes, **no cancela Prisma ni revierte datos**. Las mutaciones no se interrumpen automáticamente. El GET de snapshot heredado todavía puede escribir: se corregirá en R1.4.

```bash
npm test
```

Pruebas HTTP sobre loopback y DB simulada; no leen `.env` ni requieren una DB real. No sustituyen integración PostgreSQL ni smoke del despliegue.

Plan/avance: [docs/development/ROADMAP.md](docs/development/ROADMAP.md) y [docs/development/STATUS.md](docs/development/STATUS.md).
Procedimiento de diagnóstico: [docs/development/RUNBOOK_RENDER.md](docs/development/RUNBOOK_RENDER.md).
