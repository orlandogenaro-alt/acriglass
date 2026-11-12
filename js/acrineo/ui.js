// ACRINEO · Utilidades de la interfaz: escape de HTML, formatos, fechas, avisos, confirmación y rutas 'a.b.c'.
(function (AN) {
    'use strict';

    var fmtDinero = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function dinero(n) { return '$ ' + fmtDinero.format(Number(n) || 0); }
    function pct(n) { return (Number(n) || 0).toFixed(4) + ' %'; }

    // yyyy-mm-dd de hoy en la hora local
    function hoy() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // Igual que acrineoFechaTerminacion() del servidor: el día de inicio cuenta como el primero
    function fechaTerminacion(inicio, dias) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inicio || '');
        dias = Number(dias);
        if (!m || !Number.isInteger(dias) || dias < 1) return '';
        var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        if (d.getUTCMonth() !== +m[2] - 1) return '';
        d.setUTCDate(d.getUTCDate() + dias - 1);
        return d.toISOString().slice(0, 10);
    }

    function fechaCorta(iso) {
        var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(iso || '');
        return m ? m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' ' + m[4] : '') : '';
    }

    function obtener(obj, ruta) {
        return ruta.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    }
    function poner(obj, ruta, valor) {
        var partes = ruta.split('.');
        var o = obj;
        for (var i = 0; i < partes.length - 1; i++) {
            if (o[partes[i]] == null || typeof o[partes[i]] !== 'object') o[partes[i]] = {};
            o = o[partes[i]];
        }
        o[partes[partes.length - 1]] = valor;
    }

    function retrasar(fn, ms) {
        var t;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    // Aviso flotante (tipo: ok | error | info)
    function aviso(texto, tipo, ms) {
        var caja = document.getElementById('anToasts');
        if (!caja) return;
        var t = document.createElement('div');
        t.className = 'an-toast ' + (tipo || 'info');
        t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
        t.textContent = texto;
        caja.appendChild(t);
        setTimeout(function () { t.remove(); }, ms || (tipo === 'error' ? 6000 : 3500));
    }

    // Confirmación propia (no window.confirm). Promise<boolean>
    function confirmar(op) {
        var dlg = document.getElementById('anConfirmar');
        document.getElementById('anConfirmarTitulo').textContent = op.titulo || 'Confirmar';
        document.getElementById('anConfirmarTexto').textContent = op.mensaje || '';
        var si = document.getElementById('anConfirmarSi');
        var no = document.getElementById('anConfirmarNo');
        si.textContent = op.aceptar || 'Aceptar';
        no.textContent = op.cancelar || 'Cancelar';
        si.classList.toggle('an-peligro', !!op.peligro);
        si.classList.toggle('an-primario', !op.peligro);
        return new Promise(function (resolver) {
            function fin(valor) {
                si.removeEventListener('click', alSi);
                no.removeEventListener('click', alNo);
                dlg.removeEventListener('cancel', alCancelar);
                dlg.close();
                resolver(valor);
            }
            function alSi() { fin(true); }
            function alNo() { fin(false); }
            function alCancelar(e) { e.preventDefault(); fin(false); }
            si.addEventListener('click', alSi);
            no.addEventListener('click', alNo);
            dlg.addEventListener('cancel', alCancelar);
            dlg.showModal();
            no.focus();
        });
    }

    // Cierra con los botones [data-cerrar] de un <dialog>
    function cerrables(dlg) {
        dlg.querySelectorAll('[data-cerrar]').forEach(function (b) {
            b.addEventListener('click', function () { dlg.close(); });
        });
    }

    AN.ui = {
        esc: esc, dinero: dinero, pct: pct, hoy: hoy, fechaTerminacion: fechaTerminacion, fechaCorta: fechaCorta,
        obtener: obtener, poner: poner, retrasar: retrasar, aviso: aviso, confirmar: confirmar, cerrables: cerrables
    };
})(window.AcriNeo = window.AcriNeo || {});
