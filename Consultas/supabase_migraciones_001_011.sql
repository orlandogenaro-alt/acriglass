/******************************************************************************/
/****  AcriGlass - TODAS las migraciones de las Etapas 0 a 5 (Supabase)     ****/
/****                                                                       ****/
/****  Cómo correrlo: Supabase > SQL Editor > New query > pegar TODO > Run  ****/
/****                                                                       ****/
/****  - Va todo en una sola transacción: si algo falla, no se aplica nada  ****/
/****    y la base queda como estaba.                                       ****/
/****  - Al final queda anotado en migraciones_aplicadas, así después       ****/
/****    php herramientas/migrar.php sabe que ya se aplicaron.             ****/
/****  - Si alguna ya estaba aplicada, no pasa nada: todas usan             ****/
/****    IF NOT EXISTS / CREATE OR REPLACE.                                 ****/
/****  - Archivo generado; los originales están en migraciones/.          ****/
/******************************************************************************/

BEGIN;

/* ---------- Requisitos: las tablas base del sistema deben existir ---------- */
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['doctos_sugerido_obra', 'doctos_sugerido_obra_det', 'reg_obras', 'conceptos_tareas', 'configuracion',
                             'conceptos_mat_prima_obra', 'conceptos_mano_obra', 'conceptos_gas_operacion_obra', 'usuarios'] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE EXCEPTION 'Falta la tabla %: primero corre los scripts base (Consultas/supabase_acriglass.sql, supabase_roles_conceptos.sql y supabase_obras.sql).', t;
        END IF;
    END LOOP;
END $$;

/* ==================== supabase_presupuesto_analisis_pu.sql ==================== */
/******************************************************************************/
/****  AcriGlass - Análisis de Precios Unitarios del presupuesto (Supabase) ****/
/****                                                                       ****/
/****  Misma columna que aw_presupuesto_analisis_pu.sql en AW-Management:   ****/
/****  los factores de la pestaña Análisis P.U. (Neodata) como JSON.       ****/
/****                                                                       ****/
/****  Como correrlo: Supabase > SQL Editor > New query > pegar todo > Run  ****/
/****  Se puede volver a correr: solo crea lo que falta.                    ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra ADD COLUMN IF NOT EXISTS analisis_pu TEXT;

/* ==================== supabase_presupuesto_datos_obra.sql ==================== */
/******************************************************************************/
/****  AcriGlass - Datos de la obra en el presupuesto (Supabase)            ****/
/****                                                                       ****/
/****  Misma columna que aw_presupuesto_datos_obra.sql en AW-Management:   ****/
/****  los datos de la ventana Nueva obra capturados en el encabezado del  ****/
/****  presupuesto, como JSON.                                              ****/
/****                                                                       ****/
/****  Como correrlo: Supabase > SQL Editor > New query > pegar todo > Run  ****/
/****  Se puede volver a correr: solo crea lo que falta.                    ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra ADD COLUMN IF NOT EXISTS datos_obra TEXT;

/* ==================== supabase_presupuesto_utilidad_modo.sql ==================== */
/******************************************************************************/
/****  AcriGlass - Forma de la utilidad y un presupuesto = una obra         ****/
/****  (Supabase)                                                           ****/
/****                                                                       ****/
/****  1. utilidad_modo: 'costo' (+ % sobre el costo) o 'margen' (margen    ****/
/****     sobre el precio). Misma columna que                              ****/
/****     aw_presupuesto_utilidad_modo.sql en AW-Management.               ****/
/****  2. Índice único: un presupuesto no puede quedar ligado a dos obras   ****/
/****     (las obras sin presupuesto llevan sugerido_id = 0 o vacío).       ****/
/****     Si ya hay presupuestos con dos obras, el índice no se crea y se   ****/
/****     listan en los mensajes (NOTICE) para corregirlos a mano.          ****/
/****                                                                       ****/
/****  Como correrlo: Supabase > SQL Editor > New query > pegar todo > Run  ****/
/****  Se puede volver a correr: solo crea lo que falta.                    ****/
/******************************************************************************/

ALTER TABLE doctos_sugerido_obra ADD COLUMN IF NOT EXISTS utilidad_modo VARCHAR(10);

DO $$
DECLARE
    r RECORD;
    hay BOOLEAN := false;
BEGIN
    FOR r IN SELECT sugerido_id, string_agg(obra_id::text, ', ' ORDER BY obra_id) AS obras
               FROM reg_obras WHERE sugerido_id > 0
              GROUP BY sugerido_id HAVING count(*) > 1
    LOOP
        hay := true;
        RAISE NOTICE 'Presupuesto % ligado a las obras %', r.sugerido_id, r.obras;
    END LOOP;
    IF hay THEN
        RAISE NOTICE 'No se creó uq_reg_obras_sugerido: deja una sola obra por presupuesto y vuelve a correr este script.';
    ELSE
        CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_obras_sugerido ON reg_obras (sugerido_id) WHERE sugerido_id > 0;
    END IF;
END $$;

/* ==================== Registro de migraciones ==================== */
CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre    VARCHAR(100) PRIMARY KEY,
    checksum  CHAR(64) NOT NULL,
    fecha     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario   VARCHAR(100)
);
ALTER TABLE migraciones_aplicadas ENABLE ROW LEVEL SECURITY;

/* ==================== 001_auditoria.sql ==================== */
/******************************************************************************/
/****  001 - Bitácora de auditoría (Supabase)                               ****/
/****                                                                       ****/
/****  Cada alta, cambio o baja en las tablas de negocio deja un renglón   ****/
/****  en auditoria: quién (acri.usuario, que pone el PHP en cada          ****/
/****  transacción), cuándo, tabla, llave y los valores. En los cambios     ****/
/****  solo se guardan las columnas que cambiaron; un UPDATE que no cambia  ****/
/****  nada (p. ej. apartar el presupuesto) no deja renglón.                ****/
/****  Se omiten columnas binarias y contraseñas.                           ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS auditoria (
    auditoria_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario       VARCHAR(50),
    tabla         VARCHAR(63) NOT NULL,
    operacion     CHAR(1) NOT NULL CHECK (operacion IN ('I', 'U', 'D')),
    llave         TEXT,
    antes         JSONB,
    despues       JSONB
);

CREATE INDEX IF NOT EXISTS ix_auditoria_tabla_llave ON auditoria (tabla, llave);
CREATE INDEX IF NOT EXISTS ix_auditoria_fecha       ON auditoria (fecha);

/* Igual que las demás tablas: la API pública de Supabase no la ve; el PHP sí */
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;

