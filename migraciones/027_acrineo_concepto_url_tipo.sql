/******************************************************************************/
/****  027 - ACRINEO · URL y Tipo del concepto                               ****/
/****                                                                       ****/
/****  url:  enlace del concepto (ficha técnica, plano, catálogo del        ****/
/****        proveedor…); solo http:// o https://.                          ****/
/****  tipo: código del tipo de concepto, como la columna Tipo de Neodata   ****/
/****        (los renglones nuevos llevan 4).                               ****/
/****                                                                       ****/
/****  Requiere la 025. Se aplica con: php herramientas/migrar.php --aplicar ****/
/******************************************************************************/

ALTER TABLE acrineo_conceptos ADD COLUMN IF NOT EXISTS url VARCHAR(500)
    CHECK (url IS NULL OR url ~* '^https?://[^[:space:]]+$');
ALTER TABLE acrineo_conceptos ADD COLUMN IF NOT EXISTS tipo SMALLINT NOT NULL DEFAULT 4
    CHECK (tipo BETWEEN 0 AND 99);
