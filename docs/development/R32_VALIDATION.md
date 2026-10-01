# Validación R3.2

Fecha: 01/10/2026. Estado: `COMPLETADO_LOCAL`; no publicado ni validado en producción en esta continuación.

## Alcance implementado

- Las exportaciones TXT finales exigen campaña `CERRADA` con `closedAt`; una campaña activa o borrador responde `409`.
- Los nombres de archivo son repetibles por cierre: usan nombre de campaña, atributo y `closedAt`, no el momento de descarga.
- `scope=applied` exporta solo decisiones `aplicada` con `appliedAt`, tomando el último evento por SKU/atributo y omitiendo valores sin cambio.
- `scope=unknown` exporta solo altas desconocidas `APPROVED` que realmente fueron aplicadas al maestro (`appliedToMaestroAt`).
- El resumen TXT diferencia aplicados, altas aplicadas, pendientes vigentes, rechazos y desconocidos rechazados/fusionados.
- Descargar de nuevo no escribe ni marca nada; las rutas son lecturas repetibles.

## Pruebas

Comandos ejecutados:

```powershell
npx prisma validate --schema prisma\schema.prisma
npm test
git diff --check
```

Resultado backend: **68 tests, 65 PASS, 3 SKIP**.

Nuevas regresiones R3.2:

- exportar TXT de una campaña no cerrada devuelve `409`;
- exportar aplicados y altas aprobadas separa correctamente `scope=applied` y `scope=unknown`;
- el nombre del archivo TXT usa `closedAt` y por lo tanto es repetible;
- el resumen diferencia aplicados, altas, pendientes, rechazos y desconocidos rechazados/fusionados.

## Límites

No se ejecutó PostgreSQL aislado ni staging en esta continuación. La exportación se mantiene en tres TXT separados más resumen; un archivo comprimido único queda pendiente si se decide agregar dependencias o un empaquetado binario en una etapa posterior.
