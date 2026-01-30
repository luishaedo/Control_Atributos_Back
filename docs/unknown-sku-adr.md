# ADR + Plan de Implementación: SKU Desconocidos en Campañas

## 1) Contexto y alcance
Este documento analiza el repositorio **Control_Atributos_Back** y describe el tratamiento **actual** (as-is) y la propuesta **futura** (to-be) para SKUs desconocidos dentro del flujo de campañas. El foco es exclusivamente backend y no incluye UI.

---

## 2) As-is (mapa del flujo actual)

### 2.1 Flujo general de campañas
1. **Creación de campaña**: al crear una campaña se genera un snapshot (`CampaniaMaestro`) con los SKUs del maestro actual. Esto define el universo de SKUs conocidos para esa campaña. 【F:src/services/campanias.service.js†L1-L52】
2. **Activación**: sólo una campaña puede estar activa. 【F:src/services/campanias.service.js†L54-L60】
3. **Escaneo**: cada escaneo crea un `Escaneo` con el SKU normalizado y la propuesta asumida. Si el SKU no está en el snapshot de la campaña, se registra como “unknown” y se crea/actualiza `UnknownSku` y `SkuStage`. 【F:src/controllers/escaneos.controller.js†L1-L101】
4. **Revisión/admin**: las propuestas se agregan a partir de `Escaneo` y se usan para crear `Actualizacion` cuando el admin decide. 【F:src/controllers/revisiones.controller.js†L1-L255】
5. **Confirmación y consolidación**: el workflow por etapas utiliza `SkuStage` con etapas `unknown`, `confirm`, `consolidate`. 【F:src/controllers/workflow.controller.js†L1-L173】
6. **Cierre de campaña**: aplica actualizaciones pendientes y genera exportes; para unknowns confirmados en etapa `consolidate`, se vuelve a upsert en maestro y snapshot. 【F:src/controllers/workflow.controller.js†L291-L397】

### 2.2 Normalización de SKU
- `cleanSku(raw)` aplica **trim**, **upper**, y elimina espacios internos. 【F:src/utils/sku.js†L1-L4】
- Los códigos de diccionarios se normalizan con `pad2`. 【F:src/utils/sku.js†L5-L8】

### 2.3 Endpoints actuales (as-is)
**Base URL**: `/api` (público) y `/api/admin` (admin). 【F:src/server.js†L1-L20】

#### Campañas
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/campanias` | query: `raw` | `{ items }` o array | 200 | listado campañas |
| POST | `/api/campanias` | `{ nombre, inicia, termina, ... }` | campaña creada | 200/400/500 | creación + snapshot |
| POST | `/api/campanias/:id/activar` | params `id` | campaña activada | 200/400 | activación |
【F:src/routes/public.routes.js†L9-L24】【F:src/controllers/campanias.controller.js†L1-L25】

#### Maestro
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/maestro` | query `q,page,pageSize` | `{ page, pageSize, total, items }` | 200 | lookup maestro |
| GET | `/api/maestro/:sku` | params `sku` | item maestro | 200/400/404 | lookup maestro |
| POST | `/api/maestro/import` | `{ items }` | `{ ok, count, ... }` | 200/400 | import maestro |
| GET | `/api/admin/export/maestro.csv` | - | CSV | 200 | export maestro |
| GET | `/api/admin/maestro/missing` | query `campaniaId` | `{ items }` | 200/400 | unknowns no confirmados |
【F:src/routes/public.routes.js†L15-L27】【F:src/routes/admin.routes.js†L22-L80】【F:src/controllers/maestro.controller.js†L1-L144】

#### Diccionarios
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/diccionarios` | - | `{ categorias, tipos, clasif }` | 200 | lookup diccionarios |
| POST | `/api/diccionarios/import` | JSON diccionarios | `{ ok, counts }` | 200 | import diccionarios |
| POST | `/api/admin/diccionarios/import-json` | JSON diccionarios | `{ ok, counts }` | 200 | import diccionarios (admin) |
| POST | `/api/admin/diccionarios/import-file` | multipart | `{ ok }` | 200 | import diccionarios (admin) |
| GET | `/api/admin/export/categorias.csv` | - | CSV | 200 | export diccionario |
| GET | `/api/admin/export/tipos.csv` | - | CSV | 200 | export diccionario |
| GET | `/api/admin/export/clasif.csv` | - | CSV | 200 | export diccionario |
【F:src/routes/public.routes.js†L9-L17】【F:src/routes/admin.routes.js†L17-L54】【F:src/controllers/diccionarios.controller.js†L1-L20】

#### Escaneos (scan)
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/escaneos` | `{ skuRaw, campaniaId, sugeridos, email, sucursal }` | `{ estado, maestro, asumidos }` | 200/400/500 | scan + lookup maestro + unknown |
**Notas clave**:
- Si el SKU no está en `CampaniaMaestro`, el backend exige `sugeridos` (categoria/tipo/clasif) y registra `UnknownSku` + `SkuStage`. 【F:src/controllers/escaneos.controller.js†L14-L101】
- `estado` devuelve `OK | REVISAR | NO_MAESTRO` para diferenciar known/unknown. 【F:src/controllers/escaneos.controller.js†L20-L44】【F:src/controllers/escaneos.controller.js†L90-L101】

