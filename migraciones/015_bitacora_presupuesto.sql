/******************************************************************************/
/****  015 - Bitácora de cambios del presupuesto (Supabase)                 ****/
/****                                                                       ****/
/****  El botón Bitácora del presupuesto muestra quién lo movió y cuándo,   ****/
/****  con los renglones de auditoria (001). Para que cada Guardar deje su  ****/
/****  renglón aunque no cambie el encabezado, el presupuesto guarda la     ****/
/****  fecha de su última modificación.                                     ****/
/****                                                                       ****/
/****  La bitácora no la puede cambiar nadie: auditoria solo acepta altas;  ****/
/****  un UPDATE, DELETE o TRUNCATE sobre ella marca error.                 ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra ADD COLUMN IF NOT EXISTS modificado_en TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La bitácora de cambios no se puede modificar ni borrar.';
END $$;

DROP TRIGGER IF EXISTS auditoria_inmutable ON auditoria;
CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();

DROP TRIGGER IF EXISTS auditoria_inmutable_truncate ON auditoria;
CREATE TRIGGER auditoria_inmutable_truncate BEFORE TRUNCATE ON auditoria
    FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();
