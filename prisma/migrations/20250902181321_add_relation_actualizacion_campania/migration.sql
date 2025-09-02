-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Actualizacion" (
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
    "notas" TEXT,
    "archivada" BOOLEAN NOT NULL DEFAULT false,
    "archivadaBy" TEXT,
    "archivadaAt" DATETIME,
    "appliedAt" DATETIME,
    "exported_categoria_at" DATETIME,
    "exported_tipo_at" DATETIME,
    "exported_clasif_at" DATETIME,
    CONSTRAINT "Actualizacion_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Actualizacion" ("appliedAt", "archivada", "archivadaAt", "archivadaBy", "campaniaId", "decidedAt", "decidedBy", "estado", "exported_categoria_at", "exported_clasif_at", "exported_tipo_at", "id", "new_categoria_cod", "new_clasif_cod", "new_tipo_cod", "notas", "old_categoria_cod", "old_clasif_cod", "old_tipo_cod", "sku", "ts") SELECT "appliedAt", "archivada", "archivadaAt", "archivadaBy", "campaniaId", "decidedAt", "decidedBy", "estado", "exported_categoria_at", "exported_clasif_at", "exported_tipo_at", "id", "new_categoria_cod", "new_clasif_cod", "new_tipo_cod", "notas", "old_categoria_cod", "old_clasif_cod", "old_tipo_cod", "sku", "ts" FROM "Actualizacion";
DROP TABLE "Actualizacion";
ALTER TABLE "new_Actualizacion" RENAME TO "Actualizacion";
CREATE INDEX "Actualizacion_campaniaId_sku_idx" ON "Actualizacion"("campaniaId", "sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
