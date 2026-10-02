# R5.2 - Operacion y recuperacion

Fecha: 02/10/2026.
Responsable: Codex/01a0f1e5.
Estado: COMPLETADO_LOCAL / pendiente de simulacro con credenciales de proveedor.

## Alcance

R5.2 cubre H13: backup/restore, rollback, monitoreo y responsables antes del piloto. Esta entrega deja el procedimiento versionado y un runner de restore aislado. No ejecuta seed/reset, no modifica produccion y no lee `.env` para descubrir secretos.

## Objetivos operativos iniciales

- RPO inicial: maximo 24 horas en operacion normal.
- RPO para eventos criticos: snapshot/backup antes de importaciones masivas, antes de cerrar campanias y antes de despliegues con migraciones.
- RTO inicial: maximo 4 horas para restaurar servicio API + DB en horario operativo.
- Ventana de despliegue: fuera del horario de escaneo de sucursales, con smoke antes/despues.
- Responsable primario: administrador tecnico del proyecto.
- Responsable suplente: operador designado por negocio con acceso a Render/Neon/Vercel y este runbook.

Estos objetivos son el piso para piloto. Si el uso real exige menor perdida tolerable, se debe contratar/activar backup continuo y definir guardias.

## Regla de oro

Nunca ejecutar en produccion:

- `npm run seed`
- `prisma migrate reset`
- `prisma db push`
- borrados manuales para "probar"
- restore sobre la DB productiva sin confirmar incidente, backup elegido y plan de rollback

El seed queda solo para bases locales/de prueba declaradas.

## Backups

### Antes de operaciones riesgosas

Tomar backup/snapshot antes de:

1. Importacion masiva de maestro o diccionarios.
2. Cierre de campania real.
3. Despliegue con migraciones Prisma.
4. Cambios manuales en Neon/Render.

Registrar:

- fecha/hora ART
- operador
- motivo
- origen DB
- ID/nombre del snapshot o archivo
- SHA backend/frontend desplegado
- resultado de smoke previo

### Backups automaticos

Antes del piloto hay que confirmar en Neon:

- retencion disponible para la rama productiva
- frecuencia real de backups/PITR
- procedimiento exacto de restore a rama nueva
- permisos de quien puede restaurar
- costo/limite del plan

No asumir que Render o Neon tienen restore suficiente hasta verificarlo en consola.

## Restore drill aislado

El simulacro nunca restaura encima de produccion. Debe restaurar hacia una DB/rama aislada cuyo nombre indique `restore`, `staging`, `test`, `validation`, `isolated`, `r52` o `drill`.

Requisitos locales:

- `pg_dump`
- `pg_restore`
- `psql`
- `npx`

Comando:

```powershell
$env:SOURCE_DATABASE_URL = "<url_origen>"
$env:RESTORE_DATABASE_URL = "<url_destino_aislado>"
npm.cmd run ops:restore-drill
```

El runner:

- no imprime credenciales
- rechaza origen y destino iguales
- exige que el destino parezca aislado
- crea un dump temporal custom
- restaura con `--clean --if-exists --no-owner --no-privileges`
- verifica tablas criticas
- ejecuta `prisma migrate status` contra la DB restaurada
- borra el dump temporal por defecto

Si se quiere conservar artefactos locales del simulacro:

```powershell
npm.cmd run ops:restore-drill -- --keep-dump
```

Conservar dumps solo en almacenamiento local seguro y nunca commitearlos.

## Rollback

### Codigo backend

1. Identificar SHA actual y SHA anterior sano.
2. Confirmar si hubo migraciones nuevas.
3. Si no hubo migraciones nuevas: redeploy manual del SHA anterior en Render.
4. Si hubo migraciones nuevas: no revertir codigo solo si el esquema queda incompatible; decidir entre forward-fix o restore a snapshot aislado.
5. Ejecutar smoke:

```powershell
npm.cmd run ops:smoke -- --base https://control-atributos-back.onrender.com --origin https://stockeador-client-1nll.vercel.app
```

6. Registrar resultado en `STATUS.md`/incidente operativo.

### Codigo frontend

1. Identificar deployment anterior sano en Vercel.
2. Promover rollback desde Vercel.
3. Verificar carga 200 y uso con backend esperado.
4. No cambiar `VITE_API_URL` sin confirmar entorno.

### Datos

Rollback de datos no es automatico. Opciones, en orden preferente:

1. Reversion funcional compensatoria ya implementada para decisiones aplicadas.
2. Correccion forward controlada si el problema es acotado.
3. Restore a rama aislada para comparar y extraer datos.
4. Restore productivo completo solo si se acepta perdida desde el backup elegido y se comunica a negocio.

## Monitoreo minimo

Durante piloto:

- Smoke read-only antes de abrir jornada.
- Smoke read-only al cerrar jornada.
- Revisar Render logs ante 5xx/timeouts.
- Revisar Neon uso/conexiones/errores.
- Registrar incidentes con hora ART, usuario afectado, campania, ruta y request ID si existe.
- Alertar si readiness falla dos veces seguidas en caliente.

Smoke:

```powershell
npm.cmd run ops:smoke -- --base https://control-atributos-back.onrender.com --origin https://stockeador-client-1nll.vercel.app
```

## Checklist de habilitacion R6.1

Antes de piloto:

- Restore drill ejecutado contra DB aislada y evidencia sanitizada guardada.
- Backup/snapshot manual probado antes de una importacion ficticia.
- Responsable primario y suplente con acceso validado.
- Contraseñas temporales rotadas.
- Render backend desplegado con Node 24 o runtime soportado vigente.
- CI remoto observado en verde para ambos repos.
- Smoke backend en caliente 7/7.
- Frontend publicado verificado con bundle esperado.

## Estado de esta entrega

Completado localmente:

- runbook versionado
- runner `scripts/restore-drill.mjs`
- scripts `ops:smoke` y `ops:restore-drill`
- validacion sintactica y pruebas locales
- guardrail sin credenciales verificado: falla cerrado con `SOURCE_DATABASE_URL and RESTORE_DATABASE_URL are required`

Pendiente externo:

- ejecutar restore drill real con credenciales de Neon y DB destino aislada
- confirmar politica de backups/PITR del plan Neon
- observar CI remoto en GitHub
- desplegar runtime Node 24 en Render si todavia sirve un build anterior
