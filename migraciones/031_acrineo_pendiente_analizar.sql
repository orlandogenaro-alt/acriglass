/****************************************************************************************/
/****  031 · ACRINEO › P.A. = «Pendiente de analizar» (como en Neodata): marca de que ****/
/****        al concepto le falta terminar su análisis de precio unitario. Se marca   ****/
/****        en la columna P.A. de los conceptos o en el encabezado de la matriz.     ****/
/****        (El precio fijo, «precio alzado», se sigue capturando en la columna      ****/
/****        Precio; no cambia.)                                                       ****/
/****************************************************************************************/

ALTER TABLE acrineo_conceptos ADD COLUMN IF NOT EXISTS pendiente_analizar BOOLEAN NOT NULL DEFAULT false;
