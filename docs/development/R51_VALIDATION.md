# R5.1 - Runtime, dependencias y CI

Fecha: 02/10/2026.
Responsable: Codex/01a0f1e5.
Estado: COMPLETADO_LOCAL.

## Alcance

R5.1 cierra H11/H12 en el repositorio: runtime soportado, vulnerabilidades evaluadas/corregidas, barreras CI versionadas y build/config verificables.

No se ejecutaron seeds, resets, migraciones sobre DB real ni cambios de datos. No se publico Render/Vercel en esta entrega.

## Runtime

Se fija Node `>=24 <25` en backend y frontend, con `.nvmrc` en ambos repos.

Motivo: a la fecha de cierre, Node 20 esta End-of-Life y Node 24 es una linea LTS activa. La configuracion nueva alinea local/CI con una linea soportada y evita seguir ampliando el rango a versiones EOL.

## Dependencias

Backend:

- `express` actualizado dentro de la linea 4.
- `multer` actualizado a linea 2.4.
- `csv-parse` actualizado a linea 7.
- `npm audit --json`: 0 vulnerabilidades.

Frontend:

- `react-router-dom` actualizado a version parcheada.
- `vite` actualizado a linea 6.4.
- `vitest` actualizado a linea 4.1 compatible con Node 24.
- `@vitejs/plugin-react` actualizado a linea 5.
- `npm audit --json`: 0 vulnerabilidades.

Se uso `npm audit fix` sin `--force` solo en frontend para transitivas de desarrollo. No se aceptaron peer dependencies rotas ni saltos forzados.

## CI

Se agregaron workflows versionados:

- Backend: `.github/workflows/ci.yml`
  - Node 24
  - `npm ci`
  - `npm run prisma:generate`
  - `npx prisma validate --schema prisma/schema.prisma`
  - `npm test`
  - `npm audit --omit=dev`

- Frontend: `.github/workflows/ci.yml`
  - Node 24
  - `npm ci`
  - `npm run lint`
  - `npm test`
  - `npm run build` con `VITE_API_URL=https://control-atributos-back.onrender.com`
  - `npm audit --omit=dev`

Tambien se agregaron scripts locales:

- Backend: `quality:check`, `audit:prod`.
- Frontend: `audit:prod`; `quality:check` ahora incluye auditoria productiva.

## Validacion local

Backend:

- `npx.cmd prisma validate --schema prisma\schema.prisma`: OK.
- `npm.cmd test`: 71 tests, 68 PASS, 3 SKIP.
- `npm.cmd audit --json`: 0 vulnerabilidades.

Frontend:

- `npm.cmd run lint`: 0 errores, 41 advertencias heredadas.
- `npm.cmd test`: 2 archivos, 7 tests PASS.
- `VITE_API_URL=https://control-atributos-back.onrender.com npm.cmd run build`: OK, 389 modulos transformados.
- `npm.cmd audit --json`: 0 vulnerabilidades.

Nota ambiental: Vitest y Vite build requieren ejecutarse fuera del sandbox restringido de archivos por un bloqueo de lectura de esbuild sobre `vite.config.js`. Con permisos de ejecucion local pasaron correctamente.

## Limites

- CI queda versionado, pero no ejecutado en GitHub hasta publicar los commits y observar una corrida remota.
- No se cambio la configuracion runtime de Render/Vercel en esta entrega.
- No se agrego PostgreSQL real al CI; las pruebas de integracion PostgreSQL siguen marcadas como separadas/omitidas si no hay DB aislada declarada.

## Proximo paso

R5.2: operacion y recuperacion. Debe cubrir backup/restore probado, RPO/RTO, rollback, monitoreo y responsable antes del piloto.
