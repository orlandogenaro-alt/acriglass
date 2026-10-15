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
