// ACRINEO · Llamadas a la API interna (fetch con la sesión y el token CSRF de la página en X-Acri-Token).
// Las respuestas son { ok, … }; un error lanza AcriNeo.api.ApiError con el mensaje y los errores por campo.
(function (AN) {
    'use strict';

    var meta = document.querySelector('meta[name="acri-token"]');
    var TOKEN = meta ? meta.content : '';

    function ApiError(mensaje, estado, errores) {
        var e = new Error(mensaje);
        e.name = 'ApiError';
        e.estado = estado || 0;
        e.errores = errores || {};
        return e;
    }

    async function pedir(metodo, url, cuerpo, opciones) {
        opciones = opciones || {};
        var encabezados = { 'X-Acri-Token': TOKEN, 'Accept': 'application/json' };
        var body;
        if (cuerpo instanceof FormData) {
            body = cuerpo;
        } else if (cuerpo !== undefined) {
            encabezados['Content-Type'] = 'application/json';
            body = JSON.stringify(cuerpo);
        }
        var resp;
        try {
            resp = await fetch(url, { method: metodo, headers: encabezados, body: body, credentials: 'same-origin', signal: opciones.signal });
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            throw ApiError('No hay conexión con el servidor. Revisa tu red e intenta de nuevo.', 0);
        }
        var datos = null;
        try { datos = await resp.json(); } catch (e) { /* respuesta que no es JSON */ }
        if (!resp.ok || !datos || datos.ok === false) {
            if (resp.status === 401) {
                // Sesión vencida: la ventana principal manda al login
                setTimeout(function () { (window.top || window).location.href = 'index.php'; }, 1500);
            }
            throw ApiError((datos && datos.error) || 'Error del servidor (' + resp.status + ').', resp.status, datos && datos.errores);
        }
        return datos;
    }

    // url('api/…', { a: 1, b: '' }) → 'api/…?a=1' (sin los vacíos)
    function url(base, parametros) {
        var q = new URLSearchParams();
        Object.keys(parametros || {}).forEach(function (k) {
            var v = parametros[k];
            if (v !== '' && v !== null && v !== undefined) q.set(k, v);
        });
        var s = q.toString();
        return base + (s ? (base.indexOf('?') >= 0 ? '&' : '?') + s : '');
    }

    // Descarga un archivo de la API como Blob (para la vista previa)
    async function blob(direccion) {
        var resp = await fetch(direccion, { credentials: 'same-origin', headers: { 'X-Acri-Token': TOKEN } });
        if (!resp.ok) {
            var datos = null;
            try { datos = await resp.json(); } catch (e) {}
            throw ApiError((datos && datos.error) || 'No se pudo leer el archivo (' + resp.status + ').', resp.status);
        }
        return resp.blob();
    }

    AN.api = {
        ApiError: ApiError,
        PRESUPUESTOS: 'api/acrineo/presupuestos.php',
        CATALOGOS: 'api/acrineo/catalogos.php',
        url: url,
        blob: blob,
        get: function (u, op) { return pedir('GET', u, undefined, op); },
        post: function (u, cuerpo) { return pedir('POST', u, cuerpo); },
        put: function (u, cuerpo) { return pedir('PUT', u, cuerpo); },
        del: function (u) { return pedir('DELETE', u); }
    };
})(window.AcriNeo = window.AcriNeo || {});
