// Recorrido guiado: bienvenida, fondo atenuado, elemento resaltado y una tarjeta por paso.
// Pantalla principal: pasos en js/recorrido-pasos.js. Presupuesto de Obra y Obra: js/recorrido-presupuesto.js
// y js/recorrido-obra.js, que además ponen window.RECORRIDO_OPCIONES (id, usuario y textos de la bienvenida).
// Se ofrece solo en la primera sesión del usuario después de que le crearon la cuenta (login.php pone
// primer_ingreso cuando aún no tenía ultimo_acceso); si se omite o se completa ya no se vuelve a ofrecer.
// Después se abre con el botón Tour (en la principal también desde Ayuda › Iniciar recorrido). El estado
// (omitido / completado) se guarda en este navegador por usuario y por pantalla, como los favoritos.
(function () {
    var PASOS = window.RECORRIDO_PASOS || [];
    var OPC = window.RECORRIDO_OPCIONES || {};
    var VERSION = OPC.version || 1;   // se guarda con el estado (omitido / completado)
    var usuario = OPC.usuario || (window.ACRI && window.ACRI.usuario) || '';
    var clave = 'acri_recorrido_' + (OPC.id ? OPC.id + '_' : '') + usuario;
    var TEXTOS = {
        titulo: OPC.titulo || '¡Bienvenido al recorrido de AcriGlass!',
        intro: OPC.intro || 'Te mostraremos las funciones principales del sistema para que puedas empezar a trabajar con mayor facilidad.',
        volver: OPC.volver || 'Podrás abrirlo nuevamente con el botón Tour, al pie del menú, o desde Ayuda.',
        listo: OPC.listo || '¡Listo! Puedes volver a consultar este recorrido con el botón Tour o desde Ayuda.'
    };
    function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    var movil = window.matchMedia('(max-width: 800px)');
    var ESPERA_MAX = 2500;   // ms que se espera a que aparezca un elemento antes de omitir su paso

    function leerEstado() {
        try { return JSON.parse(localStorage.getItem(clave)) || null; } catch (e) { return null; }
    }
    function guardarEstado(estado) {
        var previo = leerEstado();
        // Salir a medio camino no borra un recorrido que ya se había completado
        if (estado === 'omitido' && previo && previo.estado === 'completado' && previo.version === VERSION) return;
        try { localStorage.setItem(clave, JSON.stringify({ estado: estado, version: VERSION, fecha: new Date().toISOString() })); } catch (e) {}
    }

    function crear(html) {
        var d = document.createElement('div');
        d.innerHTML = html.trim();
        return d.firstChild;
    }
    function lim(v, a, b) { return Math.max(a, Math.min(v, b)); }

    // Mantiene el foco del teclado dentro de una caja (Tab / Shift+Tab)
    function atraparTab(e, caja) {
        var b = caja.querySelectorAll('button:not([disabled])');
        if (!b.length) return;
        var primero = b[0], ultimo = b[b.length - 1];
        if (!caja.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
        else if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    }

    // ================= Cambios temporales a la pantalla =================
    // Cada paso puede abrir el menú, una sección o el buscador. Se recuerda cómo estaba
    // y se regresa al cambiar a un paso que ya no lo necesita o al salir del recorrido.
    var cambios = [];   // { el, clase, original, usado }

    function clase(el, nombre, valor) {
        if (!el) return;
        var c = null;
        cambios.forEach(function (x) { if (x.el === el && x.clase === nombre) c = x; });
        if (!c) { c = { el: el, clase: nombre, original: el.classList.contains(nombre) }; cambios.push(c); }
        c.usado = true;
        el.classList.toggle(nombre, valor);
    }
    function restaurar(todo) {
        cambios = cambios.filter(function (c) {
            if (!todo && c.usado) return true;
            c.el.classList.toggle(c.clase, c.original);
            return false;
        });
    }
    var ayudantes = {
        clase: clase,
        abrirGrupo: function (g) { clase(g, 'abierto', true); },
        movil: function () { return movil.matches; }
    };

    // ================= Bienvenida =================
    var modal = null, focoModal = null;

    function bienvenida() {
        if (activo || modal) return;
        focoModal = document.activeElement;
        modal = crear(
            '<div class="rc-fondo">' +
            '<div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rcTitulo" aria-describedby="rcTexto">' +
            '<button class="rc-x" data-rc="cerrar" aria-label="Cerrar" title="Cerrar">×</button>' +
            '<h2 id="rcTitulo">' + esc(TEXTOS.titulo) + '</h2>' +
            '<div id="rcTexto">' +
            '<p>' + esc(TEXTOS.intro) + '</p>' +
            '<p>Avanza a tu ritmo, regresa al paso anterior o cierra el recorrido cuando quieras. También puedes usar las teclas:<br>' +
            '<b>← para ir al paso anterior</b><br><b>→ para ir al siguiente</b><br><b>Esc para salir</b></p>' +
            '<p>' + esc(TEXTOS.volver) + '</p>' +
            '</div>' +
            '<div class="rc-pie">' +
            '<button class="rc-btn-sec" data-rc="no">Ahora no</button>' +
            '<button class="rc-btn-pri" data-rc="si">Iniciar recorrido</button>' +
            '</div></div></div>');
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            var b = e.target.closest('[data-rc]');
            if (!b) return;
            if (b.dataset.rc === 'si') { cerrarBienvenida(); iniciar(); }
            else { cerrarBienvenida(true); guardarEstado('omitido'); }
        });
        document.addEventListener('keydown', teclasModal, true);
        modal.querySelector('[data-rc="si"]').focus();
    }
    function cerrarBienvenida(devolverFoco) {
        if (!modal) return;
        document.removeEventListener('keydown', teclasModal, true);
        modal.remove();
        modal = null;
        if (devolverFoco && focoModal && focoModal.focus && document.contains(focoModal)) focoModal.focus();
    }
    function teclasModal(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarBienvenida(true); guardarEstado('omitido'); }
        else if (e.key === 'Tab') atraparTab(e, modal);
    }

    // ================= Recorrido =================
    var activo = false;
    var lista = [];       // pasos que se mostrarán (ya filtrados por su condición)
    var i = 0;            // paso actual
    var objetivo = null;  // elementos resaltados (arreglo)
    var ultimo = '';      // última posición dibujada del elemento
    var espera = 0, bucle = 0, focoPrevio = null;
    var raiz, foco, tarjeta, flecha, txtPaso, txtTitulo, txtTexto, btnAnt, btnSig;

    function construir() {
        raiz = crear(
            '<div class="rc">' +
            '<div class="rc-capa"></div>' +
            '<div class="rc-foco"></div>' +
            '<div class="rc-tarjeta rc-cargando" role="dialog" aria-modal="true" aria-labelledby="rcPasoTitulo" aria-describedby="rcPasoTexto">' +
            '<span class="rc-flecha"></span>' +
            '<div class="rc-paso" aria-live="polite"></div>' +
            '<h2 id="rcPasoTitulo"></h2>' +
            '<p id="rcPasoTexto"></p>' +
            '<div class="rc-botones">' +
            '<button data-rc="salir">Salir del recorrido</button>' +
            '<button data-rc="anterior">Anterior</button>' +
            '<button data-rc="siguiente">Siguiente</button>' +
            '</div></div></div>');
        foco = raiz.querySelector('.rc-foco');
        tarjeta = raiz.querySelector('.rc-tarjeta');
        flecha = raiz.querySelector('.rc-flecha');
        txtPaso = raiz.querySelector('.rc-paso');
        txtTitulo = raiz.querySelector('h2');
        txtTexto = raiz.querySelector('p');
        btnAnt = raiz.querySelector('[data-rc="anterior"]');
        btnSig = raiz.querySelector('[data-rc="siguiente"]');
        raiz.querySelector('.rc-botones').addEventListener('click', function (e) {
            var b = e.target.closest('[data-rc]');
            if (!b) return;
            if (b.dataset.rc === 'salir') terminar(false);
            else if (b.dataset.rc === 'anterior') anterior();
            else siguiente();
        });
        document.body.appendChild(raiz);
    }

    function iniciar(volverA) {
        cerrarBienvenida();
        cerrarAviso();
        if (activo) return;
        lista = PASOS.filter(function (p) {
            try { return !p.si || p.si(); } catch (e) { return false; }
        });
        if (!lista.length) return;
        focoPrevio = volverA || document.activeElement;
        activo = true;
        construir();
        document.addEventListener('keydown', teclas, true);
        bucle = requestAnimationFrame(seguir);
        mostrar(0, 1);
    }

    function resolver(paso) {
        try { return typeof paso.elemento === 'function' ? paso.elemento() : document.querySelector(paso.elemento); }
        catch (e) { return null; }
    }
    function visible(el) {
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }
    // Un paso puede resaltar varios elementos juntos (p. ej. tres botones seguidos): la función regresa
    // un arreglo y se resaltan los que se ven, como un solo rectángulo.
    function visibles(el) {
        if (!el) return null;
        var v = (Array.isArray(el) ? el : [el]).filter(function (x) { return x && visible(x); });
        return v.length ? v : null;
    }
    function rect(els) {
        var l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
        els.forEach(function (el) {
            var x = el.getBoundingClientRect();
            l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
        });
        return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
    }

    // dir: 1 = avanzando, -1 = regresando (para saber a dónde ir si se omite el paso)
    function mostrar(n, dir) {
        clearTimeout(espera);
        var paso = lista[n];
        i = n;
        objetivo = null;
        tarjeta.classList.add('rc-cargando');

        cambios.forEach(function (c) { c.usado = false; });
        if (paso.menu) {
            if (movil.matches) clase(document.body, 'sb-movil', true);
            else clase(document.body, 'sb-oculto', false);
        } else if (movil.matches) {
            clase(document.body, 'sb-movil', false);   // en celular el menú taparía la barra superior
        }
        try { if (paso.preparar) paso.preparar(ayudantes); } catch (e) {}
        restaurar(false);

        var inicio = Date.now();
        (function buscar() {
            if (!activo || i !== n) return;
            var el = visibles(resolver(paso));
            if (el) { enfocar(el); return; }
            if (Date.now() - inicio < ESPERA_MAX) { espera = setTimeout(buscar, 100); return; }
            // No apareció o no está disponible: se omite y se recalcula el total
            lista.splice(n, 1);
            if (!lista.length) { terminar(false); return; }
            mostrar(lim(dir > 0 ? n : n - 1, 0, lista.length - 1), dir);
        })();
    }

    function enfocar(el) {
        var paso = lista[i];
        objetivo = el;
        var r = rect(el);
        if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > document.documentElement.clientWidth) {
            // Varios elementos: primero se trae el último y luego el primero, para que se vean todos si caben
            if (el.length > 1) el[el.length - 1].scrollIntoView({ block: 'nearest', inline: 'nearest' });
            el[0].scrollIntoView({ block: r.height > window.innerHeight * 0.7 ? 'start' : 'center', inline: 'nearest', behavior: 'smooth' });
        }
        txtPaso.textContent = 'Paso ' + (i + 1) + ' de ' + lista.length;
        txtTitulo.textContent = paso.titulo;
        txtTexto.textContent = paso.texto;
        btnAnt.disabled = i === 0;
        btnSig.textContent = i === lista.length - 1 ? 'Finalizar' : 'Siguiente';
        ultimo = '';
        colocar();
        tarjeta.classList.remove('rc-cargando');
        btnSig.focus({ preventScroll: true });
    }

    // Sigue al elemento: transiciones del menú, desplazamientos y cambios de tamaño de la ventana
    function seguir() {
        if (!activo) return;
        if (objetivo) {
            var r = rect(objetivo);
            var k = [r.left, r.top, r.width, r.height, window.innerWidth, window.innerHeight].map(Math.round).join();
            if (k !== ultimo) { ultimo = k; colocar(); }
        }
        bucle = requestAnimationFrame(seguir);
    }

    var ORDEN = {
        derecha:   ['derecha', 'abajo', 'izquierda', 'arriba'],
        izquierda: ['izquierda', 'abajo', 'derecha', 'arriba'],
        abajo:     ['abajo', 'derecha', 'arriba', 'izquierda'],
        arriba:    ['arriba', 'derecha', 'abajo', 'izquierda']
    };

    function colocar() {
        if (!objetivo) return;
        var r = rect(objetivo);
        var vw = document.documentElement.clientWidth, vh = window.innerHeight;
        var m = 10, sep = 14, pad = 5;

        // Resaltado: el elemento con un pequeño margen, recortado a la pantalla
        var f = {
            l: lim(r.left - pad, 2, vw - 2), t: lim(r.top - pad, 2, vh - 2),
            r: lim(r.right + pad, 2, vw - 2), b: lim(r.bottom + pad, 2, vh - 2)
        };
        foco.style.left = f.l + 'px';
        foco.style.top = f.t + 'px';
        foco.style.width = (f.r - f.l) + 'px';
        foco.style.height = (f.b - f.t) + 'px';

        // Tarjeta: el lado preferido si cabe; si no, el siguiente que quepa
        var w = tarjeta.offsetWidth, h = tarjeta.offsetHeight;
        var cx = (f.l + f.r) / 2, cy = (f.t + f.b) / 2;
        var orden = ORDEN[lista[i].posicion] || ORDEN.abajo;
        var pos = null;
        for (var k = 0; k < orden.length && !pos; k++) {
            var lado = orden[k], x, y;
            if (lado === 'derecha' || lado === 'izquierda') {
                x = lado === 'derecha' ? f.r + sep : f.l - sep - w;
                y = lim(cy - h / 2, m, vh - h - m);
                if (x < m || x + w > vw - m) continue;
            } else {
                y = lado === 'abajo' ? f.b + sep : f.t - sep - h;
                x = lim(cx - w / 2, m, vw - w - m);
                if (y < m || y + h > vh - m) continue;
            }
            pos = { lado: lado, x: x, y: y };
        }
        // Sin espacio alrededor (p. ej. el menú en celular): arriba o abajo de la pantalla, donde tape menos
        if (!pos) pos = { lado: 'hoja', x: lim(cx - w / 2, m, vw - w - m), y: f.t > vh - f.b ? m : vh - h - m };

        tarjeta.style.left = pos.x + 'px';
        tarjeta.style.top = pos.y + 'px';
        tarjeta.dataset.lado = pos.lado;

        // Flecha apuntando al elemento
        if (pos.lado === 'derecha' || pos.lado === 'izquierda') {
            flecha.style.left = (pos.lado === 'derecha' ? -6 : w - 6) + 'px';
            flecha.style.top = (lim(cy - pos.y, 16, h - 16) - 6) + 'px';
        } else if (pos.lado !== 'hoja') {
            flecha.style.top = (pos.lado === 'abajo' ? -6 : h - 6) + 'px';
            flecha.style.left = (lim(cx - pos.x, 16, w - 16) - 6) + 'px';
        }
    }

    function siguiente() {
        if (i >= lista.length - 1) terminar(true);
        else mostrar(i + 1, 1);
    }
    function anterior() {
        if (i > 0) mostrar(i - 1, -1);
    }

    function teclas(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminar(false); return; }
        if (e.key === 'Tab') { atraparTab(e, tarjeta); return; }
        var t = e.target;
        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); anterior(); }
    }

    // completo = llegó a Finalizar; si no, salió antes (queda como omitido)
    function terminar(completo) {
        if (!activo) return;
        activo = false;
        clearTimeout(espera);
        cancelAnimationFrame(bucle);
        document.removeEventListener('keydown', teclas, true);
        restaurar(true);
        raiz.remove();
        raiz = objetivo = null;
        guardarEstado(completo ? 'completado' : 'omitido');
        if (completo) aviso(TEXTOS.listo);
        if (focoPrevio && focoPrevio.focus && document.contains(focoPrevio)) focoPrevio.focus({ preventScroll: true });
        focoPrevio = null;
    }

    // Si la ventana cruza el tamaño de celular, se vuelve a preparar el paso (menú fijo o deslizable)
    movil.addEventListener('change', function () { if (activo) mostrar(i, 1); });

    // ================= Aviso final =================
    var cajaAviso = null, tAviso = 0;
    function aviso(texto) {
        cerrarAviso();
        cajaAviso = crear('<div class="rc-aviso" role="status"></div>');
        cajaAviso.textContent = texto;
        document.body.appendChild(cajaAviso);
        tAviso = setTimeout(cerrarAviso, 5000);
    }
    function cerrarAviso() {
        clearTimeout(tAviso);
        if (cajaAviso) cajaAviso.remove();
        cajaAviso = null;
    }

    // ================= Menú Ayuda de la barra superior =================
    var btnAyuda = document.getElementById('btnAyuda');
    var menuAyuda = document.getElementById('menuAyuda');
    if (btnAyuda && menuAyuda) {
        var opRecorrido = menuAyuda.querySelector('[data-ayuda="recorrido"]');
        var abrirMenu = function () {
            var est = leerEstado();
            opRecorrido.querySelector('small').textContent =
                !est ? 'Conoce las funciones principales' :
                est.estado === 'completado' ? 'Ya lo completaste · puedes repetirlo' : 'Lo omitiste · inícialo cuando quieras';
            menuAyuda.hidden = false;
            btnAyuda.setAttribute('aria-expanded', 'true');
            opRecorrido.focus();
        };
        var cerrarMenu = function () {
            menuAyuda.hidden = true;
            btnAyuda.setAttribute('aria-expanded', 'false');
        };
        btnAyuda.addEventListener('click', function () { if (menuAyuda.hidden) abrirMenu(); else cerrarMenu(); });
        document.addEventListener('pointerdown', function (e) {
            if (!menuAyuda.hidden && !menuAyuda.contains(e.target) && !btnAyuda.contains(e.target)) cerrarMenu();
        });
        menuAyuda.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { cerrarMenu(); btnAyuda.focus(); }
        });
        opRecorrido.addEventListener('click', function () { cerrarMenu(); iniciar(btnAyuda); });
    }

    // Botón Tour al pie del menú lateral
    var btnTour = document.getElementById('btnTour');
    if (btnTour) btnTour.addEventListener('click', function () { iniciar(btnTour); });

    // Solo en la primera sesión del usuario (la primera vez que entra desde que le crearon la cuenta) se ofrece
    // la bienvenida, una vez por pantalla; después el recorrido se abre únicamente con el botón Tour
    if (window.ACRI_PRIMER_INGRESO && !leerEstado()) setTimeout(bienvenida, 700);

    window.Recorrido = { iniciar: iniciar, bienvenida: bienvenida };
})();
