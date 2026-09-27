-- Diagnóstico manual de solo lectura. No contiene credenciales ni datos de negocio.
-- Ejecutar solo en el destino identificado. No crea ni modifica objetos.
BEGIN READ ONLY;

SELECT current_schema() AS active_schema;

WITH expected(name) AS (
  VALUES ('DicCategoria'), ('DicTipo'), ('DicClasif'), ('Maestro'),
         ('Campania'), ('CampaniaMaestro'), ('Escaneo'), ('Actualizacion'),
         ('SkuStage'), ('UnknownSku'), ('_prisma_migrations')
)
SELECT expected.name AS expected_table, t.table_schema, t.table_type
FROM expected
LEFT JOIN information_schema.tables t ON t.table_name = expected.name
ORDER BY expected.name, t.table_schema;

SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('Campania', 'Escaneo', 'UnknownSku', 'Actualizacion')
ORDER BY table_schema, table_name, ordinal_position;

COMMIT;

-- Solo si el inventario anterior confirma public._prisma_migrations:
-- SELECT migration_name, checksum, started_at, finished_at, rolled_back_at,
--        applied_steps_count FROM public._prisma_migrations ORDER BY started_at;
-- No seleccionar la columna logs: puede contener información sensible.
