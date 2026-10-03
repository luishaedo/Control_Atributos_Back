-- Existing accounts retain their current status; new/admin-reset credentials require rotation.
ALTER TABLE "Usuario" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
