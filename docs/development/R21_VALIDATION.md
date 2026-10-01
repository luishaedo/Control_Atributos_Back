# Validación R2.1

Fecha: 01/10/2026. Estado: `IMPLEMENTADO_LOCAL`; no validado en PostgreSQL real, staging ni producción.

## Contrato implementado

- D-B04 aprobada: cuenta individual, sucursal asignada, roles `OPERADOR`, `REVISOR` y `ADMIN`.
- Nuevos modelos: `Sucursal`, `Usuario` y `Sesion`.
- Login por `username/password` crea cookie `cc_session` httpOnly.
- Logout revoca la sesión actual y limpia cookies.
- Las sesiones tienen vencimiento, hash de token, `revokedAt` y `lastSeenAt`.
- Admin puede listar/crear/actualizar sucursales y usuarios; resetear password revoca sesiones activas del usuario.
- Rutas por rol: `ADMIN` administra campañas, importaciones, exportaciones, cierre y usuarios; `REVISOR` puede revisar, decidir, confirmar y gestionar desconocidos; `OPERADOR` queda reservado para escaneo.
- `POST /api/escaneos` requiere sesión y deriva actor/sucursal del servidor. El body ya no decide `email` ni `sucursal`.
- En mutaciones protegidas, `decidedBy`, `updatedBy` y `closedBy` se sobreescriben con el actor autenticado.
- El token `ADMIN_TOKEN` heredado queda como bootstrap/compatibilidad controlada, no como identidad operativa final.

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

Resultado final: **61 tests, 58 PASS, 3 SKIP**.

Los skips son las integraciones PostgreSQL aisladas R1.2/R1.3/R1.4 cuando no se proveen sus `*_TEST_DATABASE_URL`; no validan ni invalidan R2.1. La nueva cobertura R2.1 prueba login real por usuario/password, cookie de sesión, identidad servida por `/api/admin/ping`, logout con revocación y bloqueo `403` de un `REVISOR` en rutas admin-only.

## Límites y próximo paso

No se ejecutó la migración R2.1 en PostgreSQL aislado. No hubo deploy ni acceso a staging/producción. El frontend todavía debe adaptarse a login por usuario/password, expiración de sesión, permisos y escaneo autenticado. Próximo paso: validar migración y flujos R2.1 contra PostgreSQL aislado, agregar fixtures de usuario/sucursal y luego publicar/validar en staging con autorización separada.
