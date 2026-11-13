/****************************************************************************************/
/****  030 · ACRINEO › opciones de la ventana «Cálculo» del presupuesto (botón de     ****/
/****        cuadrícula de la hoja). Se guardan con el presupuesto, junto a sus        ****/
/****        decimales (decimales_costos y decimales_explosion ya existen).            ****/
/****************************************************************************************/

ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS tipo_explosion VARCHAR(10) NOT NULL DEFAULT 'todo';
ALTER TABLE acrineo_presupuesto_calculo DROP CONSTRAINT IF EXISTS ck_acrineo_calculo_tipo_explosion;
ALTER TABLE acrineo_presupuesto_calculo ADD CONSTRAINT ck_acrineo_calculo_tipo_explosion CHECK (tipo_explosion IN ('todo', 'marcados', 'no'));

ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS errores_potenciales    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS ch_misma_tasa          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS ch_tasa                NUMERIC(7,4) NOT NULL DEFAULT 12;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS asignar_fecha          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS fecha_insumos          DATE;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS respaldo_correo        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS moneda                 SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS explosion_x_concepto   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS explotar_ch            BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acrineo_presupuesto_calculo ADD COLUMN IF NOT EXISTS no_explotar_integrados BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE acrineo_presupuesto_calculo DROP CONSTRAINT IF EXISTS ck_acrineo_calculo_moneda;
ALTER TABLE acrineo_presupuesto_calculo ADD CONSTRAINT ck_acrineo_calculo_moneda CHECK (moneda IN (1, 2));
ALTER TABLE acrineo_presupuesto_calculo DROP CONSTRAINT IF EXISTS ck_acrineo_calculo_ch_tasa;
ALTER TABLE acrineo_presupuesto_calculo ADD CONSTRAINT ck_acrineo_calculo_ch_tasa CHECK (ch_tasa >= 0 AND ch_tasa <= 100);
