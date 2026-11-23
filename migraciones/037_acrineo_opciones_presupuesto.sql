/****************************************************************************************/
/****  037 · ACRINEO › Opciones del presupuesto: catálogos de Materiales, Mano de     ****/
/****        obra y Maquinaria del presupuesto, Actualizar costos y FASAR.          ****/
/****                                                                               ****/
/****  acrineo_presupuesto_insumos  datos de cada insumo DENTRO del presupuesto     ****/
/****        (los insumos viven en las matrices; la clave es la misma con la que   ****/
/****        los junta la explosión: i<insumo_id> o l<CÓDIGO|DESCRIPCIÓN|…>).      ****/
/****        datos: material  {costo_lab, fletes, maniobra, almacenaje, derechos,  ****/
/****                          mermas}  → costo = la suma                          ****/
/****               mano obra {salario_base, fasar, viaticos, alimentacion,        ****/
/****                          sepelio, otras} → costo = salario × FASAR + extras  ****/
/****               maquinaria {vida_llantas, vida_piezas, potencia}               ****/
/****        fecha: fecha del precio del catálogo con que se actualizó el costo.   ****/
/****  acrineo_presupuesto_fasar  Factor de Salario Real del presupuesto (mismos   ****/
/****        datos que el FASAR del sistema, migración 005).                       ****/
/****************************************************************************************/

CREATE TABLE IF NOT EXISTS acrineo_presupuesto_insumos (
    presupuesto_id  INTEGER NOT NULL REFERENCES acrineo_presupuestos (presupuesto_id) ON DELETE CASCADE,
    clave           TEXT NOT NULL,
    tipo            VARCHAR(8),
    datos           JSONB NOT NULL DEFAULT '{}',
    fecha           DATE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (presupuesto_id, clave)
);

CREATE TABLE IF NOT EXISTS acrineo_presupuesto_fasar (
    presupuesto_id    INTEGER PRIMARY KEY REFERENCES acrineo_presupuestos (presupuesto_id) ON DELETE CASCADE,
    dias_calendario   NUMERIC(8,2) NOT NULL DEFAULT 365 CHECK (dias_calendario > 0),
    dias_pagados      JSONB NOT NULL DEFAULT '[]',
    dias_no_laborados JSONB NOT NULL DEFAULT '[]',
    obligaciones      JSONB NOT NULL DEFAULT '[]',
    tp                NUMERIC(10,4) NOT NULL,
    tl                NUMERIC(10,4) NOT NULL CHECK (tl > 0),
    ps                NUMERIC(10,6) NOT NULL,
    fsr               NUMERIC(8,4) NOT NULL CHECK (fsr > 0 AND fsr < 10),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by        VARCHAR(50)
);

/* Datos del IMSS del FASAR: año, salario mínimo, UMA, límites (grupos 1 y 2), considerar (patron | ambos), SAR,
   INFONAVIT, riesgo de trabajo, impuesto sobre nómina y otros cargos (includes/acrineo/opciones.php) */
ALTER TABLE acrineo_presupuesto_fasar ADD COLUMN IF NOT EXISTS parametros JSONB NOT NULL DEFAULT '{}';

ALTER TABLE acrineo_presupuesto_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE acrineo_presupuesto_fasar   ENABLE ROW LEVEL SECURITY;
