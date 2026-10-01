# R4.2 - Rendimiento medido

Fecha: 01/10/2026.
Responsable: Codex/01a0f1e5.
Estado: COMPLETADO_LOCAL con benchmark reproducible.

## Alcance

R4.2 toma el hallazgo H14: revisiones y auditoria cargan escaneos, snapshots y decisiones completos y agregan en memoria. Antes de optimizar a ciegas se agrego un benchmark local reproducible para medir el volumen objetivo del roadmap.

No se uso base real, `.env`, credenciales ni datos productivos. El dataset es ficticio `TEST-R42` generado en memoria.

## Dataset

- 7.594 SKUs.
- 7 sucursales.
- 53.158 escaneos ficticios.
- 7.594 snapshots de maestro de campania.
- 584 decisiones ficticias.
- 3 atributos por escaneo.
- 159.474 observaciones logicas esperadas para consenso.

## Comando

```powershell
npm.cmd run benchmark:r42 -- --out docs\development\r42-benchmark-20261001.json
```

Tambien se puede ajustar el volumen:

```powershell
npm.cmd run benchmark:r42 -- --skus 100 --branches 7 --runs 3 --warmup 1 --concurrentSessions 3
```

## Resultado local

Ambiente: Windows, Node `v24.20.0`.

| Medicion | p95 | Max | Resultado |
|---|---:|---:|---|
| `revisiones.listar` | 693,35 ms | 781,54 ms | PASS |
| `revisiones.discrepancias` | 970,38 ms | 1.318,19 ms | PASS |
| `revisiones.discrepanciasSuc` | 591,59 ms | 681,30 ms | PASS |
| `revisiones.resumenAuditoria` | 663,82 ms | 714,32 ms | PASS |

El objetivo local inicial era p95 menor a 2.000 ms en caliente. Los cuatro endpoints medidos quedaron por debajo.

Chequeos logicos:

- Escaneos esperados: 53.158; medidos: 53.158.
- Observaciones logicas esperadas: 159.474; medidas: 159.474.
- Items esperados: 7.594; medidos: 7.594.
- `consensoPorcentaje` siempre dentro de 0..100.
- Resultado global: PASS.

Rafaga caliente simulada:

- 21 invocaciones concurrentes a `revisiones.resumenAuditoria`.
- Tiempo total: 14.057,32 ms.
- Promedio de pared por sesion: 669,40 ms.
- Resultado: PASS contra objetivo promedio local de 2.000 ms.

Evidencia completa: `docs/development/r42-benchmark-20261001.json`.

## Que mide

- Generacion local de fixture del tamano objetivo.
- Controladores reales de revisiones con Prisma falso en memoria.
- Agregacion real de consenso (`buildConsensusReport`).
- Endpoints de revision, discrepancias, discrepancias entre sucursales y resumen de auditoria.
- Cero perdida logica sobre la regla de consenso aprobada en D-B06.

## Limites

- No mide latencia de red, Render, Neon, PostgreSQL real ni serializacion HTTP real.
- No prueba indices SQL ni planes de consulta.
- No sustituye una prueba de carga staging con usuarios/dispositivos reales.
- La concurrencia se simula con invocaciones locales al mismo proceso; Node ejecuta la agregacion CPU-bound en el hilo principal.
- No valida lookup/scan remoto contra DB real; R4.2 deja preparado el baseline para decidir si hacen falta paginacion, cache o agregacion en DB antes del piloto.

## Criterio R4.2

R4.2 queda completado localmente porque existe una medicion reproducible del volumen objetivo, con evidencia versionable, cero perdida logica y p95 local menor a 2 s en caliente para los puntos backend de revision/auditoria marcados por H14.

El siguiente paso natural es R5.1: runtime, dependencias y CI. Antes del piloto R6.1 conviene repetir R4.2 contra staging/PostgreSQL real con datos ficticios y, si aparece cuello de botella, implementar paginacion server-side/agregacion SQL/indexes medidos.
