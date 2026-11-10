// Validación contra Neodata: compara lo que calculó Neodata con lo que da el motor del sistema
// (js/presupuesto-calculo.js, gemelo de includes/presupuesto-calculo.php) con las mismas matrices.
// Los datos salen de herramientas/validar-neodata.ps1 (un JSON por presupuesto en herramientas/validacion-neodata).
//
// Uso:  node herramientas/validar-neodata.js                 todos los JSON de validacion-neodata
//       node herramientas/validar-neodata.js <archivo.json>  uno
//       agregar --detalle para ver cada concepto con diferencia y su matriz
//
// Cómo se arma cada concepto (las reglas de Neodata que se encontraron al validar):
//   · Insumo con matriz (básico, cuadrilla, accesorios…): componentes del sistema (matriz dentro de matriz), su costo
//     es la suma de sus componentes.
//   · Mano de obra: el costo de Neodata ya es el salario real (con su FASAR), así que FSR 1.
//   · Insumo con unidad «%» de equipo (Herramienta, Seguridad): % de los materiales del concepto (base 'pct_mat').
//     Uno de material (Tornillería y material menor) es cantidad × su costo, como cualquier material.
//   · Costos en dólares: × la paridad del presupuesto.
require('../js/presupuesto-calculo.js');
var M = global.AcriCalculoPU;
var fs = require('fs'), path = require('path');

var args = process.argv.slice(2), detalle = args.indexOf('--detalle') >= 0;
args = args.filter(function (a) { return a !== '--detalle'; });
var carpeta = path.join(__dirname, 'validacion-neodata');
var archivos = args.length ? args : fs.readdirSync(carpeta).filter(function (f) { return /\.json$/i.test(f); }).map(function (f) { return path.join(carpeta, f); });

