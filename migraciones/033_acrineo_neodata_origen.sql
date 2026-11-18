/****************************************************************************************/
/****  033 · ACRINEO › origen de los presupuestos importados de Neodata: la obra,     ****/
/****        la fecha de la versión de Neodata que se subió (respaldo .zip o última   ****/
/****        modificación en la base) y el archivo. Con esto, al subir otra versión   ****/
/****        de la misma obra (aunque la haya subido otro usuario) se avisa y se      ****/
/****        compara la fecha antes de subirla.                                       ****/
/****************************************************************************************/

ALTER TABLE acrineo_presupuestos ADD COLUMN IF NOT EXISTS neodata_obra    VARCHAR(150);
ALTER TABLE acrineo_presupuestos ADD COLUMN IF NOT EXISTS neodata_fecha   TIMESTAMPTZ;
ALTER TABLE acrineo_presupuestos ADD COLUMN IF NOT EXISTS neodata_archivo VARCHAR(250);
CREATE INDEX IF NOT EXISTS ix_acrineo_presupuestos_neodata ON acrineo_presupuestos (upper(neodata_obra)) WHERE neodata_obra IS NOT NULL;
