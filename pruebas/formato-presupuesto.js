// Formato impreso del presupuesto (js/formato-presupuesto.js): partidas, subpartidas y propuesta para el cliente.
// Se corre con: node pruebas/formato-presupuesto.js   (sale con código 1 si algo falla)
global.window = {};
require('../js/formato-presupuesto.js');

var doc = {
    folio: 12, fecha: '2026-10-15', estatus: 'Pendiente', cliente: 'CLIENTE', proyecto: 'P', ubicacion: '', vendedor: 'V', elaboro: 'U', notas: '',
    secciones: [], utilidad_pct: 20, subtotal: 3000, iva_pct: 8, propuesta: true, titulo: 'PROPUESTA ECONÓMICA',
    catalogo: { factor: 1.3, detalle: false, partidas: [{
        nombre: 'Cancelería', numero: '1',
        conceptos: [{ clave: '001', descripcion: 'Cancel fijo', unidad: 'M2', cantidad: 2, pu: 500, importe: 1000, especificacion: 'Vidrio templado 9 mm\nPerfil 3"' }],
        subpartidas: [{ nombre: 'Planta baja', numero: '1.1', conceptos: [{ clave: '002', descripcion: 'Puerta', unidad: 'PZA', cantidad: 1, pu: 2000, importe: 2000 }] }]
    }] }
};
var html = window.FormatoPresupuesto(doc, {}, false);
var fallas = 0;
function hay(texto, que) {
    var ok = html.indexOf(texto) >= 0;
    if (!ok) fallas++;
    console.log((ok ? '  ok    ' : '  FALLA ') + que);
}

console.log('Formato impreso del presupuesto');
hay('1 &nbsp;Cancelería', 'partida numerada');
hay('$3,000.00', 'el total de la partida incluye su subpartida');
hay('1.1 &nbsp;Planta baja', 'subpartida numerada');
hay('Vidrio templado 9 mm<br>Perfil 3&quot;', 'especificación técnica escapada y con saltos de línea');
hay('IVA (8%):', 'IVA con la tasa del presupuesto');
hay('$3,240.00', 'total con IVA de 8 %');
if (html.indexOf('Estatus:') >= 0) { fallas++; console.log('  FALLA la propuesta no debe mostrar el estatus'); } else console.log('  ok    la propuesta no muestra el estatus');

doc.propuesta = false;
html = window.FormatoPresupuesto(doc, {}, false);
if (html.indexOf('Vidrio templado') >= 0) { fallas++; console.log('  FALLA el P.U. interno no lleva la especificación'); } else console.log('  ok    el P.U. interno no lleva la especificación');

console.log(fallas ? fallas + ' FALLARON' : 'Todas pasaron');
process.exit(fallas ? 1 : 0);
