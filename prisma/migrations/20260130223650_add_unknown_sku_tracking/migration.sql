-- AlterTable
ALTER TABLE "Escaneo" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Escaneo" ADD COLUMN "skuNormalized" TEXT;
ALTER TABLE "Escaneo" ADD COLUMN "skuRaw" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UnknownSku" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaniaId" INTEGER NOT NULL,
    "sku" TEXT NOT NULL,
    "skuRaw" TEXT,
    "skuNormalized" TEXT,
    "descripcion" TEXT,
    "categoria_cod" TEXT,
    "tipo_cod" TEXT,
    "clasif_cod" TEXT,
    "status" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" DATETIME,
    "lastSeenAt" DATETIME,
    "mergedIntoSku" TEXT,
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "decisionReason" TEXT,
    "appliedToMaestroAt" DATETIME,
    "appliedToMaestroBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnknownSku_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UnknownSku" ("campaniaId", "categoria_cod", "clasif_cod", "createdAt", "descripcion", "id", "sku", "status", "tipo_cod", "updatedAt", "updatedBy") SELECT "campaniaId", "categoria_cod", "clasif_cod", "createdAt", "descripcion", "id", "sku", "status", "tipo_cod", "updatedAt", "updatedBy" FROM "UnknownSku";
DROP TABLE "UnknownSku";
ALTER TABLE "new_UnknownSku" RENAME TO "UnknownSku";
CREATE INDEX "UnknownSku_campaniaId_sku_idx" ON "UnknownSku"("campaniaId", "sku");
CREATE INDEX "UnknownSku_campaniaId_skuNormalized_idx" ON "UnknownSku"("campaniaId", "skuNormalized");
CREATE UNIQUE INDEX "UnknownSku_campaniaId_sku_key" ON "UnknownSku"("campaniaId", "sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Escaneo_skuNormalized_idx" ON "Escaneo"("skuNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Escaneo_campaniaId_idempotencyKey_key" ON "Escaneo"("campaniaId", "idempotencyKey");

