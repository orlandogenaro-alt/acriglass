/******************************************************************************/
/****  020 - Sobrecosto del presupuesto                                     ****/
/****                                                                       ****/
/****  Botón Sobrecosto: la integración del precio sobre el costo directo   ****/
/****  de la obra (indirectos de campo y de oficina, financiamiento con su  ****/
/****  tasa, plazo, anticipo e indicador económico, utilidad y cargos       ****/
/****  adicionales) y el factor de sobrecosto. Se guardan TODOS sus         ****/
/****  componentes en cada Guardar, no solo el resultado; el precio y el    ****/
/****  factor los calcula el servidor (includes/presupuesto-calculo.php).   ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS presupuesto_sobrecosto (
    docto_sugerido_obra_id    INTEGER PRIMARY KEY REFERENCES doctos_sugerido_obra (docto_sugerido_obra_id) ON DELETE CASCADE,
    costo_directo             NUMERIC(18,2) NOT NULL DEFAULT 0,
    mano_obra_gravable        NUMERIC(18,2) NOT NULL DEFAULT 0,   /* mano de obra con FSR */
    indirectos_campo          NUMERIC(18,2) NOT NULL DEFAULT 0,
    indirectos_oficina        NUMERIC(18,2) NOT NULL DEFAULT 0,
    indirectos_otros          NUMERIC(18,2) NOT NULL DEFAULT 0,
    financiamiento_pct        NUMERIC(9,4)  NOT NULL DEFAULT 0,
    financiamiento            NUMERIC(18,2) NOT NULL DEFAULT 0,
    tasa_interes_pct          NUMERIC(9,4),                       /* tasa anual con que se estimó el financiamiento */
    plazo_meses               NUMERIC(9,2),
    anticipo_pct              NUMERIC(9,4),
    indicador_economico       VARCHAR(60),                        /* p. ej. TIIE 28 días */
    utilidad_pct              NUMERIC(9,4)  NOT NULL DEFAULT 0,   /* Utilidad Neta del presupuesto */
    utilidad_modo             VARCHAR(6)    NOT NULL DEFAULT 'costo' CHECK (utilidad_modo IN ('costo', 'margen')),
    utilidad_pct_equivalente  NUMERIC(12,6) NOT NULL DEFAULT 0,   /* el % sobre CD + Ind + Fin que da el mismo subtotal */
    utilidad                  NUMERIC(18,2) NOT NULL DEFAULT 0,
    cargos_pct                NUMERIC(9,4)  NOT NULL DEFAULT 0,   /* comisiones y seguro, % del precio */
    cargos                    NUMERIC(18,2) NOT NULL DEFAULT 0,
    precio_venta              NUMERIC(18,2) NOT NULL DEFAULT 0,
    factor                    NUMERIC(12,6) NOT NULL DEFAULT 0,
    subtotal_presupuesto      NUMERIC(18,2) NOT NULL DEFAULT 0,   /* el Subtotal del documento, para comparar */
    usuario                   VARCHAR(50),
    fecha                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE presupuesto_sobrecosto ENABLE ROW LEVEL SECURITY;
