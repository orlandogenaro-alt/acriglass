/******************************************************************************/
/****  014 - Datos de entrega de la Orden de Trabajo de obra (Supabase)     ****/
/****                                                                       ****/
/****  En la ventana Orden de Trabajo (3-Orden Trabajo) se captura dónde    ****/
/****  está la empresa, el contacto, a nombre de quién se factura y el      ****/
/****  lugar de entrega. Sin estas columnas la orden se guarda sin ellos.   ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE doctos_orden_obra ADD COLUMN IF NOT EXISTS ubicacion_empresa VARCHAR(300);
ALTER TABLE doctos_orden_obra ADD COLUMN IF NOT EXISTS contacto VARCHAR(150);
ALTER TABLE doctos_orden_obra ADD COLUMN IF NOT EXISTS facturar_a VARCHAR(200);
ALTER TABLE doctos_orden_obra ADD COLUMN IF NOT EXISTS lugar_entrega VARCHAR(300);
