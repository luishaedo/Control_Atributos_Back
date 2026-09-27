# Backend — guía para agentes

Leer primero `docs/development/ROADMAP.md`, `STATUS.md`, `DECISIONS.md` y `CHANGELOG.md`; son canónicos para ambos repositorios. Si se trabaja en el workspace conjunto, leer también `../AGENTS.md` y la auditoría en `../auditoria/`.

- Express 4: todo handler async debe propagar errores con wrapper explícito; no depender de la captura automática de Express 5.
- La fábrica de aplicación debe poder probarse con Prisma inyectado, sin leer `.env`, conectar DB ni abrir puerto al importar.
- No modificar reglas de SKU, campañas, decisiones o exportaciones dentro de la entrega de disponibilidad R0.1.
- Mantener `/health` y `/api/health` compatibles; readiness debe consultar DB de forma acotada. Nunca registrar credenciales/cuerpo de petición.
- No añadir reintentos automáticos a escrituras. Un timeout no prueba que no se haya escrito.
- No ejecutar `seed`, `migrate reset`, `db push` o migraciones sobre DB desconocida. No leer `.env` para buscar acceso a producción.
- Antes/después de cambios: git status; ejecutar `npm test` y comprobaciones relevantes. Usar pruebas HTTP con DB simulada para errores/health; la integración PostgreSQL se declara separadamente.
- Registrar tarea y responsable en STATUS antes de editar; actualizar CHANGELOG, pruebas y próximo paso al finalizar. Si hay agentes simultáneos, el integrador mantiene esos documentos y asigna archivos sin superposición.
- No marcar producción restaurada por tests locales. El acceso a Render, el SHA desplegado y el smoke remoto son evidencias independientes.
