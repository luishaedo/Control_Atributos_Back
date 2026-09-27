-- SOLO rama r02-migration-validation. Fixtures sintéticos revertidos al final.
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = public;
DO $$
DECLARE campaign_id integer := -20260927; defaults_ok boolean;
BEGIN
  INSERT INTO "Campania" (id,nombre,inicia,termina)
  VALUES (campaign_id,'R02_TEST',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  SELECT NOT activa AND NOT "activatedOnce" INTO defaults_ok FROM "Campania" WHERE id=campaign_id;
  IF NOT defaults_ok THEN RAISE EXCEPTION 'Defaults Campania incorrectos'; END IF;

  INSERT INTO "Escaneo" (id,"campaniaId",sucursal,email,sku,estado,"idempotencyKey")
  VALUES (-1,campaign_id,'TEST','fixture.invalid','TEST','pendiente','R02_KEY');
  BEGIN
    INSERT INTO "Escaneo" (id,"campaniaId",sucursal,email,sku,estado,"idempotencyKey")
    VALUES (-2,campaign_id,'TEST','fixture.invalid','TEST','pendiente','R02_KEY');
    RAISE EXCEPTION 'Clave idempotente duplicada aceptada';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  INSERT INTO "Escaneo" (id,"campaniaId",sucursal,email,sku,estado)
  VALUES (-3,campaign_id,'TEST','fixture.invalid','TEST','pendiente'),
         (-4,campaign_id,'TEST','fixture.invalid','TEST','pendiente');
  BEGIN
    INSERT INTO "Escaneo" (id,"campaniaId",sucursal,email,sku,estado)
    VALUES (-5,campaign_id-1,'TEST','fixture.invalid','TEST','pendiente');
    RAISE EXCEPTION 'FK huerfana aceptada';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  INSERT INTO "UnknownSku" (id,"campaniaId",sku,"updatedAt")
  VALUES (-1,campaign_id,'TEST',CURRENT_TIMESTAMP);
  IF (SELECT "seenCount" FROM "UnknownSku" WHERE id=-1) <> 0 THEN
    RAISE EXCEPTION 'Default seenCount incorrecto'; END IF;
  BEGIN
    INSERT INTO "UnknownSku" (id,"campaniaId",sku,"updatedAt")
    VALUES (-2,campaign_id,'TEST',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'UnknownSku duplicado aceptado';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  INSERT INTO "CampaniaMaestro" ("campaniaId",sku,descripcion,categoria_cod,tipo_cod,clasif_cod)
  VALUES (campaign_id,'TEST','Fixture','01','01','01');
  INSERT INTO "SkuStage" ("campaniaId",sku,stage) VALUES (campaign_id,'TEST','pendiente');
  INSERT INTO "Actualizacion" (id,"campaniaId",sku,new_categoria_cod,new_tipo_cod,new_clasif_cod,estado)
  VALUES (-1,campaign_id,'TEST','01','01','01','pendiente');
  IF (SELECT archivada FROM "Actualizacion" WHERE id=-1) THEN
    RAISE EXCEPTION 'Default archivada incorrecto'; END IF;

  DELETE FROM "Campania" WHERE id=campaign_id;
  IF EXISTS(SELECT 1 FROM "Escaneo" WHERE "campaniaId"=campaign_id)
    OR EXISTS(SELECT 1 FROM "UnknownSku" WHERE "campaniaId"=campaign_id)
    OR EXISTS(SELECT 1 FROM "CampaniaMaestro" WHERE "campaniaId"=campaign_id)
    OR EXISTS(SELECT 1 FROM "SkuStage" WHERE "campaniaId"=campaign_id)
    OR EXISTS(SELECT 1 FROM "Actualizacion" WHERE "campaniaId"=campaign_id)
  THEN RAISE EXCEPTION 'Cascada incompleta'; END IF;
END $$;
SELECT 'PASS: defaults, unique keys, nullable keys, FK, 5 cascades' AS validation;
ROLLBACK;
