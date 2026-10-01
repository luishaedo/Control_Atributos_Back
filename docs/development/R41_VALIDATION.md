# R4.1 - UX operativa y accesibilidad

Fecha: 01/10/2026. Responsable: Codex/01a0f1e5. Estado: COMPLETADO_LOCAL.

## Alcance

Entrega acotada al frontend operativo:

- Escaneo mantiene foco en el campo de articulo al cambiar de campaña y despues de registrar una observacion.
- Escaneo ignora respuestas obsoletas de lookup si el usuario cambia campaña/SKU antes de que vuelva la consulta.
- Mensajes de escaneo dejan de decir "aplicar cambios" y pasan a "registrar observacion", que es el efecto real de esa pantalla.
- Revisiones ignora respuestas obsoletas al cambiar filtros/campaña en las cargas de evaluacion, cola, faltantes, confirmacion y consolidacion.
- El build del frontend falla temprano si falta `VITE_API_URL`, si no es HTTP(S), si trae credenciales o si se configura con `/api`.

## Validacion local

Comandos ejecutados:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
$env:VITE_API_URL='https://control-atributos-back.onrender.com'; npm.cmd run build
```

Resultados:

- `npm.cmd test`: 7/7 PASS.
- `npm.cmd run lint`: 0 errores, 41 advertencias heredadas.
- `npm.cmd run build` sin `VITE_API_URL`: falla temprano en `prebuild`, comportamiento esperado para H18.
- `npm.cmd run build` con `VITE_API_URL=https://control-atributos-back.onrender.com`: OK, 388 modulos transformados.

## Limites

- No se completo una auditoria visual con navegador/pantallas 360-390 px en esta entrega.
- No se probo pistola fisica ni lector de codigo de barras real.
- Quedan advertencias heredadas de lint en `Revisiones.jsx`, `Catalogo.jsx` y `ui.jsx`; no bloquean build.
- No se publico todavia en Vercel desde este commit.
