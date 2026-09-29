# Decisiones y propuestas

## Decisiones técnicas de esta entrega

- D-T01 (26/09/2026): conservar stack; app Express inyectable para tests sin DB real. Sin actualización de major ni de esquema en R0.1.
- D-T02: roadmap/estado/decisiones/historial canónicos en este repositorio, `docs/development`; raíz solo enlaza. Los tres AGENTS explican descubrimiento. Hasta publicar estos archivos, un agente en otro checkout debe recibirlos del coordinador.
- D-T03: mantener health legado como liveness; crear readiness independiente con DB y deadline. No mostrar errores Prisma ni secretos al cliente.
- D-T04: deadlines automáticos solo para lecturas GET/HEAD en R0.1. Timeout no cancela DB; las mutaciones necesitan transacciones/idempotencia antes de automatizar reintentos.
- D-T05: registrar versión desde `RENDER_GIT_COMMIT` o `APP_VERSION`; si falta, declarar `unknown` y no inventar un SHA.
- D-T06: deadline GET/HEAD por defecto 7000 ms, menor a los 8/10 s usados por lookup/carga inicial frontend; readiness 2000 ms. Configurables y validados. Las exportaciones grandes pueden requerir revisar el límite con mediciones, sin desactivar el diagnóstico general.

- D-T07 (28/09/2026): staging API en servicio Render Free independiente, rama Git main con despliegue manual, conectado exclusivamente a Neon r02-migration-validation/r02_prisma_validation; CORS localhost:5173 y token propio. Sin frontend Vercel adicional ni migraciones automáticas al arranque. No usar staging con datos reales; límites Free y hardening siguen R5.

- D-T08 (29/09/2026, R1.3): aplicar parches solo a atributos propuestos; comparar sus valores anteriores dentro de Serializable; conflictos 409 sin retry. Vigencia lógica por campaña/SKU/atributo y desempate ts/id, incluyendo rechazo. Sustitución parcial conserva campos aún vigentes mediante continuación trazable, sin mutar el original archivado. No hay nuevo esquema ni reparación de datos históricos.
- D-T09 (29/09/2026, R1.3): crear revisión, sustituir pendientes, mover etapa y aplicación inmediata en una transacción. Nuevas revisiones toman baseline del maestro actual, manteniendo snapshot inmutable. Control por valor y de transacciones superpuestas; no equivale a token de revisión de pantalla ni detecta ABA. Reglas de cierre/reversión y decisiones de negocio siguen pendientes.

- D-T10 (29/09/2026): staging R1.3 sigue rama exclusiva r13-atributos-staging, Auto-Deploy Off. No publicar en main para evitar despliegue productivo involuntario. Verificador remoto restringe destino y SHA, crea fixtures nuevos identificables que conserva y usa credenciales solo en memoria; autorización específica de escrituras consultada tras rechazo automático.

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
