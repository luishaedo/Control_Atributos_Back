# R0.1 / R0.2 — diagnóstico y validación de disponibilidad

Estado: procedimiento preparado; ningún deploy se ejecutó como parte de R0.1.

Diagnóstico del 27/09: ver `DIAGNOSTICO_RENDER_2026-09-27.md`. Render conecta a DB pero Prisma informa tablas ausentes. Resolver inventario/destino/migraciones antes de declarar disponibilidad.

## Smoke reproducible de solo lectura

Desde backend: `npm run smoke -- --base https://control-atributos-back.onrender.com --origin https://stockeador-client-1nll.vercel.app --expected-version SHA_PUBLICADO --out resultado.json`.

Hace siete GET, máximo tres concurrentes, sin credenciales/reintentos; comprueba contrato JSON, CORS, versión y auth. Guarda solo metadatos, nunca cuerpos de negocio. Sale con código 1 ante fallo; un fallo de red local no demuestra caída remota. Timeout por petición: 10 s (`--timeout` configurable hasta 60 s). En Free distinguir cold start de una segunda comprobación con proceso activo. Los nuevos health dan 404 hasta publicar R0.1.

## Antes de desplegar

1. Revisar diff y ejecutar `npm test` desde backend. La entrega R0.1 no agrega migraciones ni dependencias.
2. Registrar SHA del backend y frontend publicados, versión Node, plan de servicio, comando build/start y configuración del health check. No copiar valores secretos al registro.
3. En Render, consultar logs de la petición `/api/campanias` y errores Prisma/conexión. Verificar que PostgreSQL pertenece al ambiente esperado, está disponible y sus migraciones coinciden. No ejecutar seed/reset para reparar un timeout.
4. Comprobar `DATABASE_URL` mediante el panel seguro sin imprimirla, `NODE_ENV=production`, token admin configurado y CORS con el origen Vercel. En el repositorio actual `CORS_ALLOW_ALL` todavía existe por compatibilidad: mantenerlo desactivado.
5. El proyecto todavía declara Node >=18 <21. La migración a runtime soportado es R5.1; no cambiar el runtime a ciegas dentro del diagnóstico.
6. Publicar primero en staging aislado cuando esté disponible. R0.2 incluye preparar ese ambiente; su existencia no se presume.

## Endpoints después de una publicación autorizada

| Consulta | Esperado | Interpretación |
|---|---|---|
| GET `/health` | 200 `{ok:true}` | Proceso HTTP responde; no prueba DB. |
| GET `/api/health/live` | 200, `version` SHA esperado | Build identificado; `unknown` requiere configurar versión. |
| GET `/api/health/ready` | 200, `database:up` | La DB ejecuta SELECT 1 dentro del plazo. No certifica migraciones/tablas. |
| GET `/api/campanias` | 200 `{items:[...]}` | Consulta funcional; array vacío puede ser legítimo. |
| GET `/api/diccionarios` | 200, tres listas | Consulta funcional de diccionarios. |
| GET `/api/maestro?page=1&pageSize=1` | 200, items/total | Consulta funcional de catálogo. |
| GET `/api/admin/ping` sin sesión | 401 | Auth administrativa sigue vigente. |

Repetir smoke tres veces y una después de reinicio controlado, en staging primero. Registrar hora, versión, estado/latencia y requestId, no datos de negocio. Verificar carga real desde Vercel con el navegador.

Mantener inicialmente el health configurado existente; cambiarlo conscientemente a `/api/health/ready` una vez verificado su efecto en el proveedor. Un fallo DB deja readiness en 503 aunque el proceso siga vivo.

## Diagnóstico por resultado

- Live 200 + ready 503: investigar conexión/pool/DB y consultar logs; no ampliar CORS como solución.
- Ready 200 + campañas 500: revisar consulta/modelo/migraciones. SELECT 1 no comprueba tablas.
- `READ_TIMEOUT` 503: petición superó `READ_TIMEOUT_MS`; correlacionar ID y latencia con logs DB. La operación puede continuar en segundo plano.
- `DATABASE_UNAVAILABLE` 503 en handler: fallo de disponibilidad Prisma propagado; logs estructurados permiten correlación sin revelar URL de conexión.
- Respuesta HTTP directa correcta, navegador falla: revisar origen permitido, HTTPS, cookies y configuración VITE_API_URL del build. No desactivar autenticación.
- 404 en nuevos health: probablemente se sigue sirviendo un build anterior; comprobar versión publicada.

## Límites explícitos

- Readiness mantiene máximo una query pendiente por proceso; si queda atascada se siguen devolviendo 503 sin crear más probes. Si se resuelve, se permite nueva consulta.
- Promise.race acota la espera HTTP, no cancela SQL. Configurar/validar connect/pool/statement timeout del proveedor en R0.2. El deadline general tampoco impide que varias lecturas funcionales acumulen consultas; monitorear pool/carga.
- No reintentar escrituras automáticamente: falta completar idempotencia/transacciones en R1.2/R1.4.
- La aplicación todavía conecta Prisma antes de escuchar al arrancar: si la conexión inicial falla, los health no estarán disponibles; revisar logs de arranque.
- Los errores que ya capturan los controladores conservan su política propia salvo el formato JSON del helper común. R0.1 captura los rechazos que antes escapaban.
- No atribuir al código nuevo la recuperación de producción sin publicación y evidencia.

## Reversión

Como no hay cambio de esquema en R0.1, una reversión de código puede volver al build anterior sin migración inversa. Registrar el SHA y restaurar el health path compatible si fue cambiado. Esto no arregla el incidente DB previo. No restaurar/borrar bases como parte automática del rollback del código.
