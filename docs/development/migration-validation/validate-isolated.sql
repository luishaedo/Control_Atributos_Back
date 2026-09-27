-- SOLO rama aislada r02-migration-validation, base neondb.
-- Validación SQL: NO sustituye prisma migrate deploy ni crea historial Prisma.
-- Revisar la rama en la consola antes de ejecutar: SQL no identifica la rama Neon.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public') THEN
    RAISE EXCEPTION 'Validacion requiere public sin tablas';
  END IF;
END $$;
-- Migration: 20250827230701_init
-- CreateTable
CREATE TABLE "DicCategoria" (
    "cod" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DicTipo" (
    "cod" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DicClasif" (
    "cod" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Maestro" (
    "sku" TEXT NOT NULL PRIMARY KEY,
    "descripcion" TEXT NOT NULL,
    "categoria_cod" TEXT NOT NULL,
    "tipo_cod" TEXT NOT NULL,
    "clasif_cod" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Campania" (
    "id" SERIAL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "inicia" TIMESTAMP(3) NOT NULL,
    "termina" TIMESTAMP(3) NOT NULL,
    "categoria_objetivo_cod" TEXT,
    "tipo_objetivo_cod" TEXT,
    "clasif_objetivo_cod" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "CampaniaMaestro" (
    "campaniaId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "categoria_cod" TEXT NOT NULL,
    "tipo_cod" TEXT NOT NULL,
    "clasif_cod" TEXT NOT NULL,

    PRIMARY KEY ("campaniaId", "sku"),
    CONSTRAINT "CampaniaMaestro_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Escaneo" (
    "id" SERIAL PRIMARY KEY,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaniaId" INTEGER NOT NULL,
    "sucursal" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "categoria_sug_cod" TEXT,
    "tipo_sug_cod" TEXT,
    "clasif_sug_cod" TEXT,
    "asum_categoria_cod" TEXT,
    "asum_tipo_cod" TEXT,
    "asum_clasif_cod" TEXT,
    CONSTRAINT "Escaneo_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Campania_activa_idx" ON "Campania"("activa");

-- CreateIndex
CREATE INDEX "CampaniaMaestro_sku_idx" ON "CampaniaMaestro"("sku");

-- CreateIndex
CREATE INDEX "Escaneo_sku_idx" ON "Escaneo"("sku");

-- CreateIndex
CREATE INDEX "Escaneo_campaniaId_idx" ON "Escaneo"("campaniaId");


-- Migration: 20250828161856_revisiones_actualizaciones
-- CreateTable
CREATE TABLE "Actualizacion" (
    "id" SERIAL PRIMARY KEY,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "campaniaId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "old_categoria_cod" TEXT,
    "old_tipo_cod" TEXT,
    "old_clasif_cod" TEXT,
    "new_categoria_cod" TEXT NOT NULL,
    "new_tipo_cod" TEXT NOT NULL,
    "new_clasif_cod" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "notas" TEXT
);

-- CreateIndex
CREATE INDEX "Actualizacion_campaniaId_sku_idx" ON "Actualizacion"("campaniaId", "sku");


-- Migration: 20250831125857_add_archivado_cols
-- AlterTable
ALTER TABLE "Actualizacion" ADD COLUMN "archivada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Actualizacion" ADD COLUMN "archivadaBy" TEXT;
ALTER TABLE "Actualizacion" ADD COLUMN "archivadaAt" TIMESTAMP(3);


-- Migration: 20250831230017_export_marks
-- AlterTable
ALTER TABLE "Actualizacion" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "Actualizacion" ADD COLUMN "exported_categoria_at" TIMESTAMP(3);
ALTER TABLE "Actualizacion" ADD COLUMN "exported_clasif_at" TIMESTAMP(3);
ALTER TABLE "Actualizacion" ADD COLUMN "exported_tipo_at" TIMESTAMP(3);


-- Migration: 20250902181321_add_relation_actualizacion_campania
-- AddForeignKey
ALTER TABLE "Actualizacion" ADD CONSTRAINT "Actualizacion_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Migration: 20260129133101_init
-- CreateTable
CREATE TABLE "SkuStage" (
    "campaniaId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("campaniaId", "sku"),
    CONSTRAINT "SkuStage_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnknownSku" (
    "id" SERIAL PRIMARY KEY,
    "campaniaId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria_cod" TEXT,
    "tipo_cod" TEXT,
    "clasif_cod" TEXT,
    "status" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UnknownSku_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SkuStage_stage_idx" ON "SkuStage"("stage");

-- CreateIndex
CREATE INDEX "UnknownSku_campaniaId_sku_idx" ON "UnknownSku"("campaniaId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "UnknownSku_campaniaId_sku_key" ON "UnknownSku"("campaniaId", "sku");


-- Migration: 20260130223650_add_unknown_sku_tracking
-- AlterTable
ALTER TABLE "Escaneo" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Escaneo" ADD COLUMN "skuNormalized" TEXT;
ALTER TABLE "Escaneo" ADD COLUMN "skuRaw" TEXT;

-- AlterTable
ALTER TABLE "UnknownSku" ADD COLUMN "skuRaw" TEXT;
ALTER TABLE "UnknownSku" ADD COLUMN "skuNormalized" TEXT;
ALTER TABLE "UnknownSku" ADD COLUMN "seenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UnknownSku" ADD COLUMN "firstSeenAt" TIMESTAMP(3);
ALTER TABLE "UnknownSku" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "UnknownSku" ADD COLUMN "mergedIntoSku" TEXT;
ALTER TABLE "UnknownSku" ADD COLUMN "decidedBy" TEXT;
ALTER TABLE "UnknownSku" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "UnknownSku" ADD COLUMN "decisionReason" TEXT;
ALTER TABLE "UnknownSku" ADD COLUMN "appliedToMaestroAt" TIMESTAMP(3);
ALTER TABLE "UnknownSku" ADD COLUMN "appliedToMaestroBy" TEXT;

-- CreateIndex
CREATE INDEX "UnknownSku_campaniaId_skuNormalized_idx" ON "UnknownSku"("campaniaId", "skuNormalized");

-- CreateIndex
CREATE INDEX "Escaneo_skuNormalized_idx" ON "Escaneo"("skuNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Escaneo_campaniaId_idempotencyKey_key" ON "Escaneo"("campaniaId", "idempotencyKey");


-- Migration: 20260201210645_add_activated_once
-- AlterTable
ALTER TABLE "Campania" ADD COLUMN "activatedOnce" BOOLEAN NOT NULL DEFAULT false;

SELECT count(*) AS application_tables FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
COMMIT;
