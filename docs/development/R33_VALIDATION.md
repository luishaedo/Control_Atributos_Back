# R3.3 - Consenso y metricas

Fecha: 01/10/2026. Responsable: Codex/01a0f1e5. Estado: COMPLETADO_LOCAL.

## Decision aprobada

D-B06 quedo aprobada por el usuario: para consenso y metricas cuenta la ultima observacion valida por sucursal, SKU y atributo dentro de la campania. Cada sucursal pesa una vez por atributo. Todos los eventos se conservan para auditoria. El consenso se calcula por atributo, con porcentaje sobre sucursales observantes, maximo 100%, separando sin observacion, conflicto y empate. La decision final sigue siendo del revisor/admin y el consenso solo informa/prioriza.

## Implementacion

- Nuevo servicio `src/services/consenso.service.js` con una unica regla de agregacion para revision, auditoria y exportes.
- La llave de consenso es `campaniaId` implicito por consulta, `sku`, `sucursal` y atributo (`categoria_cod`, `tipo_cod`, `clasif_cod`).
- Para cada llave se conserva solo la observacion valida mas reciente por `ts` y, ante empate, por `id`.
- Los eventos completos de `Escaneo` no se modifican ni se eliminan; la deduplicacion existe solo para metricas.
- El consenso se informa por atributo con:
  - `totalObservantes`
  - `votosGanador`
  - `consensoPct` como ratio compatible con frontend existente
  - `consensoPorcentaje` como porcentaje 0..100
  - `estado`: `sin_observacion`, `consenso`, `conflicto` o `empate`
- El listado de revision conserva `propuestas` para compatibilidad, pero sus conteos ahora son por sucursal observante, no por cantidad cruda de escaneos.
- `discrepancias`, `discrepancias-sucursales` y sus CSV pasan a reportar atributos y sucursales observantes, separando conflicto/empate.
- `resumenAuditoria` calcula sugerencias y aceptacion desde observaciones deduplicadas; los rankings de escaneos siguen contando eventos crudos para auditoria operativa.

## Validacion local

Comandos ejecutados:

```powershell
npm.cmd test
npx.cmd prisma validate --schema prisma\schema.prisma
```

Resultados:

- `npm.cmd test`: 71 tests, 68 PASS, 3 SKIP.
- `npx.cmd prisma validate --schema prisma\schema.prisma`: schema valido.

Cobertura nueva:

- Una sucursal que escanea dos veces el mismo SKU/atributo pesa una sola vez con su ultima observacion.
- Dos sucursales 1-vs-1 quedan como `empate`, no como consenso falso.
- Conflicto sin empate se informa separado y el porcentaje queda acotado a 100.
- Atributos sin valor valido quedan como `sin_observacion` sin inventar votos.

## Limites

- No se ejecuto PostgreSQL aislado ni staging en esta entrega.
- No se publico en Render todavia desde este commit.
- El frontend sigue mostrando el badge historico con `consensoPct * 100`; por compatibilidad se mantuvo `consensoPct` como ratio y se agrego `consensoPorcentaje` para consumidores nuevos.
