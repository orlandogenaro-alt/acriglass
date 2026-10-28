/******************************************************************************/
/****  021 - Programa de los conceptos del presupuesto                      ****/
/****                                                                       ****/
/****  Botón Cálculo: cada concepto del Análisis P.U. puede tener su        ****/
/****  programa (inicio y fin) para calcular lo que se requiere hasta un    ****/
/****  periodo de corte y marcar las actividades programadas en él. Queda   ****/
/****  listo para cuando el programa de obra completo las llene.            ****/
/****  El periodo de corte y las opciones se guardan en el análisis (JSON). ****/
/****                                                                       ****/
/****  Requiere la 017. Se aplica con: php herramientas/migrar.php --aplicar ****/
/******************************************************************************/

ALTER TABLE presupuesto_conceptos ADD COLUMN IF NOT EXISTS programa_inicio DATE;
ALTER TABLE presupuesto_conceptos ADD COLUMN IF NOT EXISTS programa_fin    DATE;
