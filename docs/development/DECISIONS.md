# Decisiones y propuestas

## Decisiones técnicas de esta entrega

- D-T01 (26/09/2026): conservar stack; app Express inyectable para tests sin DB real. Sin actualización de major ni de esquema en R0.1.
- D-T02: roadmap/estado/decisiones/historial canónicos en este repositorio, `docs/development`; raíz solo enlaza. Los tres AGENTS explican descubrimiento. Hasta publicar estos archivos, un agente en otro checkout debe recibirlos del coordinador.
- D-T03: mantener health legado como liveness; crear readiness independiente con DB y deadline. No mostrar errores Prisma ni secretos al cliente.
- D-T04: deadlines automáticos solo para lecturas GET/HEAD en R0.1. Timeout no cancela DB; las mutaciones necesitan transacciones/idempotencia antes de automatizar reintentos.
- D-T05: registrar versión desde `RENDER_GIT_COMMIT` o `APP_VERSION`; si falta, declarar `unknown` y no inventar un SHA.
- D-T06: deadline GET/HEAD por defecto 7000 ms, menor a los 8/10 s usados por lookup/carga inicial frontend; readiness 2000 ms. Configurables y validados. Las exportaciones grandes pueden requerir revisar el límite con mediciones, sin desactivar el diagnóstico general.

## Decisiones de negocio pendientes

Autorización operativa 27/09: el usuario aprobó explícitamente la rama de pruebas Neon persistente y ejecución de migraciones aisladas; pidió continuar autónomamente el desarrollo sin repetir confirmaciones ya concedidas. Mantener límites de datos/seguridad; esta autorización no decide por sí sola D-B01–D-B06.

| ID | Tema | Propuesta para discutir | Bloquea |
|---|---|---|---|
| D-B01 | SKU/códigos | Sufijo #/$ de etiqueta separado; rechazo sin truncado de códigos fuera de dominio | R1.1 |
| D-B02 | Aplicación/cierre | Aprobar propone, confirmar habilita, cerrar aplica solo vigentes; reversión compensatoria | R1.4 |
| D-B03 | Campaña/snapshot/fechas | Una activa, snapshot al activar, cierre permanente; definir fechas informativas u obligatorias | R1.4 |
| D-B04 | Identidad | Cuenta individual, sucursal asignada, operador/revisor/admin | R2.1 |
| D-B05 | Sistema externo | Contrato de import/export, encoding, altas y cambios netos o absolutos | R3.1/R3.2 |
| D-B06 | Consenso | Última observación por sucursal/SKU/atributo; conservar eventos | R3.3 |

El usuario autorizó roadmap y primer paso, no aprobó aún estas propuestas. No bloquean R0.1.
