# Staging R0.2 — Render + Neon

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
