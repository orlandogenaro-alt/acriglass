// ACRINEO · Divisores de los paneles de la hoja (como en Neodata y Excel): al pasar el puntero sobre la línea entre dos
// paneles se marca en rojo y arrastrándola se hacen más grandes o más chicos. Doble clic la regresa a su tamaño normal.
// Con el teclado: Tab hasta la línea y flechas (Shift = paso grande). El tamaño se recuerda en este navegador.
//
// Marcado: <div class="an-divisor" data-divisor="nombre" data-eje="x|y" role="separator" tabindex="0"></div>
// Los dos paneles que reparte son el elemento anterior y el siguiente (data-a / data-b para indicarlos con selector).
// El tamaño queda en las variables --an-<nombre>-a y -b del contenedor (en fr), que usa su grid en css/acrineo.css.
(function () {
    'use strict';
    var MINIMO = 160;          // px que siempre le quedan a cada panel
    var CLAVE = 'acrineo.divisor.';

    function panel(div, cual) {
        var sel = div.getAttribute('data-' + cual);
        if (sel) return div.parentElement.querySelector(sel);
        var el = cual === 'a' ? div.previousElementSibling : div.nextElementSibling;
        while (el && el.classList.contains('an-divisor')) el = cual === 'a' ? el.previousElementSibling : el.nextElementSibling;
        return el;
    }
    // Variable CSS del tamaño de cada panel: --an-<nombre>-a / -b (una por divisor, para que no se hereden entre ellos)
    function variable(div, cual) { return '--an-' + div.getAttribute('data-divisor') + '-' + cual; }
    function medida(el, eje) { var r = el.getBoundingClientRect(); return eje === 'x' ? r.width : r.height; }

    function aplicar(div, a, b) {
        var cont = div.parentElement;
        cont.style.setProperty(variable(div, 'a'), a.toFixed(1) + 'fr');
        cont.style.setProperty(variable(div, 'b'), b.toFixed(1) + 'fr');
        var total = a + b;
        div.setAttribute('aria-valuenow', String(Math.round(a / total * 100)));
    }
    function guardar(div, a, b) {
        try { localStorage.setItem(CLAVE + div.getAttribute('data-divisor'), a.toFixed(1) + ',' + b.toFixed(1)); } catch (e) { /* sin memoria */ }
    }
    function restablecer(div) {
        var cont = div.parentElement;
        cont.style.removeProperty(variable(div, 'a'));
        cont.style.removeProperty(variable(div, 'b'));
        div.removeAttribute('aria-valuenow');
        try { localStorage.removeItem(CLAVE + div.getAttribute('data-divisor')); } catch (e) { /* sin memoria */ }
    }

    // Reparte el espacio de los dos paneles moviendo la línea «delta» px (positivo = el primero crece)
    function mover(div, inicioA, inicioB, delta) {
        var total = inicioA + inicioB;
        var minimo = Math.min(MINIMO, total / 2);
        var a = Math.max(minimo, Math.min(total - minimo, inicioA + delta));
        aplicar(div, a, total - a);
        return [a, total - a];
    }

    function preparar(div) {
        var eje = div.getAttribute('data-eje') === 'y' ? 'y' : 'x';
        div.setAttribute('role', 'separator');
        div.setAttribute('aria-orientation', eje === 'x' ? 'vertical' : 'horizontal');
        div.setAttribute('aria-valuemin', '0');
        div.setAttribute('aria-valuemax', '100');
        if (!div.hasAttribute('tabindex')) div.tabIndex = 0;
        if (!div.title) div.title = 'Arrastra para cambiar el tamaño de los paneles (doble clic: tamaño normal)';

        var guardado = null;
        try { guardado = localStorage.getItem(CLAVE + div.getAttribute('data-divisor')); } catch (e) { /* sin memoria */ }
        if (guardado) {
            var p = guardado.split(',').map(Number);
            if (p.length === 2 && p[0] > 0 && p[1] > 0) aplicar(div, p[0], p[1]);
        }

        var arrastre = null;
        div.addEventListener('pointerdown', function (ev) {
            if (ev.button !== 0) return;
            var pa = panel(div, 'a'), pb = panel(div, 'b');
            if (!pa || !pb) return;
            ev.preventDefault();
            arrastre = { inicio: eje === 'x' ? ev.clientX : ev.clientY, a: medida(pa, eje), b: medida(pb, eje), final: null };
            try { div.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }
            div.classList.add('arrastrando');
            document.body.classList.add('an-redimensionando', eje === 'x' ? 'an-redim-x' : 'an-redim-y');
        });
        div.addEventListener('pointermove', function (ev) {
            if (!arrastre) return;
            arrastre.final = mover(div, arrastre.a, arrastre.b, (eje === 'x' ? ev.clientX : ev.clientY) - arrastre.inicio);
        });
        function soltar() {
            if (!arrastre) return;
            if (arrastre.final) guardar(div, arrastre.final[0], arrastre.final[1]);
            arrastre = null;
            div.classList.remove('arrastrando');
            document.body.classList.remove('an-redimensionando', 'an-redim-x', 'an-redim-y');
            window.dispatchEvent(new Event('resize'));   // las cuadrículas reacomodan sus columnas fijas
        }
        div.addEventListener('pointerup', soltar);
        div.addEventListener('pointercancel', soltar);
        div.addEventListener('lostpointercapture', soltar);
        div.addEventListener('dblclick', function () { restablecer(div); window.dispatchEvent(new Event('resize')); });

        div.addEventListener('keydown', function (ev) {
            var menos = eje === 'x' ? 'ArrowLeft' : 'ArrowUp', mas = eje === 'x' ? 'ArrowRight' : 'ArrowDown';
            if (ev.key !== menos && ev.key !== mas && ev.key !== 'Home' && ev.key !== 'End') return;
            var pa = panel(div, 'a'), pb = panel(div, 'b');
            if (!pa || !pb) return;
            ev.preventDefault();
            var paso = ev.shiftKey ? 120 : 30;
            var delta = ev.key === mas ? paso : ev.key === menos ? -paso : ev.key === 'End' ? 1e6 : -1e6;
            var r = mover(div, medida(pa, eje), medida(pb, eje), delta);
            guardar(div, r[0], r[1]);
            window.dispatchEvent(new Event('resize'));
        });
    }

    document.querySelectorAll('.an-divisor[data-divisor]').forEach(preparar);
})();
