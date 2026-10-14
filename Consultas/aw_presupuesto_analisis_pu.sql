/******************************************************************************/
/****  AcriGlass - Análisis de Precios Unitarios del presupuesto (Firebird) ****/
/****                                                                       ****/
/****  Factores de la pestaña Análisis P.U. (lógica de Neodata): FSR,       ****/
/****  % herramienta menor, % financiamiento y % utilidad. Se guardan como  ****/
/****  JSON en una sola columna. Sin la columna el presupuesto se guarda    ****/
/****  igual y el análisis usa los factores por omisión.                   ****/
/****                                                                       ****/
/****  Como correrlo: IBExpert > conectar a PRODUCCION_AW.FDB > SQL Editor  ****/
/****  > pegar > Execute > Commit. Se corre una sola vez.                   ****/
/******************************************************************************/

ALTER TABLE DOCTOS_SUGERIDO_OBRA ADD ANALISIS_PU BLOB SUB_TYPE TEXT;
