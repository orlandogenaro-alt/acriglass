// Motor de cálculo del Análisis de Precios Unitarios: gemelo de includes/presupuesto-calculo.php (la fuente de
// verdad, donde están explicadas las fórmulas). Aquí solo para la vista previa en vivo de la pantalla; los dos
// se prueban con los mismos casos (pruebas/presupuesto-calculo.json). Si cambias una fórmula, cámbiala en los dos.
(function (raiz) {
    var TIPOS = ['MAT', 'MO', 'EQ', 'MAQ', 'HER', 'OTRO'];

    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function fsrAnalisis(a) { return num(a && a.fsr) > 0 ? num(a.fsr) : 1; }

    function insumo(i) {
        i = i || {};
        var tipo = TIPOS.indexOf(i.tipo) >= 0 ? i.tipo : 'MAT';
        var rinde = Math.max(0, num(i.rinde));
        var tc = i.tipo_calculo === 'cantidad' || i.tipo_calculo === 'rendimiento' ? i.tipo_calculo : (tipo === 'MO' && rinde > 0 ? 'rendimiento' : 'cantidad');
        var base = ['unidad', 'fijo', 'pct_mo'].indexOf(i.base) >= 0 ? i.base : 'unidad';
        var factor = i.factor !== undefined && i.factor !== null && i.factor !== '' ? Math.max(0, num(i.factor)) : 1;
        return {
            tipo: tipo, tipo_calculo: tc, base: base,
            cantidad: Math.max(0, num(i.cantidad)), rinde: rinde, factor: factor,
            merma_pct: Math.max(0, num(i.merma_pct)), costo: Math.max(0, num(i.costo)), fsr: Math.max(0, num(i.fsr)),
            viaticos: Math.max(0, num(i.viaticos)), alimentacion: Math.max(0, num(i.alimentacion)), hospedaje: Math.max(0, num(i.hospedaje))
        };
    }

    function cantidad(i, cantConcepto) {
        i = insumo(i);
        var q = i.tipo_calculo === 'rendimiento' ? (i.rinde > 0 ? 1 / i.rinde : 0) : i.cantidad;
        if (i.base === 'pct_mo') return q;
        if (i.base === 'fijo' && cantConcepto > 0) q /= cantConcepto;
        return q * i.factor * (1 + i.merma_pct / 100);
    }

    function fsrInsumo(i, fsr) {
        i = insumo(i);
        return i.fsr > 0 ? i.fsr : (fsr > 0 ? fsr : 1);
    }

    // Matriz dentro de matriz (ver includes/presupuesto-calculo.php)
    var NIVELES = 5;
    function componentes(i) { return i && Array.isArray(i.componentes) ? i.componentes.filter(function (c) { return c && typeof c === 'object'; }) : []; }
    function enCompuesto(c) { var r = {}; Object.keys(c).forEach(function (k) { r[k] = c[k]; }); r.base = 'unidad'; return r; }

    function costos(i, fsr, nivel) {
        nivel = nivel || 0;
        var comp = componentes(i);
        if (comp.length && nivel < NIVELES) {
            var r = { base: 0, real: 0 };
            comp.forEach(function (c) {
                var q = cantidad(enCompuesto(c)), k = costos(c, fsr, nivel + 1);
                r.base += q * k.base;
                r.real += q * k.real;
            });
            return r;
        }
        var x = insumo(i);
        if (x.tipo !== 'MO') return { base: x.costo, real: x.costo };
        return { base: x.costo, real: x.costo * fsrInsumo(x, fsr) + x.viaticos + x.alimentacion + x.hospedaje };
    }
    function costoReal(i, fsr) { return costos(i, fsr).real; }

    function desgloseCompuesto(i, fsr) {
        return componentes(i).map(function (c) {
            var q = cantidad(enCompuesto(c)), k = costos(c, fsr, 1), x = insumo(c);
            var r = { tipo: x.tipo, cantidad: q, base: k.base, costo: k.real, importe: q * k.real, compuesto: componentes(c).length > 0 };
            if (x.tipo === 'MO' && !r.compuesto) r.fsr = fsrInsumo(x, fsr);
            return r;
        });
    }

    function concepto(c, a) {
        var fsr = fsrAnalisis(a), cantC = num(c.cantidad);
        var t = { mat: 0, mo: 0, moReal: 0, eq: 0, maq: 0, her: 0, otro: 0, hm: 0, cd: 0 };
        var lista = c.insumos || [], renglones = [], pctMo = [];
        lista.forEach(function (raw, n) {
            var i = insumo(raw);
            if (i.base === 'pct_mo') { pctMo.push(n); renglones[n] = null; return; }
            var q = cantidad(raw, cantC), k = costos(raw, fsr), imp = q * k.real, comp = componentes(raw).length > 0;
            if (i.tipo === 'MO') { t.mo += q * k.base; t.moReal += imp; }
            else t[i.tipo.toLowerCase()] += imp;
            renglones[n] = { tipo: i.tipo, cantidad: q, base: k.base, costo: k.real, importe: imp, compuesto: comp };
            if (i.tipo === 'MO') renglones[n].fsr = comp ? (k.base > 0 ? k.real / k.base : 1) : fsrInsumo(i, fsr);
        });
        pctMo.forEach(function (n) {
            var i = insumo(lista[n]), q = cantidad(i, cantC), imp = t.moReal * q / 100;
            t[i.tipo === 'MO' ? 'moReal' : i.tipo.toLowerCase()] += imp;
            renglones[n] = { tipo: i.tipo, cantidad: q, base: 0, costo: 0, importe: imp, compuesto: false };
        });
        t.hm = t.moReal * num(a && a.hm) / 100;
        t.cd = t.mat + t.moReal + t.eq + t.maq + t.her + t.otro + t.hm;
        return { insumos: renglones, totales: t };
    }

    function explosion(a, desglosar) {
        if (desglosar === undefined) desglosar = true;
        var fsr = fsrAnalisis(a), grupos = {}, lista = [], tot = { hm: 0 };
        TIPOS.forEach(function (t) { tot[t] = 0; });
        function sumar(i, unidad, cant, imp) {
            var x = insumo(i), desc = String(i.descripcion || '').trim();
            var k = x.tipo + '|' + desc.toUpperCase() + '|' + unidad.toUpperCase();
            if (!grupos[k]) { grupos[k] = { tipo: x.tipo, codigo: '', descripcion: desc, unidad: unidad, cantidad: 0, importe: 0 }; lista.push(grupos[k]); }
            if (!grupos[k].codigo) grupos[k].codigo = String(i.codigo || '').trim();
            grupos[k].cantidad += cant;
            grupos[k].importe += imp;
            tot[x.tipo] += imp;
        }
        function hojas(i, cant, nivel) {
            if (cant <= 0) return;
            if (desglosar && nivel < NIVELES && componentes(i).length) {
                componentes(i).forEach(function (c) { hojas(c, cant * cantidad(enCompuesto(c)), nivel + 1); });
                return;
            }
            sumar(i, String(i.unidad || '').trim(), cant, cant * costoReal(i, fsr));
        }
        ((a && a.conceptos) || []).forEach(function (c) {
            var cc = num(c.cantidad);
            if (cc <= 0) return;
            var d = concepto(c, a);
            (c.insumos || []).forEach(function (i, n) {
                if (i.base === 'pct_mo') { if (d.insumos[n].importe > 0) sumar(i, '%', 0, cc * d.insumos[n].importe); return; }
                hojas(i, cc * d.insumos[n].cantidad, 0);
            });
            tot.hm += cc * d.totales.hm;
        });
        lista.sort(function (x, y) {
            var tx = TIPOS.indexOf(x.tipo), ty = TIPOS.indexOf(y.tipo);
            return tx !== ty ? tx - ty : x.descripcion < y.descripcion ? -1 : x.descripcion > y.descripcion ? 1 : 0;
        });
        tot.total = Object.keys(tot).reduce(function (s, k) { return s + tot[k]; }, 0);
        return { insumos: lista, totales: tot };
    }

    function resumen(t) {
        return { materiales: t.mat, mano_obra: t.moReal, maquinaria_equipo: t.eq + t.maq, gastos_operacion: t.her + t.hm,
                 otros: t.otro, costo_directo: t.cd };
    }

    function sobrecosto(cd, ind, finPct, utilDocPct, modo, ca) {
        ca = Math.min(Math.max(ca, 0), 0.99);
        var fin = (cd + ind) * finPct / 100, m = utilDocPct / 100, utilPct;
        if (modo === 'costo') utilPct = 1 - ca * (1 + m) > 0 ? ((1 + m) * (1 - ca) / (1 - ca * (1 + m)) - 1) * 100 : 0;
        else utilPct = 1 - m - ca > 0 ? m / (1 - m - ca) * 100 : 0;
        var util = (cd + ind + fin) * utilPct / 100, pv = (cd + ind + fin + util) / (1 - ca);
        return { cd: cd, ind: ind, fin: fin, util_pct: utilPct, util: util, ca: ca, cargos: pv * ca, pv: pv, factor: cd > 0 ? pv / cd : 0 };
    }

    function precioConcepto(cdU, s) {
        var k = s.cd > 0 ? cdU / s.cd : 0;
        return { cd: cdU, ind: s.ind * k, fin: s.fin * k, util: s.util * k, cargos: s.cargos * k, pu: s.pv * k };
    }

    var GASTO_BASES = ['unidad', 'hora', 'jornada', 'pct_mo'];
    function gastoOperacion(g, manoObra) {
        var base = g && GASTO_BASES.indexOf(g.base) >= 0 ? g.base : '';
        if (!base) return null;
        if (base === 'pct_mo') return manoObra * Math.max(0, num(g.pct)) / 100;
        return Math.max(0, num(g.cantidad)) * Math.max(0, num(g.costo));
    }

    raiz.AcriCalculoPU = { gastoOperacion: gastoOperacion, TIPOS: TIPOS, insumo: insumo, cantidad: cantidad, fsrInsumo: fsrInsumo, costoReal: costoReal, concepto: concepto,
                           resumen: resumen, sobrecosto: sobrecosto, precioConcepto: precioConcepto,
                           costos: costos, componentes: componentes, desgloseCompuesto: desgloseCompuesto, explosion: explosion };
})(typeof window !== 'undefined' ? window : global);