#### Revisiones / Sugerencias (derivadas de escaneos)
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/revisiones` | query `campaniaId, sku, consenso, soloConDiferencias` | `{ items }` | 200/400 | agregación de propuestas |
| POST | `/api/admin/revisiones/decidir` | `{ campaniaId, sku, propuesta, decision, ... }` | `{ ok, actualizacion }` | 200/400/500 | decisión admin sobre propuesta |
| GET | `/api/admin/confirmaciones` | query `campaniaId` | `{ items }` | 200/400 | lista decisiones pendientes |
| POST | `/api/admin/etapas/mover` | `{ campaniaId, sku, stage }` | `{ ok }` | 200/400 | mover etapa SKU |
【F:src/routes/admin.routes.js†L55-L69】【F:src/controllers/revisiones.controller.js†L1-L255】【F:src/controllers/workflow.controller.js†L1-L167】

#### Unknowns (bandeja)
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/desconocidos` | query `campaniaId` | `{ items }` | 200/400 | bandeja unknowns |
| PATCH | `/api/admin/desconocidos/:sku` | `{ campaniaId, descripcion, categoria_cod, ... }` | `{ ok, item }` | 200/400 | editar unknown |
| POST | `/api/admin/desconocidos/:sku/confirmar` | `{ campaniaId, updatedBy }` | `{ ok }` | 200/400/404 | aprobar unknown → maestro |
【F:src/routes/admin.routes.js†L70-L77】【F:src/controllers/workflow.controller.js†L105-L232】

