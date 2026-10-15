// Ruta crítica (CPM) del programa de obra. Puro, sin pantalla: lo usa js/conceptos-tareas.js (Gantt) y lo prueba
// pruebas/ruta-critica.js. Dependencias de fin a inicio (la tarea empieza cuando terminan sus predecesoras).
//
//   RutaCritica.calcular([{ id, inicio, fin, preds: [id…] }])   inicio / fin en milisegundos (fechas del programa)
//   → { ciclo: [id…] | null,            tareas en una referencia circular (entonces no se calcula lo demás)
//       faltan: [{ id, pred }],          predecesoras que no existen o no tienen fechas
//       conflictos: [{ id, pred }],      la tarea empieza antes de que termine su predecesora
//       es / ef / ls / lf: { id: ms },   inicio y fin más tempranos y más tardíos
//       holgura: { id: días },           cuánto se puede retrasar sin mover la terminación de la obra
//       criticas: { id: true },          holgura cero: si se retrasan, se retrasa la obra
//       fin: ms }                        terminación de la obra con las dependencias
// Una tarea sin predecesoras conserva su inicio; una con predecesoras empieza al terminar la última.
(function (raiz) {
    var DIA = 864e5, TOLERANCIA = 6e4;   // un minuto

    function calcular(lista) {
        var porId = {}, r = { ciclo: null, faltan: [], conflictos: [], es: {}, ef: {}, ls: {}, lf: {}, holgura: {}, criticas: {}, fin: null };
        lista.forEach(function (t) { porId[t.id] = t; });
        var preds = {}, sucs = {};
        lista.forEach(function (t) {
            preds[t.id] = [];
            sucs[t.id] = sucs[t.id] || [];
            (t.preds || []).forEach(function (p) {
                if (p === t.id || !porId[p]) { r.faltan.push({ id: t.id, pred: p }); return; }
                if (preds[t.id].indexOf(p) < 0) preds[t.id].push(p);
                (sucs[p] = sucs[p] || []).push(t.id);
            });
        });

        // Orden topológico (Kahn); lo que sobra está en un ciclo
        var entradas = {}, cola = [], orden = [];
        lista.forEach(function (t) { entradas[t.id] = preds[t.id].length; if (!entradas[t.id]) cola.push(t.id); });
        while (cola.length) {
            var id = cola.shift();
            orden.push(id);
            (sucs[id] || []).forEach(function (s) { if (--entradas[s] === 0) cola.push(s); });
        }
        if (orden.length < lista.length) {
            r.ciclo = lista.filter(function (t) { return orden.indexOf(t.id) < 0; }).map(function (t) { return t.id; });
            return r;
        }

        var dur = {};
        lista.forEach(function (t) { dur[t.id] = Math.max(0, t.fin - t.inicio); });
        // Ida: inicio y fin más tempranos
        orden.forEach(function (id) {
            var t = porId[id];
            r.es[id] = preds[id].length ? Math.max.apply(null, preds[id].map(function (p) { return r.ef[p]; })) : t.inicio;
            r.ef[id] = r.es[id] + dur[id];
            preds[id].forEach(function (p) { if (t.inicio < porId[p].fin - TOLERANCIA) r.conflictos.push({ id: id, pred: p }); });
        });
        r.fin = lista.length ? Math.max.apply(null, orden.map(function (id) { return r.ef[id]; })) : null;
        // Vuelta: inicio y fin más tardíos
        orden.slice().reverse().forEach(function (id) {
            var s = sucs[id] || [];
            r.lf[id] = s.length ? Math.min.apply(null, s.map(function (x) { return r.ls[x]; })) : r.fin;
            r.ls[id] = r.lf[id] - dur[id];
            var h = r.ls[id] - r.es[id];
            r.holgura[id] = Math.round(h / DIA * 100) / 100;
            if (h < TOLERANCIA) r.criticas[id] = true;
        });
        return r;
    }

    raiz.RutaCritica = { calcular: calcular };
})(typeof window !== 'undefined' ? window : globalThis);
