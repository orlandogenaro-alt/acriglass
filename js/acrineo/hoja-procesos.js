// ACRINEO · Procesos y factores de las Opciones del presupuesto: Actualizar costos y matrices (Ctrl+Shift+U),
// Recibir archivo de intercambio, Depurar presupuesto, Renumerar control y FASAR (Ctrl+Shift+F).
// Servidor: includes/acrineo/opciones.php.
(function (AN) {
    'use strict';

    var H = AN.hoja;
    if (!H) return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = AN.ui.esc;
    var cfg = window.ACRINEO || {};

    function sinPermiso(que) {
        if (H.puede) return false;
        AN.ui.aviso('No tienes permiso para ' + que + ' (ACRINEO_PRESUPUESTOS_EDITAR).', 'error');
        return true;
    }
    function pendientes() {
        if (!H.renglonesPendientes() && !(AN.hojaMatriz && AN.hojaMatriz.abierta())) return false;
        AN.ui.aviso('Guarda o cancela primero los cambios de los conceptos o de la matriz.', 'error');
        return true;
    }
    function estadoEn(id) { return function (t, tipo) { var e = $(id); e.textContent = t || ''; e.className = 'an-estado' + (tipo ? ' ' + tipo : ''); }; }

    // ---------- Actualizar costos y matrices ----------
    var dlgAct = $('anActualizarDlg');
    var estadoAct = dlgAct ? estadoEn('anActualizarEstado') : null;

    async function actualizar() {
        if (!dlgAct || sinPermiso('actualizar costos y matrices') || pendientes()) return;
        dlgAct.querySelectorAll('[data-act]').forEach(function (s) { s.textContent = ''; });
        estadoAct('Cargando…', 'info');
        dlgAct.showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'actualizar' }));
            var n = function (x, s, p) { return '(' + x + ' ' + (x === 1 ? s : p) + ')'; };
            dlgAct.querySelector('[data-act="en_maestro"]').textContent = n(r.en_maestro, 'concepto está', 'conceptos están') + ' en el maestro';
            dlgAct.querySelector('[data-act="sin_analisis"]').textContent = n(r.sin_analisis, 'concepto', 'conceptos');
            dlgAct.querySelector('[data-act="pendientes"]').textContent = n(r.pendientes, 'concepto', 'conceptos');
            dlgAct.querySelector('[data-act="insumos_catalogo"]').textContent = '· ' + r.insumos_catalogo + ' insumo(s) del catálogo en las matrices';
            estadoAct(r.maestro ? '' : 'El catálogo de insumos o los Conceptos P.U. del sistema no están instalados.', r.maestro ? '' : 'error');
            $('anActualizarAceptar').disabled = !r.maestro;
        } catch (e) { estadoAct(e.message, 'error'); }
    }

    async function aceptarActualizar(e) {
        e.preventDefault();
        var f = $('anActualizarForm');
        var cuerpo = { accion: 'actualizar', importar: f.importar.value, costos: f.costos.value, partida_id: H.sel || 0 };
        if (cuerpo.importar === 'no' && cuerpo.costos === 'no') { estadoAct('Elige qué quieres actualizar.', 'error'); return; }
        if (cuerpo.importar !== 'no' && !(await AN.ui.confirmar({ titulo: 'Importar matrices', mensaje: 'Las matrices de los conceptos que están en el maestro se reemplazan por las del maestro (se pierde lo que se haya capturado en ellas).\n¿Continuar?', aceptar: 'Importar', peligro: true }))) return;
        $('anActualizarAceptar').disabled = true;
        estadoAct('Actualizando y recalculando…', 'info');
        try {
            var r = await AN.api.post(H.url(), cuerpo);
            H.aplicar(r);
            dlgAct.close();
            var a = r.actualizado, partes = [];
            if (cuerpo.importar !== 'no') partes.push(a.importadas + ' matriz(ces) importada(s)');
            if (cuerpo.costos !== 'no') partes.push(a.actualizados + ' costo(s) de insumo actualizado(s)');
            partes.push(a.recalculados + ' concepto(s) cambiaron de costo');
            AN.ui.aviso(partes.join(' · ') + '.' + (a.avisos.length ? '\nAvisos: ' + a.avisos.slice(0, 8).join('; ') + (a.avisos.length > 8 ? '…' : '') : ''), a.avisos.length ? 'info' : 'ok', a.avisos.length ? 12000 : undefined);
        } catch (err) { estadoAct(err.message, 'error'); }
        finally { $('anActualizarAceptar').disabled = false; }
    }
    if (dlgAct) {
        $('anActualizarForm').addEventListener('submit', aceptarActualizar);
        dlgAct.querySelectorAll('[data-act-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlgAct.close(); }); });
    }

    // ---------- Recibir archivo de intercambio ----------
    // Como en Neodata, crea un presupuesto NUEVO a partir del archivo: abre el importador del catálogo de presupuestos.
    async function recibir() {
        if (!(cfg.permisos && cfg.permisos['presupuestos.crear'])) { AN.ui.aviso('No tienes permiso para crear presupuestos (ACRINEO_PRESUPUESTOS_CREAR).', 'error'); return; }
        if (pendientes()) return;
        if (!(await AN.ui.confirmar({ titulo: 'Recibir archivo de intercambio', mensaje: 'El archivo de intercambio (respaldo .zip de Neodata) crea un presupuesto nuevo.\nSe abrirá el catálogo de presupuestos con la ventana para elegir el archivo.', aceptar: 'Continuar' }))) return;
        location.href = 'acrineo-presupuestos.php?importar=neodata';
    }

    // ---------- Depurar presupuesto ----------
    // Regresa true si se depuró
    async function depurar() {
        if (sinPermiso('depurar el presupuesto') || pendientes()) return false;
        try {
            var v = await AN.api.get(H.url({ recurso: 'depurar' }));
            if (!v.conceptos.length && !v.renglones.length) { AN.ui.aviso('El presupuesto ya está depurado: todos los conceptos y los insumos de sus matrices participan.', 'ok'); return false; }
            var lista = function (l, f) { return l.slice(0, 12).map(f).join('\n') + (l.length > 12 ? '\n… y ' + (l.length - 12) + ' más' : ''); };
            var msg = 'Se eliminarán del presupuesto:\n';
            if (v.conceptos.length) msg += '\n' + v.conceptos.length + ' concepto(s) que ninguna partida usa (con su matriz):\n' + lista(v.conceptos, function (c) { return '  · ' + c.codigo + ' ' + c.descripcion.slice(0, 60); });
            if (v.renglones.length) msg += '\n\n' + v.renglones.length + ' insumo(s) de matriz con cantidad cero:\n' + lista(v.renglones, function (r) { return '  · ' + r.concepto + ' → ' + (r.codigo || r.descripcion.slice(0, 50)); });
            msg += '\n\n¿Depurar el presupuesto?';
            if (!(await AN.ui.confirmar({ titulo: 'Depurar presupuesto', mensaje: msg, aceptar: 'Depurar', peligro: true }))) return false;
            var r = await AN.api.post(H.url(), { accion: 'depurar', partida_id: H.sel || 0 });
            H.aplicar(r);
            H.emitir('catalogo', null);
            AN.ui.aviso('Presupuesto depurado: ' + r.depurado.conceptos + ' concepto(s) y ' + r.depurado.renglones + ' insumo(s) de matriz eliminados.', 'ok');
            return true;
        } catch (e) { AN.ui.aviso(e.message, 'error'); return false; }
    }

    // ---------- Renumerar control ----------
    async function renumerar() {
        if (sinPermiso('renumerar el control') || pendientes()) return;
        if (!(await AN.ui.confirmar({ titulo: 'Renumerar control', mensaje: 'Se vuelve a numerar seguido el orden de las partidas, de los conceptos de cada partida y de los insumos de cada matriz, tal como se ven acomodados ahora.\n¿Continuar?', aceptar: 'Renumerar' }))) return;
        try {
            var r = await AN.api.post(H.url(), { accion: 'renumerar', partida_id: H.sel || 0 });
            H.aplicar(r);
            var n = r.renumerado;
            AN.ui.aviso(n.partidas + n.renglones + n.matriz ? 'Control renumerado: ' + n.partidas + ' partida(s), ' + n.renglones + ' concepto(s) y ' + n.matriz + ' insumo(s) de matriz cambiaron de número.' : 'El control ya estaba numerado en orden.', 'ok');
        } catch (e) { AN.ui.aviso(e.message, 'error'); }
    }

    // ---------- FASAR ----------
    // La misma cuenta que acrineoFasarCategoria (includes/acrineo/opciones.php): cuotas del IMSS, SAR, INFONAVIT, impuesto
    // sobre nómina y otros cargos; el FASAR es distinto para cada salario.
    var dlgF = $('anFasarDlg');
    var estadoF = dlgF ? estadoEn('anFasarEstado') : null;
    var fasar = { sistema: [], anios: {}, cuotas: {}, mano_obra: [] };
    var fmt4 = function (n) { return (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 5 }); };

    function filaFasar(campo, r) {
        return '<tr><td><input data-c="concepto" maxlength="100" value="' + esc(r.concepto || '') + '" aria-label="Concepto"></td>'
            + '<td class="num"><input data-c="' + campo + '" inputmode="decimal" value="' + esc(r[campo] === undefined || r[campo] === null ? '' : r[campo]) + '" aria-label="Días"></td>'
            + '<td><button type="button" class="an-btn an-mini an-texto" data-quitar title="Quitar" aria-label="Quitar">×</button></td></tr>';
    }
    function pintarDias(d) {
        if (d.dias_calendario !== undefined) $('anFasarDias').value = d.dias_calendario;
        dlgF.querySelectorAll('.an-fasar-tabla').forEach(function (t) {
            t.innerHTML = (d[t.dataset.lista] || []).map(function (r) { return filaFasar(t.dataset.campo, r); }).join('');
        });
    }
    function pintarParametros(p) {
        dlgF.querySelectorAll('[data-p]').forEach(function (i) { if (p[i.dataset.p] !== undefined) i.value = p[i.dataset.p]; });
        dlgF.querySelector('input[name="considerar"][value="' + (p.considerar === 'patron' ? 'patron' : 'ambos') + '"]').checked = true;
    }
    function parametros() {
        var p = {};
        dlgF.querySelectorAll('[data-p]').forEach(function (i) { p[i.dataset.p] = String(i.value).trim().replace(/,/g, ''); });
        p.considerar = dlgF.querySelector('input[name="considerar"]:checked').value;
        return p;
    }
    function leer() {
        var d = { dias_calendario: $('anFasarDias').value.trim(), parametros: parametros() };
        dlgF.querySelectorAll('.an-fasar-tabla').forEach(function (t) {
            d[t.dataset.lista] = Array.prototype.map.call(t.querySelectorAll('tr'), function (tr) {
                var o = { concepto: tr.querySelector('[data-c="concepto"]').value.trim() };
                o[t.dataset.campo] = tr.querySelector('[data-c="' + t.dataset.campo + '"]').value.trim().replace(/,/g, '');
                return o;
            }).filter(function (o) { return o.concepto || o[t.dataset.campo]; });
        });
        return d;
    }
    function porcentajes(p) {
        var r = {};
        Object.keys(fasar.cuotas).forEach(function (k) { r[k] = fasar.cuotas[k][0] + (p.considerar === 'ambos' ? fasar.cuotas[k][1] : 0); });
        r.riesgo = Number(p.riesgo) || 0;
        return r;
    }
    function categoria(p, dc, tp, tl, sb) {
        var pc = porcentajes(p), n = function (k) { return Number(p[k]) || 0; }, uma = n('uma');
        var sbc = Math.max(sb * tp / dc, n('salario_minimo')), s1 = Math.min(sbc, n('grupo1') * uma), s2 = Math.min(sbc, n('grupo2') * uma);
        var diario = pc.cuota_fija / 100 * uma + pc.excedente / 100 * Math.max(0, s1 - 3 * uma)
            + (pc.dinero + pc.especie + pc.riesgo + pc.guarderias) / 100 * s1 + (pc.invalidez + pc.cesantia + n('sar') + n('infonavit')) / 100 * s2;
        var ps = sb > 0 ? diario * dc / (sb * tp) + (n('impuesto_nomina') + n('otros_cargos')) / 100 : 0;
        var fsr = Math.round((ps * (tp / tl) + tp / tl) * 10000) / 10000;
        return { sbc: sbc, ps: ps, fsr: fsr, real: sb * fsr };
    }
    function dias(d) {
        var suma = function (l) { return l.reduce(function (s, r) { return s + (Number(r.dias) || 0); }, 0); };
        var dc = Number(d.dias_calendario) || 0;
        return { dc: dc, tp: dc + suma(d.dias_pagados), tl: dc - suma(d.dias_no_laborados) };
    }
    function calcular() {
        var d = leer(), p = d.parametros, t = dias(d), pc = porcentajes(p);
        dlgF.querySelectorAll('[data-pct]').forEach(function (i) { i.value = fmt4(pc[i.dataset.pct]); });
        var cuerpo = $('anFasarSalarios').tBodies[0];
        if (t.dc <= 0 || t.tl <= 0 || !(Number(p.uma) > 0)) {
            $('anFasarResultado').textContent = '—';
            $('anFasarDetalle').textContent = 'Revisa los días, la UMA y el salario mínimo.';
            cuerpo.innerHTML = '';
            return null;
        }
        var ref = categoria(p, t.dc, t.tp, t.tl, Number(p.salario_minimo) || 0);
        $('anFasarResultado').textContent = ref.fsr.toFixed(4);
        $('anFasarDetalle').textContent = 'Tp ' + t.tp.toFixed(2) + ' · Tl ' + t.tl.toFixed(2) + ' · Ps ' + (ref.ps * 100).toFixed(4) + ' % · Tp/Tl ' + (t.tp / t.tl).toFixed(4);
        var desdeCosto = $('anFasarDesdeCosto').checked;
        cuerpo.innerHTML = fasar.mano_obra.length ? fasar.mano_obra.map(function (m) {
            var sb = Number(m.salario_base) || (desdeCosto ? Number(m.costo) || 0 : 0);
            var c = sb > 0 ? categoria(p, t.dc, t.tp, t.tl, sb) : null;
            return '<tr' + (c ? '' : ' class="an-fasar-sin"') + '><td>' + esc(m.codigo || '') + '</td><td title="' + esc(m.descripcion) + '">' + esc(m.descripcion) + '</td>'
                + '<td class="num">' + (c ? AN.ui.dinero(sb) : 'sin salario base') + '</td><td class="num">' + (c ? AN.ui.dinero(c.sbc) : '') + '</td>'
                + '<td class="num">' + (c ? (c.ps * 100).toFixed(4) + ' %' : '') + '</td><td class="num"><b>' + (c ? c.fsr.toFixed(4) : '') + '</b></td>'
                + '<td class="num">' + (c ? AN.ui.dinero(c.real) : '') + '</td></tr>';
        }).join('') : '<tr class="an-vacio"><td colspan="7">No hay mano de obra en las matrices del presupuesto.</td></tr>';
        return { d: d, t: t, ref: ref };
    }

    async function abrirFasar() {
        if (!dlgF || sinPermiso('calcular el FASAR') || pendientes()) return;
        estadoF('Cargando…', 'info');
        dlgF.showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'fasar' }));
            fasar = r;
            var anios = Object.keys(r.anios).sort().reverse();
            var anio = String(r.datos.parametros.anio);
            if (anios.indexOf(anio) < 0) anios.unshift(anio);
            $('anFasarAnio').innerHTML = anios.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('');
            $('anFasarSistema').innerHTML = '<option value="">— FASAR del sistema —</option>' + r.sistema.map(function (s, i) {
                return '<option value="' + i + '">' + esc(s.nombre) + '</option>';
            }).join('');
            $('anFasarSistema').disabled = !r.sistema.length;
            pintarParametros(r.datos.parametros);
            pintarDias(r.datos);
            calcular();
            var con = r.mano_obra.filter(function (m) { return Number(m.salario_base) > 0; }).length;
            estadoF(!r.disponible ? 'Falta aplicar la migración 037 para guardar el FASAR.'
                : (r.guardado ? 'FASAR guardado del presupuesto (salario mínimo): ' + Number(r.fsr).toFixed(4) : 'El presupuesto aún no tiene FASAR: revisa los datos (sobre todo el riesgo de trabajo).')
                  + (r.mano_obra.length ? ' · ' + con + ' de ' + r.mano_obra.length + ' categoría(s) con salario base.' : ''),
                r.disponible ? (r.guardado ? '' : 'info') : 'error');
            $('anFasarAceptar').disabled = !r.disponible;
            $('anFasarAnio').focus();
        } catch (e) { estadoF(e.message, 'error'); }
    }

    async function aceptarFasar(e) {
        e.preventDefault();
        if (!calcular()) { estadoF('Revisa los días, la UMA y el salario mínimo.', 'error'); return; }
        var cuerpo = Object.assign({ accion: 'fasar_guardar', aplicar: $('anFasarAplicar').checked, base_desde_costo: $('anFasarDesdeCosto').checked, partida_id: H.sel || 0 }, leer());
        dlgF.querySelectorAll('.invalido').forEach(function (i) { i.classList.remove('invalido'); });
        $('anFasarAceptar').disabled = true;
        estadoF('Guardando…', 'info');
        try {
            var r = await AN.api.post(H.url(), cuerpo);
            H.aplicar(r);
            dlgF.close();
            var x = r.fasar;
            AN.ui.aviso('FASAR con el salario mínimo: ' + Number(x.fsr).toFixed(4) + (cuerpo.aplicar ? '. Se aplicó a ' + x.aplicados + ' categoría(s) de mano de obra (cada una con el suyo); ' + x.recalculados + ' concepto(s) cambiaron de costo.' : '.'), 'ok');
        } catch (err) {
            Object.keys(err.errores || {}).forEach(function (k) { var i = dlgF.querySelector('[data-p="' + k + '"]') || (k === 'dias_calendario' ? $('anFasarDias') : null); if (i) i.classList.add('invalido'); });
            estadoF(err.message, 'error');
        } finally { $('anFasarAceptar').disabled = false; }
    }

    // Libro del FASAR en Excel: datos generales, % de las cuotas, días y la tabla de salarios
    function libroFasar() {
        var c = calcular();
        if (!c) { estadoF('Revisa los días, la UMA y el salario mínimo.', 'error'); return; }
        var p = c.d.parametros, pc = porcentajes(p), t = c.t;
        var filas = [['FASAR · ' + H.ctx.codigo + ' · ' + H.ctx.nombre, ''], ['', ''],
            ['Año de los % de aplicación', p.anio], ['Salario mínimo', Number(p.salario_minimo)], ['UMA', Number(p.uma)],
            ['Impuesto sobre nómina %', Number(p.impuesto_nomina)], ['Otros cargos %', Number(p.otros_cargos)],
            ['Límite superior grupo 1 (UMA)', Number(p.grupo1)], ['Límite superior grupo 2 (UMA)', Number(p.grupo2)],
            ['Considerar', p.considerar === 'patron' ? 'Solo % patrón' : '% patrón + % trabajador'], ['SAR %', Number(p.sar)], ['INFONAVIT %', Number(p.infonavit)], ['', ''],
            ['Cuota fija %', pc.cuota_fija], ['Excedente de 3 UMA %', pc.excedente], ['Prestaciones en dinero %', pc.dinero], ['Prestaciones en especie %', pc.especie],
            ['Riesgo de trabajo %', pc.riesgo], ['Guarderías %', pc.guarderias], ['Invalidez y vida %', pc.invalidez], ['Cesantía en edad avanzada y vejez %', pc.cesantia], ['', ''],
            ['Días calendario', t.dc]];
        c.d.dias_pagados.forEach(function (r) { filas.push(['(+) ' + r.concepto, Number(r.dias) || 0]); });
        filas.push(['Tp (días pagados)', t.tp]);
        c.d.dias_no_laborados.forEach(function (r) { filas.push(['(−) ' + r.concepto, Number(r.dias) || 0]); });
        filas.push(['Tl (días laborados)', t.tl], ['FASAR con el salario mínimo', c.ref.fsr], ['', ''], ['Salarios', '']);
        var tabla = [['Código', 'Descripción', 'Salario base', 'SBC', 'Ps %', 'FASAR', 'Salario real']];
        fasar.mano_obra.forEach(function (m) {
            var sb = Number(m.salario_base) || ($('anFasarDesdeCosto').checked ? Number(m.costo) || 0 : 0);
            if (!(sb > 0)) { tabla.push([m.codigo || '', m.descripcion, 'sin salario base', '', '', '', '']); return; }
            var x = categoria(p, t.dc, t.tp, t.tl, sb);
            tabla.push([m.codigo || '', m.descripcion, sb, Math.round(x.sbc * 100) / 100, Math.round(x.ps * 1e6) / 1e4, x.fsr, Math.round(x.real * 100) / 100]);
        });
        filas = filas.map(function (f) { return f.concat(['', '', '', '', '']); }).concat(tabla);
        var blob = window.XlsxSimple.crear({ nombre: 'FASAR', anchos: [38, 50, 14, 14, 12, 10, 14], filas: filas });
        window.XlsxSimple.descargar(blob, 'FASAR ' + H.ctx.codigo + '.xlsx');
    }

    if (dlgF) {
        $('anFasarForm').addEventListener('submit', aceptarFasar);
        $('anFasarForm').addEventListener('input', function (e) { if (e.target.id !== 'anFasarSistema') calcular(); });
        $('anFasarForm').addEventListener('change', function (e) { if (e.target.name === 'considerar' || e.target.id === 'anFasarDesdeCosto') calcular(); });
        $('anFasarAnio').addEventListener('change', function () {
            var a = fasar.anios[this.value];
            if (a) { pintarParametros({ salario_minimo: a.salario_minimo, uma: a.uma, considerar: parametros().considerar }); calcular(); }
        });
        $('anFasarSistema').addEventListener('change', function () {
            var s = fasar.sistema[+this.value];
            if (s) { pintarDias(s); calcular(); }
        });
        $('anFasarExcel').addEventListener('click', libroFasar);
        dlgF.addEventListener('click', function (e) {
            var a = e.target.closest('[data-agregar]');
            if (a) {
                var t = dlgF.querySelector('.an-fasar-tabla[data-lista="' + a.dataset.agregar + '"]');
                t.insertAdjacentHTML('beforeend', filaFasar(t.dataset.campo, {}));
                t.querySelector('tr:last-child input').focus();
                return;
            }
            var q = e.target.closest('[data-quitar]');
            if (q) { q.closest('tr').remove(); calcular(); }
        });
        dlgF.querySelectorAll('[data-fasar-cerrar]').forEach(function (b) { b.addEventListener('click', function () { dlgF.close(); }); });
    }

    AN.hojaProcesos = { actualizar: actualizar, recibir: recibir, depurar: depurar, renumerar: renumerar, fasar: abrirFasar };
})(window.AcriNeo = window.AcriNeo || {});