#### Export y cierre de campaña
| Método | Path | Input | Output | Status | Parte del flujo |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/actualizaciones` | query `campaniaId, estado, archivada` | `{ items }` | 200/400 | listado actualizaciones |
| POST | `/api/admin/actualizaciones/aplicar` | `{ ids, decidedBy }` | `{ ok, applied }` | 200/400/500 | aplica updates en maestro |
| GET | `/api/admin/export/actualizaciones.csv` | query `campaniaId` | CSV | 200/400 | export updates |
| GET | `/api/admin/export/txt/*` | query `campaniaId, scope` | TXT | 200/400 | export updates/unknowns |
| POST | `/api/admin/campanias/:id/cerrar` | `{ decidedBy }` | `{ ok, applied, summary, exports }` | 200/400 | cierre campaña |
【F:src/routes/admin.routes.js†L29-L89】【F:src/controllers/actualizaciones.controller.js†L1-L309】【F:src/controllers/workflow.controller.js†L291-L397】

### 2.4 Cómo se detecta un SKU desconocido (as-is)
- Se consulta `CampaniaMaestro` por `campaniaId + sku` (SKU normalizado). Si no existe, se considera **unknown** y se exige `sugeridos` obligatorios. 【F:src/controllers/escaneos.controller.js†L18-L44】
- El scan crea `Escaneo` con `estado = NO_MAESTRO` y luego upsert en `UnknownSku` + `SkuStage`. 【F:src/controllers/escaneos.controller.js†L49-L86】

### 2.5 Qué registra el backend cuando aparece un unknown
- `Escaneo` con `estado = NO_MAESTRO`, valores sugeridos y asumidos. 【F:src/controllers/escaneos.controller.js†L49-L70】
- `UnknownSku` con `status = detected`, atributos sugeridos y `updatedBy`. 【F:src/controllers/escaneos.controller.js†L72-L94】
- `SkuStage` con `stage = unknown`. 【F:src/controllers/escaneos.controller.js†L95-L100】

### 2.6 Qué devuelve al frontend para distinguir KNOWN vs UNKNOWN
- La respuesta de `/api/escaneos` usa `estado`:
  - `OK`: SKU conocido y cumple objetivos
  - `REVISAR`: SKU conocido pero fuera de objetivos
  - `NO_MAESTRO`: SKU desconocido
- Si es conocido, `maestro` contiene atributos del snapshot; si es desconocido, `maestro` es `null`. 【F:src/controllers/escaneos.controller.js†L20-L101】

### 2.7 Cómo se persisten estados/decisiones del admin
- **Known SKUs**: el admin decide a través de `Actualizacion` (`estado: pendiente/aplicada/rechazada`). 【F:prisma/schema.prisma†L53-L87】【F:src/controllers/revisiones.controller.js†L117-L255】
- **Unknown SKUs**: `UnknownSku.status` toma valores como `detected`, `edited`, `confirmed`. Se confirma con `/desconocidos/:sku/confirmar`, lo cual también crea/actualiza en `Maestro` y `CampaniaMaestro`. 【F:prisma/schema.prisma†L107-L120】【F:src/controllers/workflow.controller.js†L174-L232】

### 2.8 Exportación y sincronización del maestro (as-is)
- **Updates**: `Actualizacion` aplicada actualiza `Maestro`. 【F:src/services/actualizaciones.service.js†L1-L56】
- **Unknown confirmados**: en `confirmUnknown` ya se hace `upsert` directo a `Maestro` y `CampaniaMaestro`. 【F:src/controllers/workflow.controller.js†L174-L232】
- **Cierre de campaña**: aplica updates pendientes y vuelve a upsert unknowns confirmados en `Maestro`/`CampaniaMaestro` si están en etapa `consolidate`. 【F:src/controllers/workflow.controller.js†L291-L381】
- **Export TXT**: `scope=unknown` exporta códigos de `UnknownSku` confirmados en etapa `consolidate`. 【F:src/controllers/actualizaciones.controller.js†L44-L110】

---

## 3) Diagnóstico de gaps (unknowns)

1. **No existe `skuRaw` persistido**
   - La normalización ocurre en `cleanSku`, pero se pierde el valor original. Esto dificulta auditoría y detección de typos. 【F:src/utils/sku.js†L1-L4】【F:src/controllers/escaneos.controller.js†L14-L70】
2. **Entidad unknown limitada**
   - `UnknownSku` guarda status pero sin historial ni motivo de rechazo/merge; no hay decisión explícita. 【F:prisma/schema.prisma†L107-L120】
3. **No hay deduplicación por campaña + skuNormalized con recuento de ocurrencias**
   - `UnknownSku` se upsertea y pisa datos, pero no conserva conteo de ocurrencias ni primer/último scan. 【F:src/controllers/escaneos.controller.js†L72-L94】
4. **No hay flujo formal de rechazo o merge**
   - Solo existe `confirmUnknown`; no hay endpoints ni estados para `REJECTED` o `MERGED`. 【F:src/controllers/workflow.controller.js†L174-L232】
5. **Sugerencias se calculan on-the-fly**
   - No hay tabla de `Suggestion`. Las propuestas se derivan de `Escaneo` y se agregan en el controller, sin estado propio. 【F:src/controllers/revisiones.controller.js†L51-L180】
6. **Normalización de SKU limitada**
   - `cleanSku` solo elimina espacios y convierte a uppercase; no se registran reglas explícitas (por ejemplo guiones, caracteres especiales). 【F:src/utils/sku.js†L1-L4】
7. **Idempotencia y concurrencia**
   - No existe idempotency key en `Escaneo`. Reintentos pueden duplicar eventos. No hay locking para decisiones admin concurrentes sobre unknowns. 【F:src/controllers/escaneos.controller.js†L49-L70】【F:src/controllers/workflow.controller.js†L174-L232】
8. **Riesgo de contaminación del maestro**
   - `confirmUnknown` escribe directamente en `Maestro` y el cierre de campaña vuelve a hacerlo. Falta un control explícito de “aprobación final” vs “pending export”. 【F:src/controllers/workflow.controller.js†L174-L232】【F:src/controllers/workflow.controller.js†L291-L381】

---

## 4) Propuesta de modelo de datos (to-be)

### 4.1 Entidades y relaciones
**Objetivo:** soportar unknowns con auditoría, deduplicación por campaña, merges y exportes controlados.

#### MaestroSku (existente: `Maestro`)
- **Campos**: `sku (PK)`, `descripcion`, `categoria_cod`, `tipo_cod`, `clasif_cod`, `createdAt`, `updatedAt`.
- **Reglas**: solo se actualiza vía export/aprobación admin.

#### Campaign (existente: `Campania`)
- **Campos**: `id`, `nombre`, `inicia`, `termina`, `activa`, objetivos opcionales.
- **Reglas**: snapshot en `CampaignSkuSnapshot` al crear.

#### CampaignSkuSnapshot (existente: `CampaniaMaestro`)
- **Campos**: `campaniaId + sku` (PK), copia de atributos.
- **Reglas**: inmutable; se actualiza solo al cierre (si se desea reflejar altas/updates).

#### Scan/Observation (existente: `Escaneo`)
- **Campos nuevos**: `skuRaw`, `skuNormalized`, `deviceId`, `idempotencyKey`, `createdAt`.
- **Reglas**: `skuNormalized` = `cleanSku(skuRaw)`; si hay `idempotencyKey`, evitar duplicación.

#### UnknownSku (to-be, reemplaza/expande actual)
- **Campos**: 
  - `id`, `campaignId`, `skuRaw`, `skuNormalized`, `descripcion`,
  - `categoria_cod`, `tipo_cod`, `clasif_cod`,
  - `status` (`PENDING`, `APPROVED`, `REJECTED`, `MERGED`),
  - `mergedIntoSku` (nullable),
  - `firstSeenAt`, `lastSeenAt`, `seenCount`,
  - `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
- **Índices/constraints**:
  - `unique(campaignId, skuNormalized)`
  - `index(status, campaignId)`
- **Reglas**:
  - `skuNormalized` obligatorio.
  - `MERGED` requiere `mergedIntoSku` existente en maestro.

#### Suggestion (nuevo)
- **Campos**: `id`, `campaignId`, `skuNormalized`, `source` (`SCAN`/`ADMIN`),
  `categoria_cod`, `tipo_cod`, `clasif_cod`, `confidence`,
  `createdBy`, `createdAt`, `status` (`PENDING`, `ACCEPTED`, `REJECTED`).
- **Índices**:
  - `index(campaignId, skuNormalized)`
  - `unique(campaignId, skuNormalized, categoria_cod, tipo_cod, clasif_cod)` (para dedupe)

#### AdminDecision (nuevo o integrado en Suggestion/Unknown)
- **Campos**: `id`, `campaignId`, `skuNormalized`, `decisionType` (`UNKNOWN`, `SUGGESTION`),
  `decision` (`APPROVE`, `REJECT`, `MERGE`, `APPLY_UPDATE`), `decidedBy`, `decidedAt`, `notes`.
- **Reglas**: audita cambios y evita perder historial.

### 4.2 Estados y transiciones
- **UnknownSku**:
  - `PENDING` → `APPROVED` (alta) → export “altas”
  - `PENDING` → `REJECTED` (archivado)
  - `PENDING` → `MERGED` (apunta a SKU válido)
- **Suggestion**:
  - `PENDING` → `ACCEPTED` (genera update)
  - `PENDING` → `REJECTED`

### 4.3 Reglas de integridad
- No permitir `APPROVED` si no hay `categoria/tipo/clasif` válidos en diccionarios.
- `MERGED` requiere `mergedIntoSku` existente en Maestro.
- `skuNormalized` siempre derivado de `skuRaw`.

---

## 5) Contrato API propuesto (backend → frontend)

### 5.1 Scan
**POST /api/scans** (o `/api/escaneos`)
```json
{
  "skuRaw": "abc 123",
  "campaignId": 10,
  "email": "user@corp.com",
  "branch": "SUC1",
  "suggested": {
    "categoria_cod": "01",
    "tipo_cod": "02",
    "clasif_cod": "03"
  },
  "idempotencyKey": "scan-uuid-123"
}
```
**Respuesta**
```json
{
  "skuType": "UNKNOWN",
  "skuNormalized": "ABC123",
  "scanId": 999,
  "maestro": null,
  "unknown": {
    "id": 55,
    "campaignId": 10,
    "skuRaw": "abc 123",
    "skuNormalized": "ABC123",
    "status": "PENDING",
    "suggested": {
      "categoria_cod": "01",
      "tipo_cod": "02",
      "clasif_cod": "03"
    },
    "seenCount": 3
  }
}
```
**Errores**: `400` (payload inválido), `404` (campaña inexistente), `409` (idempotency conflict), `422` (diccionarios inválidos).

### 5.2 Unknowns (admin)
**GET /api/admin/unknowns?campaignId=10&status=PENDING**
```json
{
  "items": [
    {
      "id": 55,
      "campaignId": 10,
      "skuRaw": "abc 123",
      "skuNormalized": "ABC123",
      "status": "PENDING",
      "seenCount": 3,
      "lastSeenAt": "2024-06-01T10:00:00Z",
      "suggested": {
        "categoria_cod": "01",
        "tipo_cod": "02",
        "clasif_cod": "03"
      }
    }
  ]
}
```

**POST /api/admin/unknowns/:id/approve**
```json
{ "decidedBy": "admin@corp.com" }
```

**POST /api/admin/unknowns/:id/reject**
```json
{ "decidedBy": "admin@corp.com", "reason": "invalid_sku" }
```

**POST /api/admin/unknowns/:id/merge**
```json
{ "decidedBy": "admin@corp.com", "mergedIntoSku": "SKU123" }
```

### 5.3 Sugerencias (admin)
**GET /api/admin/suggestions?campaignId=10&sku=ABC123**
```json
{ "items": [ { "id": 1, "status": "PENDING", "categoria_cod": "01" } ] }
```

**POST /api/admin/suggestions/:id/accept**
```json
{ "decidedBy": "admin@corp.com" }
```

**POST /api/admin/suggestions/:id/reject**
```json
{ "decidedBy": "admin@corp.com", "reason": "not_enough_consensus" }
```

### 5.4 Versionado
- Mantener endpoints actuales y agregar nuevos (`/api/admin/unknowns`, `/api/admin/suggestions`) con compatibilidad.
- Opcional: `/api/v2` para separar contratos.

---

## 6) Exportación / cierre de campaña (to-be)

1. **Export updates**: sólo para SKUs existentes (`Suggestion` aceptada) → archivo de updates.
2. **Export altas**: `UnknownSku` con `status=APPROVED` → archivo de altas.
3. **Cierre de campaña**:
   - no borrar unknowns rechazados; pasar a `REJECTED` y archivar.
   - congelar decisiones (lock) y generar export final.
4. **Sincronización maestro**:
   - aplicar updates sólo después de confirmación de ERP.
   - importar maestro nuevo y reconciliar `UnknownSku` pendientes.

---

## 7) Edge cases y seguridad

- **Idempotencia**: usar `idempotencyKey` en `Scan` para evitar duplicados.
- **Concurrencia admin**: usar `version` (optimistic lock) o `updatedAt` en decisiones para detectar conflictos (`409`).
- **Auditoría**: registrar `decidedBy`, `decidedAt`, `notes` en `AdminDecision`.
- **Normalización**: definir reglas explícitas y guardar `skuRaw` + `skuNormalized`.
- **Multi-tenant**: si hay múltiples negocios, incluir `tenantId` en todas las tablas y unique constraints.
- **Validación diccionarios**: evitar cods inexistentes al aprobar.

---

## 8) Plan de implementación incremental

### Etapa 0: Alineación de contrato
- Definir contrato de `/api/scans` y `/api/admin/unknowns`.
- Acordar formato de `skuType` y payload.

### Etapa 1: Migraciones
- Agregar columnas `skuRaw`, `skuNormalized`, `seenCount`, `firstSeenAt`, `lastSeenAt`.
- Crear tabla `Suggestion` y `AdminDecision`.

### Etapa 2: Endpoints nuevos
- `POST /api/scans` con respuesta `skuType`.
- `GET /api/admin/unknowns`, `approve`, `reject`, `merge`.
- `GET /api/admin/suggestions`, `accept`, `reject`.

### Etapa 3: Refactor mínimo
- Mantener `/api/escaneos` y mapear a nuevo servicio.
- Mantener `/api/admin/desconocidos` con compatibilidad.

### Etapa 4: Export/close
- Export de altas separado de updates.
- Cierre de campaña con locking e historial.

### Etapa 5: Testing
- Unit: normalización, dedupe, transición de estados.
- Integration: scan idempotente, aprobación/rechazo, merge, export.

### DoD (Definition of Done)
- Migraciones aplicadas y documentadas.
- Endpoints nuevos con `400/404/409/422` consistentes.
- Auditoría completa (decisions con usuario/fecha).
- No rompe compatibilidad con frontend actual.
- Exportes separados para updates vs altas.

---

## 9) Recomendación final
**Recomendación**: implementar **UnknownSku + Suggestion + AdminDecision** con `skuRaw/skuNormalized` y estados explícitos `PENDING/APPROVED/REJECTED/MERGED`. Esto alinea el flujo con auditoría, evita contaminación del maestro y permite exportes diferenciados (altas vs updates) sin reusar flujos actuales de `Actualizacion` que fueron diseñados para SKUs conocidos.
