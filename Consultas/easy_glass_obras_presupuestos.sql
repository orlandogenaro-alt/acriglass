/******************************************************************************/
/****  AcriGlass - Presupuestos de Obra y Registro de Obra                  ****/
/****  Estructura para la base EASY_GLASS (Firebird 3, dialecto 3)          ****/
/****                                                                       ****/
/****  Todos los objetos llevan el prefijo AG_ (AcriGlass) para que nunca   ****/
/****  choquen con tablas actuales o futuras de Easy-Glass.                 ****/
/****  Las COLUMNAS conservan los nombres del sistema original (Form46 /    ****/
/****  sugeridos_obra.vb) para poder portar sus consultas.                  ****/
/****                                                                       ****/
/****  Equivalencias con el sistema original:                               ****/
/****    CONCEPTOS_MAT_PRIMA_OBRA      -> AG_CONCEPTOS_MP                   ****/
/****    CONCEPTOS_MANO_OBRA           -> AG_CONCEPTOS_MO                   ****/
/****    CONCEPTOS_GAS_OPERACION_OBRA  -> AG_CONCEPTOS_GO                   ****/
/****    EMPLEADOS_OBRA                -> AG_EMPLEADOS_OBRA                 ****/
/****    TIPOS_EMPLEADOS_COMISIONES    -> AG_TIPOS_COMISION                 ****/
/****    PARAMETROS_COSTOS_SUG         -> AG_PARAMETROS_OBRA                ****/
/****    DOCTOS_SUGERIDO_OBRA          -> AG_PRESUPUESTOS                   ****/
/****    DOCTOS_SUGERIDO_OBRA_DET      -> AG_PRESUPUESTOS_DET               ****/
/****    DOCTOS_SUGE_OBRA_DET_MAT      -> AG_PRESUPUESTOS_MAT               ****/
/****    MANO_OBRA_DETALLE             -> AG_PRES_MANO_OBRA                 ****/
/****    COMISIONES_OBRA_DET           -> AG_PRES_COMISIONES                ****/
/****    ANEXOS_OBRA_SEGURO            -> AG_PRES_SEGURO                    ****/
/****    SUGERIDOS_RELACIONADOS        -> AG_PRES_RELACIONADOS              ****/
/****    REG_OBRAS                     -> AG_OBRAS                          ****/
/****    RESPONSABLES_DE_OBRA          -> AG_OBRAS_RESPONSABLES             ****/
/****    VENDEDORES_OBRAS              -> VENDEDORES (de Easy-Glass)        ****/
/****    ELIMINA_CONCEPTOS_PRE_OBRA    -> AG_ELIMINA_CONCEPTO_OBRA          ****/
/****                                                                       ****/
/****  El script solo CREA objetos nuevos: no modifica ni borra nada        ****/
/****  existente de Easy-Glass.                                             ****/
/****                                                                       ****/
/****  CORRER PRIMERO EN UNA COPIA DE easy_glass.fdb                        ****/
/******************************************************************************/

/* ---------------------------------------------------------------------------
   PASO 0: verificar que no exista ningun objeto AG_. Debe regresar vacio.

   SELECT TRIM(RDB$RELATION_NAME)  FROM RDB$RELATIONS  WHERE RDB$RELATION_NAME  STARTING WITH 'AG_'
   UNION ALL
   SELECT TRIM(RDB$GENERATOR_NAME) FROM RDB$GENERATORS WHERE RDB$GENERATOR_NAME STARTING WITH 'AG_'
   UNION ALL
   SELECT TRIM(RDB$PROCEDURE_NAME) FROM RDB$PROCEDURES WHERE RDB$PROCEDURE_NAME STARTING WITH 'AG_'
   UNION ALL
   SELECT TRIM(RDB$EXCEPTION_NAME) FROM RDB$EXCEPTIONS WHERE RDB$EXCEPTION_NAME STARTING WITH 'AG_'
   UNION ALL
   SELECT TRIM(RDB$TRIGGER_NAME)   FROM RDB$TRIGGERS   WHERE RDB$TRIGGER_NAME   STARTING WITH 'AG_';
--------------------------------------------------------------------------- */

SET SQL DIALECT 3;


/******************************************************************************/
/****                              Secuencias                              ****/
/******************************************************************************/

