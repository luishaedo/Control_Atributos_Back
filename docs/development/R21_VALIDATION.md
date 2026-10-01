# Validación R2.1

Fecha: 01/10/2026. Estado: `COMPLETADO_LOCAL`; no validado en PostgreSQL real, staging ni producción.

## Contrato implementado

- D-B04 aprobada: cuenta individual, sucursal asignada, roles `OPERADOR`, `REVISOR` y `ADMIN`.
- Nuevos modelos: `Sucursal`, `Usuario` y `Sesion`.
- Login por `username/password` crea cookie `cc_session` httpOnly.
- Logout revoca la sesión actual y limpia cookies.
- Las sesiones tienen vencimiento, hash de token, `revokedAt` y `lastSeenAt`.
- Admin puede listar/crear/actualizar sucursales y usuarios; resetear password revoca sesiones activas del usuario.
- Rutas por rol: `ADMIN` administra campañas, importaciones, exportaciones, cierre y usuarios; `REVISOR` puede revisar, decidir, confirmar y gestionar desconocidos; `OPERADOR` queda reservado para escaneo.
- `POST /api/escaneos` requiere sesión y deriva actor/sucursal del servidor. El body ya no decide `email` ni `sucursal`.
- Endpoints públicos de sesión para operación: `POST /api/session/login`, `GET /api/session` y `POST /api/session/logout`, válidos para `OPERADOR`, `REVISOR` y `ADMIN`.
- En mutaciones protegidas, `decidedBy`, `updatedBy` y `closedBy` se sobreescriben con el actor autenticado.
- El token `ADMIN_TOKEN` heredado queda como bootstrap/compatibilidad controlada, no como identidad operativa final.
- Frontend adaptado a sesión real: escáner y panel admin usan usuario/password y cookie `HttpOnly`; el escaneo envía credenciales por cookie y no manda `email`/`sucursal` en el body. La clave idempotente del intento ya no depende de identidad editable local.

## Esquema

Migración `20261001010000_r21_identity_sessions`:

- crea `Sucursal` con `codigo` único;
- crea `Usuario` con `username` único, `rol`, `activo`, `passwordHash` y relación opcional a sucursal;
- crea `Sesion` con `tokenHash` único, vencimiento y revocación;
- agrega índices para rol, sucursal, vencimiento y revocación.

## Pruebas

Comandos ejecutados:

```powershell
npx prisma validate
npm test
```

Resultado backend final: **62 tests, 59 PASS, 3 SKIP**.

Los skips son las integraciones PostgreSQL aisladas R1.2/R1.3/R1.4 cuando no se proveen sus `*_TEST_DATABASE_URL`; no validan ni invalidan R2.1. La cobertura R2.1 prueba login real por usuario/password, cookie de sesión, identidad servida por `/api/admin/ping`, logout con revocación, bloqueo `403` de un `REVISOR` en rutas admin-only y endpoints públicos de sesión para `OPERADOR`.

Comandos frontend ejecutados con permisos ampliados porque Vite/esbuild no podía leer `vite.config.js` dentro del sandbox restringido:

```powershell
npm test
npm run lint
npm run build
```

Resultado frontend final: **7/7 PASS**, build Vite correcto con 388 módulos, lint con **0 errores / 42 advertencias heredadas**.

## Límites y próximo paso

No se ejecutó la migración R2.1 en PostgreSQL aislado: `psql` no está disponible en PATH y no se preparó un cluster local nuevo en esta continuación. No hubo deploy ni acceso a staging/producción. Próximo paso: validar migración y flujos R2.1 contra PostgreSQL aislado con fixtures de usuario/sucursal; luego publicar y validar en staging con autorización separada.
