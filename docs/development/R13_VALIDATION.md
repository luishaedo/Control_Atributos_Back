# R1.3 — aplicación por atributo y conflictos

29/09/2026. Responsable local: Codex/01a0eef9; validación remota 30/09/2026: Codex/01a0f1e5; sin agentes delegados. VALIDADO_STAGING. Publicado solo en rama `r13-atributos-staging`; producción/main no modificados por esta entrega.

## Comportamiento

- Aplicar escribe exclusivamente `new_*` no vacíos. Los otros atributos del maestro se conservan; vacío sigue significando ausencia de propuesta, no borrado.
- IDs positivos y únicos; ID ausente, decisión archivada/rechazada/aplicada, falta de baseline o maestro, propuesta vacía y decisión no vigente producen rechazo del lote. La aplicación nunca omite silenciosamente un ID conflictivo.
- Se comprueba la última decisión no archivada por campaña/SKU/atributo, ordenada por `ts DESC, id DESC`, incluyendo rechazos. Es vigencia lógica; no se agrega una restricción única al esquema histórico.
- Escritura condicional del maestro contra `old_*` solo para atributos propuestos, lectura y marcado dentro de transacción Serializable. Un conflicto revierte todo el lote y devuelve `409 UPDATE_CONFLICT`; no hay reintentos automáticos ni promesa de idempotencia.
- Creación de decisión, sustitución de pendientes, etapa y aplicación inmediata forman una misma transacción. Sustituir parte de una fila conserva sus atributos todavía vigentes en una continuación enlazada por notas; el original queda archivado e intacto para auditoría. Se conserva su fecha y baseline. No se reviven atributos ya sustituidos/rechazados.
- Nuevas revisiones toman baseline del maestro actual cuando existe; snapshot es fallback para registros sin maestro, cuya aplicación sigue bloqueada si el maestro no existe. El snapshot no se modifica. Esto permite revisar nuevamente un atributo después de aplicar una decisión anterior.
- Aplicación inmediata devuelve la fila realmente aplicada. Revisión/listado usa ID para desempatar fechas. Los tres caminos de aplicación propagan 409 con request ID.
- Ajuste de compatibilidad en cierre: no pasa archivadas a aplicación y no intenta aplicar lote vacío. No cambia su frontera de confirmación ni lo convierte en cierre atómico.

## Evidencia ejecutada

Windows, Node 24.20.0, PostgreSQL 16.3 local. Cluster nuevo dedicado en `../.r13-runtime/pgdata`, escucha únicamente `127.0.0.1:55439`, usuario de prueba `r13test`, base `r13_isolated`. No se usó el servicio PostgreSQL preexistente, `.env`, Neon, Render ni bases productivas. Las ocho migraciones históricas se ejecutaron con `psql -v ON_ERROR_STOP=1 -f <migration.sql>` sobre esa base vacía, sin seed/reset ni migración nueva. El cluster se detuvo al finalizar; sus archivos se conservaron fuera de los repositorios.

Comando desde el backend, exclusivamente con ese destino aislado preparado:

```powershell
$env:R13_TEST_DATABASE_URL='postgresql://r13test@127.0.0.1:55439/r13_isolated'
npm test
Remove-Item Env:R13_TEST_DATABASE_URL
```

Resultado: **57/57 PASS**, cero omitidos. Incluye 15 escenarios PostgreSQL y su test contenedor, 16 pruebas del servicio/controlador y 25 HTTP/smoke. `git diff --check` correcto (solo advertencias de conversión LF/CRLF).

`test/actualizaciones.postgres.test.js` nunca usa DATABASE_URL ni carga .env; sin R13_TEST_DATABASE_URL omite integración. Verifica host, puerto, base y usuario antes de conectar. Crea fixtures con UUID y borra exclusivamente su campaña y SKU al terminar. No crea esquema ni migra automáticamente; requiere base de prueba preparada. Las barreras sincronizan operaciones de dos transacciones reales, sin sustituir consultas ni aislamiento. La prueba de fallo inmediato sí inyecta count=0 para verificar rollback real de las demás escrituras.

Escenarios: los seis órdenes de tres atributos; sustitución parcial; rechazo posterior conservando otro atributo; doble aplicación simultánea; dos atributos simultáneos con reaplicación manual del perdedor; dos revisores simultáneos; historial con empate de fecha sin resurrección; maestro cambiado y rollback completo del lote; nueva revisión después de aplicar; fallo inmediato con rollback de archivado/decisión/etapa. HTTP verifica 409 en aplicación, decisión inmediata y cierre; 400 para IDs inválidos; compatibilidad de cierre sin pendientes.

## Límites y siguiente paso

VALIDADO_STAGING no equivale a VALIDADO_PRODUCCION. No hubo pruebas de carga ni de UI en navegador. Frontend intacto; sus clientes existentes reciben el mensaje de error JSON. No se ejecutan lint/build frontend por no modificarlo.

La comparación optimista es por valor, no por contador de versión: no detecta ABA (valor cambiado y restituido) ni que una pantalla antigua se envíe después de concluir otra revisión. Serializable detecta carreras de transacciones superpuestas; no es un token de versión de pantalla. Puede rechazar también atributos distintos del mismo SKU; se informa 409 y el operador vuelve a revisar antes de reenviar. No hay retry automático.

Datos históricos ya perdidos no se reconstruyen. Duplicados históricos no vigentes se rechazan al aplicar; no se limpian automáticamente. Archivar/deshacer/revertir, cierre único y frontera de confirmados, snapshot y exportaciones continúan en R1.4/R3.2; en particular, el cierre completo aún no es atómico. Las propuestas D-B01–D-B06 siguen pendientes.

Seguimiento local 30/09/2026: `npm test` repetido sin `R13_TEST_DATABASE_URL`: 41/41 PASS, 1 integración PostgreSQL omitida por no estar activo el cluster aislado. Esto comprueba la suite no remota disponible en el checkout actual y no sustituye los 57/57 previos con PostgreSQL real.

Validación staging 30/09/2026: `scripts/run-r13-staging-loopback.mjs` entregó credenciales en memoria al mismo verificador restringido, mediante listener efímero en `127.0.0.1`. SHA esperado y observado `520cd35d33a3be2e7ca1d90adc745880d0d53eff`; base `r02_prisma_validation`; 12/12 escenarios PASS y 58 solicitudes HTTP con 200/409 esperados. Se conservaron una campaña inactiva TEST-R13, ID 1, y 11 SKU ficticios como evidencia. Reporte sanitizado: `docs/development/r13-staging-validation-20260930.json`; búsqueda de patrones confirmó que no contiene cadena PostgreSQL, host Neon, token, contraseña ni Bearer. Producción no fue consultada ni modificada.

Estado final: VALIDADO_STAGING, no VALIDADO_PRODUCCION. Próximo: continuar R1.4 solo después de resolver R1.2 y confirmar D-B02/D-B03.
