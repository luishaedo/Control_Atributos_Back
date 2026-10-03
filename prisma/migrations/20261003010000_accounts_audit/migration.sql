-- ACCOUNTS-02: immutable account and branch change events without secrets.
CREATE TABLE "CuentaAudit" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "entidad" TEXT NOT NULL,
  "entidadId" TEXT NOT NULL,
  "accion" TEXT NOT NULL,
  "cambios" JSONB NOT NULL,
  "requestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuentaAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CuentaAudit_createdAt_idx" ON "CuentaAudit"("createdAt");
CREATE INDEX "CuentaAudit_entidad_entidadId_createdAt_idx" ON "CuentaAudit"("entidad", "entidadId", "createdAt");