CREATE SEQUENCE AG_GEN_IDS;             /* ids internos de todas las tablas AG_ */
CREATE SEQUENCE AG_FOLIOS_PRESUPUESTO;  /* folio visible del presupuesto        */

COMMIT;


/******************************************************************************/
/****                              Catalogos                               ****/
/******************************************************************************/

/* Conceptos de Materia Prima (combo "Concepto" de la pestana Materia Prima) */
CREATE TABLE AG_CONCEPTOS_MP (
    CONCEPTO_MAT_PRIMA_ID  INTEGER NOT NULL,
    DESCRIPCION            VARCHAR(80),
    CLAVE                  VARCHAR(10),
    CALCULO_AUTOMATICO     CHAR(10) DEFAULT 'False',   /* 'True' / 'False' como en el VB */
    PORCENTAJE_CALCULO     NUMERIC(15,2) DEFAULT 0,
    AFECTA_GASTO_OPER      INTEGER DEFAULT 0,
    CONSTRAINT AG_PK_CONCEPTOS_MP PRIMARY KEY (CONCEPTO_MAT_PRIMA_ID)
);

/* Conceptos de Mano de Obra */
CREATE TABLE AG_CONCEPTOS_MO (
    CONCEPTO_MANO_OBRA_ID  INTEGER NOT NULL,
    CLAVE                  VARCHAR(10),
    DESCRIPCION            VARCHAR(80),
    CONSTRAINT AG_PK_CONCEPTOS_MO PRIMARY KEY (CONCEPTO_MANO_OBRA_ID)
);

/* Conceptos de Gastos de Operacion */
CREATE TABLE AG_CONCEPTOS_GO (
    CONCEPTO_GAS_OPERACION_OBRA_ID  INTEGER NOT NULL,
    CLAVE                           VARCHAR(10),
    DESCRIPCION                     VARCHAR(80),
    CALCULO_AUTOMATICO              VARCHAR(10) DEFAULT 'False',
    PORCENTAJE_CALCULO              NUMERIC(15,4) DEFAULT 0,
    ES_CONCEPTO_SEGURO              VARCHAR(1) DEFAULT 'F',
    CONSTRAINT AG_PK_CONCEPTOS_GO PRIMARY KEY (CONCEPTO_GAS_OPERACION_OBRA_ID)
);

/* Empleados de obra (mano de obra, sueldo diario) */
CREATE TABLE AG_EMPLEADOS_OBRA (
    EMPLEADO_ID      INTEGER NOT NULL,
    NUMERO_EMPLEADO  INTEGER,
    NOMBRE           VARCHAR(200),
    TIPO             INTEGER,
    ESTATUS          CHAR(1) DEFAULT 'A',
    TELEFONO         VARCHAR(50),
    DIRECCION        VARCHAR(430),
    SUELDO_DIARIO    NUMERIC(15,2) DEFAULT 0,
    COMISION         NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_EMPLEADOS_OBRA PRIMARY KEY (EMPLEADO_ID)
);

/* Tipos de empleado para comisiones de obra */
CREATE TABLE AG_TIPOS_COMISION (
    TIPO_EMPLEADO_ID  INTEGER NOT NULL,
    CLAVE             VARCHAR(20),
    NOMBRE            VARCHAR(50),
    PORCENTAJE        NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_TIPOS_COMISION PRIMARY KEY (TIPO_EMPLEADO_ID)
);

/* Parametros de obra (clave 101 = % utilidad neta) */
CREATE TABLE AG_PARAMETROS_OBRA (
    CLAVE                INTEGER NOT NULL,
    DESCRIPCION          VARCHAR(50),
    VALOR                NUMERIC(18,6) DEFAULT 0,
    FECHA_ACTUALIZACION  DATE,
    CONSTRAINT AG_PK_PARAMETROS_OBRA PRIMARY KEY (CLAVE)
);

COMMIT;


/******************************************************************************/
/****                       Presupuesto de Obra                            ****/
/******************************************************************************/