/* Argumentos del trigger: 1.º columna llave; los demás, columnas que no se guardan */
CREATE OR REPLACE FUNCTION auditoria_registrar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_omitir  TEXT[] := CASE WHEN TG_NARGS > 1 THEN TG_ARGV[1:TG_NARGS - 1] ELSE ARRAY[]::TEXT[] END;
    v_antes   JSONB;
    v_despues JSONB;
    v_cambio_antes   JSONB;
    v_cambio_despues JSONB;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_antes := to_jsonb(OLD) - v_omitir; END IF;
    IF TG_OP <> 'DELETE' THEN v_despues := to_jsonb(NEW) - v_omitir; END IF;

    IF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(a.key, a.value) INTO v_cambio_antes
          FROM jsonb_each(v_antes) a WHERE (v_despues -> a.key) IS DISTINCT FROM a.value;
        SELECT jsonb_object_agg(d.key, d.value) INTO v_cambio_despues
          FROM jsonb_each(v_despues) d WHERE (v_antes -> d.key) IS DISTINCT FROM d.value;
        IF v_cambio_despues IS NULL AND v_cambio_antes IS NULL THEN RETURN NULL; END IF;
    END IF;

    INSERT INTO auditoria (usuario, tabla, operacion, llave, antes, despues)
    VALUES (
        nullif(current_setting('acri.usuario', true), ''),
        TG_TABLE_NAME,
        left(TG_OP, 1),
        coalesce(v_despues ->> TG_ARGV[0], v_antes ->> TG_ARGV[0]),
        CASE WHEN TG_OP = 'UPDATE' THEN v_cambio_antes ELSE v_antes END,
        CASE WHEN TG_OP = 'UPDATE' THEN v_cambio_despues ELSE v_despues END
    );
    RETURN NULL;
END $$;

/* Tablas con bitácora (solo las que existan). Los renglones del presupuesto (doctos_sugerido_obra_det y
   sus detalles) no llevan: se borran y se vuelven a escribir en cada Guardar; su historia la darán las
   versiones del presupuesto. configuracion y sesiones tampoco (guardan contraseñas de conexión y sesiones). */
DO $$
DECLARE
    t TEXT[];
    tablas TEXT[][] := ARRAY[
        ['doctos_sugerido_obra',          'docto_sugerido_obra_id',          ''],
        ['reg_obras',                     'obra_id',                         'imagen'],
        ['responsables_de_obra',          'res_obra_id',                     ''],
        ['doctos_microsip_obra',          'docto_orden_obra_id',             ''],
        ['doctos_adic_cobro_obra',        'docto_adic_cobro_obra_id',        ''],
        ['doctos_orden_obra',             'docto_orden_obra_id',             ''],
        ['explocion_material_de_obra',    'explocion_mat_obra_id',           ''],
        ['empleados_asignados_a_obra',    'empleado_asignado_obra_id',       ''],
        ['gastos_adicionales_obra',       'gasto_adicional_id',              ''],
        ['gastos_adicionales_obra_det',   'gasto_adicional_obra_det_id',     ''],
        ['servicios_obra',                'servicio_obra_id',                'archivo'],
        ['archivos_adjuntos',             'archivo_id',                      'archivo_adjunto'],
        ['conceptos_tareas',              'tarea_id',                        ''],
        ['usuarios',                      'usuario_id',                      'contrasena_hash'],
        ['permisos_usuarios',             'usuario_id',                      ''],
        ['roles',                         'rol_id',                          ''],
        ['permisos_roles',                'rol_id',                          ''],
        ['conceptos_mat_prima_obra',      'concepto_mat_prima_id',           ''],
        ['conceptos_mano_obra',           'concepto_mano_obra_id',           ''],
        ['conceptos_gas_operacion_obra',  'concepto_gas_operacion_obra_id',  ''],
        ['empleados_obra',                'empleado_id',                     ''],
        ['vendedores_obras',              'vendedor_obra_id',                ''],
        ['tipos_empleados_comisiones',    'tipo_empleado_id',                ''],
        ['parametros_costos_sug',         'parametro_id',                    '']
    ];
BEGIN
    FOREACH t SLICE 1 IN ARRAY tablas LOOP
        IF to_regclass('public.' || t[1]) IS NULL THEN
            RAISE NOTICE 'Sin bitácora: no existe la tabla %', t[1];
            CONTINUE;
        END IF;
        EXECUTE format('DROP TRIGGER IF EXISTS auditoria_%s ON %I', t[1], t[1]);
        EXECUTE format('CREATE TRIGGER auditoria_%s AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION auditoria_registrar(%L%s)',
                       t[1], t[1], t[2], CASE WHEN t[3] <> '' THEN format(', %L', t[3]) ELSE '' END);
    END LOOP;
END $$;

