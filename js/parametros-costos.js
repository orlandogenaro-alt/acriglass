// Catalogos › Parámetros de costos: tipo de cambio y FASAR (api/costos.php)
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;
    var datos = null, editando = null;   // editando: FASAR abierto ({} = nuevo)

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    function fmt(n, d) { return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    function dmy(s) { var p = String(s || '').slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
    function hoy() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

    function pedir(accion, cuerpo) {
        var op = { method: cuerpo ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (cuerpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo); }
        return fetch('api/costos.php?accion=' + accion, op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) { if (!j.ok) throw new Error(j.error); return j; });
    }
    function aviso(texto, tipo) {
        var a = $('aviso');
        a.textContent = texto || '';
        a.className = 'aviso ' + (tipo || '');
        a.hidden = !texto;
        if (texto && tipo === 'ok') setTimeout(function () { if (a.textContent === texto) a.hidden = true; }, 4000);
    }

    function cargar() {
        return pedir('datos').then(function (j) {
            datos = j;
            pintarTc();
            pintarFasar();
        }).catch(function (err) {
            aviso(err.message, 'error');
            $('bloqueTc').hidden = $('bloqueFasar').hidden = true;
        });
    }

    // ---------- Tipo de cambio ----------
    function pintarTc() {
        $('tcVigente').textContent = datos.tc_vigente ? '$ ' + fmt(datos.tc_vigente, 4) : 'Sin capturar';
        $('tcFecha').value = hoy();
        $('tcFecha').max = hoy();
        ['tcFecha', 'tcValor', 'tcGuardar'].forEach(function (id) { $(id).disabled = !datos.puede_tc; });
        $('tcBanxico').disabled = !datos.puede_tc || !datos.banxico;
        $('tcBanxicoNota').hidden = datos.banxico;
        $('tcHistorial').innerHTML = datos.tc_historial.length ? datos.tc_historial.map(function (t) {
            return '<tr><td>' + esc(dmy(t.fecha)) + '</td><td class="num">' + esc(fmt(t.tipo_cambio, 4)) + '</td><td>' + esc(t.fuente === 'banxico' ? 'Banxico' : 'Captura') +
                '</td><td>' + esc(t.usuario || '') + '</td></tr>';
        }).join('') : '<tr><td colspan="4" class="vacio">Sin tipos de cambio capturados.</td></tr>';
    }
    $('tcGuardar').addEventListener('click', function () {
        if (!(num($('tcValor').value) > 0)) { aviso('Captura los pesos por dólar.', 'error'); return; }
        pedir('tc_guardar', { fecha: $('tcFecha').value, tipo_cambio: $('tcValor').value }).then(function () {
            $('tcValor').value = '';
            aviso('Tipo de cambio guardado.', 'ok');
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); });
    });
    $('tcBanxico').addEventListener('click', function () {
        $('tcBanxico').disabled = true;
        pedir('tc_banxico', {}).then(function (j) {
            aviso((j.repetido ? 'Ya estaba registrado: ' : 'Tipo de cambio de Banxico guardado: ') + fmt(j.tipo_cambio, 4) + ' del ' + dmy(j.fecha) + '.', 'ok');
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); $('tcBanxico').disabled = false; });
    });

    // ---------- FASAR ----------
    function pintarFasar() {
        $('fsNuevo').disabled = !datos.puede_fasar;
        $('fsLista').innerHTML = datos.fasar.length ? datos.fasar.map(function (f, i) {
            return '<tr data-i="' + i + '"><td>' + esc(f.nombre) + '</td><td class="num">' + esc(fmt(f.tp, 2)) + '</td><td class="num">' + esc(fmt(f.tl, 2)) +
                '</td><td class="num">' + esc(fmt(f.ps, 4)) + '</td><td class="num"><b>' + esc(fmt(f.fsr, 4)) + '</b></td><td class="num">' + esc(f.insumos) +
                '</td><td>' + (String(f.estatus).trim() === 'B' ? 'Baja' : 'Activo') + '</td></tr>';
        }).join('') : '<tr><td colspan="7" class="vacio">Sin FASAR. Con «Nuevo FASAR» se captura el de cada grupo de trabajadores.</td></tr>';
    }

    function filaLista(campo, r) {
        return '<tr><td><input type="text" data-k="concepto" maxlength="100" value="' + esc(r ? r.concepto : '') + '"></td>' +
            '<td class="num"><input type="number" step="any" min="0" data-k="' + campo + '" value="' + esc(r ? r[campo] : '') + '"></td>' +
            '<td><button class="btn chico peligro" data-quitar title="Quitar">✕</button></td></tr>';
    }
    function leerLista(nombre) {
        var t = document.querySelector('[data-lista="' + nombre + '"]'), campo = t.dataset.campo;
        return Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (tr) {
            var r = { concepto: tr.querySelector('[data-k="concepto"]').value.trim() };
            r[campo] = tr.querySelector('[data-k="' + campo + '"]').value;
            return r;
        }).filter(function (r) { return r.concepto || r[campo] !== ''; });
    }
    function suma(lista, campo) { return lista.reduce(function (s, r) { return s + num(r[campo]); }, 0); }

    // Vista previa con la misma fórmula del servidor (includes/pu.php puFsr); al guardar manda el servidor
    function calcular() {
        var dias = num($('fsDias').value);
        var tp = dias + suma(leerLista('dias_pagados'), 'dias');
        var tl = dias - suma(leerLista('dias_no_laborados'), 'dias');
        var ps = suma(leerLista('obligaciones'), 'pct') / 100;
        $('fsResultado').innerHTML = dias > 0 && tl > 0
            ? 'Tp = <b>' + fmt(tp, 2) + '</b> · Tl = <b>' + fmt(tl, 2) + '</b> · Ps = <b>' + fmt(ps, 4) + '</b> · ' +
              '<span class="fsr">FSR = ' + fmt(ps * (tp / tl) + tp / tl, 4) + '</span>'
            : '<span class="error">Los días laborados deben ser mayores que cero.</span>';
    }

    function abrir(f) {
        editando = f || {};
        $('fsEditor').hidden = false;
        $('fsNombre').value = editando.nombre || '';
        $('fsDias').value = editando.dias_calendario != null ? num(editando.dias_calendario) : 365;
        $('fsActivo').checked = !editando.estatus || String(editando.estatus).trim() !== 'B';
        $('fsNotas').value = editando.notas || '';
        document.querySelectorAll('[data-lista]').forEach(function (t) {
            var filas = editando[t.dataset.lista] || [];
            t.querySelector('tbody').innerHTML = (filas.length ? filas : [null]).map(function (r) { return filaLista(t.dataset.campo, r); }).join('');
        });
        var puede = datos.puede_fasar;
        $('fsEditor').querySelectorAll('input, textarea, [data-agregar], [data-quitar]').forEach(function (el) { el.disabled = !puede; });
        $('fsGuardar').disabled = !puede;
        $('fsEliminar').hidden = !editando.fasar_id;
        $('fsEliminar').disabled = !puede;
        calcular();
        $('fsEditor').scrollIntoView({ behavior: 'smooth' });
        $('fsNombre').focus();
    }

    $('fsNuevo').addEventListener('click', function () { abrir(null); });
    $('fsLista').addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (tr) abrir(datos.fasar[+tr.dataset.i]);
    });
    $('fsEditor').addEventListener('input', calcular);
    $('fsEditor').addEventListener('click', function (e) {
        var ag = e.target.closest('[data-agregar]');
        if (ag && !ag.disabled) {
            var t = document.querySelector('[data-lista="' + ag.dataset.agregar + '"]');
            t.querySelector('tbody').insertAdjacentHTML('beforeend', filaLista(t.dataset.campo, null));
            t.querySelector('tbody tr:last-child input').focus();
            return;
        }
        var q = e.target.closest('[data-quitar]');
        if (q && !q.disabled) { q.closest('tr').remove(); calcular(); }
    });
    $('fsCerrar').addEventListener('click', function () { $('fsEditor').hidden = true; editando = null; });
    $('fsGuardar').addEventListener('click', function () {
        var d = {
            id: editando.fasar_id || 0, nombre: $('fsNombre').value, dias_calendario: $('fsDias').value, activo: $('fsActivo').checked, notas: $('fsNotas').value,
            dias_pagados: leerLista('dias_pagados'), dias_no_laborados: leerLista('dias_no_laborados'), obligaciones: leerLista('obligaciones')
        };
        $('fsGuardar').disabled = true;
        pedir('fasar_guardar', d).then(function (j) {
            aviso('FASAR guardado: FSR ' + fmt(j.fsr, 4) + (j.insumos_actualizados ? ' · ' + j.insumos_actualizados + ' mano(s) de obra actualizada(s).' : '.'), 'ok');
            $('fsEditor').hidden = true;
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); }).then(function () { $('fsGuardar').disabled = !datos.puede_fasar; });
    });
    $('fsEliminar').addEventListener('click', function () {
        if (!editando.fasar_id || !confirm('¿Eliminar el FASAR «' + editando.nombre + '»?')) return;
        pedir('fasar_eliminar', { id: editando.fasar_id }).then(function () {
            aviso('FASAR eliminado.', 'ok');
            $('fsEditor').hidden = true;
            return cargar();
        }).catch(function (err) { aviso(err.message, 'error'); });
    });

    cargar();
})();
