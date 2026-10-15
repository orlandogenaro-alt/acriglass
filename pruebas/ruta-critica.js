// Ruta crítica del programa de obra (js/ruta-critica.js). Se corre con: node pruebas/ruta-critica.js
global.window = {};
require('../js/ruta-critica.js');
var RC = window.RutaCritica;
var D = 864e5, base = Date.UTC(2026, 10, 2);   // 2-nov-2026
function dia(n) { return base + n * D; }
var fallas = 0;
function prueba(nombre, fn) {
    try { fn(); console.log('  ok    ' + nombre); } catch (e) { fallas++; console.log('  FALLA ' + nombre + '\n        ' + e.message); }
}
function igual(a, b, que) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((que || '') + ' se esperaba ' + JSON.stringify(a) + ' y se obtuvo ' + JSON.stringify(b)); }

console.log('Ruta crítica del programa');

// Medición (3 días) → Fabricación (10) → Instalación (4); Limpieza (1) después de Instalación; Herrajes (2) en paralelo a Fabricación
var programa = [
    { id: 'MED', inicio: dia(0), fin: dia(3), preds: [] },
    { id: 'FAB', inicio: dia(3), fin: dia(13), preds: ['MED'] },
    { id: 'HER', inicio: dia(3), fin: dia(5), preds: ['MED'] },
    { id: 'INS', inicio: dia(13), fin: dia(17), preds: ['FAB', 'HER'] },
    { id: 'LIM', inicio: dia(17), fin: dia(18), preds: ['INS'] }
];

prueba('la ruta crítica es Medición → Fabricación → Instalación → Limpieza; termina el día 18', function () {
    var r = RC.calcular(programa);
    igual(['FAB', 'INS', 'LIM', 'MED'], Object.keys(r.criticas).sort());
    igual(dia(18), r.fin, 'fin');
});

prueba('Herrajes tiene 8 días de holgura (puede terminar hasta el día 13)', function () {
    var r = RC.calcular(programa);
    igual(8, r.holgura.HER);
    igual(dia(13), r.lf.HER, 'fin más tardío');
});

prueba('una tarea que empieza antes de que termine su predecesora es un conflicto; el programa la mueve', function () {
    var p = programa.map(function (t) { return Object.assign({}, t); });
    p[3].inicio = dia(10); p[3].fin = dia(14);       // Instalación empieza antes de que termine Fabricación
    var r = RC.calcular(p);
    igual([{ id: 'INS', pred: 'FAB' }], r.conflictos);
    igual(dia(13), r.es.INS, 'inicio programado');
    igual(dia(17), r.ef.INS, 'conserva su duración de 4 días');
});

prueba('referencia circular: se detecta y no se calcula', function () {
    var r = RC.calcular([{ id: 'A', inicio: dia(0), fin: dia(1), preds: ['B'] }, { id: 'B', inicio: dia(1), fin: dia(2), preds: ['A'] },
                         { id: 'C', inicio: dia(0), fin: dia(1), preds: [] }]);
    igual(['A', 'B'], r.ciclo);
});

prueba('predecesora que no existe o es ella misma: se reporta y se ignora', function () {
    var r = RC.calcular([{ id: 'A', inicio: dia(0), fin: dia(2), preds: ['ZZZ', 'A'] }]);
    igual([{ id: 'A', pred: 'ZZZ' }, { id: 'A', pred: 'A' }], r.faltan);
    igual(true, !!r.criticas.A);
});

console.log(fallas ? fallas + ' FALLARON' : 'Todas pasaron');
process.exit(fallas ? 1 : 0);