/* Encabezado del presupuesto */
CREATE TABLE AG_PRESUPUESTOS (
    DOCTO_SUGERIDO_OBRA_ID  INTEGER NOT NULL,
    FOLIO                   INTEGER,
    FECHA                   DATE,
    CLIENTE_ID              INTEGER,          /* opcional: CLIENTES de Easy-Glass */
    CLIENTE                 VARCHAR(150),
    CORREO_ELECTRONICO      VARCHAR(150),
    PROYECTO                VARCHAR(200),
    UBICACION               VARCHAR(150),
    VENDEDOR_ID             INTEGER,          /* VENDEDORES de Easy-Glass */
    USUARIO_CREADOR         VARCHAR(50),
    FECHA_CREACION          TIMESTAMP,
    ESTATUS                 VARCHAR(15) DEFAULT 'Pendiente',
    UTILIDAD_NETA_POR       NUMERIC(15,4) DEFAULT 0,
    COS_PRIMO               NUMERIC(15,2) DEFAULT 0,
    GAS_OPERACION           NUMERIC(15,2) DEFAULT 0,
    UTILIDAD_NETA           NUMERIC(15,2) DEFAULT 0,
    SUBTOTAL                NUMERIC(15,2) DEFAULT 0,
    IVA                     NUMERIC(15,2) DEFAULT 0,
    TOTAL                   NUMERIC(15,2) DEFAULT 0,
    NOTAS                   MEMO,
    OBRA_ID                 INTEGER,
    ID_HS                   VARCHAR(30),      /* Id de negocio en HubSpot */
    CONSTRAINT AG_PK_PRESUPUESTOS PRIMARY KEY (DOCTO_SUGERIDO_OBRA_ID)
);

/* Renglones del presupuesto. TIPO_CONCEPTO: 'MP' materia prima, 'MO' mano de obra, 'GO' gastos de operacion */
CREATE TABLE AG_PRESUPUESTOS_DET (
    DOCTO_SUGERIDO_OBRA_DET_ID  INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_ID      INTEGER NOT NULL,
    CONCEPTO_ID                 INTEGER,
    PRESUPUESTO                 NUMERIC(15,2) DEFAULT 0,
    SUBTOTAL                    NUMERIC(15,2) DEFAULT 0,
    TOTAL                       NUMERIC(15,2) DEFAULT 0,
    PORCENTAJE                  NUMERIC(15,2) DEFAULT 0,
    DOCTO_IMP_ID                INTEGER,          /* documento importado (columna "Importar") */
    FOLIO                       VARCHAR(20),      /* columna "Folio.Doc." */
    TIPO_DOCTO                  VARCHAR(2),
    NOTAS                       MEMO,
    TIPO_CONCEPTO               CHAR(2),
    CONSTRAINT AG_PK_PRESUPUESTOS_DET PRIMARY KEY (DOCTO_SUGERIDO_OBRA_DET_ID),
    CONSTRAINT AG_FK_PRES_DET_ENC FOREIGN KEY (DOCTO_SUGERIDO_OBRA_ID)
        REFERENCES AG_PRESUPUESTOS (DOCTO_SUGERIDO_OBRA_ID) ON DELETE CASCADE
);

/* Articulos del documento importado en un renglon */
CREATE TABLE AG_PRESUPUESTOS_MAT (
    DOCTO_SUGE_OBRA_DET_MAT_ID  INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_DET_ID  INTEGER NOT NULL,
    DOCTO_ID                    INTEGER,
    FECHA                       DATE,
    FOLIO                       VARCHAR(10),
    CLAVE_CLIENTE               VARCHAR(30),
    ID_ARTICULO                 INTEGER,
    CLAVE_ARTICULO              VARCHAR(30),
    NOM_ARTICULO                VARCHAR(200),
    UNIDADES                    NUMERIC(15,2) DEFAULT 0,
    PRECIO_UNIT                 NUMERIC(15,2) DEFAULT 0,
    PRECIO_TOTAL                NUMERIC(15,2) DEFAULT 0,
    UNID_MEDIDA                 VARCHAR(30),
    CONSTRAINT AG_PK_PRESUPUESTOS_MAT PRIMARY KEY (DOCTO_SUGE_OBRA_DET_MAT_ID),
    CONSTRAINT AG_FK_PRES_MAT_DET FOREIGN KEY (DOCTO_SUGERIDO_OBRA_DET_ID)
        REFERENCES AG_PRESUPUESTOS_DET (DOCTO_SUGERIDO_OBRA_DET_ID) ON DELETE CASCADE
);

