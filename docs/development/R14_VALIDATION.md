# Validación R1.4

Fecha: 30/09/2026. Estado: `VALIDADO_STAGING`; no validado en producción.

## Contrato implementado

- `BORRADOR -> ACTIVA -> CERRANDO -> CERRADA`; una campaña cerrada no se reactiva.
- Solo puede existir una campaña activa. El snapshot de `Maestro` se crea completo y queda congelado al activar.
- `inicia` y `termina` deben ser fechas válidas y ordenadas. En R1.4 son informativas.
- Aceptar crea una propuesta pendiente; confirmar mueve el SKU a consolidación; no existe aplicación anticipada.
- Cerrar aplica en una transacción Serializable únicamente decisiones vigentes de SKU confirmados y altas desconocidas aprobadas. Los pendientes sin confirmar, rechazos y fusiones se conservan.
- Repetir el cierre devuelve el resultado persistido sin reaplicar. Un conflicto concurrente devuelve `409`.
- Revertir crea y aplica un evento compensatorio enlazado por `reversalOfId`; el evento original no se modifica ni elimina.
- Las lecturas de snapshot ya no copian datos desde `Maestro` ni crean filas faltantes.

## Esquema

Migración `20260930220000_r14_campaign_lifecycle`:

- agrega `estado`, `activatedAt`, `closedAt` y `closedBy` a `Campania`;
- agrega `reversalOfId` único a `Actualizacion`;
- incorpora un índice parcial único para impedir dos campañas con `activa = true`.

La migración conserva campañas históricas: las activas quedan `ACTIVA`, las previamente activadas e inactivas quedan `CERRADA` y las restantes `BORRADOR`.

## Pruebas

Se usó PostgreSQL 16.3 local en `127.0.0.1:55439`, con bases explícitas `r12_isolated`, `r13_isolated` y `r14_isolated`. No se leyó `DATABASE_URL` como destino de prueba, no hubo seed/reset/db push y no se accedió a servicios remotos.

Comando equivalente, omitiendo credenciales locales:

```powershell
$env:R12_TEST_DATABASE_URL='<postgres-local>/r12_isolated'
$env:R13_TEST_DATABASE_URL='<postgres-local>/r13_isolated'
$env:R14_TEST_DATABASE_URL='<postgres-local>/r14_isolated'
npm test
```

Resultado final backend: **90/90 PASS, 0 fallos, 0 omitidas**.

R1.4 cubre diez escenarios reales: fechas inválidas; objetivos fuera de formato/dominio sin escritura; snapshot congelado y GET sin escritura; segunda campaña activa rechazada; cierre selectivo con rechazo preservado; cierre repetido/no reactivación; reversión compensatoria única; rollback total ante fallo final; dos cierres simultáneos; y carrera escaneo contra cierre sin escritura parcial.

También se repitieron completas las suites PostgreSQL R1.2 y R1.3. Las bases nuevas recibieron las nueve migraciones; la base R1.3 preservada, creada previamente sin historial Prisma, recibió solo la migración incremental R1.4. Los fixtures terminaron en cero en las bases R1.2/R1.4; ambas bases se eliminaron. `r13_isolated` se conservó sin campañas de prueba activas y el clúster quedó detenido.

Frontend: 7/7 tests PASS, build Vite de 389 módulos exitoso y lint con 0 errores/42 advertencias heredadas. La primera ejecución test/build dentro del sandbox no pudo leer `vite.config.js`; la repetición autorizada fuera de ese límite pasó.

## Validación staging

Publicación y validación remota completadas el 30/09/2026 en el servicio aislado `control-atributos-staging`.

- Rama: `r13-atributos-staging`.
- Commit publicado: `594ce7aa4c01402b147f52383d0b7b733a1c974b`.
- Deploy Render: `dep-daupn7c9v7es73ag7le0`, Live, 1m00s.
- Base Neon: rama `r02-migration-validation`, DB `r02_prisma_validation`.
- Migración aplicada manualmente: `20260930220000_r14_campaign_lifecycle`, historial Prisma 9/9.
- Smoke remoto read-only: `smoke-r14-staging.json`, 7/7 PASS, SHA exacto, readiness DB up y auth/CORS correctos.
- Validación funcional: `r14-staging-validation-20260930.json`, 9/9 checks PASS y 32 requests HTTP.

La validación funcional ejecutó el flujo completo con fixtures `TEST-R14`/`TESTR14`: borrador, activación con snapshot congelado, rechazo de segunda activa, GET sin escritura, aceptación sin aplicación anticipada, confirmación, desconocidos aprobado/rechazado, cierre selectivo, cierre repetido, no reactivación, reversión compensatoria única y doble cierre concurrente con una sola aplicación. Los fixtures quedan retenidos en la base aislada como evidencia: campañas 7, 8 y 9; SKUs `TESTR147EE8387FCA*`.

El runner `scripts/run-r14-staging-loopback.mjs` usa una ruta local aleatoria de un solo uso y credenciales en memoria. La evidencia fue revisada sin `DATABASE_URL`, token, contraseña ni encabezados de autorización. Para hacer la prueba autosuficiente en la base aislada, el validador asegura diccionarios `01/02/03` con `skipDuplicates` si faltan.

## Archivos principales

- `prisma/schema.prisma` y `prisma/migrations/20260930220000_r14_campaign_lifecycle/migration.sql`
- `src/services/campanias.service.js`
- `src/services/campaignClosure.service.js`
- `src/services/actualizaciones.service.js`
- `src/services/escaneos.service.js`
- `src/controllers/campanias.controller.js`
- `src/controllers/workflow.controller.js`
- `src/controllers/actualizaciones.controller.js`
- `src/controllers/maestro.controller.js`
- `test/r14.postgres.test.js` y regresiones R1.2/R1.3
- `Control_Atributos_Front/src/pages/Revisiones.jsx` (resumen de cierre por usuario)

## Límites y próximo paso

No hubo despliegue productivo ni cambios en Vercel/frontend productivo. Staging API quedó validado; producción sigue pendiente de autorización separada. R2.1 sigue dependiendo de D-B04; R3.1/R3.2 de D-B05 y R3.3 de D-B06.
