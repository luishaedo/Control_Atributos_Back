ALTER TABLE "Campania"
ADD COLUMN "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "closedBy" TEXT;

UPDATE "Campania"
SET "estado" = CASE
  WHEN "activa" = TRUE THEN 'ACTIVA'
  WHEN "activatedOnce" = TRUE THEN 'CERRADA'
  ELSE 'BORRADOR'
END,
"activatedAt" = CASE WHEN "activatedOnce" = TRUE THEN CURRENT_TIMESTAMP ELSE NULL END,
"closedAt" = CASE WHEN "activatedOnce" = TRUE AND "activa" = FALSE THEN CURRENT_TIMESTAMP ELSE NULL END;

ALTER TABLE "Actualizacion" ADD COLUMN "reversalOfId" INTEGER;

CREATE UNIQUE INDEX "Actualizacion_reversalOfId_key" ON "Actualizacion"("reversalOfId");
CREATE INDEX "Actualizacion_reversalOfId_idx" ON "Actualizacion"("reversalOfId");

CREATE UNIQUE INDEX "Campania_single_active_idx" ON "Campania"("activa") WHERE "activa" = TRUE;
