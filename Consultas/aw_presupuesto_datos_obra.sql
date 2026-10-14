/******************************************************************************/
/****  AcriGlass - Datos de la obra en el presupuesto (Firebird)            ****/
/****                                                                       ****/
/****  Lo que se captura en el encabezado del presupuesto como en la       ****/
/****  ventana Nueva obra: nombre, descripcion, direccion, colonia, C.P.,  ****/
/****  ciudad, estado, telefono, mail, observaciones, obra bloqueada y     ****/
/****  obra maestra. Se guarda como JSON en una sola columna y llena la    ****/
/****  obra al «Registrar Obra». Sin la columna el presupuesto se guarda   ****/
/****  igual, sin estos datos.                                              ****/
/****                                                                       ****/
/****  Como correrlo: IBExpert > conectar a PRODUCCION_AW.FDB > SQL Editor  ****/
/****  > pegar > Execute > Commit. Se corre una sola vez.                   ****/
/******************************************************************************/

ALTER TABLE DOCTOS_SUGERIDO_OBRA ADD DATOS_OBRA BLOB SUB_TYPE TEXT;