/* Detalle de mano de obra: empleados x dias */
CREATE TABLE AG_PRES_MANO_OBRA (
    MANO_OBRA_DET_ID        INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_ID  INTEGER NOT NULL,
    EMPLEADO_ID             INTEGER,
    CLAVE_EMPLEADO          INTEGER,
    NOMBRE                  VARCHAR(200),
    SUELDO_DIARIO           NUMERIC(15,2) DEFAULT 0,
    NUM_DIAS                NUMERIC(15,2) DEFAULT 0,
    TOTAL                   NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_PRES_MANO_OBRA PRIMARY KEY (MANO_OBRA_DET_ID),
    CONSTRAINT AG_FK_PRES_MO_ENC FOREIGN KEY (DOCTO_SUGERIDO_OBRA_ID)
        REFERENCES AG_PRESUPUESTOS (DOCTO_SUGERIDO_OBRA_ID) ON DELETE CASCADE
);

/* Comisiones por tipo de empleado */
CREATE TABLE AG_PRES_COMISIONES (
    COMISION_OBRA_DET_ID    INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_ID  INTEGER NOT NULL,
    TIPO_EMPLEADO_ID        INTEGER,
    NOMBRE                  VARCHAR(50),
    PORCENTAJE              NUMERIC(15,4) DEFAULT 0,
    TOTAL_COMISION          NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_PRES_COMISIONES PRIMARY KEY (COMISION_OBRA_DET_ID),
    CONSTRAINT AG_FK_PRES_COM_ENC FOREIGN KEY (DOCTO_SUGERIDO_OBRA_ID)
        REFERENCES AG_PRESUPUESTOS (DOCTO_SUGERIDO_OBRA_ID) ON DELETE CASCADE
);

/* Anexo de seguro (conceptos de gasto marcados ES_CONCEPTO_SEGURO) */
CREATE TABLE AG_PRES_SEGURO (
    ANEXO_OBRA_IDD                  INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_ID          INTEGER NOT NULL,
    CONCEPTO_GAS_OPERACION_OBRA_ID  INTEGER,
    NOMBRE                          VARCHAR(80),
    PORCENTAJE_1                    NUMERIC(15,2) DEFAULT 0,
    PORCENTAJE_2                    NUMERIC(15,2) DEFAULT 0,
    TOTAL                           NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_PRES_SEGURO PRIMARY KEY (ANEXO_OBRA_IDD),
    CONSTRAINT AG_FK_PRES_SEG_ENC FOREIGN KEY (DOCTO_SUGERIDO_OBRA_ID)
        REFERENCES AG_PRESUPUESTOS (DOCTO_SUGERIDO_OBRA_ID) ON DELETE CASCADE
);

/* Pestana "Sugeridos relacionados" */
CREATE TABLE AG_PRES_RELACIONADOS (
    SUG_RELACION_ID        INTEGER NOT NULL,
    SUGERIDO_ID_PADRE      INTEGER NOT NULL,
    SUGERIDO_ID_HIJO       INTEGER,
    FOLIO_SUGERIDO_HIJO    INTEGER,
    CLIENTE_SUGERIDO_HIJO  VARCHAR(100),
    TIPO                   CHAR(2),
    CONSTRAINT AG_PK_PRES_RELACIONADOS PRIMARY KEY (SUG_RELACION_ID),
    CONSTRAINT AG_FK_PRES_REL_PADRE FOREIGN KEY (SUGERIDO_ID_PADRE)
        REFERENCES AG_PRESUPUESTOS (DOCTO_SUGERIDO_OBRA_ID) ON DELETE CASCADE
);

COMMIT;


/******************************************************************************/
/****                           Registro de Obra                           ****/
/******************************************************************************/

CREATE TABLE AG_OBRAS (
    OBRA_ID               INTEGER NOT NULL,
    SUGERIDO_ID           INTEGER,            /* presupuesto de origen (0 = sin presupuesto) */
    NOM_OBRA              VARCHAR(200),
    DIRECCION             VARCHAR(200),
    CONTACTO              VARCHAR(150),
    NOTAS                 MEMO,
    FECHA_INI             DATE,
    FECHA_FIN             DATE,
    ESTATUS               VARCHAR(30) DEFAULT 'Planificacion',
    FECHA_CREACION        TIMESTAMP,
    USUARIO_CREACION      VARCHAR(50),
    IMAGEN                IMAGEN,
    GASTO_ADMINISTRATIVO  NUMERIC(15,2) DEFAULT 26,   /* el VB usa 26 cuando viene nulo */
    AVANCE_OBRA           INTEGER DEFAULT 0,
    IMP_FAC_OBRA          NUMERIC(15,2) DEFAULT 0,
    CONSTRAINT AG_PK_OBRAS PRIMARY KEY (OBRA_ID)
    /* Sin FK a AG_PRESUPUESTOS: una obra puede no venir de presupuesto (SUGERIDO_ID = 0) */
);

