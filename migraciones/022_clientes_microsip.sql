/******************************************************************************/
/****  022 - Clientes ligados a Microsip                                    ****/
/****                                                                       ****/
/****  El Catálogo de Clientes ya se relaciona con HubSpot (hs_clientes,    ****/
/****  migración 016). Aquí se agrega su cuenta de Microsip: el cliente_id  ****/
/****  y la clave que da la API de Easy-Glass (/clientes).                  ****/
/****    · Cliente con cuenta en Microsip: se trae de Microsip.             ****/
/****    · Cliente nuevo: se da de alta desde su contacto de HubSpot.       ****/
/****  El presupuesto de obra guarda el cliente del catálogo en su          ****/
/****  cliente_id (doctos_sugerido_obra).                                   ****/
/****                                                                       ****/
/****  Requiere la 016. Se aplica con: php herramientas/migrar.php --aplicar ****/
/******************************************************************************/

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS microsip_cliente_id INTEGER;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS microsip_clave       VARCHAR(30);

/* Una cuenta de Microsip solo puede estar en un cliente del catálogo */
CREATE UNIQUE INDEX IF NOT EXISTS clientes_microsip_unico ON clientes (microsip_cliente_id) WHERE microsip_cliente_id IS NOT NULL;
