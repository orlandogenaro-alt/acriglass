/******************************************************************************/
/****  AcriGlass - Forma de la utilidad del presupuesto (Firebird)          ****/
/****                                                                       ****/
/****  'costo' (+ % sobre el costo) o 'margen' (margen sobre el precio).    ****/
/****  Sin la columna el presupuesto se guarda igual y al abrirlo la forma  ****/
/****  se deduce comparando el subtotal con las dos fórmulas.              ****/
/****                                                                       ****/
/****  Un presupuesto, una obra: en AW lo cuida el sistema (aparta el       ****/
/****  presupuesto al registrar la obra). Firebird no admite el índice      ****/
/****  único parcial de Supabase porque las obras sin presupuesto llevan    ****/
/****  SUGERIDO_ID = 0.                                                     ****/
/****                                                                       ****/
/****  Como correrlo: IBExpert > conectar a PRODUCCION_AW.FDB > SQL Editor  ****/
/****  > pegar > Execute > Commit. Se corre una sola vez.                   ****/
/******************************************************************************/

ALTER TABLE DOCTOS_SUGERIDO_OBRA ADD UTILIDAD_MODO VARCHAR(10);
