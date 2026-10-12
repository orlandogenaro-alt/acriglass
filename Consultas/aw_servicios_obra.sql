/******************************************************************************/
/****  AcriGlass - Servicios de obra en AW-Management (Firebird)            ****/
/****                                                                       ****/
/****  Lo que se captura en el menu Servicios: renta de maquinaria,        ****/
/****  cuentas por pagar, subcontratos, tramites, bitacora de obra,        ****/
/****  pruebas, planos y gastos indirectos. Una sola tabla: MODULO dice    ****/
/****  de que apartado es cada renglon (includes/servicios-obra.php).      ****/
/****  OBRA_ID vacio = gasto general (cuentas por pagar e indirectos).     ****/
/****  El id lo da el sistema con GEN_ID(ID_CATALOGOS, 1), igual que las   ****/
/****  demas tablas de AW.                                                  ****/
/****                                                                       ****/
/****  Como correrlo: IBExpert > conectar a PRODUCCION_AW.FDB > SQL Editor  ****/
/****  > pegar > Execute > Commit. Se corre una sola vez.                   ****/
/******************************************************************************/

CREATE TABLE SERVICIOS_OBRA (
    SERVICIO_OBRA_ID   INTEGER NOT NULL,
    MODULO             VARCHAR(20) NOT NULL,
    OBRA_ID            INTEGER,
    FECHA              DATE,
    FECHA_FIN          DATE,
    FECHA_VENCE        DATE,
    FOLIO              VARCHAR(30),
    CONCEPTO           VARCHAR(200),
    TIPO               VARCHAR(60),
    PROVEEDOR          VARCHAR(150),
    RESPONSABLE        VARCHAR(150),
    CANTIDAD           NUMERIC(15,3) DEFAULT 0,
    UNIDAD             VARCHAR(30),
    PRECIO             NUMERIC(15,2) DEFAULT 0,
    IMPORTE            NUMERIC(15,2) DEFAULT 0,
    PAGADO             NUMERIC(15,2) DEFAULT 0,
    AVANCE             NUMERIC(5,2) DEFAULT 0,
    ESTATUS            VARCHAR(30),
    REVISION           VARCHAR(20),
    NOTAS              VARCHAR(2000),
    NOMBRE_ARCHIVO     VARCHAR(150),
    ARCHIVO            BLOB SUB_TYPE 0 SEGMENT SIZE 80,
    FECHA_CREACION     TIMESTAMP,
    USUARIO_CREACION   VARCHAR(50),
    FECHA_MOD          TIMESTAMP,
    USUARIO_MOD        VARCHAR(50),
    CONSTRAINT PK_SERVICIOS_OBRA PRIMARY KEY (SERVICIO_OBRA_ID)
);

CREATE INDEX IX_SERVICIOS_OBRA_OBRA  ON SERVICIOS_OBRA (MODULO, OBRA_ID);
CREATE INDEX IX_SERVICIOS_OBRA_FECHA ON SERVICIOS_OBRA (MODULO, FECHA);