/* ==================== 002_autorizaciones.sql ==================== */
/******************************************************************************/
/****  002 - Autorizaciones (Supabase)                                      ****/
/****                                                                       ****/
/****  Registro único de quién pidió y quién autorizó o rechazó una         ****/
/****  operación sobre un documento. Hoy lo llena la autorización de otro  ****/
/****  usuario (usuario y contraseña de quien tiene el permiso); las        ****/
/****  siguientes etapas lo usan para aprobar presupuestos, requisiciones,  ****/
/****  órdenes de compra, aditivas y estimaciones.                          ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS autorizaciones (
    autorizacion_id   BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    documento_tipo    VARCHAR(30) NOT NULL,          /* presupuesto, obra, requisicion, … */
    documento_id      BIGINT,                         /* vacío si aún no existe (p. ej. una obra nueva) */
    accion            VARCHAR(60) NOT NULL,           /* permiso u operación: NUEVO_OBRA, APROBAR, … */
    estatus           VARCHAR(10) NOT NULL DEFAULT 'pendiente'
                      CHECK (estatus IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
    solicitada_por    VARCHAR(50) NOT NULL,
    fecha_solicitud   TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelta_por      VARCHAR(50),
    fecha_resolucion  TIMESTAMPTZ,
    comentario        TEXT,
    datos             JSONB,                          /* importes o detalle que se autorizó */
    CONSTRAINT ck_autorizaciones_resuelta CHECK (
        (estatus = 'pendiente' AND resuelta_por IS NULL AND fecha_resolucion IS NULL)
        OR (estatus <> 'pendiente' AND resuelta_por IS NOT NULL AND fecha_resolucion IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS ix_autorizaciones_documento ON autorizaciones (documento_tipo, documento_id);
CREATE INDEX IF NOT EXISTS ix_autorizaciones_pendientes ON autorizaciones (estatus, fecha_solicitud) WHERE estatus = 'pendiente';

ALTER TABLE autorizaciones ENABLE ROW LEVEL SECURITY;

/* ==================== 003_obra_movimientos.sql ==================== */
/******************************************************************************/
/****  003 - Libro de movimientos por obra (Supabase)                       ****/
/****                                                                       ****/
/****  Un renglón por cada importe que mueve un documento de la obra, con  ****/
/****  su clase separada para no mezclar indicadores:                      ****/
/****    costo:   presupuestado, comprometido, incurrido, proyectado        ****/
/****    ingreso: contratado, estimado, facturado, cobrado                  ****/
/****    pago:    pagado                                                    ****/
/****  El importe va SIN IVA; el IVA y la moneda van aparte, con el tipo   ****/
/****  de cambio del día, para que los reportes no sumen MXN con USD ni    ****/
/****  importes con y sin IVA. Los documentos de las siguientes etapas      ****/
/****  escriben aquí; los reportes y el tablero leerán de aquí.             ****/
/****  Un documento cancelado no se borra: deja su renglón de reversa.      ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS obra_movimientos (
    movimiento_id     BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    obra_id           INTEGER NOT NULL REFERENCES reg_obras (obra_id),
    fecha             DATE NOT NULL,
    naturaleza        VARCHAR(7) NOT NULL CHECK (naturaleza IN ('costo', 'ingreso', 'pago')),
    clase             VARCHAR(13) NOT NULL,
    tipo_costo        VARCHAR(10) CHECK (tipo_costo IN ('material', 'mano_obra', 'equipo', 'subcontrato', 'indirecto', 'otro')),
    importe           NUMERIC(18,2) NOT NULL,                 /* sin IVA, en la moneda del documento; negativo = reversa */
    iva               NUMERIC(18,2) NOT NULL DEFAULT 0,
    moneda            CHAR(3) NOT NULL DEFAULT 'MXN',
    tipo_cambio       NUMERIC(12,6) NOT NULL DEFAULT 1 CHECK (tipo_cambio > 0),
    importe_mxn       NUMERIC(18,2) GENERATED ALWAYS AS (round(importe * tipo_cambio, 2)) STORED,
    origen_tipo       VARCHAR(30) NOT NULL,                   /* presupuesto, contrato, orden_compra, estimacion, … */
    origen_id         BIGINT NOT NULL,
    origen_renglon    BIGINT,                                 /* renglón del documento, si aplica */
    concepto          VARCHAR(200),
    usuario           VARCHAR(50),
    fecha_registro    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_obra_mov_clase CHECK (
           (naturaleza = 'costo'   AND clase IN ('presupuestado', 'comprometido', 'incurrido', 'proyectado'))
        OR (naturaleza = 'ingreso' AND clase IN ('contratado', 'estimado', 'facturado', 'cobrado'))
        OR (naturaleza = 'pago'    AND clase = 'pagado'))
);

CREATE INDEX IF NOT EXISTS ix_obra_mov_obra   ON obra_movimientos (obra_id, naturaleza, clase);
CREATE INDEX IF NOT EXISTS ix_obra_mov_origen ON obra_movimientos (origen_tipo, origen_id);
CREATE INDEX IF NOT EXISTS ix_obra_mov_fecha  ON obra_movimientos (fecha);

ALTER TABLE obra_movimientos ENABLE ROW LEVEL SECURITY;

/* ==================== 004_insumos.sql ==================== */
/******************************************************************************/
/****  004 - Catálogo de insumos y básicos (Supabase)                       ****/
/****                                                                       ****/
/****  insumos:              materiales (MAT), mano de obra (MO), equipo y  ****/
/****                        maquinaria (EQ), herramienta (HER) y básicos   ****/
/****                        (BAS: auxiliares y cuadrillas que se arman     ****/
/****                        con otros insumos).                            ****/
/****  insumo_precios:       historial de precios. Un cambio de precio      ****/
/****                        nunca sobrescribe: agrega un renglón con su    ****/
/****                        fecha de vigencia. Precios SIN IVA.            ****/
/****  insumo_componentes:   de qué está hecho un básico (cantidad y %      ****/
/****                        de desperdicio). La base rechaza referencias   ****/
/****                        circulares (A lleva B y B lleva A).            ****/
/****  unidades:             unidades de medida.                            ****/
/****                                                                       ****/
/****  Mano de obra: el precio es el salario base por jornada; el costo     ****/
/****  es salario base × FSR del insumo (Factor de Salario Real).           ****/
/****  Ningún precio se carga aquí: los captura Acristala o se importan.    ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS unidades (
    unidad_id  INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    clave      VARCHAR(10) NOT NULL,
    nombre     VARCHAR(60) NOT NULL,
    estatus    CHAR(1) NOT NULL DEFAULT 'A' CHECK (estatus IN ('A', 'B'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_clave ON unidades (upper(trim(clave)));

INSERT INTO unidades (clave, nombre)
SELECT v.clave, v.nombre FROM (VALUES
    ('PZA', 'Pieza'), ('M', 'Metro lineal'), ('M2', 'Metro cuadrado'), ('M3', 'Metro cúbico'),
    ('KG', 'Kilogramo'), ('TON', 'Tonelada'), ('L', 'Litro'), ('JGO', 'Juego'), ('LOTE', 'Lote'),
    ('CART', 'Cartucho'), ('ROLLO', 'Rollo'), ('CAJA', 'Caja'), ('TRAMO', 'Tramo'),
    ('JOR', 'Jornada'), ('HR', 'Hora'), ('DIA', 'Día'), ('VIAJE', 'Viaje'), ('%', 'Porcentaje')
) AS v (clave, nombre)
WHERE NOT EXISTS (SELECT 1 FROM unidades u WHERE upper(trim(u.clave)) = v.clave);

CREATE TABLE IF NOT EXISTS insumos (
    insumo_id             INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    clave                 VARCHAR(30) NOT NULL,
    descripcion           VARCHAR(250) NOT NULL,
    tipo                  CHAR(3) NOT NULL CHECK (tipo IN ('MAT', 'MO', 'EQ', 'HER', 'BAS')),
    unidad_id             INTEGER NOT NULL REFERENCES unidades (unidad_id),
    familia               VARCHAR(60),                       /* vidrio, aluminio, herrajes, selladores… */
    fsr                   NUMERIC(8,4) NOT NULL DEFAULT 1 CHECK (fsr > 0 AND fsr < 10),   /* solo mano de obra */
    articulo_microsip_id  INTEGER,                            /* vínculo opcional con el artículo de Microsip */
    clave_microsip        VARCHAR(30),
    notas                 TEXT,
    estatus               CHAR(1) NOT NULL DEFAULT 'A' CHECK (estatus IN ('A', 'B')),
    fecha_creacion        TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_creacion      VARCHAR(50)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insumos_clave ON insumos (upper(trim(clave)));
CREATE INDEX IF NOT EXISTS ix_insumos_tipo ON insumos (tipo, estatus);
CREATE INDEX IF NOT EXISTS ix_insumos_descripcion ON insumos (upper(descripcion) text_pattern_ops);

CREATE TABLE IF NOT EXISTS insumo_precios (
    precio_id       BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    insumo_id       INTEGER NOT NULL REFERENCES insumos (insumo_id) ON DELETE CASCADE,
    precio          NUMERIC(18,6) NOT NULL CHECK (precio >= 0),
    moneda          CHAR(3) NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN', 'USD')),
    vigente_desde   DATE NOT NULL DEFAULT CURRENT_DATE,
    fuente          VARCHAR(20) NOT NULL DEFAULT 'captura' CHECK (fuente IN ('captura', 'proveedor', 'microsip', 'importacion')),
    proveedor       VARCHAR(150),
    notas           VARCHAR(500),
    usuario         VARCHAR(50),
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_insumo_precios_vigencia ON insumo_precios (insumo_id, vigente_desde DESC, precio_id DESC);

/* Precio vigente de cada insumo a la fecha de hoy: el de vigencia más reciente que ya empezó
   (si hay dos el mismo día, el último capturado) */
CREATE OR REPLACE VIEW insumos_precio_vigente AS
SELECT DISTINCT ON (p.insumo_id) p.insumo_id, p.precio_id, p.precio, p.moneda, p.vigente_desde, p.fuente, p.proveedor
  FROM insumo_precios p
 WHERE p.vigente_desde <= CURRENT_DATE
 ORDER BY p.insumo_id, p.vigente_desde DESC, p.precio_id DESC;

CREATE TABLE IF NOT EXISTS insumo_componentes (
    componente_id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    insumo_id             INTEGER NOT NULL REFERENCES insumos (insumo_id) ON DELETE CASCADE,
    componente_insumo_id  INTEGER NOT NULL REFERENCES insumos (insumo_id),
    cantidad              NUMERIC(18,6) NOT NULL CHECK (cantidad > 0),
    desperdicio_pct       NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (desperdicio_pct >= 0 AND desperdicio_pct < 100),
    orden                 INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_insumo_componente UNIQUE (insumo_id, componente_insumo_id),
    CONSTRAINT ck_insumo_componente_propio CHECK (insumo_id <> componente_insumo_id)
);
CREATE INDEX IF NOT EXISTS ix_insumo_componentes_comp ON insumo_componentes (componente_insumo_id);

/* Solo un básico lleva componentes, y sin referencias circulares (a cualquier profundidad) */
CREATE OR REPLACE FUNCTION insumo_componentes_valida() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT tipo FROM insumos WHERE insumo_id = NEW.insumo_id) <> 'BAS' THEN
        RAISE EXCEPTION 'Solo un insumo básico (BAS) puede llevar componentes.';
    END IF;
    IF EXISTS (
        WITH RECURSIVE baja AS (
            SELECT NEW.componente_insumo_id AS id
            UNION
            SELECT c.componente_insumo_id FROM insumo_componentes c JOIN baja b ON c.insumo_id = b.id
        )
        SELECT 1 FROM baja WHERE id = NEW.insumo_id
    ) THEN
        RAISE EXCEPTION 'Referencia circular: el componente ya contiene (directa o indirectamente) al básico.';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS insumo_componentes_biu ON insumo_componentes;
CREATE TRIGGER insumo_componentes_biu BEFORE INSERT OR UPDATE ON insumo_componentes
    FOR EACH ROW EXECUTE FUNCTION insumo_componentes_valida();

ALTER TABLE unidades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_precios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumo_componentes ENABLE ROW LEVEL SECURITY;

/* Bitácora (001_auditoria.sql) */
DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_insumos ON insumos;
        CREATE TRIGGER auditoria_insumos AFTER INSERT OR UPDATE OR DELETE ON insumos
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('insumo_id');
        DROP TRIGGER IF EXISTS auditoria_insumo_precios ON insumo_precios;
        CREATE TRIGGER auditoria_insumo_precios AFTER INSERT OR UPDATE OR DELETE ON insumo_precios
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('insumo_id');
        DROP TRIGGER IF EXISTS auditoria_insumo_componentes ON insumo_componentes;
        CREATE TRIGGER auditoria_insumo_componentes AFTER INSERT OR UPDATE OR DELETE ON insumo_componentes
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('insumo_id');
    END IF;
END $$;

/* ==================== 005_tipo_cambio_fasar_costo_horario.sql ==================== */
/******************************************************************************/
/****  005 - Tipo de cambio, FASAR y costos horarios (Supabase)             ****/
/****                                                                       ****/
/****  tipos_cambio:     historial de tipos de cambio (captura o Banxico).  ****/
/****                    El vigente es el de fecha más reciente que ya      ****/
/****                    empezó.                                            ****/
/****  fasar:            cálculo del Factor de Salario Real con los datos   ****/
/****                    que captura Acristala (Reglamento de la LOPSRM):   ****/
/****                      Fsr = Ps × (Tp / Tl) + Tp / Tl                   ****/
/****                    Tp = días pagados, Tl = días laborados,            ****/
/****                    Ps = obligaciones obrero-patronales (fracción).    ****/
/****                    Una mano de obra ligada a un FASAR toma su FSR.    ****/
/****  costos_horarios:  datos del costo horario de una máquina (equipo).   ****/
/****                    El costo que resulta entra al historial de precios ****/
/****                    del insumo con fuente 'costo_horario'.             ****/
/****  No se carga ningún valor legal ni comercial: todo lo captura         ****/
/****  Acristala.                                                           ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS tipos_cambio (
    tipo_cambio_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    moneda          CHAR(3) NOT NULL CHECK (moneda IN ('USD')),
    fecha           DATE NOT NULL,
    tipo_cambio     NUMERIC(12,6) NOT NULL CHECK (tipo_cambio > 0),
    fuente          VARCHAR(10) NOT NULL DEFAULT 'captura' CHECK (fuente IN ('captura', 'banxico')),
    usuario         VARCHAR(50),
    fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tipos_cambio_vigencia ON tipos_cambio (moneda, fecha DESC, tipo_cambio_id DESC);

CREATE TABLE IF NOT EXISTS fasar (
    fasar_id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    dias_calendario  NUMERIC(8,2) NOT NULL DEFAULT 365 CHECK (dias_calendario > 0),
    dias_pagados     JSONB NOT NULL DEFAULT '[]',   /* [{concepto, dias}] además de los días calendario: aguinaldo, prima vacacional… */
    dias_no_laborados JSONB NOT NULL DEFAULT '[]',  /* [{concepto, dias}] domingos, festivos, vacaciones, clima… */
    obligaciones     JSONB NOT NULL DEFAULT '[]',   /* [{concepto, pct}] IMSS, INFONAVIT, SAR, impuesto sobre nómina… */
    tp               NUMERIC(10,4) NOT NULL,
    tl               NUMERIC(10,4) NOT NULL CHECK (tl > 0),
    ps               NUMERIC(10,6) NOT NULL,
    fsr              NUMERIC(8,4) NOT NULL CHECK (fsr > 0 AND fsr < 10),
    notas            TEXT,
    estatus          CHAR(1) NOT NULL DEFAULT 'A' CHECK (estatus IN ('A', 'B')),
    fecha_mod        TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_mod      VARCHAR(50)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fasar_nombre ON fasar (upper(trim(nombre)));

ALTER TABLE insumos ADD COLUMN IF NOT EXISTS fasar_id INTEGER REFERENCES fasar (fasar_id);

CREATE TABLE IF NOT EXISTS costos_horarios (
    insumo_id   INTEGER PRIMARY KEY REFERENCES insumos (insumo_id) ON DELETE CASCADE,
    parametros  JSONB NOT NULL,
    costo       NUMERIC(18,6) NOT NULL CHECK (costo >= 0),
    fecha_mod   TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_mod VARCHAR(50)
);

/* Fuente nueva en el historial de precios */
ALTER TABLE insumo_precios DROP CONSTRAINT IF EXISTS insumo_precios_fuente_check;
ALTER TABLE insumo_precios DROP CONSTRAINT IF EXISTS ck_insumo_precios_fuente;
ALTER TABLE insumo_precios ADD CONSTRAINT ck_insumo_precios_fuente
    CHECK (fuente IN ('captura', 'proveedor', 'microsip', 'importacion', 'costo_horario'));

ALTER TABLE tipos_cambio    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fasar           ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos_horarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_tipos_cambio ON tipos_cambio;
        CREATE TRIGGER auditoria_tipos_cambio AFTER INSERT OR UPDATE OR DELETE ON tipos_cambio
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('tipo_cambio_id');
        DROP TRIGGER IF EXISTS auditoria_fasar ON fasar;
        CREATE TRIGGER auditoria_fasar AFTER INSERT OR UPDATE OR DELETE ON fasar
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('fasar_id');
        DROP TRIGGER IF EXISTS auditoria_costos_horarios ON costos_horarios;
        CREATE TRIGGER auditoria_costos_horarios AFTER INSERT OR UPDATE OR DELETE ON costos_horarios
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('insumo_id');
    END IF;
END $$;

/* ==================== 006_conceptos_pu_versiones.sql ==================== */
/******************************************************************************/
/****  006 - Catálogo de conceptos con matriz y versiones del presupuesto   ****/
/****  (Supabase)                                                           ****/
/****                                                                       ****/
/****  conceptos_pu:          conceptos reutilizables (código único,        ****/
/****                         descripción corta y técnica, unidad,          ****/
/****                         familia / partida sugerida).                  ****/
/****  concepto_pu_insumos:   matriz del concepto: qué insumos lleva una    ****/
/****                         unidad, con cantidad, % de desperdicio y, en  ****/
/****                         mano de obra o cuadrillas, el rendimiento     ****/
/****                         (unidades por jornada: cantidad = 1 / rend.). ****/
/****  presupuesto_versiones: copia congelada del presupuesto al aceptarse  ****/
/****                         o al registrar su obra. No se modifica ni se  ****/
/****                         borra (lo impide la base).                    ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS conceptos_pu (
    concepto_pu_id        INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    codigo                VARCHAR(30) NOT NULL,
    descripcion           VARCHAR(250) NOT NULL,            /* descripción corta */
    descripcion_tecnica   TEXT,                               /* especificación completa para la propuesta */
    unidad_id             INTEGER NOT NULL REFERENCES unidades (unidad_id),
    familia               VARCHAR(80),                        /* partida sugerida: cancelería, fachadas, barandales… */
    notas                 TEXT,
    estatus               CHAR(1) NOT NULL DEFAULT 'A' CHECK (estatus IN ('A', 'B')),
    fecha_creacion        TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_creacion      VARCHAR(50)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conceptos_pu_codigo ON conceptos_pu (upper(trim(codigo)));
CREATE INDEX IF NOT EXISTS ix_conceptos_pu_descripcion ON conceptos_pu (upper(descripcion) text_pattern_ops);

CREATE TABLE IF NOT EXISTS concepto_pu_insumos (
    concepto_pu_insumo_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    concepto_pu_id         INTEGER NOT NULL REFERENCES conceptos_pu (concepto_pu_id) ON DELETE CASCADE,
    insumo_id              INTEGER NOT NULL REFERENCES insumos (insumo_id),
    cantidad               NUMERIC(18,6) NOT NULL CHECK (cantidad > 0),
    rendimiento            NUMERIC(18,6) CHECK (rendimiento IS NULL OR rendimiento > 0),
    desperdicio_pct        NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (desperdicio_pct >= 0 AND desperdicio_pct < 100),
    orden                  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_concepto_pu_insumo UNIQUE (concepto_pu_id, insumo_id)
);
CREATE INDEX IF NOT EXISTS ix_concepto_pu_insumos_insumo ON concepto_pu_insumos (insumo_id);

CREATE TABLE IF NOT EXISTS presupuesto_versiones (
    version_id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    docto_sugerido_obra_id  INTEGER NOT NULL REFERENCES doctos_sugerido_obra (docto_sugerido_obra_id),
    version                 INTEGER NOT NULL CHECK (version > 0),
    motivo                  VARCHAR(20) NOT NULL CHECK (motivo IN ('aceptado', 'obra', 'manual')),
    obra_id                 INTEGER,
    snapshot                JSONB NOT NULL,
    hash                    CHAR(64) NOT NULL,                /* sha256 del snapshot, para verificar que no cambió */
    total                   NUMERIC(18,2),
    usuario                 VARCHAR(50),
    fecha                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_presupuesto_version UNIQUE (docto_sugerido_obra_id, version)
);

/* Una versión es para auditoría: no se cambia ni se borra */
CREATE OR REPLACE FUNCTION presupuesto_versiones_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Las versiones del presupuesto no se modifican ni se eliminan.';
END $$;

DROP TRIGGER IF EXISTS presupuesto_versiones_bud ON presupuesto_versiones;
CREATE TRIGGER presupuesto_versiones_bud BEFORE UPDATE OR DELETE ON presupuesto_versiones
    FOR EACH ROW EXECUTE FUNCTION presupuesto_versiones_inmutable();

ALTER TABLE conceptos_pu          ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepto_pu_insumos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_versiones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_conceptos_pu ON conceptos_pu;
        CREATE TRIGGER auditoria_conceptos_pu AFTER INSERT OR UPDATE OR DELETE ON conceptos_pu
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('concepto_pu_id');
        DROP TRIGGER IF EXISTS auditoria_concepto_pu_insumos ON concepto_pu_insumos;
        CREATE TRIGGER auditoria_concepto_pu_insumos AFTER INSERT OR UPDATE OR DELETE ON concepto_pu_insumos
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('concepto_pu_id');
    END IF;
END $$;

/* ==================== 007_presupuesto_iva.sql ==================== */
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

/* ==================== 008_plantillas_presupuesto.sql ==================== */
/******************************************************************************/
/****  008 - Plantillas de presupuesto (Supabase)                           ****/
/****                                                                       ****/
/****  Una plantilla es una lista de conceptos del catálogo (Conceptos      ****/
/****  P.U.) con su cantidad y partida, para arrancar un presupuesto sin    ****/
/****  capturarlo todo (p. ej. «Baño completo», «Fachada tipo», «Barandal   ****/
/****  de escalera»). Al cargarla, cada concepto se copia al Análisis P.U.  ****/
/****  con los precios vigentes del catálogo.                               ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS plantillas_presupuesto (
    plantilla_id      INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nombre            VARCHAR(100) NOT NULL,
    descripcion       TEXT,
    estatus           CHAR(1) NOT NULL DEFAULT 'A' CHECK (estatus IN ('A', 'B')),
    fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_creacion  VARCHAR(50)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantillas_nombre ON plantillas_presupuesto (upper(trim(nombre)));

CREATE TABLE IF NOT EXISTS plantilla_conceptos (
    plantilla_concepto_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    plantilla_id           INTEGER NOT NULL REFERENCES plantillas_presupuesto (plantilla_id) ON DELETE CASCADE,
    concepto_pu_id         INTEGER NOT NULL REFERENCES conceptos_pu (concepto_pu_id),
    cantidad               NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (cantidad >= 0),
    partida                VARCHAR(100),                     /* «Partida / Subpartida»; vacía = la familia del concepto */
    orden                  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_plantilla_conceptos ON plantilla_conceptos (plantilla_id, orden);
CREATE INDEX IF NOT EXISTS ix_plantilla_conceptos_concepto ON plantilla_conceptos (concepto_pu_id);

ALTER TABLE plantillas_presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE plantilla_conceptos    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_plantillas_presupuesto ON plantillas_presupuesto;
        CREATE TRIGGER auditoria_plantillas_presupuesto AFTER INSERT OR UPDATE OR DELETE ON plantillas_presupuesto
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('plantilla_id');
        DROP TRIGGER IF EXISTS auditoria_plantilla_conceptos ON plantilla_conceptos;
        CREATE TRIGGER auditoria_plantilla_conceptos AFTER INSERT OR UPDATE OR DELETE ON plantilla_conceptos
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('plantilla_id');
    END IF;
END $$;

/* ==================== 009_contratos_convenios.sql ==================== */
/******************************************************************************/
/****  009 - Contrato de obra y convenios (Supabase)                        ****/
/****                                                                       ****/
/****  contratos_obra:  un contrato por obra con el cliente. Monto SIN IVA, ****/
/****                   su IVA y moneda, % de anticipo, % de fondo de      ****/
/****                   garantía y % de retención (los aplicarán las       ****/
/****                   estimaciones). Liga la versión aprobada del        ****/
/****                   presupuesto de la que sale.                        ****/
/****  convenios_obra:  aditivas, deductivas, órdenes de cambio y          ****/
/****                   ampliaciones de plazo. Nacen pendientes; solo al    ****/
/****                   autorizarse cambian el monto y el plazo vigentes.   ****/
/****  Cada cambio de monto deja su renglón (o su diferencia) en           ****/
/****  obra_movimientos como ingreso «contratado».                          ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS contratos_obra (
    contrato_id            INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    obra_id                INTEGER NOT NULL REFERENCES reg_obras (obra_id),
    numero                 VARCHAR(40) NOT NULL,
    version_id             BIGINT REFERENCES presupuesto_versiones (version_id),
    fecha_firma            DATE,
    fecha_inicio           DATE,
    fecha_termino          DATE,
    monto                  NUMERIC(18,2) NOT NULL CHECK (monto >= 0),        /* sin IVA */
    iva_pct                NUMERIC(6,3) NOT NULL DEFAULT 16 CHECK (iva_pct >= 0 AND iva_pct < 100),
    moneda                 CHAR(3) NOT NULL DEFAULT 'MXN' CHECK (moneda IN ('MXN', 'USD')),
    tipo_cambio            NUMERIC(12,6) NOT NULL DEFAULT 1 CHECK (tipo_cambio > 0),
    anticipo_pct           NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (anticipo_pct >= 0 AND anticipo_pct <= 100),
    fondo_garantia_pct     NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (fondo_garantia_pct >= 0 AND fondo_garantia_pct <= 100),
    retencion_pct          NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (retencion_pct >= 0 AND retencion_pct <= 100),
    retencion_concepto     VARCHAR(100),
    condiciones_pago       TEXT,
    notas                  TEXT,
    estatus                VARCHAR(10) NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador', 'vigente', 'terminado', 'cancelado')),
    fecha_creacion         TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario_creacion       VARCHAR(50),
    CONSTRAINT ck_contrato_fechas CHECK (fecha_termino IS NULL OR fecha_inicio IS NULL OR fecha_termino >= fecha_inicio)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contratos_obra ON contratos_obra (obra_id) WHERE estatus <> 'cancelado';

CREATE TABLE IF NOT EXISTS convenios_obra (
    convenio_id         INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    contrato_id         INTEGER NOT NULL REFERENCES contratos_obra (contrato_id),
    tipo                VARCHAR(12) NOT NULL CHECK (tipo IN ('aditiva', 'deductiva', 'orden_cambio', 'plazo')),
    numero              VARCHAR(40) NOT NULL,
    fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
    descripcion         TEXT NOT NULL,
    monto               NUMERIC(18,2) NOT NULL DEFAULT 0,   /* sin IVA; deductiva negativa; orden de cambio con su signo */
    dias                INTEGER NOT NULL DEFAULT 0,          /* días que se mueve la terminación */
    estatus             VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'autorizado', 'rechazado', 'cancelado')),
    solicitado_por      VARCHAR(50),
    fecha_solicitud     TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelto_por        VARCHAR(50),
    fecha_resolucion    TIMESTAMPTZ,
    comentario          TEXT,
    CONSTRAINT ck_convenio_signo CHECK ((tipo <> 'aditiva' OR monto >= 0) AND (tipo <> 'deductiva' OR monto <= 0) AND (tipo <> 'plazo' OR monto = 0)),
    CONSTRAINT uq_convenio_numero UNIQUE (contrato_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_convenios_contrato ON convenios_obra (contrato_id, estatus);

ALTER TABLE contratos_obra ENABLE ROW LEVEL SECURITY;
ALTER TABLE convenios_obra ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_contratos_obra ON contratos_obra;
        CREATE TRIGGER auditoria_contratos_obra AFTER INSERT OR UPDATE OR DELETE ON contratos_obra
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('contrato_id');
        DROP TRIGGER IF EXISTS auditoria_convenios_obra ON convenios_obra;
        CREATE TRIGGER auditoria_convenios_obra AFTER INSERT OR UPDATE OR DELETE ON convenios_obra
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('convenio_id');
    END IF;
END $$;

/* ==================== 010_tareas_predecesoras.sql ==================== */
/******************************************************************************/
/****  010 - Predecesoras del programa de obra (Supabase)                   ****/
/****                                                                       ****/
/****  Claves de los Conceptos/Tareas que deben terminar antes de que      ****/
/****  empiece la tarea (dependencia fin-inicio), separadas por coma. Con   ****/
/****  ellas el Gantt calcula la ruta crítica y las holguras.               ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE conceptos_tareas ADD COLUMN IF NOT EXISTS predecesoras VARCHAR(500);

/* ==================== 011_estimaciones.sql ==================== */
/******************************************************************************/
/****  011 - Catálogo del contrato y estimaciones (Supabase)                ****/
/****                                                                       ****/
/****  contrato_conceptos:    conceptos del contrato con su cantidad, P.U.  ****/
/****                         e importe (de la versión aprobada del         ****/
/****                         presupuesto). Se congela al generarse.        ****/
/****  estimaciones_obra:     anticipo y estimaciones de avance con sus     ****/
/****                         deducciones (amortización, fondo de garantía, ****/
/****                         retención), IVA y neto; flujo borrador →      ****/
/****                         autorizada → facturada → cobrada.             ****/
/****  estimacion_conceptos:  cantidad ejecutada de cada concepto en la     ****/
/****                         estimación. La suma de todas no puede pasar   ****/
/****                         de lo contratado (eso va como convenio).      ****/
/****  Autorizar, facturar y cobrar dejan su renglón en obra_movimientos.   ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

CREATE TABLE IF NOT EXISTS contrato_conceptos (
    contrato_concepto_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    contrato_id           INTEGER NOT NULL REFERENCES contratos_obra (contrato_id),
    orden                 INTEGER NOT NULL DEFAULT 0,
    clave                 VARCHAR(30),
    partida               VARCHAR(100),
    descripcion           VARCHAR(300) NOT NULL,
    unidad                VARCHAR(20),
    cantidad              NUMERIC(18,4) NOT NULL CHECK (cantidad >= 0),
    pu                    NUMERIC(18,2) NOT NULL CHECK (pu >= 0),
    importe               NUMERIC(18,2) NOT NULL,
    cd_unitario           NUMERIC(18,6),
    origen                VARCHAR(10) NOT NULL DEFAULT 'analisis' CHECK (origen IN ('analisis', 'importe', 'convenio'))
);
CREATE INDEX IF NOT EXISTS ix_contrato_conceptos ON contrato_conceptos (contrato_id, orden);

ALTER TABLE contratos_obra ADD COLUMN IF NOT EXISTS factor_catalogo NUMERIC(18,6);

CREATE TABLE IF NOT EXISTS estimaciones_obra (
    estimacion_id      INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    contrato_id        INTEGER NOT NULL REFERENCES contratos_obra (contrato_id),
    tipo               VARCHAR(10) NOT NULL DEFAULT 'estimacion' CHECK (tipo IN ('anticipo', 'estimacion')),
    numero             INTEGER NOT NULL,
    fecha              DATE NOT NULL DEFAULT CURRENT_DATE,
    periodo_ini        DATE,
    periodo_fin        DATE,
    importe            NUMERIC(18,2) NOT NULL DEFAULT 0,
    amortizacion       NUMERIC(18,2) NOT NULL DEFAULT 0,
    subtotal           NUMERIC(18,2) NOT NULL DEFAULT 0,
    iva                NUMERIC(18,2) NOT NULL DEFAULT 0,
    fondo_garantia     NUMERIC(18,2) NOT NULL DEFAULT 0,
    retencion          NUMERIC(18,2) NOT NULL DEFAULT 0,
    neto               NUMERIC(18,2) NOT NULL DEFAULT 0,
    estatus            VARCHAR(10) NOT NULL DEFAULT 'borrador' CHECK (estatus IN ('borrador', 'autorizada', 'facturada', 'cobrada', 'cancelada')),
    folio_factura      VARCHAR(40),
    fecha_factura      DATE,
    fecha_cobro        DATE,
    notas              TEXT,
    usuario_creacion   VARCHAR(50),
    fecha_creacion     TIMESTAMPTZ NOT NULL DEFAULT now(),
    autorizada_por     VARCHAR(50),
    fecha_autorizacion TIMESTAMPTZ,
    CONSTRAINT uq_estimacion_numero UNIQUE (contrato_id, tipo, numero),
    CONSTRAINT ck_estimacion_periodo CHECK (periodo_fin IS NULL OR periodo_ini IS NULL OR periodo_fin >= periodo_ini)
);
CREATE INDEX IF NOT EXISTS ix_estimaciones_contrato ON estimaciones_obra (contrato_id, estatus);

CREATE TABLE IF NOT EXISTS estimacion_conceptos (
    estimacion_concepto_id  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    estimacion_id           INTEGER NOT NULL REFERENCES estimaciones_obra (estimacion_id) ON DELETE CASCADE,
    contrato_concepto_id    BIGINT NOT NULL REFERENCES contrato_conceptos (contrato_concepto_id),
    cantidad                NUMERIC(18,4) NOT NULL CHECK (cantidad > 0),
    importe                 NUMERIC(18,2) NOT NULL,
    CONSTRAINT uq_estimacion_concepto UNIQUE (estimacion_id, contrato_concepto_id)
);
CREATE INDEX IF NOT EXISTS ix_estimacion_conceptos_concepto ON estimacion_conceptos (contrato_concepto_id);

ALTER TABLE contrato_conceptos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimaciones_obra    ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimacion_conceptos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF to_regproc('auditoria_registrar') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS auditoria_estimaciones_obra ON estimaciones_obra;
        CREATE TRIGGER auditoria_estimaciones_obra AFTER INSERT OR UPDATE OR DELETE ON estimaciones_obra
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('estimacion_id');
        DROP TRIGGER IF EXISTS auditoria_estimacion_conceptos ON estimacion_conceptos;
        CREATE TRIGGER auditoria_estimacion_conceptos AFTER INSERT OR UPDATE OR DELETE ON estimacion_conceptos
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('estimacion_id');
        DROP TRIGGER IF EXISTS auditoria_contrato_conceptos ON contrato_conceptos;
        CREATE TRIGGER auditoria_contrato_conceptos AFTER INSERT OR UPDATE OR DELETE ON contrato_conceptos
            FOR EACH ROW EXECUTE FUNCTION auditoria_registrar('contrato_id');
    END IF;
END $$;

/* ==================== Quedan anotadas como aplicadas ==================== */
INSERT INTO migraciones_aplicadas (nombre, checksum, usuario) VALUES
    ('001_auditoria.sql', '537d4e869b444795e2162d826374c249a4a2e9d21fba6ce5fa80f6e1a7c4bdd8', 'SQL Editor'),
    ('002_autorizaciones.sql', '026e4ef73ab11d8d83f11ceea1e98a27c46816bf9f0dc897e906be299f187904', 'SQL Editor'),
    ('003_obra_movimientos.sql', 'b9f0adc64924b84484d8f73a0841622f47b7a67393afc658182bcaf598fd5e7f', 'SQL Editor'),
    ('004_insumos.sql', '72071ccdb428aee6a6f9466514f7fddc519b4c28ac07af0329fa9b624aa778fa', 'SQL Editor'),
    ('005_tipo_cambio_fasar_costo_horario.sql', '6e5151a54f1b17e883158149edee1881504959667c34e9fd1e028c7374f6e918', 'SQL Editor'),
    ('006_conceptos_pu_versiones.sql', '71c7b41deafcae99aa28930b06bfcab4db7924caf45d0f89c434e6118e274c89', 'SQL Editor'),
    ('007_presupuesto_iva.sql', '7e2cf452114077d19f2a7457c4571a96ad31c79105d98d49dd1062e9cf64f7fc', 'SQL Editor'),
    ('008_plantillas_presupuesto.sql', 'c9978099e4b62b08bb8400ce6cc0ccf28bdb661dab923bc461302e2d5deba0b0', 'SQL Editor'),
    ('009_contratos_convenios.sql', '20b22417d92dcacd84f02013ce449613734502a0852e39a20b628b9804481bd2', 'SQL Editor'),
    ('010_tareas_predecesoras.sql', '7fe5aecf9b4b8a5da9aeb93e1c1f3c05af9b96062fd5053399f49d4f34616c71', 'SQL Editor'),
    ('011_estimaciones.sql', 'a1b529b9996bba8162a8e660c83dbf9394347066da00bec6569d8a5d9a1d75f0', 'SQL Editor')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;

/* Para revisar: select nombre, fecha from migraciones_aplicadas order by nombre; */
