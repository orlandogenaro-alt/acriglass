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

    function costoReal(i, fsr) {
        i = insumo(i);
        if (i.tipo !== 'MO') return i.costo;
        var f = i.fsr > 0 ? i.fsr : (fsr > 0 ? fsr : 1);
        return i.costo * f + i.viaticos + i.alimentacion + i.hospedaje;
    }

    function concepto(c, a) {
        var fsr = fsrAnalisis(a), cantC = num(c.cantidad);
        var t = { mat: 0, mo: 0, moReal: 0, eq: 0, maq: 0, her: 0, otro: 0, hm: 0, cd: 0 };
        var lista = c.insumos || [], renglones = [], pctMo = [];
        lista.forEach(function (raw, n) {
            var i = insumo(raw);
            if (i.base === 'pct_mo') { pctMo.push(n); renglones[n] = null; return; }
            var q = cantidad(i, cantC), costo = costoReal(i, fsr), imp = q * costo;
            if (i.tipo === 'MO') { t.mo += q * i.costo; t.moReal += imp; }
            else t[i.tipo.toLowerCase()] += imp;
            renglones[n] = { tipo: i.tipo, cantidad: q, costo: costo, importe: imp };
        });
        pctMo.forEach(function (n) {
            var i = insumo(lista[n]), q = cantidad(i, cantC), imp = t.moReal * q / 100;
            t[i.tipo === 'MO' ? 'moReal' : i.tipo.toLowerCase()] += imp;
            renglones[n] = { tipo: i.tipo, cantidad: q, costo: 0, importe: imp };
        });
        t.hm = t.moReal * num(a && a.hm) / 100;
        t.cd = t.mat + t.moReal + t.eq + t.maq + t.her + t.otro + t.hm;
        return { insumos: renglones, totales: t };
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

    raiz.AcriCalculoPU = { TIPOS: TIPOS, insumo: insumo, cantidad: cantidad, costoReal: costoReal, concepto: concepto,
                           resumen: resumen, sobrecosto: sobrecosto, precioConcepto: precioConcepto };
})(typeof window !== 'undefined' ? window : global);
