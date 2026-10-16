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
