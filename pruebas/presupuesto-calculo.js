// Gemelo del motor de P.U. en la pantalla (js/presupuesto-calculo.js) con los casos compartidos de
// pruebas/presupuesto-calculo.json, los mismos que corre pruebas/presupuesto-calculo.php contra el servidor.
// Se corre con: node pruebas/presupuesto-calculo.js   (sale con código 1 si algo falla)
require('../js/presupuesto-calculo.js');
var M = global.AcriCalculoPU;
var casos = require('./presupuesto-calculo.json').casos;
var fallas = 0;

function comparar(esperado, obtenido, ruta) {
    Object.keys(esperado).forEach(function (k) {
        var v = esperado[k];
        if (!(k in Object(obtenido))) throw new Error('falta ' + ruta + k);
        if (typeof v === 'object') { comparar(v, obtenido[k], ruta + k + '.'); return; }
        if (Math.abs(v - obtenido[k]) >= 0.00005 * Math.max(1, Math.abs(v))) throw new Error(ruta + k + ': se esperaba ' + v + ' y se obtuvo ' + obtenido[k]);
    });
}

console.log('Motor de P.U. de la pantalla');
casos.forEach(function (caso) {
    try {
        if (caso.tipo === 'sobrecosto') comparar(caso.esperado, M.sobrecosto.apply(null, caso.args), '');
        else if (caso.tipo === 'precio') comparar(caso.esperado, M.precioConcepto(caso.cd, M.sobrecosto.apply(null, caso.args)), '');
        else {
            var r = M.concepto(caso.concepto, caso.analisis);
            r.resumen = M.resumen(r.totales);
            comparar(caso.esperado, r, '');
        }
        console.log('  ok    ' + caso.nombre);
    } catch (e) {
        fallas++;
        console.log('  FALLA ' + caso.nombre + '\n        ' + e.message);
    }
});
console.log(fallas ? fallas + ' FALLARON' : 'Todas pasaron');
process.exit(fallas ? 1 : 0);
