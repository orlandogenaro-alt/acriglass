/****************************************************************************************/
/****  032 · ACRINEO › factores del sobrecosto (ventana «Sobrecosto», Ctrl+Shift+S): ****/
/****        indirecto de campo y de oficina, financiamiento, utilidad y cargos       ****/
/****        adicionales, en %. El % de sobrecosto que resulta se guarda en           ****/
/****        acrineo_presupuestos.sobrecosto_pct como siempre.                         ****/
/****************************************************************************************/

ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS indirecto_campo    NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS indirecto_oficina  NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS financiamiento     NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS utilidad           NUMERIC(10,6) NOT NULL DEFAULT 0;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS cargos_adicionales NUMERIC(10,6) NOT NULL DEFAULT 0;
