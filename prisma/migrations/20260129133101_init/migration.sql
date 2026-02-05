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
