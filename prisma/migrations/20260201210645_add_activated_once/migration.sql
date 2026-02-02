-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campania" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "inicia" DATETIME NOT NULL,
    "termina" DATETIME NOT NULL,
    "categoria_objetivo_cod" TEXT,
    "tipo_objetivo_cod" TEXT,
    "clasif_objetivo_cod" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "activatedOnce" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Campania" ("activa", "categoria_objetivo_cod", "clasif_objetivo_cod", "id", "inicia", "nombre", "termina", "tipo_objetivo_cod") SELECT "activa", "categoria_objetivo_cod", "clasif_objetivo_cod", "id", "inicia", "nombre", "termina", "tipo_objetivo_cod" FROM "Campania";
DROP TABLE "Campania";
ALTER TABLE "new_Campania" RENAME TO "Campania";
CREATE INDEX "Campania_activa_idx" ON "Campania"("activa");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
