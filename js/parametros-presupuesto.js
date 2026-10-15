// Administrador › Parámetros de presupuesto (api/parametros-presupuesto.php)
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var token = document.querySelector('meta[name="acri-token"]').content;

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function pedir(accion, cuerpo) {
        var op = { method: cuerpo ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (cuerpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo); }
        return fetch('api/parametros-presupuesto.php?accion=' + accion, op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) { if (!j.ok) throw new Error(j.error); return j; });
    }
    function aviso(texto, tipo) {
        var a = $('aviso');
        a.textContent = texto || '';
        a.className = 'aviso ' + (tipo || '');
        a.hidden = !texto;
        if (texto) a.scrollIntoView({ behavior: 'smooth' });
    }

    function filaIva(t, defecto) {
        return '<tr><td><input type="radio" name="ivaDefecto"' + (t && Number(t.pct) === Number(defecto) ? ' checked' : '') + '></td>' +
            '<td><input type="text" data-k="nombre" maxlength="40" value="' + esc(t ? t.nombre : '') + '"></td>' +
            '<td class="num"><input type="number" step="any" min="0" max="99.99" data-k="pct" value="' + esc(t ? t.pct : '') + '"></td>' +
            '<td><button class="btn chico peligro" data-quitar title="Quitar">✕</button></td></tr>';
    }
    function verModo() {
        var m = $('indirectosModo').value;
        document.querySelectorAll('[data-modo]').forEach(function (el) { el.hidden = el.dataset.modo !== m; });
    }

    function pintar(j) {
        var p = j.parametros;
        $('utilidadModo').value = p.utilidad_modo;
        $('utilidadPct').value = p.utilidad_pct == null ? '' : p.utilidad_pct;
        $('utilidadNota').textContent = 'Si lo dejas vacío, se usa el parámetro de costos 101' + (j.utilidad_101 != null ? ' (hoy ' + j.utilidad_101 + ' %).' : '.');
        $('indirectosModo').value = p.indirectos_modo;
        $('indirectoPct').value = p.indirecto_pct;
        $('indirectoOficinaPct').value = p.indirecto_oficina_pct;
        $('indirectoCampoPct').value = p.indirecto_campo_pct;
        $('financiamientoPct').value = p.financiamiento_pct;
        document.querySelector('#ivaTabla tbody').innerHTML = p.iva_tasas.map(function (t) { return filaIva(t, p.iva_defecto); }).join('');
        verModo();
    }

    function leer() {
        var tasas = [], defecto = null;
        document.querySelectorAll('#ivaTabla tbody tr').forEach(function (tr) {
            var t = { nombre: tr.querySelector('[data-k="nombre"]').value.trim(), pct: tr.querySelector('[data-k="pct"]').value };
            if (!t.nombre && t.pct === '') return;
            tasas.push(t);
            if (tr.querySelector('[type="radio"]').checked) defecto = t.pct;
        });
        return {
            utilidad_modo: $('utilidadModo').value, utilidad_pct: $('utilidadPct').value,
            indirectos_modo: $('indirectosModo').value, indirecto_pct: $('indirectoPct').value,
            indirecto_oficina_pct: $('indirectoOficinaPct').value, indirecto_campo_pct: $('indirectoCampoPct').value,
            financiamiento_pct: $('financiamientoPct').value, iva_tasas: tasas, iva_defecto: defecto
        };
    }

    $('indirectosModo').addEventListener('change', verModo);
    $('ivaAgregar').addEventListener('click', function () {
        document.querySelector('#ivaTabla tbody').insertAdjacentHTML('beforeend', filaIva(null));
    });
    $('ivaTabla').addEventListener('click', function (e) { if (e.target.closest('[data-quitar]')) e.target.closest('tr').remove(); });
    $('guardar').addEventListener('click', function () {
        $('guardar').disabled = true;
        pedir('guardar', leer()).then(function (j) {
            pintar({ parametros: j.parametros, utilidad_101: null });
            aviso('Parámetros guardados. Aplican a los presupuestos nuevos.', 'ok');
        }).catch(function (err) { aviso(err.message, 'error'); }).then(function () { $('guardar').disabled = false; });
    });

    pedir('datos').then(pintar).catch(function (err) { aviso(err.message, 'error'); });
})();
