# R0.2 — diagnóstico remoto, 27/09/2026

Estado: diagnóstico parcial confirmado; producción NO recuperada. Inspección de solo lectura por Codex.

## Evidencia

- Render: servicio `Control_Atributos_Back`, región Oregon, plan Free, rama main. Último deploy exitoso/live: `266cea59f089fd1bc42aa4850d924de51dce5167`. R0.1 local todavía no publicado.
- Build: `npm ci && npx prisma generate`. Start: `npm run start`. Pre-deploy vacío/no disponible en este plan. Health configurado: `/api/health` (solo proceso).
- Variables presentes: ADMIN_TOKEN, CORS_ORIGINS, DATABASE_URL, NODE_ENV. Valores permanecieron ocultos; no se verificó su contenido.
- Panel de logs, ventana 24 horas: el 26/09 a las 22:16 aparecen errores Prisma P2021: faltan `public.DicCategoria`, `public.DicClasif` y `public.Campania`; también `Unhandled rejection`. Horas tal como las muestra el panel.
- El 27/09 a las 14:25:10 el arranque informa `DB connected` y escucha HTTP. Esto acredita conexión, no integridad del esquema.
- Smoke inicial: seis timeouts de 10 s y admin 401. Coincide temporalmente con arranque del servicio; compatible con cold start, sin atribuir todos los fallos a ello.
- Smoke posterior con proceso activo: health 200 (356 ms), admin 401 (278 ms), CORS correcto; nuevos live/ready 404, campañas/diccionarios/maestro timeout a 10 s. Evidencia JSON adjunta sin cuerpos de negocio.

## Interpretación y límites

Está confirmada la ausencia de tablas esperadas en la base/esquema consultado por el despliegue. Los errores async sin respuesta explican los timeouts funcionales del build antiguo. No es un fallo general de conectividad ni se corrige ampliando CORS.

Los comandos configurados no aplican migraciones. Aún no está probado si nunca se aplicaron, si DATABASE_URL apunta a otra base/esquema o si hubo cambios posteriores. No se identificó proveedor/proyecto DB: el listado del workspace Render muestra cuatro servicios web y ninguna base PostgreSQL. Esto no descarta otra cuenta/proveedor.

La revisión estática de las ocho migraciones versionadas muestra creación de tablas, índices, FK y agregado de columnas; no se ejecutaron contra PostgreSQL. No se verificaron `_prisma_migrations`, checksums, permisos, tablas existentes ni runtime Node del deploy.

## Neon: inventario de solo lectura

El usuario confirmó Neon. Panel: proyecto `control-atributos-db` (`fragrant-feather-11219369`), única rama `production` (`br-soft-resonance-anuzx1go`), base `neondb`, PostgreSQL 17, plan Free, AWS N. Virginia. Render está en Oregon: registrar distancia regional para futuras mediciones, no atribuirle el error de tablas.

Se ejecutaron dos SELECT de metadatos en el editor SQL, sin DDL/DML. El primero listó tablas fuera de pg_catalog/information_schema: cero filas. El segundo confirmó `current_database()=neondb`, `current_schema()=public`, `visible_user_tables=0` y referencias nulas a `public.Campania` y `public._prisma_migrations`. No hay historial Prisma que consultar en public. Esto describe los objetos visibles al rol del editor; no prueba por sí solo que DATABASE_URL en Render apunte exactamente a ese endpoint.

No se ejecutó el ejemplo de CREATE/INSERT que Neon muestra por defecto: fue reemplazado por SELECT antes de Run. No hay PostgreSQL/psql/Docker disponibles en PATH local. Para validar migraciones se necesita un entorno aislado identificado, por ejemplo una rama de pruebas Neon con sus límites de plan verificados antes de crearla.

## Reparación preparada, aún no ejecutada

1. Identificar proveedor/proyecto y confirmar cuál es la base destinada a esta app, sin publicar credenciales.
2. En su consola SQL, ejecutar solamente el inventario de `scripts/inspect-schema.sql`. Leer historial `_prisma_migrations` solo si existe. Confirmar esquema, estado y posible uso compartido; respaldar antes de cualquier modificación.
3. Si el destino es incorrecto, corregir la configuración hacia la base verificada. Si es correcto y faltan migraciones, probar las ocho migraciones en PostgreSQL aislado antes de aplicar el plan al destino autorizado. No usar reset, seed, db push ni marcar migraciones como aplicadas a ciegas.
4. Publicar R0.1 únicamente con autorización, registrar SHA y verificar health/live/ready más consultas funcionales. Separar publicación de código de reparación del esquema.
5. Cerrar R0.2 solo tras staging aislado y tres smoke exitosos, uno después de reinicio controlado. No reiniciar producción para fabricar evidencia de staging.

Archivos de evidencia: `smoke-production-2026-09-27.json` y `smoke-production-warm-2026-09-27.json`. No hubo push, deploy, cambio de configuración ni escritura DB.
