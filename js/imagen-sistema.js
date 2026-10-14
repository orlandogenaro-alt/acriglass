(function () {
    var API = 'api/imagenes.php';
    var enPestana = window.parent !== window;

    function enviar(datos) {
        var token = (document.querySelector('meta[name="acri-token"]') || {}).content || '';
        return fetch(API, { method: 'POST', body: datos, credentials: 'same-origin', headers: { 'X-Acri-Token': token } })
            .then(function (r) {
                return r.json().catch(function () { throw new Error('Respuesta inválida del servidor (' + r.status + ').'); });
            })
            .then(function (j) {
                if (!j.ok) throw new Error(j.error || 'Ocurrió un error.');
                return j;
            });
    }

    function mensaje(tarjeta, texto, clase) {
        var m = tarjeta.querySelector('.mensaje');
        m.textContent = texto || '';
        m.className = 'mensaje' + (clase ? ' ' + clase : '');
    }

    // Pinta las vistas previas con el estado que regresa el servidor
    function aplicar(imagenes) {
        Object.keys(imagenes).forEach(function (tipo) {
            var info = imagenes[tipo];
            var t = document.querySelector('.tarjeta[data-tipo="' + tipo + '"]');
            if (!t) return;
            t.querySelector('.ins').innerHTML = info.propia
                ? '<span class="insignia propia">IMAGEN PROPIA</span>'
                : '<span class="insignia">LA QUE TRAE EL SISTEMA</span>';
            t.querySelector('.btn-quitar').disabled = !info.propia;

            if (tipo === 'favicon') {
                t.querySelectorAll('.img-favicon').forEach(function (img) { img.src = info.url; });
                var link = document.querySelector('link[rel="icon"]');
                if (link) link.href = info.url;
            }
            if (tipo === 'logo') t.querySelector('.img-logo').src = info.url;
            if (tipo === 'fondo') {
                var mock = t.querySelector('.login-mock');
                mock.classList.toggle('sin-foto', !info.url);
                if (info.url) mock.style.setProperty('--foto', 'url("' + info.url + '")');
                else mock.style.removeProperty('--foto');
            }
        });
        // Avisa a la pantalla principal para refrescar logo y favicon sin recargar
        if (enPestana) window.parent.postMessage({ tipo: 'imagenes', imagenes: imagenes }, location.origin);
    }

    document.querySelectorAll('.tarjeta').forEach(function (t) {
        var tipo = t.dataset.tipo;
        var input = t.querySelector('input[type=file]');

        input.addEventListener('change', function () {
            var archivo = input.files[0];
            if (!archivo) return;
            var datos = new FormData();
            datos.append('accion', 'subir');
            datos.append('tipo', tipo);
            datos.append('archivo', archivo);

            t.classList.add('subiendo');
            mensaje(t, 'Subiendo…');
            enviar(datos)
                .then(function (j) {
                    aplicar(j.imagenes);
                    if (j.aviso) mensaje(t, '✔ Imagen guardada. ' + j.aviso, 'aviso');
                    else mensaje(t, '✔ Imagen guardada.', 'ok');
                })
                .catch(function (err) { mensaje(t, err.message, 'error'); })
                .then(function () { t.classList.remove('subiendo'); input.value = ''; });
        });

        t.querySelector('.btn-quitar').addEventListener('click', function () {
            if (!confirm('¿Quitar la imagen propia y volver a la que trae el sistema?')) return;
            var datos = new FormData();
            datos.append('accion', 'quitar');
            datos.append('tipo', tipo);
            enviar(datos)
                .then(function (j) { aplicar(j.imagenes); mensaje(t, 'Se restauró la imagen del sistema.', 'ok'); })
                .catch(function (err) { mensaje(t, err.message, 'error'); });
        });
    });

    document.getElementById('btnRestablecer').addEventListener('click', function () {
        if (!confirm('¿Restablecer el favicon, el logo y el fondo a las imágenes que trae el sistema?')) return;
        var datos = new FormData();
        datos.append('accion', 'restablecer');
        enviar(datos)
            .then(function (j) {
                aplicar(j.imagenes);
                document.querySelectorAll('.tarjeta').forEach(function (t) { mensaje(t, 'Restablecida.', 'ok'); });
            })
            .catch(function (err) { alert(err.message); });
    });
})();
