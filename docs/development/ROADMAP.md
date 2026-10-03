# Roadmap de desarrollo

Versión inicial: 26/09/2026. Objetivo: operación confiable en siete sucursales. Autorizado: preparar roadmap/instrucciones y ejecutar su primer paso. No equivale a autorización de deploy ni a aprobación de todas las reglas de negocio propuestas.

El avance actual vive en STATUS.md. La auditoría inicial del workspace enumera F01–F13 y H01–H18; sus hallazgos son históricos. Este roadmap es el orden de ejecución, y el plan detallado de auditoría aporta escenarios de aceptación.

| ID | Entrega | Depende de | Criterio de salida |
|---|---|---|---|
| R0.1 | Base de disponibilidad y diagnóstico API | Ninguna | App inyectable, errores async capturados en ambos routers, errores JSON, request ID, timeout acotado en lecturas/health, live/ready y versión; pruebas HTTP; runbook Render. |
| R0.2 | Recuperar y verificar despliegue/staging | R0.1 + acceso a proveedores | SHA/config/runtime conocidos, logs de incidente, DB/migraciones verificadas, staging aislado, 3 smoke exitosos incluido reinicio. |
| R1.1 | Contrato SKU y validación | R0.1 + D-B01 | Identidad del artículo consistente en lookup/import/scan/export; códigos inválidos rechazados sin truncado. F01/F07/H16. |
| R1.2 | Escaneo atómico e idempotente | R1.1 + DB de test | Reintentos/concurrencia no duplican; fallo intermedio revierte; etapas no retroceden inadvertidamente. F06/H03/H04. |
| R1.3 | Aplicación por atributo y conflictos | R0.1 + DB de test | Tres atributos se conservan en todo orden; cambios concurrentes detectados; decisión vigente única. F02. |
| R1.4 | Estados, cierre, snapshot y reversión | R1.2/R1.3 + D-B02/B03 | Cierre único, atómico y solo confirmado; rechazo preservado; reversión trazable; GET sin escritura. F03/F04/F08/H05/H09/H10. |
| R2.1 | Usuarios, sucursales y sesiones | R0.1 + D-B04 | Actor verificado, permisos por rol, logout/revocación, manejo 401, protección de mutaciones. F07/F10/H06/H07. |
| ACCOUNTS-01..04 | Administración de cuentas | R2.1 + D-B04 | Panel para sucursales, usuarios, roles, estado y contraseñas; integridad y auditoría; recuperación; validación operativa. Detalle en `ACCOUNTS_PLAN.md`. |
| R3.1 | Importación validada y recuperable | R1.1 + D-B05 | CSV/JSON equivalentes, prevalidación, atomicidad/lotes explícitos y round-trip. F05/F09. |
| R3.2 | Exportación final y conciliación | R1.4/R3.1 + D-B05 | TXT idénticos al estado final, pendientes diferenciados, descargas repetibles por cierre. F13/H08/H09. |
| R3.3 | Consenso y métricas | R1.4 + D-B06 | Unidades comparables, máximo 100%, conflictos 1 contra 1, conteos por SKU/atributo definidos. F11/F12/H17. |
| R4.1 | UX operativa y accesibilidad | Contratos anteriores | Carga/error/vacío distintos, foco de escáner, navegación/tablas/mensajes correctos, sin respuestas obsoletas. H15/H18. |
| R4.2 | Rendimiento medido | R0.2/R1.4 | Dataset 7.594 SKUs × 7 sucursales, 14–21 sesiones como objetivo inicial; cero pérdidas; p95 objetivo <2 s en caliente; optimizar con mediciones. H14. |
| R5.1 | Runtime, dependencias y CI | Desde R0.1; cerrar antes de piloto | Node soportado, vulnerabilidades evaluadas/corregidas, CI frontend/backend/DB, build/config verificables. H11/H12. |
| R5.2 | Operación y recuperación | R0.2/R1.4 | Backup/restore probado, RPO/RTO acordado, rollback, monitoreo y responsable. H13. |
| R6.1 | Piloto y habilitación | Todos los P0/P1 cerrados | Staging → 1 sucursal → 2 → 7; conciliación completa, incidencias documentadas, aprobación operativa. |

## Primera entrega: R0.1

Corregir el mecanismo que deja rechazos de promesas sin respuesta HTTP y hacer verificable la disponibilidad DB. No atribuir todavía el timeout observado a una causa particular.

Alcance: separar `app.js` de `server.js`, wrapper de handlers Express 4, contexto/error HTTP, readiness con límite y máximo una consulta activa, alias de health compatibles, versión vía entorno de despliegue y runbook. Mantener comportamiento CORS de `main` remoto antes de refactorizar. Sin nuevas dependencias ni cambios de esquema.

Los deadlines de esta entrega se aplican a GET/HEAD; no cortar escrituras y sugerir reintentos mientras la idempotencia no esté resuelta. Readiness con timeout deja de esperar, pero no cancela la consulta Prisma; evitar acumular nuevas probes si una continúa pendiente. Esto se documenta como límite, no como cancelación DB.

Tests: éxito/DB caída/DB lenta, probes concurrentes, recuperación, rechazo async público/admin, 401, CORS autorizado/denegado, JSON inválido, ID de correlación, respuesta tardía tras deadline y alias existentes. Usar HTTP real en loopback con dobles Prisma; no acceder al `.env`.

## Política de finalización

- Una entrega se completa localmente con código, pruebas, documentación y registro actualizado.
- R0.1 terminado no termina R0.2 ni demuestra que producción se recuperó.
- Reglas de negocio pendientes solo bloquean sus tareas dependientes. No detener correcciones independientes de disponibilidad.
- Cada entrega debe ser revisable por separado y registrar riesgos residuales; no ejecutar el roadmap entero por inercia.
