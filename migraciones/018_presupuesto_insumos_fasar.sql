/******************************************************************************/
/****  018 - FASAR de la mano de obra del presupuesto                       ****/
/****                                                                       ****/
/****  Cada mano de obra del Análisis P.U. puede tomar su FSR de un FASAR    ****/
/****  del catálogo (Catalogos › Parámetros de costos). El insumo guarda    ****/
/****  el FSR con el que se presupuestó (fsr, 017) y de qué FASAR salió.    ****/
/****  Si ese FASAR se borra, el presupuesto conserva su FSR.               ****/
/****                                                                       ****/
/****  Requiere la 017. Se aplica con: php herramientas/migrar.php --aplicar ****/
/******************************************************************************/

ALTER TABLE presupuesto_concepto_insumos
    ADD COLUMN IF NOT EXISTS fasar_id INTEGER REFERENCES fasar (fasar_id) ON DELETE SET NULL;
