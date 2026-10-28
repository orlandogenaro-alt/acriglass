/******************************************************************************/
/****  019 - Gastos de Operación calculados                                 ****/
/****                                                                       ****/
/****  Un renglón del presupuesto (doctos_sugerido_obra_det) puede          ****/
/****  calcularse en lugar de capturar su importe: por unidad, por hora o   ****/
/****  por jornada (cantidad × costo) o como % de la mano de obra (p. ej.   ****/
/****  herramienta 3 %). Se guardan todos sus componentes, no solo el       ****/
/****  importe (que sigue en «presupuesto»). Sin calculo_base = importe     ****/
/****  fijo capturado, como siempre: los renglones existentes no cambian.   ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra_det ADD COLUMN IF NOT EXISTS calculo_base VARCHAR(10)
    CHECK (calculo_base IS NULL OR calculo_base IN ('unidad', 'hora', 'jornada', 'pct_mo'));
ALTER TABLE doctos_sugerido_obra_det ADD COLUMN IF NOT EXISTS calculo_cantidad NUMERIC(18,4) CHECK (calculo_cantidad IS NULL OR calculo_cantidad >= 0);
ALTER TABLE doctos_sugerido_obra_det ADD COLUMN IF NOT EXISTS calculo_unidad   VARCHAR(20);
ALTER TABLE doctos_sugerido_obra_det ADD COLUMN IF NOT EXISTS calculo_costo    NUMERIC(18,4) CHECK (calculo_costo IS NULL OR calculo_costo >= 0);
ALTER TABLE doctos_sugerido_obra_det ADD COLUMN IF NOT EXISTS calculo_pct      NUMERIC(9,4)  CHECK (calculo_pct IS NULL OR calculo_pct >= 0);
