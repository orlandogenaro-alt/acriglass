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
