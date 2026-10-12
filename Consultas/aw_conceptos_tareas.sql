/******************************************************************************/
/****  AcriGlass - Conceptos/Tareas en AW-Management (Firebird)             ****/
/****                                                                       ****/
/****  Los Conceptos/Tareas del presupuesto de obra que también se ven y   ****/
/****  se capturan en la obra (fechas, responsable, empleados y avance).   ****/
/****  El id lo da el sistema con GEN_ID(ID_CATALOGOS, 1), igual que las   ****/
/****  demás tablas de AW.                                                  ****/
/****                                                                       ****/
/****  Como correrlo: IBExpert > conectar a PRODUCCION_AW.FDB > SQL Editor  ****/
/****  > pegar > Execute > Commit. Se corre una sola vez.                   ****/
/******************************************************************************/

CREATE TABLE CONCEPTOS_TAREAS (
    TAREA_ID                INTEGER NOT NULL,
    DOCTO_SUGERIDO_OBRA_ID  INTEGER NOT NULL,
    UID                     INTEGER NOT NULL,
    PADRE_UID               INTEGER,
    ORDEN                   INTEGER,
    ORIGEN                  VARCHAR(30),
    TIPO                    VARCHAR(15),
    CLAVE                   VARCHAR(30),
    NOMBRE                  VARCHAR(200),
    AGRUPADOR               VARCHAR(100),
    DESCRIPCION             BLOB SUB_TYPE 1 SEGMENT SIZE 80,
    CANTIDAD                NUMERIC(15,3) DEFAULT 0,
    UNIDAD                  VARCHAR(30),
    MONTO                   NUMERIC(15,2) DEFAULT 0,
    INI_REAL                TIMESTAMP,
    FIN_REAL                TIMESTAMP,
    INI_CLI                 TIMESTAMP,
    FIN_CLI                 TIMESTAMP,
    JORNADA                 VARCHAR(50),
    RESPONSABLE             VARCHAR(150),
    EMPLEADOS               VARCHAR(500),
    COLOR                   VARCHAR(10),
    AVANCE                  NUMERIC(5,2) DEFAULT 0,
    ESTATUS                 VARCHAR(20),
    MANUAL                  VARCHAR(100),
    FECHA_MOD               TIMESTAMP,
    USUARIO_MOD             VARCHAR(50),
    CONSTRAINT PK_CONCEPTOS_TAREAS PRIMARY KEY (TAREA_ID)
);

CREATE INDEX IX_CONCEPTOS_TAREAS ON CONCEPTOS_TAREAS (DOCTO_SUGERIDO_OBRA_ID, ORDEN);
