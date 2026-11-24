/****************************************************************************************/
/****  038 · ACRINEO › Datos de la partida como en Neodata PU Nube+: WBS (Work         ****/
/****        Breakdown Structure, lo pone «Regenerar WBS»), partida auxiliar,         ****/
/****        descripción corta (40 caracteres) y renglón (número de orden, lo pone    ****/
/****        «Renumerar renglón»).                                                    ****/
/****************************************************************************************/

alter table acrineo_partidas add column if not exists wbs               varchar(60);
alter table acrineo_partidas add column if not exists codigo_auxiliar   varchar(30);
alter table acrineo_partidas add column if not exists descripcion_corta varchar(40);
alter table acrineo_partidas add column if not exists renglon           integer;
