// Tema claro / oscuro. 'auto' sigue al sistema operativo; la elección se recuerda en el navegador
// y se comparte con las demás pestañas del sistema. Se carga en <head> para evitar el parpadeo.
(function () {
    var CLAVE = 'acri-tema';
    var NOMBRES = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };
    var SIGUIENTE = { auto: 'claro', claro: 'oscuro', oscuro: 'auto' };
    var raiz = document.documentElement;

    function leer() {
        try { return localStorage.getItem(CLAVE) || 'auto'; } catch (e) { return 'auto'; }
    }

    function aplicar(t) {
        if (!NOMBRES[t]) t = 'auto';
        if (t === 'auto') raiz.removeAttribute('data-theme');
        else raiz.setAttribute('data-theme', t === 'oscuro' ? 'dark' : 'light');
        document.querySelectorAll('[data-tema]').forEach(function (b) {
            b.dataset.tema = t;
            b.title = 'Tema: ' + NOMBRES[t] + ' (clic para cambiar)';
            var s = b.querySelector('span');
            if (s) s.textContent = NOMBRES[t];
        });
        return t;
    }

    var actual = aplicar(leer());

    document.addEventListener('DOMContentLoaded', function () {
        aplicar(actual);
        document.querySelectorAll('[data-tema]').forEach(function (b) {
            b.addEventListener('click', function () {
                actual = aplicar(SIGUIENTE[actual]);
                try { localStorage.setItem(CLAVE, actual); } catch (e) {}
            });
        });
    });

    // Cambio hecho desde otra pestaña / iframe
    window.addEventListener('storage', function (e) {
        if (e.key === CLAVE) actual = aplicar(e.newValue);
    });
})();
