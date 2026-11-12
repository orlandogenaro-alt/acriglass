// ACRINEO · Ventana «Detalle del presupuesto» (modal, sin cambiar de pantalla).
//   APLICAR: valida, guarda (alta o cambio) y deja la ventana abierta; un presupuesto nuevo recibe su id y sigue editándose.
//   ACEPTAR: valida, guarda, cierra y el catálogo se refresca con el presupuesto seleccionado.
//   Cerrar (X / Esc): si hay cambios sin guardar pide confirmación.
// Los controles se ubican por data-campo="seccion.campo"; las reglas salen del esquema del servidor (window.ACRINEO.esquema).
(function (AN) {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var cfg = window.ACRINEO || {};
    var esquema = cfg.esquema;
    var permisos = cfg.permisos || {};
    var dlg = $('anDetalle');
    if (!dlg) return;
    var form = $('anDetalleForm'), titulo = $('anDetalleTitulo'), estado = $('anDetalleEstado');
    var btnAceptar = $('anAceptar'), btnAplicar = $('anAplicar');
    var controles = Array.prototype.slice.call(form.querySelectorAll('[data-campo]'));
    var pestanas = Array.prototype.slice.call(form.querySelectorAll('[data-pestana]'));

    var st = { id: 0, version: null, original: '', guardando: null, soloLectura: false, alGuardar: null, cargando: false };

    // ---------- Reglas ----------
    function regla(ruta) {
        var p = ruta.split('.');
        if (p[0] === 'ch' && p[1] === 'parametros') return esquema.pct_ch;
        if (p[0] === 'ch' && p[1] === 'factores') return esquema.ch_factores[p[2]][2] === 'num' ? esquema.factor : esquema.indicador;
        if (p[0] === 'monedas') return esquema.monedas[p[2]];
        return esquema.campos[p[0]] ? esquema.campos[p[0]][p[1]] : null;
    }

    function defectos() {
        var d = JSON.parse(JSON.stringify(esquema.defectos));
        Object.keys(esquema.campos.licitacion).forEach(function (k) {
            if (esquema.campos.licitacion[k].defecto === 'hoy') d.licitacion[k] = AN.ui.hoy();
        });
        d.licitacion.fecha_terminacion = AN.ui.fechaTerminacion(d.licitacion.fecha_inicio, d.licitacion.dias);
        return d;
    }

    // ---------- Llenar / recoger ----------
    function textoDe(ruta) { return form.querySelector('[data-nombre-de="' + ruta + '"]'); }
    function control(ruta) { return form.querySelector('[data-campo="' + ruta + '"]'); }

    function llenar(p) {
        controles.forEach(function (el) {
            var v = AN.ui.obtener(p, el.dataset.campo);
            el.value = v == null ? '' : String(v);
            if (el.dataset.tipo === 'catalogo') {
                var nombre = AN.ui.obtener(p, el.dataset.campo.replace(/_id$/, '_nombre'));
                textoDe(el.dataset.campo).value = v == null ? '' : (nombre || '#' + v);
            }
        });
        $('anCodigo').value = p.meta ? p.meta.codigo || '' : '';
        titulo.textContent = 'Detalle del presupuesto:' + (p.meta ? ' ' + (p.meta.codigo || '') + ' · ' + (p.presupuesto.nombre || '') : ' (nuevo)');
        titulo.title = p.meta ? 'Creado por ' + (p.meta.created_by || '?') + ' el ' + AN.ui.fechaCorta(p.meta.created_at)
            + ' · Última modificación: ' + (p.meta.updated_by || '?') + ' el ' + AN.ui.fechaCorta(p.meta.updated_at) : '';
    }

    // Lo que se manda al servidor (los calculados no: el servidor los recalcula)
    function recoger() {
        var d = {};
        controles.forEach(function (el) {
            var r = regla(el.dataset.campo);
            if (r && r.calculado) return;
            var v = el.value.trim();
            AN.ui.poner(d, el.dataset.campo, v === '' ? null : v);
        });
        return d;
    }
    function huella() { return JSON.stringify(recoger()); }
    function sucio() { return !st.soloLectura && huella() !== st.original; }
    function actualizarSucio() { dlg.classList.toggle('con-cambios', sucio()); }

    // ---------- Validación (la misma que el servidor; el servidor vuelve a validar) ----------
    function validarCliente() {
        var errores = {};
        controles.forEach(function (el) {
            var ruta = el.dataset.campo, def = regla(ruta);
            if (!def || def.calculado) return;
            var v = el.value.trim();
            if (el.validity && el.validity.badInput) { errores[ruta] = 'Debe ser un número.'; return; }
            if (v === '') { if (def.requerido) errores[ruta] = 'Es obligatorio.'; return; }
            var msg = null;
            switch (def.tipo) {
                case 'texto': case 'largo':
                    if (def.max && v.length > def.max) msg = 'Máximo ' + def.max + ' caracteres.';
                    break;
                case 'correo':
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > (def.max || 150)) msg = 'Correo no válido.';
                    break;
                case 'cp':
                    if (!/^[0-9A-Za-z -]{3,10}$/.test(v)) msg = 'Código postal no válido.';
                    break;
                case 'caracter':
                    if (Array.from(v).length !== 1 || /\s/.test(v)) msg = 'Debe ser un solo caracter visible.';
                    break;
                case 'fecha':
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) msg = 'Fecha no válida.';
                    break;
                case 'entero':
                    msg = /^-?\d+$/.test(v) ? rango(+v, def) : 'Debe ser un número entero.';
                    break;
                case 'decimal':
                    msg = v !== '' && isFinite(Number(v)) ? rango(Number(v), def) : 'Debe ser un número.';
                    break;
            }
            if (msg) errores[ruta] = msg;
        });
        return errores;
    }
    function rango(n, def) {
        var min = def.min, max = def.max;
        if (min != null && max != null && (n < min || n > max)) return 'Debe estar entre ' + min + ' y ' + max + '.';
        if (min != null && n < min) return 'Debe ser al menos ' + min + '.';
        if (max != null && n > max) return 'Debe ser como máximo ' + max + '.';
        return null;
    }

    function marcarErrores(errores) {
        form.querySelectorAll('.invalido').forEach(function (c) { c.classList.remove('invalido'); c.removeAttribute('title'); });
        form.querySelectorAll('.an-error').forEach(function (s) { s.hidden = true; s.textContent = ''; });
        form.querySelectorAll('[data-campo][aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
        pestanas.forEach(function (b) { b.classList.remove('con-error'); });
        var primero = null;
        Object.keys(errores || {}).forEach(function (ruta) {
            var c = form.querySelector('[data-error-de="' + ruta + '"]');
            if (!c) return;
            c.classList.add('invalido');
            var s = c.querySelector('.an-error');
            if (s) { s.textContent = errores[ruta]; s.hidden = false; } else c.title = errores[ruta];
            var el = control(ruta);
            if (el) el.setAttribute('aria-invalid', 'true');
            var panel = c.closest('[data-panel]');
            if (panel) form.querySelector('[data-pestana="' + panel.dataset.panel + '"]').classList.add('con-error');
            if (!primero) primero = { panel: panel && panel.dataset.panel, el: el && el.type !== 'hidden' ? el : c.querySelector('button') };
        });
        if (primero) {
            if (primero.panel) mostrarPestana(primero.panel);
            if (primero.el) primero.el.focus();
        }
    }

    function ponerEstado(texto, tipo) {
        estado.textContent = texto || '';
        estado.className = 'an-estado' + (tipo ? ' ' + tipo : '');
    }

    // ---------- Pestañas ----------
    function mostrarPestana(k) {
        pestanas.forEach(function (b) {
            var activa = b.dataset.pestana === k;
            b.setAttribute('aria-selected', String(activa));
            b.tabIndex = activa ? 0 : -1;
        });
        form.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== k; });
        var b = form.querySelector('[data-pestana="' + k + '"]');
        if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    form.querySelector('[role=tablist]').addEventListener('click', function (e) {
        var b = e.target.closest('[data-pestana]');
        if (b) mostrarPestana(b.dataset.pestana);
    });
    form.querySelector('[role=tablist]').addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var i = pestanas.findIndex(function (b) { return b.getAttribute('aria-selected') === 'true'; });
        var sig = pestanas[(i + (e.key === 'ArrowRight' ? 1 : pestanas.length - 1)) % pestanas.length];
        mostrarPestana(sig.dataset.pestana);
        sig.focus();
    });

    // ---------- Guardar ----------
    function ocupado(si) {
        btnAceptar.disabled = btnAplicar.disabled = si;
        form.setAttribute('aria-busy', String(si));
    }

    function aplicarRespuesta(p) {
        st.id = p.meta.id;
        st.version = p.meta.version;
        llenar(p);
        AN.documentos.cargar(p.documentos || [], st.soloLectura);
        st.original = huella();
        actualizarSucio();
    }

    async function guardar() {
        if (st.soloLectura) return false;
        if (st.guardando) return st.guardando;
        st.guardando = (async function () {
            var errores = validarCliente();
            if (Object.keys(errores).length) {
                marcarErrores(errores);
                ponerEstado('Revisa los campos marcados.', 'error');
                return false;
            }
            marcarErrores({});
            ponerEstado('Guardando…', 'info');
            ocupado(true);
            try {
                var datos = recoger();
                var r;
                if (st.id) {
                    datos.version = st.version;
                    r = await AN.api.put(AN.api.url(AN.api.PRESUPUESTOS, { id: st.id }), datos);
                } else {
                    r = await AN.api.post(AN.api.PRESUPUESTOS, datos);
                }
                aplicarRespuesta(r.presupuesto);
                ponerEstado('Guardado correctamente', 'ok');
                if (st.alGuardar) st.alGuardar(st.id);
                return true;
            } catch (e) {
                if (e.errores && Object.keys(e.errores).length) marcarErrores(e.errores);
                ponerEstado(e.message, 'error');
                return false;
            } finally {
                ocupado(false);
            }
        })();
        try { return await st.guardando; } finally { st.guardando = null; }
    }

    async function aceptar() {
        if (st.soloLectura) { dlg.close(); return; }
        if (st.id && !sucio()) { dlg.close(); if (st.alGuardar) st.alGuardar(st.id); return; }
        if (await guardar()) dlg.close();
    }

    async function cerrar() {
        if (st.guardando || st.cargando) return;
        if (sucio()) {
            var ok = await AN.ui.confirmar({
                titulo: 'Cambios sin guardar',
                mensaje: 'Existen cambios sin guardar.\n¿Deseas cerrar?',
                aceptar: 'Cerrar sin guardar', cancelar: 'Cancelar', peligro: true
            });
            if (!ok) return;
        }
        dlg.close();
    }

    function soloLectura(si) {
        st.soloLectura = si;
        controles.forEach(function (el) { if (el.type !== 'hidden') el.disabled = si; });
        form.querySelectorAll('[data-buscar], [data-quitar]').forEach(function (b) { b.disabled = si; });
        btnAplicar.hidden = si;
        btnAceptar.textContent = si ? 'Cerrar' : 'Aceptar';
    }

    // ---------- Abrir ----------
    // op.alGuardar(id): se llama cada vez que se guarda (para refrescar y seleccionar en el catálogo)
    async function abrir(id, op) {
        op = op || {};
        st.alGuardar = op.alGuardar || null;
        st.id = id || 0;
        st.version = null;
        soloLectura(id ? !permisos['presupuestos.editar'] : !permisos['presupuestos.crear']);
        marcarErrores({});
        mostrarPestana('presupuesto');
        llenar(defectos());
        AN.documentos.cargar([], st.soloLectura);
        st.original = huella();
        actualizarSucio();
        ponerEstado(st.soloLectura && id ? 'Solo consulta: no tienes permiso para modificar presupuestos.' : '');
        if (!dlg.open) dlg.showModal();
        if (!id) { control('presupuesto.nombre').focus(); return; }

        st.cargando = true;
        ponerEstado('Cargando…', 'info');
        ocupado(true);
        try {
            var r = await AN.api.get(AN.api.url(AN.api.PRESUPUESTOS, { id: id }));
            aplicarRespuesta(r.presupuesto);
            ponerEstado(st.soloLectura ? 'Solo consulta: no tienes permiso para modificar presupuestos.' : '');
        } catch (e) {
            AN.ui.aviso(e.message, 'error');
            dlg.close();
        } finally {
            st.cargando = false;
            ocupado(false);
        }
    }

    // ---------- Eventos ----------
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    // Enter en un campo de una línea no cierra la ventana (solo el botón ACEPTAR)
    form.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    });
    form.addEventListener('input', function (e) {
        var ruta = e.target.dataset && e.target.dataset.campo;
        if (ruta === 'licitacion.fecha_inicio' || ruta === 'licitacion.dias') {
            control('licitacion.fecha_terminacion').value = AN.ui.fechaTerminacion(control('licitacion.fecha_inicio').value, Number(control('licitacion.dias').value));
        }
        if (ruta) {
            var c = form.querySelector('[data-error-de="' + ruta + '"].invalido');
            if (c) { c.classList.remove('invalido'); var s = c.querySelector('.an-error'); if (s) s.hidden = true; }
        }
        refrescarMarcas();
        if (estado.classList.contains('ok')) ponerEstado('');
        actualizarSucio();
    });
    // Al corregir un campo: la pestaña deja de marcarse si ya no tiene errores, y el aviso general se quita
    function refrescarMarcas() {
        pestanas.forEach(function (b) {
            var p = form.querySelector('[data-panel="' + b.dataset.pestana + '"]');
            b.classList.toggle('con-error', !!(p && p.querySelector('.invalido')));
        });
        if (!form.querySelector('.invalido') && estado.textContent === 'Revisa los campos marcados.') ponerEstado('');
    }
    form.addEventListener('change', actualizarSucio);

    form.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-buscar]');
        if (b && !b.disabled) {
            var item = await AN.buscador.abrir(b.dataset.buscar);
            if (!item) return;
            if (b.dataset.destino) {
                control(b.dataset.destino).value = item.id;
                textoDe(b.dataset.destino).value = item.nombre;
            }
            if (b.dataset.destinoTexto) control(b.dataset.destinoTexto).value = item.nombre;
            if (b.dataset.rellena) control(b.dataset.rellena).value = item.extra || '';
            if (b.dataset.rellenaVacio && !control(b.dataset.rellenaVacio).value.trim() && item.extra) control(b.dataset.rellenaVacio).value = item.extra;
            form.dispatchEvent(new Event('input', { bubbles: true }));
            var ruta = b.dataset.destino || b.dataset.destinoTexto;
            var c = form.querySelector('[data-error-de="' + ruta + '"]');
            if (c) { c.classList.remove('invalido'); var s = c.querySelector('.an-error'); if (s) s.hidden = true; }
            refrescarMarcas();
            return;
        }
        var q = e.target.closest('[data-quitar]');
        if (q && !q.disabled) {
            control(q.dataset.quitar).value = '';
            textoDe(q.dataset.quitar).value = '';
            actualizarSucio();
        }
    });

    btnAplicar.addEventListener('click', guardar);
    btnAceptar.addEventListener('click', aceptar);
    $('anDetalleCerrar').addEventListener('click', cerrar);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(); });   // Esc

    AN.documentos.montar({
        idActual: function () { return st.id; },
        obtenerId: async function () {
            if (st.id) return st.id;
            if (st.soloLectura) return null;
            ponerEstado('El presupuesto es nuevo: se guarda antes de subir el documento…', 'info');
            return (await guardar()) ? st.id : null;
        }
    });

    // La ventana principal pregunta antes de cerrar la pestaña del sistema si hay cambios (js/principal.js)
    window.acriHayCambios = function () { return dlg.open && sucio(); };
    window.addEventListener('beforeunload', function (e) {
        if (dlg.open && sucio()) { e.preventDefault(); e.returnValue = ''; }
    });

    AN.detalle = { abrir: abrir, abierto: function () { return dlg.open; } };
})(window.AcriNeo = window.AcriNeo || {});