/* Responsables (vendedores) asignados a la obra */
CREATE TABLE AG_OBRAS_RESPONSABLES (
    RES_OBRA_ID      INTEGER NOT NULL,
    OBRA_ID          INTEGER NOT NULL,
    VENDEDOR_ID      INTEGER NOT NULL,      /* VENDEDORES de Easy-Glass */
    FECHA_HORA_ASIG  TIMESTAMP,
    CONSTRAINT AG_PK_OBRAS_RESPONSABLES PRIMARY KEY (RES_OBRA_ID),
    CONSTRAINT AG_UQ_OBRAS_RESPONSABLES UNIQUE (OBRA_ID, VENDEDOR_ID),
    CONSTRAINT AG_FK_OBRAS_RESP_OBRA FOREIGN KEY (OBRA_ID)
        REFERENCES AG_OBRAS (OBRA_ID) ON DELETE CASCADE
);

COMMIT;


/******************************************************************************/
/****                               Indices                                ****/
/******************************************************************************/

CREATE UNIQUE INDEX AG_IDX_PRES_FOLIO    ON AG_PRESUPUESTOS (FOLIO);
CREATE INDEX AG_IDX_PRES_ESTATUS         ON AG_PRESUPUESTOS (ESTATUS);
CREATE INDEX AG_IDX_PRES_FECHA           ON AG_PRESUPUESTOS (FECHA);
CREATE INDEX AG_IDX_PRES_VENDEDOR        ON AG_PRESUPUESTOS (VENDEDOR_ID);
CREATE INDEX AG_IDX_PRES_OBRA            ON AG_PRESUPUESTOS (OBRA_ID);
CREATE INDEX AG_IDX_PRES_DET_TIPO        ON AG_PRESUPUESTOS_DET (DOCTO_SUGERIDO_OBRA_ID, TIPO_CONCEPTO);
CREATE INDEX AG_IDX_PRES_DET_CONCEPTO    ON AG_PRESUPUESTOS_DET (CONCEPTO_ID);
CREATE INDEX AG_IDX_OBRAS_ESTATUS        ON AG_OBRAS (ESTATUS);
CREATE INDEX AG_IDX_OBRAS_SUGERIDO       ON AG_OBRAS (SUGERIDO_ID);
CREATE INDEX AG_IDX_OBRAS_RESP_VEND      ON AG_OBRAS_RESPONSABLES (VENDEDOR_ID);

COMMIT;


/******************************************************************************/
/****                               Triggers                               ****/
/****   Asignan el id cuando llega nulo o 0 (igual que en el original).    ****/
/******************************************************************************/

SET TERM ^ ;

CREATE TRIGGER AG_CONCEPTOS_MP_BI FOR AG_CONCEPTOS_MP
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.CONCEPTO_MAT_PRIMA_ID IS NULL OR NEW.CONCEPTO_MAT_PRIMA_ID = 0) THEN
    NEW.CONCEPTO_MAT_PRIMA_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_CONCEPTOS_MO_BI FOR AG_CONCEPTOS_MO
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.CONCEPTO_MANO_OBRA_ID IS NULL OR NEW.CONCEPTO_MANO_OBRA_ID = 0) THEN
    NEW.CONCEPTO_MANO_OBRA_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_CONCEPTOS_GO_BI FOR AG_CONCEPTOS_GO
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.CONCEPTO_GAS_OPERACION_OBRA_ID IS NULL OR NEW.CONCEPTO_GAS_OPERACION_OBRA_ID = 0) THEN
    NEW.CONCEPTO_GAS_OPERACION_OBRA_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_EMPLEADOS_OBRA_BI FOR AG_EMPLEADOS_OBRA
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.EMPLEADO_ID IS NULL OR NEW.EMPLEADO_ID = 0) THEN
    NEW.EMPLEADO_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_TIPOS_COMISION_BI FOR AG_TIPOS_COMISION
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.TIPO_EMPLEADO_ID IS NULL OR NEW.TIPO_EMPLEADO_ID = 0) THEN
    NEW.TIPO_EMPLEADO_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PARAMETROS_OBRA_BIU FOR AG_PARAMETROS_OBRA
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS
BEGIN
  IF (INSERTING OR NEW.VALOR IS DISTINCT FROM OLD.VALOR) THEN
    NEW.FECHA_ACTUALIZACION = CURRENT_DATE;
