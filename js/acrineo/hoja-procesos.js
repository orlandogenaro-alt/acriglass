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
    var dlgF = $('anFasarDlg');
    var estadoF = dlgF ? estadoEn('anFasarEstado') : null;
    var fasar = { sistema: [] };

    function filaFasar(campo, r) {
        return '<tr><td><input data-c="concepto" maxlength="100" value="' + esc(r.concepto || '') + '" aria-label="Concepto"></td>'
            + '<td class="num"><input data-c="' + campo + '" inputmode="decimal" value="' + esc(r[campo] === undefined || r[campo] === null ? '' : r[campo]) + '" aria-label="' + (campo === 'pct' ? '%' : 'Días') + '"></td>'
            + '<td><button type="button" class="an-btn an-mini an-texto" data-quitar title="Quitar" aria-label="Quitar">×</button></td></tr>';
    }
    function pintarListas(d) {
        $('anFasarDias').value = d.dias_calendario;
        dlgF.querySelectorAll('.an-fasar-tabla').forEach(function (t) {
            t.innerHTML = (d[t.dataset.lista] || []).map(function (r) { return filaFasar(t.dataset.campo, r); }).join('');
        });
        calcular();
    }
    function leer() {
        var d = { dias_calendario: $('anFasarDias').value.trim() };
        dlgF.querySelectorAll('.an-fasar-tabla').forEach(function (t) {
            d[t.dataset.lista] = Array.prototype.map.call(t.querySelectorAll('tr'), function (tr) {
                var o = { concepto: tr.querySelector('[data-c="concepto"]').value.trim() };
                o[t.dataset.campo] = tr.querySelector('[data-c="' + t.dataset.campo + '"]').value.trim().replace(/,/g, '');
                return o;
            }).filter(function (o) { return o.concepto || o[t.dataset.campo]; });
        });
        return d;
    }
    // La misma cuenta que puFsr en el servidor
    function calcular() {
        var d = leer(), suma = function (l, k) { return l.reduce(function (s, r) { return s + (Number(r[k]) || 0); }, 0); };
        var dc = Number(d.dias_calendario) || 0, tp = dc + suma(d.dias_pagados, 'dias'), tl = dc - suma(d.dias_no_laborados, 'dias'), ps = suma(d.obligaciones, 'pct') / 100;
        if (dc <= 0 || tl <= 0) { $('anFasarResultado').textContent = '—'; $('anFasarDetalle').textContent = 'Revisa los días.'; return; }
        var fsr = ps * (tp / tl) + tp / tl;
        $('anFasarResultado').textContent = fsr.toFixed(4);
        $('anFasarDetalle').textContent = 'Tp ' + tp.toFixed(2) + ' · Tl ' + tl.toFixed(2) + ' · Ps ' + (ps * 100).toFixed(4) + ' %';
    }

    async function abrirFasar() {
        if (!dlgF || sinPermiso('calcular el FASAR') || pendientes()) return;
        estadoF('Cargando…', 'info');
        dlgF.showModal();
        try {
            var r = await AN.api.get(H.url({ recurso: 'fasar' }));
            fasar = r;
            $('anFasarSistema').innerHTML = '<option value="">— FASAR del sistema —</option>' + r.sistema.map(function (s, i) {
                return '<option value="' + i + '">' + esc(s.nombre) + ' (' + Number(s.fsr).toFixed(4) + ')</option>';
            }).join('');
            $('anFasarSistema').disabled = !r.sistema.length;
            pintarListas(r.datos);
            var con = r.mano_obra.filter(function (m) { return Number(m.salario_base) > 0; }).length;
            $('anFasarMo').textContent = r.mano_obra.length ? r.mano_obra.length + ' categoría(s) de mano de obra en las matrices; ' + con + ' con salario base capturado (Opciones › Mano de obra).'
                : 'No hay mano de obra en las matrices del presupuesto.';
            estadoF(r.disponible ? (r.fsr ? 'FASAR actual del presupuesto: ' + Number(r.fsr).toFixed(4) : 'El presupuesto aún no tiene FASAR: estos son valores de ejemplo, revísalos.') : 'Falta aplicar la migración 037 para guardar el FASAR.', r.disponible ? (r.fsr ? '' : 'info') : 'error');
            $('anFasarAceptar').disabled = !r.disponible;
            $('anFasarDias').focus();
        } catch (e) { estadoF(e.message, 'error'); }
    }

    async function aceptarFasar(e) {
        e.preventDefault();
        var cuerpo = Object.assign({ accion: 'fasar_guardar', aplicar: $('anFasarAplicar').checked, base_desde_costo: $('anFasarDesdeCosto').checked, partida_id: H.sel || 0 }, leer());
        $('anFasarAceptar').disabled = true;
        estadoF('Guardando…', 'info');
        try {
            var r = await AN.api.post(H.url(), cuerpo);
            H.aplicar(r);
            dlgF.close();
            var x = r.fasar;
            AN.ui.aviso('FASAR del presupuesto: ' + Number(x.fsr).toFixed(4) + (cuerpo.aplicar ? '. Aplicado a ' + x.aplicados + ' categoría(s) de mano de obra; ' + x.recalculados + ' concepto(s) cambiaron de costo.' : '.'), 'ok');
        } catch (err) { estadoF(err.message, 'error'); }
        finally { $('anFasarAceptar').disabled = false; }
    }

    if (dlgF) {
        $('anFasarForm').addEventListener('submit', aceptarFasar);
        $('anFasarForm').addEventListener('input', function (e) { if (e.target.id !== 'anFasarSistema') calcular(); });
        $('anFasarSistema').addEventListener('change', function () {
            var s = fasar.sistema[+this.value];
            if (s) pintarListas(s);
        });
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
