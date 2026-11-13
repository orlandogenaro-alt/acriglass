// ACRINEO · Controles de una cuadrícula, como en Neodata: ojo = columnas ocultas (con cuántas), chincheta = columnas fijas
// a la izquierda al desplazarse (con cuántas) y ⋮ = más opciones (las propias de la cuadrícula, exportar a Excel y
// restablecer las columnas). Cada cuadrícula se declara en el HTML con
//   <span class="an-rejilla-btns" data-rejilla="nombre" data-tabla="idDeLaTabla"> [data-cols] [data-fijas] [data-menu] </span>
// y su módulo puede agregar opciones: AN.rejilla.opciones('nombre', { fijas: 1, archivo: 'Partidas', extras: fn → [{texto, accion}] }).
// Lo que elige cada usuario se recuerda en este navegador.
(function (AN) {
    'use strict';

    var esc = AN.ui.esc;
    var rejillas = {};
    var pop = null;

    function leer(nombre) {
        try { return JSON.parse(localStorage.getItem('acrineo.rejilla.' + nombre)) || null; } catch (e) { return null; }
    }
    function escribir(r) {
        try { localStorage.setItem('acrineo.rejilla.' + r.nombre, JSON.stringify({ ocultas: r.ocultas, fijas: r.fijas })); } catch (e) { /* sin memoria */ }
    }

    // Columnas con nombre (la de las casillas no cuenta): [{ n: posición 1…, texto }]
    function columnas(r) {
        return Array.prototype.map.call(r.tabla.tHead.rows[0].cells, function (th, i) {
            var s = th.querySelector('.an-th > span');
            return { n: i + 1, texto: s ? s.textContent.trim() : '', th: th };
        });
    }
    function conNombre(r) { return columnas(r).filter(function (c) { return c.texto; }); }

    // Reglas de estilo: ocultas con display:none y fijas con position:sticky (left = ancho de las de antes)
    function aplicar(r) {
        var sel = '#' + r.tabla.id + ' tr > :nth-child(';
        var css = r.ocultas.map(function (n) { return sel + n + ') { display: none; }'; }).join('\n');
        var visibles = conNombre(r).filter(function (c) { return r.ocultas.indexOf(c.n) < 0; });
        var hasta = r.fijas > 0 && visibles.length ? visibles[Math.min(r.fijas, visibles.length) - 1].n : 0;
        var izq = 0;
        columnas(r).forEach(function (c) {
            if (c.n > hasta || r.ocultas.indexOf(c.n) >= 0) return;
            css += '\n' + sel + c.n + ') { position: sticky; left: ' + Math.round(izq) + 'px; z-index: 1; }'
                + '\n:where(' + sel + c.n + ')) { background: var(--tarjeta); }'
                + '\n#' + r.tabla.id + ' thead tr > :nth-child(' + c.n + ') { z-index: 3; }'
                + (c.n === hasta ? '\n' + sel + c.n + ') { box-shadow: inset -2px 0 0 var(--borde-2); }' : '');
            izq += c.th.getBoundingClientRect().width;
        });
        if (r.estilo.textContent !== css) r.estilo.textContent = css;
        r.btnCols.querySelector('span').textContent = r.ocultas.length;
        r.btnFijas.querySelector('span').textContent = hasta ? visibles.filter(function (c) { return c.n <= hasta; }).length : 0;
        r.btnCols.classList.toggle('activo', r.ocultas.length > 0);
    }

    function cerrarPop() {
        if (pop) { pop.remove(); pop = null; }
        document.querySelectorAll('.an-rejilla-btns .an-menu, .an-menu-cont > .an-menu').forEach(function (m) {
            m.hidden = true;
            var b = m.parentNode.querySelector('[aria-expanded]');
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }

    function abrirPop(boton, html, alClic) {
        cerrarPop();
        pop = document.createElement('div');
        pop.className = 'an-pop an-pop-rejilla';
        pop.innerHTML = html;
        document.body.appendChild(pop);
        var b = boton.getBoundingClientRect();
        pop.style.top = Math.min(b.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
        pop.style.left = Math.max(8, Math.min(b.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + 'px';
        pop.addEventListener('change', alClic);
        pop.addEventListener('click', alClic);
        var primero = pop.querySelector('input');
        if (primero) primero.focus();
    }

    function popColumnas(r) {
        var html = '<b class="an-pop-titulo">Columnas visibles</b><div class="an-pop-lista">'
            + conNombre(r).map(function (c) {
                return '<label class="an-check"><input type="checkbox" data-col="' + c.n + '"' + (r.ocultas.indexOf(c.n) < 0 ? ' checked' : '') + '> ' + esc(c.texto) + '</label>';
            }).join('') + '</div><div class="an-pop-botones"><button type="button" class="an-btn an-mini" data-todas>Mostrar todas</button></div>';
        abrirPop(r.btnCols, html, function (e) {
            if (e.type === 'click' && e.target.closest('[data-todas]')) {
                r.ocultas = [];
                pop.querySelectorAll('[data-col]').forEach(function (i) { i.checked = true; });
            } else if (e.type === 'change' && e.target.dataset.col) {
                var n = +e.target.dataset.col;
                r.ocultas = r.ocultas.filter(function (x) { return x !== n; });
                if (!e.target.checked) {
                    if (conNombre(r).length - r.ocultas.length <= 1) { e.target.checked = true; return; }   // al menos una visible
                    r.ocultas.push(n);
                }
            } else return;
            escribir(r);
            aplicar(r);
        });
    }

    function popFijas(r) {
        var visibles = conNombre(r).filter(function (c) { return r.ocultas.indexOf(c.n) < 0; });
        var actual = Math.min(r.fijas, visibles.length);
        var html = '<b class="an-pop-titulo">Columnas fijas a la izquierda</b><div class="an-pop-lista">'
            + '<label class="an-check"><input type="radio" name="anFijas" value="0"' + (actual === 0 ? ' checked' : '') + '> Ninguna</label>'
            + visibles.map(function (c, i) {
                return '<label class="an-check"><input type="radio" name="anFijas" value="' + (i + 1) + '"' + (actual === i + 1 ? ' checked' : '') + '> '
                    + (i ? 'Hasta ' : '') + esc(c.texto) + ' <small class="an-ayuda">(' + (i + 1) + ')</small></label>';
            }).join('') + '</div>';
        abrirPop(r.btnFijas, html, function (e) {
            if (e.type !== 'change' || e.target.name !== 'anFijas') return;
            r.fijas = +e.target.value;
            escribir(r);
            aplicar(r);
        });
    }

    // Exporta lo que se ve (columnas visibles y renglones pintados) a un .xlsx
    function exportar(r) {
        var cols = conNombre(r).filter(function (c) { return r.ocultas.indexOf(c.n) < 0; });
        var filas = [cols.map(function (c) { return c.texto; })];
        Array.prototype.forEach.call(r.tabla.tBodies[0].rows, function (tr) {
            if (tr.classList.contains('an-vacio') || tr.cells.length < cols.length) return;
            filas.push(cols.map(function (c) {
                var td = tr.cells[c.n - 1];
                if (!td) return '';
                var i = td.querySelector('input:not([type=checkbox])');
                var t = (i ? i.value : td.textContent).replace(/\s+/g, ' ').trim();
                var num = /^\$?\s?-?[\d,]+(\.\d+)?$/.test(t) ? Number(t.replace(/[$,\s]/g, '')) : NaN;
                return isNaN(num) || t === '' ? t : num;
            }));
        });
        if (filas.length < 2) { AN.ui.aviso('No hay renglones para exportar.', 'error'); return; }
        var nombre = (r.cfg.archivo && r.cfg.archivo()) || r.nombre;
        var blob = window.XlsxSimple.crear({ nombre: nombre, anchos: cols.map(function (c) { return /descrip/i.test(c.texto) ? 50 : 16; }), filas: filas });
        window.XlsxSimple.descargar(blob, nombre.replace(/[\\\/:*?"<>|]+/g, ' ').trim() + '.xlsx');
    }

    function abrirMenu(r) {
        var menu = r.btnMenu.parentNode.querySelector('.an-menu');
        if (!menu.hidden) { cerrarPop(); return; }
        cerrarPop();
        var extras = r.cfg.extras ? r.cfg.extras() : [];
        r.acciones = extras.concat([null,
            { texto: 'Exportar a Excel', accion: function () { exportar(r); } },
            { texto: 'Mostrar todas las columnas', accion: function () { r.ocultas = []; escribir(r); aplicar(r); }, desactivado: !r.ocultas.length },
            { texto: 'Quitar las columnas fijas', accion: function () { r.fijas = 0; escribir(r); aplicar(r); }, desactivado: !r.fijas }]);
        if (r.acciones[0] === null) r.acciones.shift();
        menu.innerHTML = r.acciones.map(function (a, i) {
            return a ? '<button type="button" role="menuitem" data-accion="' + i + '"' + (a.desactivado ? ' disabled' : '') + '>' + esc(a.texto) + '</button>' : '<div class="an-sep"></div>';
        }).join('');
        menu.hidden = false;
        r.btnMenu.setAttribute('aria-expanded', 'true');
    }

    function preparar(cont) {
        var nombre = cont.dataset.rejilla, tabla = document.getElementById(cont.dataset.tabla);
        if (!tabla) return;
        var r = rejillas[nombre] = rejillas[nombre] || { nombre: nombre, cfg: {} };
        var guardado = leer(nombre);
        r.tabla = tabla;
        r.btnCols = cont.querySelector('[data-cols]');
        r.btnFijas = cont.querySelector('[data-fijas]');
        r.btnMenu = cont.querySelector('[data-menu]');
        r.ocultas = guardado && Array.isArray(guardado.ocultas) ? guardado.ocultas : (r.cfg.ocultas || []).slice();
        r.fijas = guardado && guardado.fijas != null ? +guardado.fijas : (r.cfg.fijas || 0);
        r.estilo = document.createElement('style');
        document.head.appendChild(r.estilo);
        r.btnCols.addEventListener('click', function (e) { e.stopPropagation(); if (pop && pop.dataset.de === 'cols-' + nombre) cerrarPop(); else { popColumnas(r); pop.dataset.de = 'cols-' + nombre; } });
        r.btnFijas.addEventListener('click', function (e) { e.stopPropagation(); if (pop && pop.dataset.de === 'fijas-' + nombre) cerrarPop(); else { popFijas(r); pop.dataset.de = 'fijas-' + nombre; } });
        r.btnMenu.addEventListener('click', function (e) { e.stopPropagation(); abrirMenu(r); });
        r.btnMenu.parentNode.querySelector('.an-menu').addEventListener('click', function (e) {
            var b = e.target.closest('[data-accion]');
            if (!b) return;
            var a = r.acciones[+b.dataset.accion];
            cerrarPop();
            if (a && a.accion) a.accion();
        });
        // Los anchos cambian al pintar renglones o al cambiar el tamaño: se recalculan las posiciones de las fijas
        var pronto = AN.ui.retrasar(function () { aplicar(r); }, 60);
        if (window.ResizeObserver) new ResizeObserver(pronto).observe(tabla);
        new MutationObserver(pronto).observe(tabla.tBodies[0], { childList: true });
        aplicar(r);
    }

    document.addEventListener('click', function (e) {
        if (pop && !pop.contains(e.target)) cerrarPop();
        else if (!pop && !e.target.closest('.an-menu-cont')) cerrarPop();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (pop || document.querySelector('.an-menu-cont > .an-menu:not([hidden])'))) cerrarPop(); });
    window.addEventListener('resize', function () { if (pop) cerrarPop(); });

    AN.rejilla = {
        opciones: function (nombre, cfg) {
            var r = rejillas[nombre] = rejillas[nombre] || { nombre: nombre, cfg: {} };
            r.cfg = Object.assign(r.cfg, cfg);
            // Valores por omisión si el usuario nunca los ha cambiado
            if (r.tabla && !leer(nombre)) { r.ocultas = (cfg.ocultas || r.ocultas || []).slice(); if (cfg.fijas != null) r.fijas = cfg.fijas; aplicar(r); }
        },
        cerrar: cerrarPop
    };
    document.querySelectorAll('[data-rejilla]').forEach(preparar);
})(window.AcriNeo = window.AcriNeo || {});