END
^

/* Folio consecutivo y fecha de creacion al dar de alta */
CREATE TRIGGER AG_PRESUPUESTOS_BIU FOR AG_PRESUPUESTOS
ACTIVE BEFORE INSERT OR UPDATE POSITION 0
AS
BEGIN
  IF (NEW.DOCTO_SUGERIDO_OBRA_ID IS NULL OR NEW.DOCTO_SUGERIDO_OBRA_ID = 0) THEN
    NEW.DOCTO_SUGERIDO_OBRA_ID = GEN_ID(AG_GEN_IDS, 1);
  IF (NEW.FOLIO IS NULL OR NEW.FOLIO = 0) THEN
  BEGIN
    NEW.FOLIO = GEN_ID(AG_FOLIOS_PRESUPUESTO, 1);
    NEW.FECHA_CREACION = CURRENT_TIMESTAMP;
  END
END
^

/* En el original el renglon nuevo llega con id -1 */
CREATE TRIGGER AG_PRESUPUESTOS_DET_BI FOR AG_PRESUPUESTOS_DET
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.DOCTO_SUGERIDO_OBRA_DET_ID IS NULL OR NEW.DOCTO_SUGERIDO_OBRA_DET_ID IN (-1, 0)) THEN
    NEW.DOCTO_SUGERIDO_OBRA_DET_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PRESUPUESTOS_MAT_BI FOR AG_PRESUPUESTOS_MAT
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.DOCTO_SUGE_OBRA_DET_MAT_ID IS NULL OR NEW.DOCTO_SUGE_OBRA_DET_MAT_ID = 0) THEN
    NEW.DOCTO_SUGE_OBRA_DET_MAT_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PRES_MANO_OBRA_BI FOR AG_PRES_MANO_OBRA
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.MANO_OBRA_DET_ID IS NULL OR NEW.MANO_OBRA_DET_ID = 0) THEN
    NEW.MANO_OBRA_DET_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PRES_COMISIONES_BI FOR AG_PRES_COMISIONES
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.COMISION_OBRA_DET_ID IS NULL OR NEW.COMISION_OBRA_DET_ID = 0) THEN
    NEW.COMISION_OBRA_DET_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PRES_SEGURO_BI FOR AG_PRES_SEGURO
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.ANEXO_OBRA_IDD IS NULL OR NEW.ANEXO_OBRA_IDD = 0) THEN
    NEW.ANEXO_OBRA_IDD = GEN_ID(AG_GEN_IDS, 1);
END
^

CREATE TRIGGER AG_PRES_RELACIONADOS_BI FOR AG_PRES_RELACIONADOS
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.SUG_RELACION_ID IS NULL OR NEW.SUG_RELACION_ID = 0) THEN
    NEW.SUG_RELACION_ID = GEN_ID(AG_GEN_IDS, 1);
END
^

/* En el VB el id de obra se tomaba de retorna_id_catalogos(); aqui lo da el trigger */
CREATE TRIGGER AG_OBRAS_BI FOR AG_OBRAS
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.OBRA_ID IS NULL OR NEW.OBRA_ID = 0) THEN
    NEW.OBRA_ID = GEN_ID(AG_GEN_IDS, 1);
  IF (NEW.FECHA_CREACION IS NULL) THEN
    NEW.FECHA_CREACION = CURRENT_TIMESTAMP;
END
^

CREATE TRIGGER AG_OBRAS_RESPONSABLES_BI FOR AG_OBRAS_RESPONSABLES
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
  IF (NEW.RES_OBRA_ID IS NULL OR NEW.RES_OBRA_ID = 0) THEN
    NEW.RES_OBRA_ID = GEN_ID(AG_GEN_IDS, 1);
  IF (NEW.FECHA_HORA_ASIG IS NULL) THEN
    NEW.FECHA_HORA_ASIG = CURRENT_TIMESTAMP;
