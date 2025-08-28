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
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "inicia" DATETIME NOT NULL,
    "termina" DATETIME NOT NULL,
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
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
