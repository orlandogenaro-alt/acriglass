// Motor de las pantallas tipo catálogo (Bases de datos, APIs y servicios).
// Cada página llama a Catalogo({ columnas, formulario, acciones, alCargar }).
window.Catalogo = function (cfg) {
    var $ = function (id) { return document.getElementById(id); };
    var cuerpo = document.body;
    var api = cuerpo.dataset.api;
    var token = document.querySelector('meta[name="acri-token"]').content;
    var claveVistas = 'acri_vistas_' + cuerpo.dataset.catalogo + '_' + cuerpo.dataset.usuario;

    var filas = [];          // lo que regresó el servidor
    var catalogos = {};      // datos auxiliares (motores, autenticación…)
    var seleccion = null;    // clave de la fila seleccionada

    // ================= Utilidades =================
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function chip(texto, clase, titulo) {
        return '<span class="chip ' + (clase || '') + '"' + (titulo ? ' title="' + esc(titulo) + '"' : '') + '>' + esc(texto) + '</span>';
    }
    function fechaCorta(f) {
        if (!f) return '';
        var p = f.split(/[- :]/);
        return p[2] + '/' + p[1] + ' ' + p[3] + ':' + p[4];
    }
    // Columna estándar con el resultado de la última prueba
    function chipPrueba(p) {
        if (!p) return '<span class="c-prueba">—</span>';
        return '<span class="c-prueba">' + chip(p.ok ? 'OK' : 'Error', p.ok ? 'ok' : 'error', p.mensaje) +
            '<small>' + (p.ms ? p.ms + ' ms · ' : '') + fechaCorta(p.fecha) + '</small></span>';
    }
    function mensaje(texto, tipo) {
        var m = $('mensaje');
        m.textContent = texto || '';
        m.className = 'c-mensaje ' + (tipo || '');
    }

    function pedir(accion, datos) {
        var op = { method: datos ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (datos) {
            op.headers['Content-Type'] = 'application/json';
            op.body = JSON.stringify(datos);
        }
        return fetch(api + '?accion=' + accion, op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Error desconocido.');
            return j;
        });
    }

    function recibir(j) {
        filas = j.filas || [];
        Object.keys(j).forEach(function (k) { if (k !== 'filas' && k !== 'ok') catalogos[k] = j[k]; });
        if (seleccion && !filas.some(function (f) { return f.clave === seleccion; })) seleccion = null;
        pintar();
        if (cfg.alCargar) cfg.alCargar(filas);
    }

    // ================= Vistas (guardadas en este navegador) =================
    function leerVistas() {
        try {
            var v = JSON.parse(localStorage.getItem(claveVistas));
            if (v && v.lista && v.lista.Default) return v;
        } catch (e) {}
        return { activa: 'Default', lista: { Default: { ocultas: [] } } };
    }
    var vistas = leerVistas();
    function guardarVistas() { try { localStorage.setItem(claveVistas, JSON.stringify(vistas)); } catch (e) {} }
    function vistaActual() { return vistas.lista[vistas.activa] || vistas.lista.Default; }

    function pintarVistas() {
        $('vistas').innerHTML = Object.keys(vistas.lista).map(function (n) {
            return '<button class="c-vista' + (n === vistas.activa ? ' activa' : '') + '" data-vista="' + esc(n) + '">' + esc(n) + '</button>';
        }).join('') + '<button class="c-vista nueva" data-vista="+" title="Nueva vista">+</button>';

        $('menuVistas').innerHTML = Object.keys(vistas.lista).map(function (n) {
            return '<button data-vista="' + esc(n) + '" class="' + (n === vistas.activa ? 'marcada' : 'sin-marca') + '">' + esc(n) + '</button>';
        }).join('') + '<div class="sep"></div>' +
            '<button data-vista="+" class="sin-marca">Nueva vista…</button>' +
            (vistas.activa !== 'Default'
                ? '<button data-vista-accion="renombrar" class="sin-marca">Renombrar vista actual…</button>' +
                  '<button data-vista-accion="eliminar" class="sin-marca">Eliminar vista actual</button>'
                : '');
    }

    function usarVista(n) {
        if (n === '+') {
            var nombre = (prompt('Nombre de la nueva vista (copia las columnas de la vista actual):') || '').trim();
            if (!nombre) return;
            if (vistas.lista[nombre]) { alert('Ya existe una vista con ese nombre.'); return; }
            vistas.lista[nombre] = { ocultas: vistaActual().ocultas.slice() };
            n = nombre;
        }
        vistas.activa = n;
        guardarVistas();
        pintarVistas();
        pintar();
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-vista]');
        if (b) { usarVista(b.dataset.vista); cerrarMenus(); return; }
        var a = e.target.closest('[data-vista-accion]');
        if (a) {
            var actual = vistas.activa;
            if (a.dataset.vistaAccion === 'eliminar' && confirm('¿Eliminar la vista "' + actual + '"?')) {
                delete vistas.lista[actual];
                vistas.activa = 'Default';
            }
            if (a.dataset.vistaAccion === 'renombrar') {
                var nuevo = (prompt('Nuevo nombre de la vista:', actual) || '').trim();
                if (nuevo && nuevo !== actual && !vistas.lista[nuevo]) {
                    vistas.lista[nuevo] = vistas.lista[actual];
                    delete vistas.lista[actual];
                    vistas.activa = nuevo;
                }
            }
            guardarVistas(); pintarVistas(); pintar(); cerrarMenus();
        }
    });

    // ================= Columnas =================
    function columnasVisibles() {
        var ocultas = vistaActual().ocultas;
        return cfg.columnas.filter(function (c) { return c.fija || ocultas.indexOf(c.id) < 0; });
    }

    function pintarMenuColumnas() {
        var ocultas = vistaActual().ocultas;
        $('menuColumnas').innerHTML = cfg.columnas.map(function (c) {
            return '<label><input type="checkbox" data-col="' + c.id + '"' + (ocultas.indexOf(c.id) < 0 ? ' checked' : '') +
                (c.fija ? ' disabled' : '') + '> ' + esc(c.titulo) + '</label>';
        }).join('');
    }
    $('menuColumnas').addEventListener('change', function (e) {
        var id = e.target.dataset.col;
        var ocultas = vistaActual().ocultas;
        var i = ocultas.indexOf(id);
        if (e.target.checked && i >= 0) ocultas.splice(i, 1);
        if (!e.target.checked && i < 0) ocultas.push(id);
        guardarVistas();
        pintar();
    });

    // ================= Menús desplegables =================
    function cerrarMenus() { document.querySelectorAll('.c-drop.abierto').forEach(function (d) { d.classList.remove('abierto'); }); }
    ['btnColumnas', 'btnVistas'].forEach(function (id) {
        $(id).addEventListener('click', function (e) {
            e.stopPropagation();
            var d = this.parentElement, abierto = d.classList.contains('abierto');
            cerrarMenus();
            if (!abierto) {
                if (id === 'btnColumnas') pintarMenuColumnas();
                d.classList.add('abierto');
            }
        });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.c-menu')) cerrarMenus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenus(); });

    // ================= Tabla =================
    function textoFila(f) {
        return cfg.columnas.map(function (c) { return c.texto ? c.texto(f) : (f[c.id] == null ? '' : f[c.id]); }).join(' ').toLowerCase();
    }

    function pintar() {
        var cols = columnasVisibles();
        $('encabezado').innerHTML = cols.map(function (c) {
            return '<th class="' + (c.clase || '') + '">' + esc(c.titulo) + '</th>';
        }).join('');

        var q = $('localizar').value.trim().toLowerCase();
        var visibles = filas.filter(function (f) { return !q || textoFila(f).indexOf(q) >= 0; });
        $('registros').textContent = visibles.length + (visibles.length === 1 ? ' registro' : ' registros');

        if (!visibles.length) {
            $('filas').innerHTML = '<tr class="c-vacio"><td colspan="' + cols.length + '">' +
                (filas.length ? 'Nada coincide con la búsqueda.' : 'Sin registros.') + '</td></tr>';
            return;
        }
        $('filas').innerHTML = visibles.map(function (f) {
            var clases = (f.clave === seleccion ? 'sel ' : '') + (f.activa === false ? 'inactiva' : '');
            return '<tr data-clave="' + esc(f.clave) + '" class="' + clases + '">' + cols.map(function (c) {
                var v = c.html ? c.html(f, { esc: esc, chip: chip, prueba: chipPrueba }) : esc(f[c.id]);
                var titulo = c.titulo_celda ? ' title="' + esc(c.titulo_celda(f)) + '"' : '';
                return '<td class="' + (c.clase || '') + '"' + titulo + '>' + v + '</td>';
            }).join('') + '</tr>';
        }).join('');
    }

    $('localizar').addEventListener('input', pintar);
    $('filas').addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (!tr) return;
        seleccion = tr.dataset.clave;
        document.querySelectorAll('#filas tr.sel').forEach(function (t) { t.classList.remove('sel'); });
        tr.classList.add('sel');
    });
    $('filas').addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-clave]');
        if (tr) abrirFormulario(filaPorClave(tr.dataset.clave));
    });

    function filaPorClave(clave) { return filas.filter(function (f) { return f.clave === clave; })[0] || null; }
    function seleccionada() {
        var f = seleccion && filaPorClave(seleccion);
        if (!f) alert('Selecciona primero un renglón de la lista.');
        return f;
    }

    // ================= Formulario =================
    var dlg = $('dialogo');
    var editando = null;   // fila en edición (null = nueva)

    function valoresFormulario() {
        var v = {};
        $('campos').querySelectorAll('[name]').forEach(function (el) {
            v[el.name] = el.type === 'checkbox' ? el.checked : el.value;
        });
        return v;
    }

    function pintarCampos(valores) {
        var def = cfg.formulario(editando, valores, catalogos);
        $('campos').innerHTML = def.campos.filter(function (c) { return c.visible !== false; }).map(function (c) {
            var val = valores[c.id] == null ? '' : valores[c.id];
            var attrs = ' name="' + c.id + '"' + (c.soloLectura ? ' readonly' : '') + (c.placeholder ? ' placeholder="' + esc(c.placeholder) + '"' : '');
            var control;
            if (c.tipo === 'select') {
                control = '<select' + attrs + '>' + Object.keys(c.opciones).map(function (k) {
                    return '<option value="' + esc(k) + '"' + (String(val) === k ? ' selected' : '') + '>' + esc(c.opciones[k]) + '</option>';
                }).join('') + '</select>';
            } else if (c.tipo === 'textarea') {
                control = '<textarea' + attrs + '>' + esc(val) + '</textarea>';
            } else if (c.tipo === 'check') {
                return '<label class="c-campo check completo"><input type="checkbox"' + attrs + (val ? ' checked' : '') + '> ' + esc(c.etiqueta) + '</label>';
            } else {
                control = '<input type="' + (c.tipo || 'text') + '"' + attrs + ' value="' + esc(val) + '"' +
                    (c.tipo === 'password' ? ' autocomplete="new-password"' : ' autocomplete="off"') + '>';
            }
            return '<label class="c-campo' + (c.completo ? ' completo' : '') + '"><span>' + esc(c.etiqueta) + '</span>' + control +
                (c.ayuda ? '<small>' + esc(c.ayuda) + '</small>' : '') + '</label>';
        }).join('');
        return def;
    }

    function abrirFormulario(fila) {
        editando = fila;
        var valores = cfg.valoresIniciales(fila, catalogos);
        var def = pintarCampos(valores);
        $('dlgTitulo').textContent = def.titulo;
        $('dlgEliminar').hidden = !fila || fila.sistema;
        $('dlgProbar').hidden = !cfg.probarFormulario;
        $('dlgResultado').textContent = '';
        $('dlgResultado').className = 'c-resultado';
        dlg.showModal();
        var primero = $('campos').querySelector('input:not([readonly]), select, textarea');
        if (primero) primero.focus();
    }

    // Los campos que dependen de otros (motor, autenticación) se redibujan conservando lo capturado
    $('campos').addEventListener('change', function (e) {
        if (e.target.dataset.redibuja === undefined && !(cfg.redibujanCon || []).includes(e.target.name)) return;
        pintarCampos(valoresFormulario());
    });

    function resultadoDialogo(texto, ok) {
        $('dlgResultado').textContent = texto;
        $('dlgResultado').className = 'c-resultado ' + (ok ? 'ok' : 'error');
    }

    function ocupado(boton, si) { boton.disabled = si; }

    $('formulario').addEventListener('submit', function (e) {
        e.preventDefault();
        var datos = valoresFormulario();
        datos.nuevo = !editando;
        if (editando) datos.clave = editando.clave;
        ocupado($('dlgGuardar'), true);
        pedir('guardar', datos).then(function (j) {
            seleccion = datos.clave.toUpperCase();
            recibir(j);
            dlg.close();
            mensaje('Se guardó ' + seleccion + '.', 'ok');
        }).catch(function (err) { resultadoDialogo(err.message, false); })
          .finally(function () { ocupado($('dlgGuardar'), false); });
    });

    $('dlgCancelar').addEventListener('click', function () { dlg.close(); });

    $('dlgEliminar').addEventListener('click', function () {
        if (!editando || !confirm('¿Eliminar ' + editando.clave + '? Esta acción no se puede deshacer.')) return;
        pedir('eliminar', { clave: editando.clave }).then(function (j) {
            recibir(j);
            dlg.close();
            mensaje('Se eliminó ' + editando.clave + '.', 'ok');
        }).catch(function (err) { resultadoDialogo(err.message, false); });
    });

    $('dlgProbar').addEventListener('click', function () {
        var datos = valoresFormulario();
        if (editando) datos.clave = editando.clave;
        var b = this;
        ocupado(b, true);
        resultadoDialogo('Probando…', true);
        cfg.probarFormulario(datos, pedir).then(function (p) {
            resultadoDialogo((p.ok ? '✔ ' : '✖ ') + p.mensaje + (p.ms ? ' (' + p.ms + ' ms)' : ''), p.ok);
        }).catch(function (err) { resultadoDialogo(err.message, false); })
          .finally(function () { ocupado(b, false); });
    });

    // ================= Botones laterales =================
    function cargar(msg) {
        mensaje(msg || '', 'info');
        return pedir('listar').then(function (j) { recibir(j); if (msg) mensaje(''); })
            .catch(function (err) { mensaje(err.message, 'error'); });
    }

    var acciones = Object.assign({
        agregar: function () { abrirFormulario(null); },
        refrescar: function () { return cargar('Actualizando…'); },
        activar: function () {
            var f = seleccionada();
            if (!f) return;
            return pedir('activar', { clave: f.clave }).then(function (j) {
                recibir(j);
                mensaje(f.clave + (f.activa ? ' quedó desactivada.' : ' quedó activa.'), 'ok');
            });
        }
    }, cfg.acciones || {});

    document.querySelectorAll('.c-accion[data-accion]').forEach(function (b) {
        b.addEventListener('click', function () {
            var fn = acciones[b.dataset.accion];
            if (!fn) return;
            var r = fn({ seleccionada: seleccionada, pedir: pedir, recibir: recibir, mensaje: mensaje });
            if (r && r.then) {
                b.disabled = true;
                r.catch(function (err) { mensaje(err.message, 'error'); }).finally(function () { b.disabled = false; });
            }
        });
    });

    pintarVistas();
    pintar();
    cargar();
};
