/******************************************************************************/
/****  023 - Insumo «% de los materiales» en la matriz del concepto         ****/
/****                                                                       ****/
/****  Como los insumos con unidad «%» de Neodata (Herramienta, Seguridad): ****/
/****  la cantidad es el % sobre los materiales del concepto. Se agrega     ****/
/****  'pct_mat' a los valores permitidos de la columna base.              ****/
/****                                                                       ****/
/****  Requiere la 017. Se aplica con: php herramientas/migrar.php --aplicar ****/
/******************************************************************************/

ALTER TABLE presupuesto_concepto_insumos DROP CONSTRAINT IF EXISTS presupuesto_concepto_insumos_base_check;
ALTER TABLE presupuesto_concepto_insumos ADD CONSTRAINT presupuesto_concepto_insumos_base_check
    CHECK (base IS NULL OR base IN ('fijo', 'pct_mo', 'pct_mat'));
