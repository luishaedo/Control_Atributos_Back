-- R2.1 identity, branches and revocable sessions.

CREATE TABLE "Sucursal" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sucursal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Usuario" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "rol" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "passwordHash" TEXT NOT NULL,
  "sucursalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sesion" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sucursal_codigo_key" ON "Sucursal"("codigo");
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");
CREATE INDEX "Usuario_rol_idx" ON "Usuario"("rol");
CREATE INDEX "Usuario_sucursalId_idx" ON "Usuario"("sucursalId");
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");
CREATE INDEX "Sesion_usuarioId_idx" ON "Sesion"("usuarioId");
CREATE INDEX "Sesion_expiresAt_idx" ON "Sesion"("expiresAt");
CREATE INDEX "Sesion_revokedAt_idx" ON "Sesion"("revokedAt");

ALTER TABLE "Usuario"
  ADD CONSTRAINT "Usuario_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sesion"
  ADD CONSTRAINT "Sesion_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
