# R6.1 - Piloto y habilitacion

Fecha: 02/10/2026.
Responsable: Codex/01a0f1e5.
Estado: PREPARADO_LOCAL / pendiente de ejecucion operativa.

## Objetivo

Habilitar el producto de forma controlada: primero staging con datos ficticios, despues una sucursal, luego dos y finalmente las siete. R6.1 no se considera validado por compilar ni por tener roadmap completo; requiere evidencia operativa y aprobacion de negocio.

## Gates obligatorios antes del piloto

- Repos backend/frontend limpios y publicados en GitHub.
- Backend y frontend desplegados con SHAs conocidos.
- CI remoto observado en verde para ambos repos.
- Backend Render corriendo runtime soportado vigente.
- `npm audit` sin vulnerabilidades en backend/frontend.
- Smoke backend en caliente 7/7.
- Frontend publicado cargando 200 y apuntando al backend correcto.
- Restore drill R5.2 ejecutado contra DB aislada, con evidencia sanitizada.
- Politica de backup/PITR de Neon confirmada.
- Usuarios iniciales rotados desde contrasena temporal.
- Responsable primario y suplente con acceso probado a Render, Neon, Vercel y GitHub.
- Procedimiento de incidencias compartido.

Si cualquiera de estos puntos falta, el piloto puede prepararse pero no habilitarse como uso operativo.

## Fase 0 - Staging con datos ficticios

Objetivo: ejecutar el flujo completo sin datos reales.

Dataset:

- campania `PILOTO-STAGING-R61`
- al menos 20 SKUs ficticios
- 7 sucursales simuladas
- observaciones aprobadas, rechazadas, desconocidas y conflictivas

Flujo:

1. Crear/importar maestro ficticio.
2. Crear campania en borrador.
3. Activar campania y congelar snapshot.
4. Simular escaneos de 7 sucursales.
5. Revisar consenso y conflictos.
6. Aceptar/rechazar propuestas por atributo.
7. Confirmar decisiones.
8. Cerrar campania.
9. Exportar paquete final.
10. Reimportar/verificar archivos contra resultado esperado.
11. Ejecutar reversión compensatoria de una decision aplicada.
12. Registrar smoke, tiempos, errores y capturas.

Criterio de salida:

- sin perdida de atributos
- cierre unico
- exportacion repetible
- rechazos preservados
- snapshot preservado
- reversión trazable
- evidencia sanitizada guardada

## Fase 1 - Una sucursal

Objetivo: validar ergonomia real con un operador y un revisor/admin.

Alcance:

- una sucursal real
- campaña corta y controlada
- dataset acotado
- sin dependencia de que las siete sucursales participen

Checklist:

- operador inicia sesion con usuario propio
- pistola/teclado conserva foco
- session/logout funcionan
- errores de red se entienden
- revisor distingue observacion/propuesta/aplicacion
- admin puede cerrar y exportar
- conciliacion manual coincide con exportacion

Criterio de salida:

- cero perdida logica
- cero doble aplicacion
- incidencias P0/P1 cerradas o con workaround aprobado
- aprobacion operativa de usuario piloto

## Fase 2 - Dos sucursales

Objetivo: validar discrepancias reales entre sucursales.

Escenarios minimos:

- ambas sucursales coinciden
- ambas sucursales discrepan 1 contra 1
- una sucursal no observa
- una sucursal corrige una observacion anterior
- un SKU desconocido aparece en una sucursal

Criterio de salida:

- consenso por atributo correcto
- empate/conflicto visible
- cada sucursal pesa una vez por atributo
- auditoria conserva todos los eventos
- decision final sigue en revisor/admin

## Fase 3 - Siete sucursales

Objetivo: habilitar operacion normal.

Condiciones:

- Fase 0, 1 y 2 aprobadas
- backups y restore drill vigentes
- contrasenas temporales rotadas
- responsables disponibles
- procedimiento de soporte comunicado

Criterio de salida:

- conciliacion completa
- exportacion final aceptada por receptor externo
- incidentes documentados
- aprobacion operativa para uso continuo

## Matriz minima de aceptacion

| Caso | Resultado esperado |
|---|---|
| Login vencido | UI recupera con 401 claro; mutacion rechazada |
| Operador de sucursal A intenta suplantar B | Backend usa sucursal de sesion |
| SKU con sufijo `#`/`$` | Se usa base y se avisa |
| Codigo fuera de dominio | Se rechaza sin truncar |
| Reintento de escaneo | No duplica intento logico |
| Dos sucursales discrepan | Conflicto/empate visible por atributo |
| Revisor rechaza propuesta | Rechazo queda auditado y no se aplica |
| Cierre concurrente | Una sola aplicacion |
| Exportar dos veces | Mismo contenido |
| Reversion | Evento compensatorio trazable |
| Restore drill | Restore aislado verifica tablas/migraciones |

## Registro de incidencias

Formato minimo:

```text
Fecha/hora ART:
Fase:
Sucursal:
Usuario/rol:
Campania:
SKU:
Pantalla/ruta:
Request ID:
Severidad: P0/P1/P2/P3
Descripcion:
Pasos para reproducir:
Resultado esperado:
Resultado observado:
Decision:
Responsable:
Estado:
```

Severidad:

- P0: perdida/corrupcion de datos, cierre/exportacion incorrecta, imposibilidad total de operar.
- P1: bloqueo funcional con workaround dificil.
- P2: error recuperable, UX confusa, performance fuera de objetivo.
- P3: mejora o ajuste cosmetico.

## Estado actual

Preparado:

- roadmap P0/P1 ejecutado hasta R5.2
- runbook operativo disponible
- prototipo/product brief frontend versionado
- smoke scripts y restore drill disponibles

Pendiente para habilitar piloto:

- desplegar los ultimos SHAs si se decide probar sobre app publicada
- observar CI remoto
- ejecutar restore drill real contra DB aislada
- rotar contrasenas temporales
- definir sucursal piloto y usuarios reales
- crear dataset/campania ficticia de Fase 0
- obtener aprobacion operativa tras Fase 0
