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
