/******************************************************************************/
/****  AcriGlass - Migración 013 para el SQL Editor de Supabase             ****/
/****  (Id de HubSpot de los vendedores de obra)                           ****/
/****                                                                       ****/
/****  Cómo correrlo: Supabase > SQL Editor > New query > pegar TODO > Run  ****/
/****                                                                       ****/
/****  - Va en una sola transacción: si algo falla, no se aplica nada.      ****/
/****  - Queda anotada en migraciones_aplicadas, así después                ****/
/****    php herramientas/migrar.php sabe que ya se aplicó.                ****/
/****  - Se puede volver a correr: usa IF NOT EXISTS.                       ****/
/****  - Archivo generado; el original está en migraciones/.               ****/
/******************************************************************************/

BEGIN;

/* ---------- Requisitos ---------- */
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['vendedores_obras'] LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE EXCEPTION 'Falta la tabla %: primero corre los scripts base (Consultas/supabase_acriglass.sql).', t;
        END IF;
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS migraciones_aplicadas (
    nombre    VARCHAR(100) PRIMARY KEY,
    checksum  CHAR(64) NOT NULL,
    fecha     TIMESTAMPTZ NOT NULL DEFAULT now(),
    usuario   VARCHAR(100)
);
ALTER TABLE migraciones_aplicadas ENABLE ROW LEVEL SECURITY;

/* ==================== 013_vendedores_hubspot.sql ==================== */
/******************************************************************************/
/****  013 - Id de HubSpot de los vendedores de obra (Supabase)             ****/
/****                                                                       ****/
/****  Al guardar un presupuesto, su negocio de HubSpot queda a nombre del  ****/
/****  vendedor (retorna_id_hubspot_vendedores_obra del escritorio). Aquí   ****/
/****  se guarda el Id de propietario (owner) de HubSpot de cada vendedor;  ****/
/****  se captura en Catalogos › Vendedores de Obra. Sin él se usa el del   ****/
/****  usuario del sistema con el mismo nombre.                            ****/
/****                                                                       ****/
/****  Se aplica con: php herramientas/migrar.php --aplicar                 ****/
/******************************************************************************/

ALTER TABLE vendedores_obras ADD COLUMN IF NOT EXISTS id_hubspot VARCHAR(30);

/* ==================== Queda anotada como aplicada ==================== */
INSERT INTO migraciones_aplicadas (nombre, checksum, usuario) VALUES
    ('013_vendedores_hubspot.sql', '8a44a50b9059835c05a7ddd29a96309e398904674a7fea3d191990f012620d98', 'SQL Editor')
ON CONFLICT (nombre) DO NOTHING;

COMMIT;

/* Para revisar: select nombre, fecha from migraciones_aplicadas order by nombre; */