END
^

SET TERM ; ^

COMMIT;


/******************************************************************************/
/****                       Procedimientos                                 ****/
/******************************************************************************/

CREATE EXCEPTION AG_EX_CONCEPTO_EN_USO
  'EL CONCEPTO QUE INTENTA ELIMINAR YA SE ENCUENTRA RELACIONADO EN UN PRESUPUESTO, NO ES POSIBLE ELIMINAR';

COMMIT;

SET TERM ^ ;

/* Borra un concepto del catalogo solo si ningun presupuesto lo usa.
   TIPO: 1 materia prima, 2 mano de obra, 3 gastos de operacion */
CREATE PROCEDURE AG_ELIMINA_CONCEPTO_OBRA (
    CONCEPTO_ID INTEGER,
    TIPO INTEGER)
AS
BEGIN
  IF (EXISTS (SELECT 1 FROM AG_PRESUPUESTOS_DET T WHERE T.CONCEPTO_ID = :CONCEPTO_ID)) THEN
    EXCEPTION AG_EX_CONCEPTO_EN_USO;

  IF (TIPO = 1) THEN
    DELETE FROM AG_CONCEPTOS_MP WHERE CONCEPTO_MAT_PRIMA_ID = :CONCEPTO_ID;
  ELSE IF (TIPO = 2) THEN
    DELETE FROM AG_CONCEPTOS_MO WHERE CONCEPTO_MANO_OBRA_ID = :CONCEPTO_ID;
  ELSE IF (TIPO = 3) THEN
    DELETE FROM AG_CONCEPTOS_GO WHERE CONCEPTO_GAS_OPERACION_OBRA_ID = :CONCEPTO_ID;
END
^

SET TERM ; ^

COMMIT;


/******************************************************************************/
/****                          Datos iniciales                             ****/
/******************************************************************************/

/* % de utilidad neta por omision (en la pantalla aparece 40) */
INSERT INTO AG_PARAMETROS_OBRA (CLAVE, DESCRIPCION, VALOR) VALUES (101, 'PORCENTAJE UTILIDAD NETA OBRA', 40);

/* Conceptos de materia prima vistos en el sistema de referencia. Revisa los
   porcentajes de calculo automatico antes de descomentar.
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('ACCESORIOS',        'ACC',   'False', 0);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('ALUMINIO',          'ALU',   'False', 0);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('CRISTAL',           'CRI',   'False', 0);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('HERRAJES',          'HER',   'False', 0);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('Otros Gastos1%',    'OG1',   'True',  1);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('TORNILLERIA 0.25%', 'TOR25', 'True',  0.25);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('TORNILLERIA 0.5%',  'TOR50', 'True',  0.5);
INSERT INTO AG_CONCEPTOS_MP (DESCRIPCION, CLAVE, CALCULO_AUTOMATICO, PORCENTAJE_CALCULO) VALUES ('TORNILLERIA 1%',    'TOR1',  'True',  1);
*/

COMMIT;


/* ---------------------------------------------------------------------------
   REVERSA (solo en la copia de prueba, si necesitas volver a empezar):

   DROP PROCEDURE AG_ELIMINA_CONCEPTO_OBRA; DROP EXCEPTION AG_EX_CONCEPTO_EN_USO;
   DROP TABLE AG_OBRAS_RESPONSABLES;  DROP TABLE AG_OBRAS;
   DROP TABLE AG_PRES_RELACIONADOS;   DROP TABLE AG_PRES_SEGURO;
   DROP TABLE AG_PRES_COMISIONES;     DROP TABLE AG_PRES_MANO_OBRA;
   DROP TABLE AG_PRESUPUESTOS_MAT;    DROP TABLE AG_PRESUPUESTOS_DET;
   DROP TABLE AG_PRESUPUESTOS;        DROP TABLE AG_PARAMETROS_OBRA;
   DROP TABLE AG_TIPOS_COMISION;      DROP TABLE AG_EMPLEADOS_OBRA;
   DROP TABLE AG_CONCEPTOS_GO;        DROP TABLE AG_CONCEPTOS_MO;
   DROP TABLE AG_CONCEPTOS_MP;
   DROP SEQUENCE AG_FOLIOS_PRESUPUESTO; DROP SEQUENCE AG_GEN_IDS;
   COMMIT;
--------------------------------------------------------------------------- */
