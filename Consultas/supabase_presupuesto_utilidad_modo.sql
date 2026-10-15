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
