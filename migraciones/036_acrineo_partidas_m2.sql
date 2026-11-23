/****************************************************************************************/
/****  036 · ACRINEO › Metros cuadrados de cada partida, para mostrar en el árbol de  ****/
/****        partidas el Costo x M2 y el Precio x M2 (costo y precio de la partida   ****/
/****        entre sus metros cuadrados). Empieza en 1.                             ****/
/****************************************************************************************/

alter table acrineo_partidas add column if not exists metros_cuadrados numeric(18,4) not null default 1;

alter table acrineo_partidas drop constraint if exists acrineo_partidas_m2_positivo;
alter table acrineo_partidas add constraint acrineo_partidas_m2_positivo check (metros_cuadrados > 0);
