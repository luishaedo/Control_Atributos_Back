-- CreateTable
CREATE TABLE "Actualizacion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "decidedAt" DATETIME,
    "notas" TEXT
);

-- CreateIndex
CREATE INDEX "Actualizacion_campaniaId_sku_idx" ON "Actualizacion"("campaniaId", "sku");
