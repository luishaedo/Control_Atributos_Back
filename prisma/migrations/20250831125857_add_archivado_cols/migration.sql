-- AlterTable
ALTER TABLE "Actualizacion" ADD COLUMN "archivada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Actualizacion" ADD COLUMN "archivadaBy" TEXT;
ALTER TABLE "Actualizacion" ADD COLUMN "archivadaAt" TIMESTAMP(3);
