# R1.1 — contrato SKU y validación

30/09/2026. Responsable: Codex/01a0f1e5, sin agentes delegados. Estado: COMPLETADO_LOCAL y VALIDADO_LOCAL_POSTGRESQL. Sin commit, push, deploy ni acceso a bases remotas.

## Decisión aprobada

D-B01 fue aprobada por el usuario el 30/09/2026:

- el primer `#` o `$` separa un sufijo de etiqueta que no integra la identidad del artículo;
- el SKU base se normaliza a mayúsculas y debe ser alfanumérico;
- el valor original se conserva donde existe `skuRaw`;
- la interfaz y las respuestas de escaneo/importación avisan cuando se separó un sufijo;
- los códigos aceptan uno o dos dígitos, se completan con cero a la izquierda y se rechazan completos si tienen otro formato o no existen en su diccionario; nunca se eliminan caracteres ni se toman los últimos dígitos.

## Alcance implementado

- Backend y frontend comparten el mismo contrato mediante `parseSku`, `parseCode`, `cleanSku` y `pad2` equivalentes.
- Lookup general y por campaña, escaneo, filtros/revisión, edición de desconocidos e importaciones usan identidad normalizada y rechazan formatos inválidos.
- Escaneo valida propuestas conocidas y desconocidas contra diccionarios antes de escribir y devuelve `422` con el campo inválido.
- CSV y JSON prevalidan formato y dominio. La importación CSV de maestro valida todas las filas antes del primer upsert y devuelve avisos de sufijo; la pantalla administrativa muestra el conteo.
- Las decisiones administrativas validan formato y dominio dentro de la transacción. La edición de desconocidos valida antes del upsert.
- La exportación usa los valores canónicos almacenados. Una prueba de contrato recorre importación con sufijo, lookup con otro sufijo y exportación sin etiqueta.
- El escaneo muestra un aviso visible con el SKU base que se utilizará. Los errores de formato/dominio explican que el valor no fue truncado.

## Evidencia

Validación final con PostgreSQL 16.3 local dedicado, bases aisladas `r12_isolated` y `r13_isolated`, sin seed/reset ni red:

- backend: 79/79 PASS, 0 omitidas; incluye integración real R1.2 y regresión real R1.3;
- frontend: Vitest 7/7 PASS;
- frontend: build Vite exitoso, 389 módulos;
- ESLint: 0 errores y 42 advertencias heredadas;
- `git diff --check`: sin errores.

La integración R1.2 probó además dos solicitudes simultáneas con `#ETIQUETA`, una fila persistida y aviso `SKU_SUFFIX_IGNORED`. La base `r12_isolated` terminó con Campania/Escaneo/UnknownSku/SkuStage = 0/0/0/0, fue eliminada y el clúster se detuvo. La base `r13_isolated` preexistente se preservó; la prueba eliminó solo sus fixtures propios.

## Límites

No se desplegó ni validó R1.1/R1.2 en staging o producción. La atomicidad general de importaciones masivas y el contrato final con el sistema externo pertenecen a R3.1/D-B05. La identidad autenticada pertenece a R2.1/D-B04.
