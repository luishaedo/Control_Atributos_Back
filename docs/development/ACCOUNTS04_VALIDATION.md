# ACCOUNTS-04 — validación operativa de cuentas

Fecha: 03/10/2026. Responsable: Codex/01a1024d. Estado: ensayo HTTP local con PostgreSQL aislado aprobado; **staging no validado**.

## Ensayo local ejecutado

`test/accounts.postgres.test.js` incluye un circuito HTTP real de Express contra un PostgreSQL 16 temporal en `127.0.0.1:55440/accounts_isolated`. Comprueba CORS con credenciales desde `http://localhost:5173`, cookie de sesión, alta de sucursal y operador, cambio obligatorio de clave, bloqueo de operaciones autenticadas, revocación de todas las sesiones tras cambio/restablecimiento, rechazo de la clave anterior, permisos ADMIN/REVISOR, desactivación y reactivación de usuario y sucursal, expiración de sesión, conservación del último ADMIN activo y auditoría sin claves. Usa cuentas ficticias únicas y elimina sus fixtures al terminar.

Resultado: `npm test` 95 PASS/4 SKIP; la nueva prueba ACCOUNTS-04 pasó. Se aplicaron 12 migraciones únicamente al clúster temporal. Conteo final: 0 usuarios, 0 sucursales, 0 sesiones, 0 eventos. El clúster se detuvo y eliminó. Esta evidencia no prueba el navegador ni la API desplegada.

## Guía de validación en staging

1. Confirmar que el servicio Render de staging apunta exclusivamente a la base aislada designada y que la revisión desplegada corresponde al backend de Cuentas. Registrar SHA y versión. No ejecutar el flujo contra producción.
2. Verificar que las migraciones de auditoría y rotación estén aplicadas en esa base de staging mediante el procedimiento operativo aprobado. No ejecutar `seed`, `reset` ni una migración contra un destino sin verificar.
3. Desde un frontend de prueba con `VITE_API_URL` dirigido a staging, comprobar CORS y cookies en el navegador. No colocar contraseñas ni tokens en `VITE_*`, capturas o reportes.
4. Con un ADMIN ficticio, crear sucursales de prueba con códigos únicos y usuarios ficticios OPERADOR, REVISOR y ADMIN. Confirmar que listados y respuestas omiten hashes y contraseñas y que la auditoría no contiene secretos.
5. Ingresar con la clave inicial: debe abrirse el cambio obligatorio; las acciones autenticadas deben responder 403 hasta completar el cambio. Confirmar cierre de sesiones y nuevo ingreso con la clave cambiada.
6. Restablecer la clave desde ADMIN y repetir el primer ingreso. Comprobar que la clave anterior no permite entrar y que la sesión previa responde 401.
7. Cambiar rol, desactivar/reactivar usuario y desactivar/reactivar sucursal. Verificar permisos, revocación y recuperación mediante nuevo ingreso. Intentar degradar o desactivar el último ADMIN activo: debe responder 409.
8. Verificar cierre voluntario y vencimiento de sesión, mensajes 401/403 en frontend y comportamiento responsive. Registrar evidencia sanitizada, sin cookies ni cuerpos con contraseñas.

Para la preparación de aproximadamente siete sucursales: acordar códigos y responsables reales antes de crearlas, cargar primero las sucursales, después un ADMIN de respaldo y usuarios individuales por rol/sucursal. La ejecución inicial debe preservar al menos un ADMIN activo en todo momento. Usar cuentas ficticias en staging y no copiar datos operativos a esa base.

## Pendientes

El backend/frontend de Cuentas está sin commit ni publicación; el servicio staging existente no contiene esta revisión. Faltan despliegue controlado, verificación de destino de base, prueba de navegador y aprobación operativa. D-B09 deja fuera de alcance limitar intentos.
