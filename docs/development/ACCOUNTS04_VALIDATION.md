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

El usuario autorizó publicar las ramas `feat/accounts-administration`: backend `8e9996e6760dba9b2f78cb9f634cdd1ce85a3017`, [PR borrador #32](https://github.com/luishaedo/Control_Atributos_Back/pull/32); frontend `db24acf8d70929d1e06b0c9f8f0f56e7434b9f52`, [PR borrador #54](https://github.com/luishaedo/Control_Atributos_Front/pull/54). Ambas ramas están en GitHub; `main` permanece intacto. CI de ambos PR terminó con éxito. Prisma validó el esquema; backend sin PostgreSQL opt-in: 91 PASS/8 SKIP; frontend lint 0 errores/38 advertencias previas, tests 17/17 PASS y build PASS con API local.

Render `control-atributos-staging` (`srv-datd8aek1f9s73fqp9fg`) sigue en `r13-atributos-staging`, commit publicado `594ce7aa4c01402b147f52383d0b7b733a1c974b`, Auto-Deploy desactivado. Build: `npm ci && npx prisma generate`; start: `npm run start`, que ejecuta `prisma migrate deploy`. Se comprobó que `DATABASE_URL` apunta a la base aislada `r02_prisma_validation` en Neon; la credencial se mostró accidentalmente en la salida de la herramienta durante esa comprobación y debe rotarse antes de desplegar. No se guardó en archivos ni se usó para conectar. No ejecutar migraciones sobre ese destino hasta resolver la rotación y revisar el estado real del esquema.

La revisión automática había rechazado dos intentos de publicar la rama backend en GitHub público. Tras autorización explícita del usuario se publicaron ambas ramas por `git push`, sin modificar `main`. La guía `computer-use` exige que el usuario haga personalmente el cambio de credenciales en la interfaz; se solicitó rotar la contraseña Neon de staging y actualizar `DATABASE_URL` en Render sin compartir el valor. Faltan esa rotación, despliegue controlado, prueba de navegador y aprobación operativa. D-B09 deja fuera de alcance limitar intentos.
