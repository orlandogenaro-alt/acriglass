/******************************************************************************/
/****  029 - ACRINEO · Matriz de un insumo de la matriz (submatriz)         ****/
/****                                                                       ****/
/****  Con doble clic en un renglón de la matriz se abre su propia matriz   ****/
/****  («Código: 50450 -> B12»). Sus renglones son de acrineo_matriz con    ****/
/****  el mismo concepto_id y padre_id = el renglón. El costo del renglón   ****/
/****  padre es el total de su submatriz y sube hasta el costo directo del  ****/
/****  concepto. Se pueden anidar. Borrar el renglón borra su submatriz.    ****/
/****                                                                       ****/
/****  Requiere 026. Se aplica con: php herramientas/migrar.php --aplicar   ****/
/******************************************************************************/

ALTER TABLE acrineo_matriz ADD COLUMN IF NOT EXISTS padre_id BIGINT REFERENCES acrineo_matriz (matriz_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS ix_acrineo_matriz_padre ON acrineo_matriz (padre_id);
