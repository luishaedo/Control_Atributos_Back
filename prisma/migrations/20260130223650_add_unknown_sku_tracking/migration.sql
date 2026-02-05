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
