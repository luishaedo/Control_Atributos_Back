# Staging R0.2 — Render + Neon

## R1.3 — despliegue 29/09/2026

Rama exclusiva `r13-atributos-staging`, commit `520cd35d33a3be2e7ca1d90adc745880d0d53eff`, deploy manual `dep-dau2pc97lnhs73f705eg`, Live tras 43,3 s. Auto-Deploy permanece Off; build/start/DB/CORS/token sin cambio. No se publicó main ni se desplegó producción. Evidencia: r13-staging-deployed.png.

Smoke de disponibilidad: smoke-r13-staging.json, 7/7 PASS, SHA exacto y CORS/auth/readiness válidos, 213–783 ms. No equivale a validación remota de escrituras R1.3. El verificador scripts/validate-r13-staging.mjs pasó 12 escenarios/58 HTTP contra API local y PostgreSQL aislado antes de publicarse; suite 57/57 PASS.

Validación de escrituras pendiente de autorización específica solicitada tras rechazo de revisión automática: crear campaña inactiva TEST-R13 y 11 SKUs únicos en r02_prisma_validation, conservar fixtures, no borrar datos existentes. El primer preflight desde el entorno del navegador no pudo acceder a la red (EACCES); ningún fixture creado, evidencia r13-staging-preflight-environment-failure.json. Se preparó scripts/run-r13-staging-memory.mjs para ejecutar por canal IPC local efímero sin persistir credenciales. Ejecución remota de ese runner bloqueada antes de comenzar. No se crearon archivos de credenciales.

## Configuración y validación inicial R0.2

Preparación: 28/09/2026, Codex/coordinador. Autorización explícita del usuario para desplegar y verificar staging.

- Servicio Render: `control-atributos-staging`, `srv-datd8aek1f9s73fqp9fg`, Oregon, Free (0 USD/mes de instancia); sujeto a cuotas y suspensión por inactividad.
- URL: https://control-atributos-staging.onrender.com
- Primer deploy: `dep-datd8amk1f9s73fqpaf0`, fuente main pública, SHA `487a0e9e9ee97ab306f133aee7b3792d68e75783`.
- Build: `npm ci && npx prisma generate`; start: `npm run start`; health: `/api/health`. Auto-Deploy Off, cambios publicados por acción manual.
- Neon: rama `r02-migration-validation` (`br-crimson-poetry-an1ipez1`), DB `r02_prisma_validation`, endpoint pooled `ep-curly-shape-anyk4jwe-pooler.c-6.us-east-1.aws.neon.tech`. Destino cotejado antes de enviar a Render. Esquema/historial previamente validados: ocho migraciones, cero diferencias (ver migration-validation/RESULTS.md).
- Variables: DATABASE_URL exclusiva de la rama aislada; NODE_ENV=production; CORS_ORIGIN=http://localhost:5173; ADMIN_TOKEN aleatorio independiente. Valores secretos guardados únicamente en configuración del servicio, no en este documento ni Git. No compartir token con producción.
- No se crearon cuentas/roles DB ni se cambiaron credenciales existentes. No se modificó producción ni Vercel. No se ejecutaron seed/reset/migraciones adicionales.
- El servicio es API staging; no incluye otro frontend Vercel. Para usar el frontend local, compilar/configurar VITE_API_URL con la URL staging y usar origen localhost:5173. No apuntar el frontend productivo a esta base.
- Migraciones futuras: validar en DB aislada antes, ejecutar migrate deploy con destino comprobado y registrar SHA/historial; no usar migrate dev/reset en el servicio. Free no permite pre-deploy command; no se añadió migración al arranque.

## Verificación

Render confirmó Live; logs DB connected y API listening on port 10000. Build Node 20.20.2 y Prisma 5.22.0. Pruebas locales npm test: 22/22 el 28/09. smoke-staging-1.json y smoke-staging-2.json: 7/7 PASS cada uno, SHA exacto, JSON/CORS correctos, admin 401. Reinicio confirmado por evento Render el 28/09 a las 17:57 ART; smoke-staging-3-restart.json pasa 7/7 a las 20:57:55 UTC. Total 21/21 consultas remotas correctas, latencias 241–925 ms. Captura staging-render-verified.png. R0.2 VALIDADO_STAGING y cerrado en su alcance de disponibilidad; no certifica flujos de negocio, carga ni seguridad integral. Secretos temporales en memoria/clipboard limpiados al terminar; no se escribieron archivos de credenciales.
