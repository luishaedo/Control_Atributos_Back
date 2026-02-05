-- AddForeignKey
ALTER TABLE "Actualizacion" ADD CONSTRAINT "Actualizacion_campaniaId_fkey" FOREIGN KEY ("campaniaId") REFERENCES "Campania" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
