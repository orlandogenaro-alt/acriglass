/******************************************************************************/
/****  007 - Tasa de IVA de cada presupuesto (Supabase)                     ****/
/****                                                                       ****/
/****  Las tasas que se pueden elegir se configuran en Administrador ›      ****/
/****  Parámetros de presupuesto (16 %, frontera 8 %, exento…). Los         ****/
/****  presupuestos guardados antes quedan con 16 %, que es con lo que se   ****/
/****  calcularon.                                                          ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra ADD COLUMN IF NOT EXISTS iva_pct NUMERIC(6,3) NOT NULL DEFAULT 16
    CHECK (iva_pct >= 0 AND iva_pct < 100);