var TIPOS = { 1: 'MAT', 2: 'MO', 3: 'EQ', 4: 'MAT', 5: 'MAT' };
function dinero(n) { return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(a, b) { return b ? ((a / b - 1) * 100).toFixed(2) + ' %' : '—'; }

function validar(archivo) {
    var d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    var ins = {}, mat = {};
    d.insumos.forEach(function (i) { ins[i.IdExpIns] = i; });
    d.matrices.forEach(function (r) { (mat[r.IdCodigoMatriz] = mat[r.IdCodigoMatriz] || []).push(r); });
    var paridad = (d.monedas.filter(function (m) { return m.IdMoneda === 2; })[0] || {}).Paridad || 0;
    var avisos = {};
    function aviso(t) { avisos[t] = (avisos[t] || 0) + 1; }
    function costo(i) {
        if (i.CostoMXN !== null && i.CostoMXN !== undefined) return i.CostoMXN;
        if (i.CostoUSD) { if (!paridad) aviso('Costo en dólares sin paridad en el presupuesto'); return i.CostoUSD * paridad; }
        aviso('Insumo sin costo');
        return 0;
    }
    // Renglón de matriz de Neodata → insumo del sistema
    function insumo(r, nivel) {
        var i = ins[r.IdCodigoInsumo];
        if (!i) { aviso('Renglón de matriz con un insumo que no existe'); return { tipo: 'MAT', cantidad: 0, costo: 0 }; }
        if (r.Dividir) aviso('Renglón con «Dividir» (no se probó)');
        if (r.Expresion && r.Expresion !== 'C') aviso('Renglón con expresión «' + r.Expresion + '» (no se probó)');
        var x = { tipo: TIPOS[i.IdTipo] || 'MAT', codigo: i.Codigo, descripcion: i.Descripcion, unidad: i.Unidad || '', cantidad: r.Volumen, fsr: 1 };
        // EsPorcentaje del catálogo de Neodata: 1 = % de los materiales, 2 = % de la mano de obra, 0 = cantidad × costo
        var esPct = i.EsPorcentaje === undefined ? (i.Unidad === '%' && i.IdTipo === 3 ? 1 : 0) : i.EsPorcentaje;
        if (esPct && nivel) aviso('Insumo % (EsPorcentaje ' + esPct + ') dentro de un básico (no se probó)');
        else if (esPct === 1 || esPct === 2) { x.base = esPct === 1 ? 'pct_mat' : 'pct_mo'; x.cantidad = r.Volumen * 100; return x; }
        else if (esPct) aviso('Insumo con EsPorcentaje ' + esPct + ' (no se conoce su base)');
        var hijos = mat[r.IdCodigoInsumo];
        if (hijos && hijos.length && nivel < 5) {
            x.componentes = hijos.map(function (h) { return insumo(h, nivel + 1); });
            // El costo que Neodata guardó en el básico contra la suma de sus componentes
            var suma = M.costoReal(x, 1);
            if (Math.abs(suma - costo(i)) > 0.01) aviso('Básico con costo guardado distinto de la suma de su matriz (Neodata sin recalcular)');
        } else x.costo = costo(i);
        return x;
    }

    var tot = { cd: 0, neoCd: 0, pv: 0, mat: 0, mo: 0, eq: 0 }, filas = [], factores = {}, especiales = 0;
    d.conceptos.forEach(function (c) {
        var concepto = { cantidad: c.Cantidad, insumos: (mat[c.IdExpIns] || []).map(function (r) { return insumo(r, 0); }) };
        var r = M.concepto(concepto, { fsr: 1, hm: 0 }), t = r.totales;
        var sinMatriz = !concepto.insumos.length;
        var cd = sinMatriz ? (c.Costo || 0) : t.cd;   // un concepto sin matriz en Neodata: su costo es el capturado
        tot.cd += c.Cantidad * cd;
        tot.neoCd += c.Cantidad * (c.Costo || 0);
        tot.pv += c.Cantidad * (c.Precio || 0);
        if (!sinMatriz) { tot.mat += c.Cantidad * t.mat; tot.mo += c.Cantidad * t.moReal; tot.eq += c.Cantidad * (t.eq + t.maq + t.her + t.otro); }
        if (c.IndirectoEspecial) especiales++;
        if (c.Costo > 0 && c.Precio > 0) { var f = (c.Precio / c.Costo).toFixed(4); factores[f] = (factores[f] || 0) + 1; }
        // Si no cuadra: ¿cuadra con otra base en los insumos % (% de los materiales, % de la mano de obra o cantidad × costo)?
        // Pasa cuando en el catálogo de Neodata se cambió «EsPorcentaje» después de calcular el presupuesto
        var otraBase = '';
        if (!sinMatriz && Math.abs(cd - (c.Costo || 0)) >= 0.05) {
            var pcts = [];
            (mat[c.IdExpIns] || []).forEach(function (r, n) {
                var i = ins[r.IdCodigoInsumo];
                if (i && (i.Unidad === '%' || i.EsPorcentaje)) pcts.push({ n: n, r: r, i: i });
            });
            var opciones = ['pct_mat', 'pct_mo', 'cantidad'];
            for (var combo = 0; pcts.length && pcts.length <= 4 && combo < Math.pow(3, pcts.length) && !otraBase; combo++) {
                var prueba = { cantidad: c.Cantidad, insumos: concepto.insumos.slice() }, nombres = [];
                pcts.forEach(function (p, k) {
                    var o = opciones[Math.floor(combo / Math.pow(3, k)) % 3], x = Object.assign({}, concepto.insumos[p.n]);
                    delete x.base;
                    if (o === 'cantidad') { x.cantidad = p.r.Volumen; x.costo = costo(p.i); } else { x.base = o; x.cantidad = p.r.Volumen * 100; }
                    prueba.insumos[p.n] = x;
                    nombres.push(p.i.Codigo + ' ' + (o === 'pct_mat' ? '% materiales' : o === 'pct_mo' ? '% M.O.' : 'cant. × costo'));
                });
                if (Math.abs(M.concepto(prueba, { fsr: 1, hm: 0 }).totales.cd - c.Costo) < 0.05) otraBase = nombres.join(', ');
            }
        }
        filas.push({ c: c, cd: cd, dif: cd - (c.Costo || 0), sinMatriz: sinMatriz, concepto: concepto, r: r, otraBase: otraBase });
    });

    var neo = (d.totales.filter(function (t) { return t.IdMoneda === 1; })[0]) || {};
    // Neodata redondea a 2 decimales el costo de los básicos y el importe de cada renglón; el sistema no redondea:
    // eso deja diferencias de centavos (menos de 5 centavos se cuenta como redondeo)
    var iguales = filas.filter(function (f) { return Math.abs(f.dif) < 0.005; }).length;
    var otra = filas.filter(function (f) { return f.otraBase; });
    var malos = filas.filter(function (f) { return Math.abs(f.dif) >= 0.05 && !f.otraBase; });
    console.log('\n=== ' + d.obra + ' / ' + d.presupuesto + ' (' + d.id + '): ' + filas.length + ' conceptos');
    console.log('  Costo directo de los conceptos: ' + iguales + ' iguales al centavo, ' + (filas.length - iguales - malos.length - otra.length) +
                ' con diferencia de redondeo (< 5 centavos), ' + otra.length + ' cuadran con otra base en los % (catálogo de Neodata cambiado), ' +
                malos.length + ' distintos');
    if (detalle) otra.forEach(function (f) { console.log('    ' + String(f.c.Codigo).padEnd(16) + ' cuadra con: ' + f.otraBase); });
    malos.slice(0, detalle ? 999 : 8).forEach(function (f) {
        console.log('    ' + String(f.c.Codigo).padEnd(16) + ' Neodata ' + dinero(f.c.Costo || 0).padStart(13) + '  sistema ' + dinero(f.cd).padStart(13) +
                    '  dif ' + dinero(f.dif).padStart(10) + ' (' + pct(f.cd, f.c.Costo) + ')  ' + String(f.c.Descripcion).slice(0, 45));
        if (detalle) f.concepto.insumos.forEach(function (i, n) {
            console.log('        ' + String(i.codigo).padEnd(14) + i.tipo.padEnd(4) + (i.base || '').padEnd(8) + String(i.cantidad).padStart(12) +
                        ' × ' + (i.componentes ? '(compuesto)' : String(i.costo)).padStart(11) + ' = ' + dinero(f.r.insumos[n].importe).padStart(12) + '  ' + String(i.descripcion).slice(0, 35));
        });
    });
    if (!detalle && malos.length > 8) console.log('    … y ' + (malos.length - 8) + ' más (--detalle para verlos todos)');
    console.log('  Costo directo total:   Neodata ' + dinero(neo.CostoTotal || 0).padStart(15) + '  suma de conceptos Neodata ' + dinero(tot.neoCd).padStart(15) +
                '  sistema ' + dinero(tot.cd).padStart(15) + '  (' + pct(tot.cd, neo.CostoTotal) + ')');
    console.log('    materiales     Neodata ' + dinero(neo.CostoMA || 0).padStart(15) + '  sistema ' + dinero(tot.mat).padStart(15));
    console.log('    mano de obra   Neodata ' + dinero(neo.CostoMO || 0).padStart(15) + '  sistema ' + dinero(tot.mo).padStart(15));
    console.log('    equipo         Neodata ' + dinero(neo.CostoEQ || 0).padStart(15) + '  sistema ' + dinero(tot.eq).padStart(15));
    console.log('  Precio total:          Neodata ' + dinero(neo.PrecioTotal || 0).padStart(15) + '  suma de conceptos (cant × P.U.) ' + dinero(tot.pv).padStart(15) +
                '  factor de sobrecosto ' + (neo.CostoTotal ? (neo.PrecioTotal / neo.CostoTotal).toFixed(4) : '—'));
    var fs_ = Object.keys(factores).sort(function (a, b) { return factores[b] - factores[a]; });
    console.log('  Factor P.U. / CD por concepto: ' + fs_.slice(0, 5).map(function (f) { return f + ' (' + factores[f] + ')'; }).join(', ') + (fs_.length > 5 ? ', …' : '') +
                (especiales ? '   ' + especiales + ' con indirecto especial' : ''));
    Object.keys(avisos).forEach(function (a) { console.log('  Aviso: ' + a + ' (' + avisos[a] + ')'); });
    return { conceptos: filas.length, iguales: filas.length - malos.length - otra.length, otra: otra.length, cd: tot.cd, neo: neo.CostoTotal || 0, malos: malos.length,
             nombre: d.obra + ' / ' + d.presupuesto + ' (' + d.id + ')' };
}

var suma = { conceptos: 0, iguales: 0, otra: 0, malos: 0 }, conDif = [];
archivos.forEach(function (a) {
    var r = validar(a);
    suma.conceptos += r.conceptos;
    suma.iguales += r.iguales;
    suma.otra += r.otra;
    suma.malos += r.malos;
    if (r.malos) conDif.push(r.nombre + ': ' + r.malos + ' conceptos, total ' + pct(r.cd, r.neo));
});
console.log('\nTOTAL: ' + archivos.length + ' presupuestos, ' + suma.conceptos + ' conceptos:');
console.log('  ' + suma.iguales + ' con el mismo costo directo que Neodata (al centavo o con diferencia de redondeo)');
console.log('  ' + suma.otra + ' cuadran con otra base en los insumos % (en el catálogo de Neodata se cambió después de calcular)');
console.log('  ' + suma.malos + ' distintos');
if (conDif.length) console.log('Con diferencias reales:\n  ' + conDif.join('\n  '));
