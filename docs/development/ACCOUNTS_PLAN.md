# Administración de cuentas — plan de implementación

Fecha: 03/10/2026. Extensión de R2.1 y D-B04. El backend ya expone CRUD parcial de sucursales y usuarios, roles y sesiones; falta una interfaz administrativa completa y endurecer sus reglas.

## Entregas

| ID | Alcance | Criterio de salida |
|---|---|---|
| ACCOUNTS-01 | Nueva sección de administración: listar, crear y editar sucursales; listar, crear y editar usuarios; asignar rol y sucursal; activar/desactivar; restablecer contraseña manualmente. | Solo ADMIN puede operar; formularios validan campos; la contraseña no aparece en listados ni se conserva tras guardar; restablecer revoca sesiones; pruebas locales de API y frontend. |
| ACCOUNTS-02 | Reglas de integridad y seguridad: impedir dejar el sistema sin un ADMIN activo, impedir operador sin sucursal activa, revocar sesiones al desactivar o cambiar permisos, validación consistente, conflictos y auditoría de cambios de cuenta sin secretos. | Pruebas de concurrencia y errores con PostgreSQL aislado; cuentas y sesiones consistentes ante fallo. |
| ACCOUNTS-03 | Cambio de contraseña propia con clave actual y restablecimiento por ADMIN si se olvidó (D-B07). Rotación obligatoria al primer ingreso (D-B08). | Cambio propio revoca sesiones y audita sin secretos; administrador puede restablecer y exige cambio posterior. D-B09 excluye el límite de intentos de esta entrega. |
| ACCOUNTS-04 | Validación operativa: pruebas en staging con cuentas ficticias y roles, cookies entre frontend/backend, sesión expirada, desactivación y recuperación; guía para siete sucursales. | Evidencia de staging y aprobación operativa antes de producción. |
| ACCOUNTS-05 | Confirmación de contraseña inicial y restablecida en el panel ADMIN. | Una discrepancia impide el envío; la confirmación se limpia y no viaja a la API; pruebas de ambos flujos. |
| ACCOUNTS-06 | Edición de nombres de sucursal y usuario mediante formularios dentro del panel. | Sin `window.prompt`; cancelar no escribe; valores vacíos se rechazan y nombres válidos se recortan antes de enviar; pruebas de interfaz. |
| ACCOUNTS-07 | Validación del servidor al actualizar nombres y código de sucursal. | Un valor presente pero vacío tras recortar espacios devuelve `400` antes de abrir una transacción; no se escribe ni se audita. |

## Decisiones de producto pendientes

- Definir si cada persona puede pertenecer a una sola sucursal (modelo actual) o a varias. ACCOUNTS-01 conserva una sola.
- D-B07 definió recuperación de clave olvidada por ADMIN. No se enviarán enlaces por correo ni se habilitará recuperación anónima.
- D-B08 exige cambio en el primer ingreso tras creación o restablecimiento por ADMIN. El mínimo técnico es ocho caracteres; no hay expiración periódica aprobada.
- D-B09 excluye límites de intentos en esta entrega; reevaluar si cambia el riesgo operativo aceptado.
- Definir qué datos de auditoría y retención de sesiones exige la operación. No registrar contraseñas ni tokens.

## Orden inmediato

ACCOUNTS-02 completada localmente y validada en PostgreSQL 16 aislado el 03/10/2026. Dos administradores que se degradan a la vez terminan con un solo cambio aplicado, 409 para el otro y un ADMIN activo. Se probaron auditoría sin contraseña/hash y rollback de cambio de clave/sesiones ante falla de auditoría. Falta validación en staging y definir retención del historial antes de operación prolongada.

1. ACCOUNTS-01 local con la API existente y correcciones mínimas para mostrar el estado de cuenta y revocar sesiones tras un cambio de contraseña confirmado.
2. ACCOUNTS-02 antes de dar acceso operativo a varios administradores.
3. Acordar las decisiones pendientes y completar ACCOUNTS-03.
4. Validar ACCOUNTS-04 y recién después considerar despliegue.

Avance ACCOUNTS-03 (03/10/2026): cambio propio y rotación obligatoria de clave inicial/restablecida implementados y validados con PostgreSQL aislado; restablecimiento por ADMIN disponible localmente desde ACCOUNTS-01. D-B09 quita el límite de intentos del alcance. ACCOUNTS-04 está en ensayo local; staging y aprobación operativa pendientes. No desplegado.

ACCOUNTS-05 (03/10/2026): confirmación local de contraseñas iniciales y restablecidas implementada y cubierta por tests de interfaz. No cambia la API ni exige migraciones. La validación de ACCOUNTS-04 en staging sigue pendiente de la rotación de credencial aislada.

ACCOUNTS-06 (03/10/2026): edición de nombres con formularios locales, cancelación y validación de espacios en blanco implementadas y cubiertas por tests. No cambia la API ni exige migraciones. ACCOUNTS-04 en staging sigue pendiente.

ACCOUNTS-07 (03/10/2026): validación de campos vacíos al actualizar usuario o sucursal implementada en la API y cubierta por pruebas con doble en memoria. No cambia el esquema ni requiere migraciones. ACCOUNTS-04 en staging sigue pendiente.

No ejecutar migraciones, seed, reset ni cambios en bases remotas para estas entregas locales.
