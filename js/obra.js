(function () {
    var $ = function (id) { return document.getElementById(id); };

    // Estado del documento
    var obraId = 0;              // obra_id: 0 = obra nueva sin guardar
    var sugeridoId = 0;          // presupuesto de origen
    var estatus = 'Planificacion';
    var responsables = [];       // [{ id, nombre }]
    var avance = 0;
    var editable = true;
    var cambios = false;
    var autorizaMod = null;      // { usuario, contrasena } de quien autorizó «Modificar» sin el permiso
    var imagenPendiente = null;  // imagen elegida en una obra nueva: se sube al guardar
    var permisos = (document.body.dataset.permisos || '').split(',').filter(Boolean);
    var token = (document.querySelector('meta[name="acri-token"]') || {}).content || '';

    // Estatus que permiten agregar documentos a la obra (valida_estatus_obra)
    var ABIERTOS = ['Planificacion', 'Ejecucion', 'Obra Terminada'];
    var PASOS = { 'Ejecucion': 1, 'Obra Terminada': 2, 'Finalizacion': 3 };

    function tiene(p) { return permisos.indexOf(p) >= 0 || permisos.indexOf('ADMIN_USER') >= 0; }
    function marcarCambio() { cambios = true; }
    function escapar(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }
    function dinero(v) {
        var n = parseFloat(v);
        return isNaN(n) ? '' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function numero(v) {
        var n = parseFloat(v);
        return isNaN(n) ? '' : n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
    }
    function fechaDMY(v) { return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : (v || ''); }

    // ---------- Comunicación con el servidor ----------
    function respuesta(r) {
        if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
        return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); }).then(function (j) {
            if (!j.ok) {
                var err = new Error(j.error || 'Error desconocido.');
                err.autorizar = !!j.autorizar;   // falta un permiso: lo puede autorizar otro usuario
                throw err;
            }
            return j;
        });
    }
    // Lecturas (api/obras.php)
    function pedir(q) { return fetch('api/obras.php?' + q).then(respuesta); }
    // Cambios (api/registro-obra.php): JSON o FormData
    function enviar(accion, cuerpo) {
        var esForm = cuerpo instanceof FormData;
        var h = { 'X-Acri-Token': token };
        if (!esForm) h['Content-Type'] = 'application/json';
        return fetch('api/registro-obra.php?accion=' + accion, {
            method: 'POST', headers: h, body: esForm ? cuerpo : JSON.stringify(cuerpo)
        }).then(respuesta);
    }

    // Autorización de otro usuario (Dialog225): resuelve con { usuario, contrasena } o null si se cancela
    function pedirAutorizacion(mensaje) {
        return new Promise(function (resolver) {
            var dlg = $('auDialogo'), form = $('auForm'), hecho = false;
            function terminar(v) {
                if (hecho) return;
                hecho = true;
                form.onsubmit = null;
                dlg.onclose = null;
                if (dlg.open) dlg.close();
                $('auContrasena').value = '';
                resolver(v);
            }
            $('auMensaje').textContent = mensaje + ' Puede autorizarlo otro usuario que tenga el permiso.';
            $('auUsuario').value = '';
            $('auContrasena').value = '';
            form.onsubmit = function (e) {
                e.preventDefault();
                terminar({ usuario: $('auUsuario').value.trim(), contrasena: $('auContrasena').value });
            };
            dlg.onclose = function () { terminar(null); };
            dlg.showModal();
            $('auUsuario').focus();
        });
    }
    document.querySelectorAll('[data-au-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('auDialogo').close(); });
    });

    // Ejecuta accion(autoriza); si el servidor pide autorización, la solicita y reintenta una vez
    function conAutorizacion(accion, mensaje) {
        return accion(undefined).catch(function (err) {
            if (!err.autorizar) throw err;
            return pedirAutorizacion(mensaje || err.message).then(function (a) {
                if (!a) { var c = new Error(''); c.cancelado = true; throw c; }
                return accion(a);
            });
        });
    }
    function avisarError(err) { if (!err.cancelado) alert(err.message); }

    // ---------- Diálogo de captura genérico ----------
    // cfg: { titulo, aviso, campos: [{ id, etiqueta, tipo, valor, opciones, ancho, soloLectura }],
    //        grids: [{ id, titulo, columnas: [{ id, etiqueta, tipo, opciones, calc, total, alElegir }], filas, importar }],
    //        soloLectura, acciones: [{ texto, fn }], guardar(datos) → Promise }
    // tipos de campo: text, date, number, textarea, select ([{ v, t }]) y lista (texto con sugerencias [{ t, … }])
    function formulario(cfg) {
        var dlg = $('frmDialogo'), cuerpo = $('frmCuerpo');
        var grids = (cfg.grids || []).map(function (g) {
            return { cfg: g, filas: (g.filas || []).map(function (f) { return Object.assign({}, f); }) };
        });
        var lectura = !!cfg.soloLectura;
        var nLista = 0;

        function opcionesLista(ops) {
            var id = 'frmLista' + (++nLista);
            return { id: id, html: '<datalist id="' + id + '">' + ops.map(function (o) { return '<option value="' + escapar(o.t) + '">'; }).join('') + '</datalist>' };
        }
        function control(c, valor, attrs) {
            var dis = lectura || c.soloLectura ? ' disabled' : '';
            var v = valor == null ? '' : valor;
            if (c.tipo === 'textarea') return '<textarea rows="3"' + attrs + dis + '>' + escapar(v) + '</textarea>';
            if (c.tipo === 'select') {
                return '<select' + attrs + dis + '>' + c.opciones.map(function (o) {
                    return '<option value="' + escapar(o.v) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + escapar(o.t) + '</option>';
                }).join('') + '</select>';
            }
            if (c.tipo === 'lista') {
                var l = opcionesLista(c.opciones || []);
                return '<input list="' + l.id + '" value="' + escapar(v) + '" autocomplete="off"' + attrs + dis + '>' + l.html;
            }
            var t = c.tipo === 'number' ? 'number" step="any' : (c.tipo || 'text');
            return '<input type="' + t + '" value="' + escapar(v) + '"' + attrs + dis + '>';
        }

        function pintarGrid(k) {
            var g = grids[k], cols = g.cfg.columnas;
            var cont = cuerpo.querySelector('[data-grid="' + k + '"] .tabla');
            var html = '<table><thead><tr>' + cols.map(function (c) { return '<th' + (c.ancho ? ' style="width:' + c.ancho + '"' : '') + '>' + escapar(c.etiqueta) + '</th>'; }).join('') +
                (lectura ? '' : '<th style="width:34px"></th>') + '</tr></thead><tbody>';
            html += g.filas.length ? g.filas.map(function (f, i) {
                return '<tr data-fila="' + i + '">' + cols.map(function (c) {
                    if (c.calc) return '<td class="calc" data-calc="' + c.id + '">' + dinero(c.calc(f)) + '</td>';
                    return '<td>' + control(c, f[c.id], ' data-col="' + c.id + '"') + '</td>';
                }).join('') + (lectura ? '' : '<td><button type="button" class="quitar" title="Quitar renglón">🗑</button></td>') + '</tr>';
            }).join('') : '<tr class="vacio"><td colspan="' + (cols.length + 1) + '">Sin renglones.</td></tr>';
            html += '</tbody>';
            if (cols.some(function (c) { return c.total; })) {
                html += '<tfoot><tr>' + cols.map(function (c) { return '<td data-total="' + c.id + '"></td>'; }).join('') + (lectura ? '' : '<td></td>') + '</tr></tfoot>';
            }
            cont.innerHTML = html + '</table>';
            totales(k);
        }
        function totales(k) {
            var g = grids[k];
            g.cfg.columnas.forEach(function (c) {
                var td = cuerpo.querySelector('[data-grid="' + k + '"] [data-total="' + c.id + '"]');
                if (!td || !c.total) return;
                td.textContent = dinero(g.filas.reduce(function (s, f) { return s + (parseFloat(c.calc ? c.calc(f) : f[c.id]) || 0); }, 0));
            });
        }

        $('frmTitulo').textContent = cfg.titulo;
        cuerpo.innerHTML = (cfg.aviso ? '<p class="frm-aviso">' + escapar(cfg.aviso) + '</p>' : '') +
            (cfg.campos && cfg.campos.length ? '<div class="frm-campos">' + cfg.campos.map(function (c) {
                return '<label' + (c.ancho || c.tipo === 'textarea' ? ' class="ancho"' : '') + '>' + escapar(c.etiqueta) + control(c, c.valor, ' data-campo="' + c.id + '"') + '</label>';
            }).join('') + '</div>' : '') +
            grids.map(function (g, k) {
                return '<div class="frm-grid" data-grid="' + k + '"><h4>' + escapar(g.cfg.titulo || '') +
                    (lectura ? '' : ' <button type="button" class="ob-btn" data-agregar>＋ Agregar renglón</button>') +
                    (!lectura && g.cfg.importar ? ' <button type="button" class="ob-btn" data-importar>' + escapar(g.cfg.importar.texto) + '</button>' : '') +
                    '</h4><div class="tabla"></div></div>';
            }).join('');
        grids.forEach(function (g, k) { pintarGrid(k); });

        cuerpo.oninput = cuerpo.onchange = function (e) {
            var gEl = e.target.closest('[data-grid]'), tr = e.target.closest('tr[data-fila]');
            if (!gEl || !tr || !e.target.dataset.col) return;
            var k = +gEl.dataset.grid, g = grids[k], f = g.filas[tr.dataset.fila];
            var col = g.cfg.columnas.filter(function (c) { return c.id === e.target.dataset.col; })[0];
            f[col.id] = e.target.value;
            if (col.alElegir && e.type === 'change') {
                var item = (col.opciones || []).filter(function (o) { return o.t === e.target.value; })[0];
                col.alElegir(f, item || null);
                pintarGrid(k);
                return;
            }
            g.cfg.columnas.forEach(function (c) {
                if (c.calc) tr.querySelector('[data-calc="' + c.id + '"]').textContent = dinero(c.calc(f));
            });
            totales(k);
        };
        cuerpo.onclick = function (e) {
            var gEl = e.target.closest('[data-grid]');
            if (!gEl) return;
            var k = +gEl.dataset.grid, g = grids[k];
            if (e.target.closest('[data-agregar]')) { g.filas.push({}); pintarGrid(k); return; }
            if (e.target.closest('[data-importar]')) {
                var nuevas = g.cfg.importar.fn();
                if (!nuevas.length) { alert('No hay renglones para importar.'); return; }
                g.filas = g.filas.filter(function (f) { return Object.keys(f).some(function (x) { return f[x] !== '' && f[x] != null; }); }).concat(nuevas);
                pintarGrid(k);
                return;
            }
            var q = e.target.closest('.quitar');
            if (q) { g.filas.splice(q.closest('tr').dataset.fila, 1); pintarGrid(k); }
        };

        function datos() {
            var d = {};
            cuerpo.querySelectorAll('[data-campo]').forEach(function (el) { d[el.dataset.campo] = el.value; });
            grids.forEach(function (g) { d[g.cfg.id] = g.filas; });
            return d;
        }

        $('frmAcciones').innerHTML = '';
        (cfg.acciones || []).forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'hs-btn';
            b.textContent = a.texto;
            b.onclick = function () {
                var r = a.fn(datos());
                if (r && r.then) r.then(function (cerrar) { if (cerrar !== false) dlg.close(); }).catch(avisarError);
            };
            $('frmAcciones').appendChild(b);
        });
        $('frmGuardar').hidden = lectura || !cfg.guardar;
        $('frmForm').onsubmit = function (e) {
            e.preventDefault();
            $('frmGuardar').disabled = true;
            Promise.resolve(cfg.guardar(datos())).then(function (cerrar) { if (cerrar !== false) dlg.close(); })
                .catch(avisarError)
                .finally(function () { $('frmGuardar').disabled = false; });
        };
        dlg.showModal();
    }
    document.querySelectorAll('[data-frm-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('frmDialogo').close(); });
    });

    // ---------- Pestañas del documento (TabControl1_SelectedIndexChanged: cada pestaña se consulta al abrirla) ----------
    var cargado = {};
    document.querySelectorAll('.doc-tab').forEach(function (t) {
        t.addEventListener('click', function () {
            document.querySelectorAll('.doc-tab').forEach(function (x) { x.classList.remove('activo'); });
            document.querySelectorAll('.vista').forEach(function (v) { v.classList.remove('visible'); });
            t.classList.add('activo');
            document.querySelector('.vista[data-vista="' + t.dataset.vista + '"]').classList.add('visible');
            if (obraId && !cargado[t.dataset.vista] && CARGAS[t.dataset.vista]) CARGAS[t.dataset.vista]();
        });
    });

    // ---------- Habilitar / bloquear captura (habilita_contrales) ----------
    function habilitaControles(val) {
        editable = val;
        document.querySelectorAll('.editable').forEach(function (el) { el.disabled = !val; });
        pintarResponsables();
    }

    document.querySelectorAll('.ob-datos .editable, .ob-parametros .editable').forEach(function (el) {
        el.addEventListener('input', marcarCambio);
    });

    // ---------- Abrir el presupuesto de origen (lbl_sug_id_DoubleClick) ----------
    var enPestana = window.parent !== window;
    function abrirPresupuesto() {
        if (!sugeridoId) { alert('Esta obra no está ligada a un presupuesto.'); return; }
        if (enPestana) {
            window.parent.postMessage({ tipo: 'abrir', modulo: 'Presupuestos de Obra', id: sugeridoId, titulo: 'Presupuesto · ' + ($('presProyecto').value || sugeridoId) }, location.origin);
        } else {
            window.open('presupuesto.php?id=' + encodeURIComponent(sugeridoId), '_blank');
        }
    }
    $('presId').addEventListener('click', function (e) { e.preventDefault(); });
    $('presId').addEventListener('dblclick', abrirPresupuesto);

    // ---------- Responsables de obra ----------
    function pintarResponsables() {
        var tb = $('listaResp');
        if (!responsables.length) {
            tb.innerHTML = '<tr class="vacio-fila"><td colspan="3">Sin responsables. Presiona Agregar.</td></tr>';
            return;
        }
        tb.innerHTML = responsables.map(function (r, i) {
            return '<tr data-i="' + i + '"><td class="sel-col"></td><td class="nombre">' + escapar(r.nombre) + '</td>' +
                '<td><button class="borrar" title="Quitar responsable"' + (editable ? '' : ' disabled') + '>✕</button></td></tr>';
        }).join('');
    }
    $('agregarResp').addEventListener('click', function () {
        var sel = $('responsable');
        if (!sel.value) return;
        var ya = responsables.some(function (r) { return r.id === sel.value; });
        if (ya) { alert('Ese responsable ya está agregado.'); return; }
        responsables.push({ id: sel.value, nombre: sel.options[sel.selectedIndex].text });
        marcarCambio();
        pintarResponsables();
    });
    $('listaResp').addEventListener('click', function (e) {
        if (!e.target.classList.contains('borrar') || !editable) return;
        responsables.splice(e.target.closest('tr').dataset.i, 1);
        marcarCambio();
        pintarResponsables();
    });

    // ---------- Imagen de obra (Button2 / pic_img) ----------
    // Se puede cargar en cualquier momento mientras la obra no esté Finalizada o Cancelada.
    // En una obra guardada se sube en ese momento; en una nueva, al guardar.
    var urlImagen = null;
    function puedeImagen() { return estatus !== 'Finalizacion' && estatus !== 'Cancelado'; }
    function pintarMarco() {
        var hay = !$('imgObra').hidden;
        $('imgVacio').hidden = hay;
        $('quitarImagen').hidden = !hay || !puedeImagen();
        $('examinar').disabled = !puedeImagen();
        $('marcoImagen').classList.toggle('puede', puedeImagen() && !hay);
    }
    function mostrarImagen(src) {
        $('imgObra').src = src;
        $('imgObra').hidden = !src;
        pintarMarco();
    }

    // Fotos grandes de celular: se reducen a 1600 px (JPG) para no rebasar el límite de subida
    function reducirImagen(f) {
        return new Promise(function (resolver) {
            if (f.size < 1.5 * 1024 * 1024 && f.type !== 'image/heic') { resolver(f); return; }
            var img = new Image(), url = URL.createObjectURL(f);
            img.onload = function () {
                URL.revokeObjectURL(url);
                var esc = Math.min(1, 1600 / Math.max(img.width, img.height));
                var c = document.createElement('canvas');
                c.width = Math.round(img.width * esc);
                c.height = Math.round(img.height * esc);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                c.toBlob(function (b) { resolver(b ? new File([b], (f.name || 'imagen').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f); }, 'image/jpeg', 0.85);
            };
            img.onerror = function () { URL.revokeObjectURL(url); resolver(f); };
            img.src = url;
        });
    }

    function subirImagen(f) {
        var fd = new FormData();
        fd.append('id', obraId);
        if (f) fd.append('archivo', f);
        $('marcoImagen').classList.add('subiendo');
        return enviar('imagen', fd).finally(function () { $('marcoImagen').classList.remove('subiendo'); });
    }

    function elegirImagen(f) {
        if (!f) return;
        if (!puedeImagen()) { alert('No es posible modificar una obra que su estatus es: ' + estatus); return; }
        if (!/^image\//.test(f.type)) { alert('Selecciona un archivo de imagen (jpg o png).'); return; }
        reducirImagen(f).then(function (img) {
            if (urlImagen) URL.revokeObjectURL(urlImagen);
            var anterior = $('imgObra').hidden ? '' : $('imgObra').src;
            urlImagen = URL.createObjectURL(img);
            mostrarImagen(urlImagen);
            if (!obraId) { imagenPendiente = img; marcarCambio(); return; }
            subirImagen(img).catch(function (err) {
                alert('No se pudo guardar la imagen: ' + err.message);
                mostrarImagen(anterior);
            });
        });
    }

    $('examinar').addEventListener('click', function () { $('archivoImagen').click(); });
    $('archivoImagen').addEventListener('change', function () {
        elegirImagen(this.files[0]);
        this.value = '';
    });
    $('marcoImagen').addEventListener('click', function () {
        if ($('imgObra').hidden && puedeImagen()) $('archivoImagen').click();
    });
    // Doble clic: visor de imagen (abre_imagen_visor)
    $('marcoImagen').addEventListener('dblclick', function () {
        if (!$('imgObra').hidden) window.open($('imgObra').src, '_blank');
    });
    $('marcoImagen').addEventListener('dragover', function (e) {
        if (!puedeImagen()) return;
        e.preventDefault();
        this.classList.add('arrastre');
    });
    $('marcoImagen').addEventListener('dragleave', function () { this.classList.remove('arrastre'); });
    $('marcoImagen').addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('arrastre');
        elegirImagen(e.dataTransfer.files[0]);
    });
    $('quitarImagen').addEventListener('click', function () {
        if (!confirm('¿Quitar la imagen de la obra?')) return;
        if (!obraId) { imagenPendiente = null; mostrarImagen(''); return; }
        subirImagen(null).then(function () { mostrarImagen(''); }).catch(avisarError);
    });

    // ---------- Fechas ----------
    function validarFechas() {
        if ($('fechaInicio').value && $('fechaTermino').value && $('fechaInicio').value > $('fechaTermino').value) {
            alert('La fecha de término no puede ser anterior a la fecha de inicio.');
            $('fechaTermino').value = $('fechaInicio').value;
        }
    }
    $('fechaInicio').addEventListener('change', validarFechas);
    $('fechaTermino').addEventListener('change', validarFechas);

    // ---------- Avance de obra (TrackBar1_Scroll / Button4) ----------
    function pintarAvance() {
        $('pctAvance').textContent = avance;
        $('barraAvance').style.width = avance + '%';
    }
    $('sliderAvance').addEventListener('input', function () {
        avance = parseInt(this.value, 10) || 0;
        pintarAvance();
    });
    $('actualizarAvance').addEventListener('click', function () {
        avance = parseInt($('sliderAvance').value, 10) || 0;
        pintarAvance();
        if (!requiereObra('Es necesario guardar la obra para actualizar su avance.')) return;
        enviar('avance', { id: obraId, avance: avance }).then(function (j) {
            alert('Se actualizo correctamente el avance de Obra a ' + j.avance + ' %');
        }).catch(avisarError);
    });

    // ---------- Estatus ----------
    function ponerEstatus(e) {
        estatus = e;
        $('estatus').textContent = e;
        $('estatus').className = e.replace(/ /g, '-');
        var n = PASOS[e] || 0;
        [1, 2, 3].forEach(function (i) {
            document.querySelector('.paso-' + i).classList.toggle('hecho', i <= n);
        });
        pintarMarco();
    }

    // valida_estatus_obra
    function validaEstatusObra() {
        if (ABIERTOS.indexOf(estatus) >= 0) return true;
        alert('El estatus actual de la obra no permite agregar más elementos. Actualice el estatus para poder incorporar documentos adicionales a la obra.');
        return false;
    }

    function requiereObra(msg) {
        if (obraId > 0) return true;
        alert(msg || 'Es necesario guardar la obra para continuar.');
        return false;
    }

    function avisarGuardado() {
        if (enPestana) window.parent.postMessage({ tipo: 'guardado', id: obraId }, location.origin);
    }

    // Cambio de estatus en AW (actualiza_estatus_obra); libre = Modificar Estatus (lo autoriza un administrador)
    function cambiarEstatus(nuevo, opciones) {
        opciones = opciones || {};
        if (!requiereObra('Es necesario guardar la obra para cambiar su estatus.')) return Promise.resolve();
        return conAutorizacion(function (a) {
            return enviar('estatus', { id: obraId, estatus: nuevo, libre: !!opciones.libre, autoriza: a });
        }, opciones.mensaje).then(function (j) {
            ponerEstatus(j.estatus);
            if (j.estatus === 'Obra Terminada') { avance = 99; $('sliderAvance').value = 99; pintarAvance(); }
            if (j.estatus === 'Finalizacion' || j.estatus === 'Cancelado') habilitaControles(false);
            if (j.avisos && j.avisos.length) alert(j.avisos.join('\n'));
            avisarGuardado();
        }).catch(avisarError);
    }

    var MSG_CIERRE = 'todas las ordenes que se encuentran en produccion se enviaran a Fin de Produccion, las que no se liberan a produccion ' +
        'se estaran Cancelando, No sera posible agregar mas ordenes de trabajo o materiales, ¿Deseas Continuar?';

    // cerrar_obra
    function finalizarObra() {
        if (estatus !== 'Obra Terminada') {
            alert('Para finalizar la obra, es necesario que su estatus sea Obra Terminada. Actualice el estatus para poder continuar.');
            return;
        }
        if (!confirm('Al cerrar la Obra, ' + MSG_CIERRE)) return;
        cambiarEstatus('Finalizacion', { mensaje: 'Finalizar la obra requiere el permiso «Cerrar obras».' });
    }

    // ---------- Guardar (guarda_obra / REGISTRA_OBRAS) ----------
    function guardaObra() {
        var faltan = [];
        document.querySelectorAll('[data-req]').forEach(function (el) {
            if (!el.value.trim()) faltan.push('No se ha indicado ' + el.dataset.req + '.');
        });
        if (!responsables.length) faltan.push('No se ha seleccionado un responsable de Obra.');
        if (faltan.length) {
            alert(faltan.join('\n'));
            return Promise.resolve(false);
        }
        if (obraId && !editable) { alert('Presiona Modificar para hacer cambios a la obra.'); return Promise.resolve(false); }
        var nueva = !obraId;
        return conAutorizacion(function (a) {
            return enviar('guardar', {
                id: obraId, sugerido_id: sugeridoId,
                nom_obra: $('nombreObra').value, direccion: $('direccion').value, contacto: $('contacto').value, notas: $('notas').value,
                fecha_ini: $('fechaInicio').value, fecha_fin: $('fechaTermino').value,
                responsables: responsables.map(function (r) { return r.id; }),
                gasto_administrativo: $('gasAdminObra').value, avance: avance,
                autoriza: a || autorizaMod || undefined
            });
        }, nueva ? 'Registrar la obra requiere el permiso «Registrar obras».' : 'Modificar la obra requiere el permiso «Modificar obras».').then(function (j) {
            obraId = j.id;
            ponerEstatus(j.estatus);
            cambios = false;
            autorizaMod = null;
            avisarGuardado();
            if (nueva && imagenPendiente) {
                var img = imagenPendiente;
                imagenPendiente = null;
                return subirImagen(img).then(function () { return true; }, function (err) {
                    alert('La obra se guardó, pero no la imagen: ' + err.message);
                    return true;
                });
            }
            return true;
        }).catch(function (err) { avisarError(err); return false; });
    }

    // ---------- Pestañas con listado (3 a 8) ----------
    function estado(vista, texto) {
        var s = vista.querySelector('[data-estado]');
        if (s) s.textContent = texto || '';
    }

    function celda(f, c) {
        var v = f[c[1]];
        switch (c[2]) {
            case 'dinero': return '<td class="num' + (parseFloat(v) < 0 ? ' neg' : '') + '">' + dinero(v) + '</td>';
            case 'num':    return '<td class="num">' + numero(v) + '</td>';
            case 'fecha':  return '<td class="txt">' + fechaDMY(String(v || '').substr(0, 10)) + '</td>';
        }
        return '<td class="txt" title="' + escapar(v) + '">' + escapar(v) + '</td>';
    }

    // Llena la tabla de la pestaña con las columnas de data-columnas y suma data-totales (sin los Cancelados)
    function pintarListado(vista, filas, vacio, extra) {
        var tabla = vista.querySelector('table[data-columnas]');
        var cols = JSON.parse(tabla.dataset.columnas);
        var tots = JSON.parse(tabla.dataset.totales || '[]');
        var sumas = tots.map(function () { return 0; });
        tabla.querySelector('tbody').innerHTML = filas.length ? filas.map(function (f, i) {
            if (String(f.estatus || '').trim() !== 'Cancelado') {
                tots.forEach(function (t, k) { sumas[k] += parseFloat(f[t[2]]) || 0; });
            }
            var tds = cols.map(function (c) { return celda(f, c); }).join('');
            if (extra) tds = extra(f, tds);
            return '<tr data-i="' + i + '" data-id="' + escapar(f.id) + '"' + (f.detalle && f.detalle.length ? ' data-detalle' : '') + '>' +
                '<td class="sel-col"></td>' + tds + '</tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="' + (cols.length + 1) + '">' + escapar(vacio || 'Sin registros.') + '</td></tr>';
        tots.forEach(function (t, k) { $(t[0]).textContent = dinero(sumas[k]) || '$0.00'; });
        estado(vista, filas.length ? filas.length + ' registro(s)' : '');
    }

    function cambiarColumnas(vista, columnas, totales) {
        var tabla = vista.querySelector('table');
        tabla.dataset.columnas = JSON.stringify(columnas);
        if (totales) tabla.dataset.totales = JSON.stringify(totales);
        tabla.querySelector('thead tr').innerHTML = '<th class="sel-col"></th>' +
            columnas.map(function (c) { return '<th>' + escapar(c[0]) + '</th>'; }).join('');
    }

    function vistaDe(clave) { return document.querySelector('.vista[data-vista="' + clave + '"]'); }

    function cargarListado(clave, tipo, vacio) {
        var vista = vistaDe(clave);
        if (!obraId) return;
        cargado[clave] = true;
        estado(vista, 'Consultando…');
        return pedir('accion=listado&tipo=' + tipo + '&id=' + encodeURIComponent(obraId)).then(function (j) {
            datosListado[clave] = j.filas;
            pintarListado(vista, j.filas, vacio, ADORNOS[clave]);
        }).catch(function (err) {
            cargado[clave] = false;
            estado(vista, '⚠ ' + err.message);
        });
    }
    var datosListado = {};

    // Salidas de material: Documentos (ToolStripButton23) o Detalle de artículos (ToolStripButton1)
    var SALIDAS = {
        doctos: {
            tipo: 'salidas',
            columnas: [['Folio', 'folio_microsip', 'txt'], ['OT', 'ot', 'txt'], ['Fecha', 'fecha', 'fecha'], ['Estatus', 'estatus', 'txt'],
                       ['Concepto', 'nom_concepto', 'txt'], ['Almacen', 'nom_almacen', 'txt'], ['Costo Total', 'cos_tot', 'dinero']],
            totales: [['totSalidas', 'Total salidas', 'cos_tot']]
        },
        detalle: {
            tipo: 'salidas_det',
            columnas: [['Estatus', 'estatus', 'txt'], ['Clave', 'clave_art', 'txt'], ['Nombre', 'nom_art', 'txt'], ['Uds', 'uds', 'num'],
                       ['Uni.Med', 'unid_med', 'txt'], ['Almacen', 'nom_almacen', 'txt'], ['Costo Total', 'costo_total', 'dinero']],
            totales: [['totSalidas', 'Total salidas', 'costo_total']]
        }
    };
    var modoSalidas = 'doctos';
    function cargarSalidas(modo) {
        modoSalidas = modo || modoSalidas;
        var s = SALIDAS[modoSalidas];
        cambiarColumnas(vistaDe('salidas'), s.columnas, s.totales);
        return cargarListado('salidas', s.tipo);
    }

    // Detalles visuales por pestaña
    var ADORNOS = {
        // Salida sin folio de Microsip: el estatus en rojo
        salidas: function (f, tds) {
            if (modoSalidas !== 'doctos' || String(f.folio_microsip).trim() !== '0') return tds;
            var n = 0;
            return tds.replace(/<td class="txt"/g, function (m) { return ++n === 4 ? '<td class="txt alerta"' : m; });
        }
    };

    // Exportar a Excel (exporta_excel_grid): CSV que abre Excel
    function exportar(vista, nombre) {
        var tabla = vista.querySelector('table');
        var filas = Array.prototype.map.call(tabla.querySelectorAll('tr:not(.vacio-fila)'), function (tr) {
            return Array.prototype.slice.call(tr.children, 1).map(function (td) {
                return '"' + td.textContent.replace(/"/g, '""') + '"';
            }).join(',');
        });
        if (filas.length < 2) { alert('No hay información para exportar.'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = nombre.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.csv';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    // ---------- 2-Facturacion (ToolStripButton9 + API de Easy-Glass para Microsip) ----------
    function cargarFacturacion() {
        var vista = vistaDe('facturacion');
        if (!obraId) return;
        cargado.facturacion = true;
        estado(vista, 'Consultando AW y Microsip (API de Easy-Glass)…');
        $('facDetalle').hidden = true;
        return pedir('accion=facturacion&id=' + encodeURIComponent(obraId)).then(function (j) {
            datosListado.facturacion = j.filas;
            pintarListado(vista, j.filas, 'No existen Cotizaciones asignadas a esta obra.');
            $('facAvisos').innerHTML = j.avisos.map(function (a) { return '<li>' + escapar(a) + '</li>'; }).join('');
        }).catch(function (err) {
            cargado.facturacion = false;
            estado(vista, '⚠ ' + err.message);
        });
    }

    function verDetalleFactura(f) {
        $('facDetalleTitulo').textContent = 'Documentos en Microsip · ' + f.folio + (f.cobranza ? ' · Cobranza: ' + f.cobranza : '');
        $('facDetalleFilas').innerHTML = f.detalle.map(function (d) {
            return '<tr><td>' + escapar(d.tipo) + '</td><td>' + escapar(d.folio) + '</td><td>' + fechaDMY(d.fecha) + '</td><td>' + escapar(d.estatus) +
                '</td><td class="num">' + dinero(d.importe) + '</td><td>' + escapar(d.moneda) + '</td></tr>';
        }).join('');
        $('facDetalle').hidden = false;
    }

    // asigna_cot_de_obra
    function asignarCotizacion() {
        if (!validaEstatusObra() || !requiereObra('Es necesario guardar la obra para asignar una Cotizacion.')) return;
        var fol = prompt('Ingresa el Folio de la Cotizacion (folio de Microsip o de Easy-Glass)', '');
        if (!fol || !fol.trim()) return;
        conAutorizacion(function (a) {
            return enviar('asignar_cot', { id: obraId, folio: fol.trim(), autoriza: a });
        }, 'Asignar cotizaciones requiere el permiso «Modificar obras».').then(function (j) {
            alert('Se asignó el folio ' + j.folio + (j.cliente ? ' (' + j.cliente + ')' : '') + ' a la obra.');
            cargarFacturacion();
        }).catch(avisarError);
    }

    // ---------- 4-Explosion de material: eliminar partidas (ToolStripButton16) ----------
    function eliminarExplosion(vista) {
        if (!validaEstatusObra() || !requiereObra()) return;
        var ids = Array.prototype.map.call(vista.querySelectorAll('tbody tr.sel'), function (tr) { return tr.dataset.id; });
        if (!ids.length) { alert('Selecciona las partidas a eliminar.'); return; }
        if (!confirm('¿Deseas eliminar las partidas seleccionadas ?')) return;
        conAutorizacion(function (a) {
            return enviar('eliminar_explosion', { id: obraId, partidas: ids, autoriza: a });
        }, 'Eliminar partidas requiere el permiso «Modificar obras».').then(function () {
            cargarListado('explosion', 'explosion', 'No existen datos para mostrar');
        }).catch(avisarError);
    }

    // ---------- Capturas de la obra (Dialog242, 279, 230, 275 y 274 del escritorio) ----------
    var catObra = null;
    function catalogosObra() {
        if (catObra) return Promise.resolve(catObra);
        return pedir('accion=catalogos_obra&id=' + encodeURIComponent(obraId)).then(function (j) { catObra = j; return j; });
    }
    function num(v) { return parseFloat(v) || 0; }
    function hoy() {
        var d = new Date();
        return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
    function dia(v) { return String(v || '').substr(0, 10); }
    function obraAbierta() { return ABIERTOS.indexOf(estatus) >= 0; }
    // Cambio en AW con la obra y, si hace falta, la autorización de otro usuario con «Modificar obras»
    function guardarCon(accion, cuerpo) {
        return conAutorizacion(function (a) {
            return enviar(accion, Object.assign({ id: obraId, autoriza: a }, cuerpo));
        }, 'Esta captura requiere el permiso «Modificar obras».');
    }
    function opcionesOrdenes(cat) {
        return [{ v: '', t: '(sin orden de trabajo)' }].concat(cat.ordenes.map(function (o) { return { v: o.id, t: o.folio + ' · ' + (o.descripcion || '') }; }));
    }
    function listaEmpleados(cat) { return cat.empleados.map(function (e) { return { t: e.nombre, id: e.id, sueldo: num(e.sueldo_diario) }; }); }
    function listaNombres(items) { return items.map(function (x) { return { t: x.nombre }; }); }
    // Antes de una captura nueva: obra guardada y con estatus abierto (valida_estatus_obra)
    function puedeCapturar(msg) { return validaEstatusObra() && requiereObra(msg); }

    // 3-Orden de trabajo (nuevo_orden_trabajo / Dialog242)
    function dialogoOrden(orden) {
        catalogosObra().then(function (cat) {
            var e2 = orden ? orden.estatus_2 : 'O';
            var acciones = [];
            function cambio(est, pregunta) {
                return { texto: { P: '▶ Liberar a Producción', F: '✔ Fin de Producción', C: '✕ Cancelar orden' }[est], fn: function () {
                    if (!confirm(pregunta)) return Promise.resolve(false);
                    return guardarCon('estatus_orden', { orden_id: orden.id, estatus: est }).then(function () {
                        catObra = null;
                        cargarListado('ordenes', 'ordenes', 'No existen ordenes de trabajo asignadas a esta obra');
                    });
                } };
            }
            if (orden && obraAbierta()) {
                if (e2 === 'O') acciones.push(cambio('P', '¿Liberar la orden ' + orden.folio + ' a producción?'));
                if (e2 === 'P') acciones.push(cambio('F', '¿Enviar la orden ' + orden.folio + ' a Fin de Producción?'));
                if (e2 === 'O' || e2 === 'P') acciones.push(cambio('C', '¿Cancelar la orden ' + orden.folio + '?'));
            }
            formulario({
                titulo: orden ? 'Orden de Trabajo ' + orden.folio + ' · ' + orden.estatus : 'Nueva Orden de Trabajo · ' + $('nombreObra').value.split('\n')[0],
                aviso: orden && e2 !== 'O' ? 'La orden ya se liberó a producción: solo se puede consultar.' : '',
                soloLectura: e2 !== 'O' || !obraAbierta(),
                campos: [
                    { id: 'nom_cliente', etiqueta: 'Cliente', valor: orden ? orden.nom_cliente : cat.cliente },
                    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: orden ? dia(orden.fecha) : hoy() },
                    { id: 'fecha_entrega', etiqueta: 'Fecha de entrega', tipo: 'date', valor: orden ? dia(orden.fecha_entrega) : '' },
                    { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', valor: orden ? orden.descripcion : '' }
                ],
                grids: [{
                    id: 'partidas', titulo: 'Partidas', filas: orden ? orden.partidas : [{}],
                    columnas: [
                        { id: 'clave_articulo', etiqueta: 'Clave', ancho: '110px' },
                        { id: 'descripcion', etiqueta: 'Descripción' },
                        { id: 'unidades', etiqueta: 'Uds', tipo: 'number', ancho: '80px' },
                        { id: 'um', etiqueta: 'U.M.', ancho: '80px' },
                        { id: 'precio_unitario', etiqueta: 'Precio Unit.', tipo: 'number', ancho: '110px' },
                        { id: 'importe', etiqueta: 'Importe', ancho: '110px', total: true, calc: function (f) { return num(f.unidades) * num(f.precio_unitario); } },
                        { id: 'notas_adic', etiqueta: 'Notas' }
                    ],
                    importar: { texto: '⇩ Artículos del presupuesto', fn: function () {
                        return cat.articulos.map(function (a) {
                            return { articulo_id: a.articulo_id, clave_articulo: a.clave, descripcion: a.nombre, unidades: a.uds, um: a.um, precio_unitario: a.costo_unit };
                        });
                    } }
                }],
                acciones: acciones,
                guardar: function (d) {
                    return guardarCon('guardar_orden', {
                        orden_id: orden ? orden.id : 0, nom_cliente: d.nom_cliente, fecha: d.fecha, fecha_entrega: d.fecha_entrega,
                        descripcion: d.descripcion, partidas: d.partidas
                    }).then(function (j) {
                        if (!orden) alert('Se registró la orden de trabajo folio ' + j.folio + '.');
                        catObra = null;
                        cargarListado('ordenes', 'ordenes', 'No existen ordenes de trabajo asignadas a esta obra');
                    });
                }
            });
        }).catch(avisarError);
    }

    // 2-Facturacion: cotización para facturación (nuevo_cotizacion_microsip)
    function dialogoCotizacion(f) {
        catalogosObra().then(function (cat) {
            formulario({
                titulo: f ? 'Cotización ' + f.folio : 'Nueva Cotización para Facturación',
                soloLectura: !!f,
                campos: [
                    { id: 'folio', etiqueta: 'Folio', valor: f ? f.folio : '' },
                    { id: 'nom_cliente', etiqueta: 'Cliente', valor: f ? f.cliente : cat.cliente },
                    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: f ? dia(f.fecha) : hoy() },
                    { id: 'importe', etiqueta: 'Importe', tipo: 'number', valor: f ? f.importe : '' },
                    { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', valor: '' }
                ],
                acciones: f && obraAbierta() ? [{ texto: '✕ Quitar de la obra', fn: function () {
                    if (!confirm('¿Quitar la cotización ' + f.folio + ' de esta obra?')) return Promise.resolve(false);
                    return guardarCon('quitar_cot', { docto_id: f.id }).then(cargarFacturacion);
                } }] : [],
                guardar: f ? null : function (d) { return guardarCon('guardar_cot', d).then(cargarFacturacion); }
            });
        }).catch(avisarError);
    }

    // 2-Facturacion: pago en efectivo, nota de cargo o anticipo (Dialog279)
    function dialogoCobro(f) {
        var cancelado = f && String(f.estatus).trim() === 'Cancelado';
        formulario({
            titulo: f ? f.tipo_docto + ' ' + f.folio + (cancelado ? ' · Cancelado' : '') : 'Nuevo Documento de Cobro',
            soloLectura: !!f,
            campos: [
                { id: 'tipo', etiqueta: 'Tipo', tipo: 'select', valor: f ? f.tipo : 0,
                  opciones: [{ v: 0, t: 'Pago en Efectivo' }, { v: 1, t: 'Nota de Cargo' }, { v: 2, t: 'Anticipo' }] },
                { id: 'es_microsip', etiqueta: '¿Documento de Microsip?', tipo: 'select', valor: 0, opciones: [{ v: 0, t: 'No' }, { v: 1, t: 'Sí' }] },
                { id: 'folio', etiqueta: 'Folio (vacío = automático)', valor: f ? f.folio : '' },
                { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: f ? dia(f.fecha) : hoy() },
                { id: 'importe', etiqueta: 'Importe', tipo: 'number', valor: f ? f.importe : '' },
                { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: f ? f.cliente : '' }
            ],
            acciones: f && !cancelado && obraAbierta() ? [{ texto: '✕ Cancelar documento', fn: function () {
                if (!confirm('¿Cancelar el documento ' + f.folio + '?')) return Promise.resolve(false);
                return guardarCon('cancelar_cobro', { docto_id: f.id }).then(cargarFacturacion);
            } }] : [],
            guardar: f ? null : function (d) {
                d.es_microsip = d.es_microsip === '1';
                return guardarCon('guardar_cobro', d).then(function (j) {
                    alert('Se registró el documento folio ' + j.folio + '.');
                    cargarFacturacion();
                });
            }
        });
    }

    // 4-Explosion de material: agregar artículos (Dialog230)
    var COLS_EXPLOSION = [
        { id: 'clave', etiqueta: 'Clave', ancho: '110px' },
        { id: 'nombre', etiqueta: 'Nombre' },
        { id: 'um', etiqueta: 'U.M.', ancho: '70px' },
        { id: 'uds', etiqueta: 'Uds', tipo: 'number', ancho: '80px' },
        { id: 'costo_unit', etiqueta: 'Costo Unit.', tipo: 'number', ancho: '100px' },
        { id: 'costo_tot', etiqueta: 'Costo Total', ancho: '110px', total: true, calc: function (f) { return num(f.uds) * num(f.costo_unit); } },
        { id: 'um_ml_m2', etiqueta: 'U.M. ML/M2', ancho: '80px' },
        { id: 'tipo_docto', etiqueta: 'Tipo Docto', ancho: '100px' },
        { id: 'folio', etiqueta: 'Folio', ancho: '90px' }
    ];
    function dialogoExplosion() {
        catalogosObra().then(function (cat) {
            formulario({
                titulo: 'Explosión de Material · Agregar artículos',
                grids: [{
                    id: 'partidas', titulo: 'Artículos', filas: [{}], columnas: COLS_EXPLOSION,
                    importar: { texto: '⇩ Materia prima del presupuesto', fn: function () {
                        return cat.articulos.map(function (a) {
                            return { articulo_id: a.articulo_id, clave: a.clave, nombre: a.nombre, um: a.um, uds: a.uds, costo_unit: a.costo_unit, tipo_docto: 'Presupuesto', folio: a.folio };
                        });
                    } }
                }],
                guardar: function (d) {
                    return guardarCon('agregar_explosion', { partidas: d.partidas }).then(function () {
                        cargarListado('explosion', 'explosion', 'No existen datos para mostrar');
                    });
                }
            });
        }).catch(avisarError);
    }
    // Doble clic en una partida: corregir unidades y costo (guarda_explocion_materiales_obra)
    function dialogoPartidaExplosion(f) {
        formulario({
            titulo: 'Partida de explosión · ' + (f.clave || f.nombre),
            soloLectura: !obraAbierta(),
            campos: [
                { id: 'nombre', etiqueta: 'Artículo', valor: f.nombre, soloLectura: true, ancho: true },
                { id: 'uds', etiqueta: 'Uds', tipo: 'number', valor: f.uds },
                { id: 'costo_unit', etiqueta: 'Costo Unit.', tipo: 'number', valor: f.costo_unit }
            ],
            guardar: function (d) {
                return guardarCon('actualizar_explosion', { partidas: [{ id: f.id, uds: d.uds, costo_unit: d.costo_unit }] }).then(function () {
                    alert('Se actualizo correctamente la informacion');
                    cargarListado('explosion', 'explosion', 'No existen datos para mostrar');
                });
            }
        });
    }

    // 6-Mano de obra asignada (Dialog275)
    function dialogoManoObra(mo) {
        catalogosObra().then(function (cat) {
            var cancelado = mo && mo.estatus === 'Cancelado';
            formulario({
                titulo: mo ? 'Mano de Obra · ' + fechaDMY(dia(mo.fecha)) + (cancelado ? ' · Cancelado' : '') : 'Asignar Mano de Obra',
                soloLectura: cancelado || !obraAbierta(),
                campos: [
                    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: mo ? dia(mo.fecha) : hoy() },
                    { id: 'docto_orden_obra_id', etiqueta: 'Orden de trabajo', tipo: 'select', opciones: opcionesOrdenes(cat), valor: mo ? mo.docto_orden_obra_id : '' },
                    { id: 'nom_unidad', etiqueta: 'Unidad', tipo: 'lista', opciones: listaNombres(cat.unidades), valor: mo ? mo.nom_unidad : '' },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: mo ? mo.notas : '' }
                ],
                grids: [{
                    id: 'empleados', titulo: 'Empleados', filas: mo ? mo.empleados : [{}],
                    columnas: [
                        { id: 'nombre', etiqueta: 'Empleado', tipo: 'lista', opciones: listaEmpleados(cat), alElegir: function (f, e) {
                            f.id_empleado = e ? e.id : '';
                            if (e && !num(f.costo_x_hrs)) f.costo_x_hrs = Math.round(e.sueldo / 8 * 100) / 100;   // sueldo diario / 8 h
                        } },
                        { id: 'costo_x_hrs', etiqueta: 'Costo x Hr', tipo: 'number', ancho: '100px' },
                        { id: 'hrs_trabajo', etiqueta: 'Hrs', tipo: 'number', ancho: '80px' },
                        { id: 'hrs_trabajo_real', etiqueta: 'Hrs Real', tipo: 'number', ancho: '80px' },
                        { id: 'importe', etiqueta: 'Importe', ancho: '110px', total: true, calc: function (f) { return num(f.costo_x_hrs) * num(f.hrs_trabajo); } },
                        { id: 'importe_real', etiqueta: 'Importe Real', ancho: '110px', total: true, calc: function (f) { return num(f.costo_x_hrs) * num(f.hrs_trabajo_real); } }
                    ]
                }],
                acciones: mo && !cancelado && obraAbierta() ? [{ texto: '✕ Cancelar asignación', fn: function () {
                    if (!confirm('¿Cancelar esta asignación de mano de obra?')) return Promise.resolve(false);
                    return guardarCon('cancelar_mo', { doc_id: mo.id }).then(function () { cargarListado('mano', 'mano'); });
                } }] : [],
                guardar: function (d) {
                    d.mo_id = mo ? mo.id : 0;
                    return guardarCon('guardar_mo', d).then(function () { cargarListado('mano', 'mano'); });
                }
            });
        }).catch(avisarError);
    }

    // 8-Gastos adicionales (Dialog274)
    function dialogoGasto(g) {
        catalogosObra().then(function (cat) {
            var cancelado = g && g.estatus === 'Cancelado';
            var conceptos = listaNombres(cat.conceptos_gasto);
            formulario({
                titulo: g ? 'Gasto Adicional · ' + (g.concepto || '') + (cancelado ? ' · Cancelado' : '') : 'Nuevo Gasto Adicional',
                soloLectura: cancelado || !obraAbierta(),
                campos: [
                    { id: 'concepto', etiqueta: 'Concepto', tipo: 'lista', opciones: conceptos, valor: g ? g.concepto : '' },
                    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: g ? dia(g.fecha) : hoy() },
                    { id: 'docto_orden_obra_id', etiqueta: 'Orden de trabajo', tipo: 'select', opciones: opcionesOrdenes(cat), valor: g ? g.docto_orden_obra_id : '' },
                    { id: 'nom_unidad', etiqueta: 'Unidad', tipo: 'lista', opciones: listaNombres(cat.unidades), valor: g ? g.nom_unidad : '' },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: g ? g.notas : '' }
                ],
                grids: [{
                    id: 'detalle', titulo: 'Importes', filas: g ? g.detalle : [{}],
                    columnas: [
                        { id: 'concepto', etiqueta: 'Concepto', tipo: 'lista', opciones: conceptos },
                        { id: 'imp_presupuestado', etiqueta: 'Importe presupuestado', tipo: 'number', ancho: '170px', total: true },
                        { id: 'imp_real', etiqueta: 'Importe real', tipo: 'number', ancho: '150px', total: true }
                    ]
                }, {
                    id: 'personal', titulo: 'Personal', filas: g ? g.personal : [],
                    columnas: [{ id: 'nombre', etiqueta: 'Empleado', tipo: 'lista', opciones: listaEmpleados(cat), alElegir: function (f, e) { f.id_empleado = e ? e.id : ''; } }]
                }],
                acciones: g && !cancelado && obraAbierta() ? [{ texto: '✕ Cancelar gasto', fn: function () {
                    if (!confirm('¿Cancelar este gasto adicional?')) return Promise.resolve(false);
                    return guardarCon('cancelar_gasto', { doc_id: g.id }).then(function () { cargarListado('gastos', 'gastos'); });
                } }] : [],
                guardar: function (d) {
                    d.gasto_id = g ? g.id : 0;
                    return guardarCon('guardar_gasto', d).then(function () { catObra = null; cargarListado('gastos', 'gastos'); });
                }
            });
        }).catch(avisarError);
    }

    function abrirDocumento(tipo, id, dialogo) {
        pedir('accion=documento&tipo=' + tipo + '&id=' + encodeURIComponent(obraId) + '&doc=' + encodeURIComponent(id))
            .then(function (j) { dialogo(j.documento); }).catch(avisarError);
    }

    // Doble clic en un renglón de cada pestaña
    var DOBLE_CLIC = {
        ordenes: function (f) { abrirDocumento('orden', f.id, dialogoOrden); },
        mano: function (f) { abrirDocumento('mo', f.id, dialogoManoObra); },
        gastos: function (f) { abrirDocumento('gasto', f.id, dialogoGasto); },
        explosion: dialogoPartidaExplosion,
        facturacion: function (f) {
            if (f.tipo === -1) dialogoCotizacion(f);
            else if (f.tipo >= 0 && f.tipo <= 2) dialogoCobro(f);
        }
    };

    var subAcciones = {
        'consultar': function (vista) {
            if (!requiereObra('Es necesario guardar la obra para consultar su información.')) return;
            var v = vista.dataset.vista;
            if (CARGAS[v]) CARGAS[v]();
        },
        'exportar': function () { exportar(vistaDe('salidas'), 'Materiales de Obra ' + $('nombreObra').value); },
        'nueva-cot': function () {
            if (puedeCapturar('Es necesario guardar la obra para registrar una Cotizacion para Facturacion.')) dialogoCotizacion(null);
        },
        'asignar-cot': asignarCotizacion,
        'nuevo-cobro': function () { if (puedeCapturar('Es necesario guardar la obra para registrar un documento de cobro.')) dialogoCobro(null); },
        'nueva-ot': function () {
            if (puedeCapturar('Es necesario guardar la obra para registrar una orden de trabajo.')) dialogoOrden(null);
        },
        'nueva-explosion': function () { if (puedeCapturar()) dialogoExplosion(); },
        'eliminar-explosion': eliminarExplosion,
        'nueva-mo': function () { if (puedeCapturar()) dialogoManoObra(null); },
        'nuevo-gasto': function () { if (puedeCapturar()) dialogoGasto(null); },
        'salidas-doctos':  function () { if (requiereObra()) cargarSalidas('doctos'); },
        'salidas-detalle': function () { if (requiereObra()) cargarSalidas('detalle'); }
    };

    document.querySelectorAll('.ob-listado').forEach(function (vista) {
        vista.addEventListener('dblclick', function (e) {
            var tr = e.target.closest('tbody tr[data-i]');
            var fn = DOBLE_CLIC[vista.dataset.vista];
            if (!tr || !fn || e.target.closest('a, button')) return;
            var f = (datosListado[vista.dataset.vista] || [])[tr.dataset.i];
            if (f) fn(f);
        });
    });

    document.querySelectorAll('.ob-listado').forEach(function (vista) {
        vista.addEventListener('click', function (e) {
            var b = e.target.closest('[data-sub]');
            if (b && subAcciones[b.dataset.sub]) { subAcciones[b.dataset.sub](vista); return; }
            var tr = e.target.closest('tbody tr:not(.vacio-fila)');
            if (!tr || !tr.dataset.i || e.target.closest('a, button')) return;
            tr.classList.toggle('sel');
            if (vista.dataset.vista === 'facturacion') {
                var f = (datosListado.facturacion || [])[tr.dataset.i];
                if (f && f.detalle && f.detalle.length) verDetalleFactura(f); else $('facDetalle').hidden = true;
            }
        });
    });

    // 2-Facturacion: clic derecho en un renglón → Ver / Eliminar de la obra (cotización) o Cancelar (documento de cobro)
    var menuFac = document.createElement('div');
    menuFac.className = 'menu';
    document.body.appendChild(menuFac);
    function cerrarMenuFac() { menuFac.classList.remove('abierto'); }
    document.addEventListener('click', cerrarMenuFac);
    document.addEventListener('scroll', cerrarMenuFac, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarMenuFac(); });
    vistaDe('facturacion').addEventListener('contextmenu', function (e) {
        var tr = e.target.closest('tbody tr[data-i]');
        var f = tr && (datosListado.facturacion || [])[tr.dataset.i];
        if (!f) return;
        var opciones = [];
        if (f.tipo === -1) {
            opciones.push(['Ver cotización', function () { dialogoCotizacion(f); }]);
            if (obraAbierta()) opciones.push(['🗑 Eliminar de la obra', function () {
                if (!confirm('¿Eliminar el folio ' + f.folio + ' de esta obra?')) return;
                guardarCon('quitar_cot', { docto_id: f.id }).then(cargarFacturacion).catch(avisarError);
            }]);
        } else if (f.tipo >= 0 && f.tipo <= 2) {
            opciones.push(['Ver documento', function () { dialogoCobro(f); }]);
            if (obraAbierta() && String(f.estatus).trim() !== 'Cancelado') opciones.push(['✕ Cancelar documento', function () {
                if (!confirm('¿Cancelar el documento ' + f.folio + '?')) return;
                guardarCon('cancelar_cobro', { docto_id: f.id }).then(cargarFacturacion).catch(avisarError);
            }]);
        }
        if (!opciones.length) return;
        e.preventDefault();
        menuFac.innerHTML = '';
        opciones.forEach(function (o) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = o[0];
            b.addEventListener('click', function () { cerrarMenuFac(); o[1](); });
            menuFac.appendChild(b);
        });
        menuFac.classList.add('abierto');
        menuFac.style.left = Math.min(e.clientX, window.innerWidth - menuFac.offsetWidth - 8) + 'px';
        menuFac.style.top = Math.min(e.clientY, window.innerHeight - menuFac.offsetHeight - 8) + 'px';
    });

    // ---------- 9-Adjuntos ----------
    var archivoAdjunto = null;
    function cargarAdjuntos() {
        var vista = vistaDe('adjuntos');
        if (!obraId) return;
        cargado.adjuntos = true;
        estado(vista, 'Consultando…');
        return pedir('accion=listado&tipo=adjuntos&id=' + encodeURIComponent(obraId)).then(function (j) {
            $('listaAdjuntos').innerHTML = j.filas.length ? j.filas.map(function (f) {
                return '<tr data-id="' + escapar(f.id) + '"><td class="sel-col"></td>' +
                    '<td class="txt">' + escapar(f.nombre_archivo) + '</td><td class="txt">' + escapar(f.descripcion_corta) + '</td>' +
                    '<td class="txt">' + fechaDMY(String(f.fecha_creacion || '').substr(0, 10)) + ' ' + String(f.fecha_creacion || '').substr(11, 8) + '</td>' +
                    '<td class="txt">' + escapar(f.usuario_creacion) + '</td>' +
                    '<td class="txt"><a href="api/obras.php?accion=adjunto&id=' + encodeURIComponent(f.id) + '" target="_blank" rel="noopener">Abrir</a></td>' +
                    '<td><button type="button" class="borrar-adj" title="Eliminar archivo">🗑</button></td></tr>';
            }).join('') : '<tr class="vacio-fila"><td colspan="7">No existen documentos adjuntos para mostrar.</td></tr>';
            estado(vista, j.filas.length ? j.filas.length + ' archivo(s)' : '');
        }).catch(function (err) {
            cargado.adjuntos = false;
            estado(vista, '⚠ ' + err.message);
        });
    }
    $('examinarAdjunto').addEventListener('click', function () { $('archivoAdjunto').click(); });
    $('archivoAdjunto').addEventListener('change', function () {
        archivoAdjunto = this.files[0] || null;
        $('adjNombre').value = archivoAdjunto ? archivoAdjunto.name : '';
    });
    $('adjuntar').addEventListener('click', function () {
        if (!requiereObra('Es necesario guardar el documento para que se permita adjuntar archivos.')) return;
        if (!archivoAdjunto) { alert('Selecciona el archivo a adjuntar.'); return; }
        if (!$('adjDesc').value.trim()) { alert('Ingresar una descripcion corta maximo 50 caracteres.'); return; }
        var fd = new FormData();
        fd.append('id', obraId);
        fd.append('descripcion', $('adjDesc').value.trim());
        fd.append('archivo', archivoAdjunto);
        $('adjuntar').disabled = true;
        enviar('adjuntar', fd).then(function () {
            archivoAdjunto = null;
            $('archivoAdjunto').value = '';
            $('adjNombre').value = '';
            $('adjDesc').value = '';
            cargarAdjuntos();
        }).catch(function (err) { alert('Error al adjuntar el archivo: ' + err.message); })
          .finally(function () { $('adjuntar').disabled = false; });
    });
    // EliminarArchivoToolStripMenuItem
    $('listaAdjuntos').addEventListener('click', function (e) {
        var b = e.target.closest('.borrar-adj');
        if (!b || !confirm('Deseas eliminar el archivo seleccionado')) return;
        var archivo = b.closest('tr').dataset.id;
        conAutorizacion(function (a) {
            return enviar('eliminar_adjunto', { id: obraId, archivo: archivo, autoriza: a });
        }, 'Eliminar archivos requiere el permiso «Modificar obras».').then(cargarAdjuntos).catch(avisarError);
    });

    // ---------- 12-HubSpot / Easy-Glass ----------
    function pintarDatos(dl, pares) {
        dl.innerHTML = pares.filter(function (p) { return p[1] !== '' && p[1] != null; }).map(function (p) {
            return '<dt>' + escapar(p[0]) + '</dt><dd>' + escapar(p[1]) + '</dd>';
        }).join('') || '<dt>—</dt>';
    }

    function cargarRelacionados() {
        if (!obraId) {
            $('relAvisos').innerHTML = '<li>Abre una obra guardada para ver su negocio de HubSpot y sus folios de Easy-Glass.</li>';
            return;
        }
        cargado.relacionados = true;
        $('relAvisos').innerHTML = '<li>Consultando AW, Easy-Glass y HubSpot…</li>';
        $('relFolios').innerHTML = '<tr class="vacio-fila"><td colspan="11">Cargando…</td></tr>';
        return pedir('accion=relacionados&id=' + encodeURIComponent(obraId)).then(function (j) {
            var p = j.presupuesto, d = j.deal;
            pintarDatos($('relPresupuesto'), p ? [['Id', p.docto_sugerido_obra_id], ['Folio', p.folio], ['Cliente', p.cliente], ['Proyecto', p.proyecto], ['Negocio HS', p.id_hs]] : []);
            pintarDatos($('relDeal'), d ? [['Id', d.id], ['Nombre', d.nombre], ['Etapa', d.etapa], ['Monto', d.monto ? dinero(d.monto) : ''],
                                           ['Propietario', d.propietario], ['Creado', fechaDMY(d.creado)], ['Cierre', fechaDMY(d.cierre)]] : []);
            $('relDealLink').hidden = !j.deal_url;
            if (j.deal_url) $('relDealLink').href = j.deal_url;

            $('relAvisos').innerHTML = j.avisos.map(function (a) { return '<li>' + escapar(a) + '</li>'; }).join('');

            var total = 0;
            $('relFolios').innerHTML = j.folios.length ? j.folios.map(function (f) {
                total += parseFloat(f.importe_con_iva) || 0;
                return '<tr><td class="sel-col"></td>' +
                    '<td class="txt">' + escapar(f.folio) + '</td>' +
                    '<td class="txt">' + escapar(f.tipo) + '</td>' +
                    '<td class="txt">' + fechaDMY(f.fecha) + '</td>' +
                    '<td class="txt" title="' + escapar(f.nom_cliente) + '">' + escapar(f.nom_cliente) + '</td>' +
                    '<td class="txt" title="' + escapar(f.proyecto) + '">' + escapar(f.proyecto) + '</td>' +
                    '<td class="txt">' + escapar(f.vendedor) + '</td>' +
                    '<td class="txt">' + escapar(f.estatus) + '</td>' +
                    '<td class="txt">' + escapar(f.moneda) + '</td>' +
                    '<td class="num">' + dinero(f.importe_sin_iva) + '</td>' +
                    '<td class="num">' + dinero(f.importe_con_iva) + '</td></tr>';
            }).join('') : '<tr class="vacio-fila"><td colspan="11">Sin folios de Easy-Glass.</td></tr>';
            $('relCuenta').textContent = j.folios.length;
            $('relTotal').textContent = dinero(total) || '$0.00';
        }).catch(function (err) {
            cargado.relacionados = false;
            $('relAvisos').innerHTML = '<li>' + escapar(err.message) + '</li>';
            $('relFolios').innerHTML = '<tr class="vacio-fila"><td colspan="11">No se pudo consultar.</td></tr>';
        });
    }
    $('actualizarRel').addEventListener('click', cargarRelacionados);

    // ---------- 13-Conceptos/Tareas: los mismos del presupuesto (js/conceptos-tareas.js) ----------
    // Cada cambio se guarda al momento en conceptos_tareas (api/tareas.php); si una tarea tiene avance,
    // el avance de la obra se calcula con el de sus tareas.
    var ctPres = null;   // presupuesto de la obra: { datos, proyecto, ubicacion, fecha }
    var ctCola = Promise.resolve();
    var ct = AcriTareas({
        datos: function () { return ctPres ? ctPres.datos : { mp: [], mo: [], go: [] }; },
        contexto: function () { return ctPres || {}; },
        soloLectura: function () { return !ctPres || estatus === 'Finalizacion' || estatus === 'Cancelado'; },
        avisoSoloLectura: function () {
            alert(!ctPres ? 'La obra no está ligada a un presupuesto de obra.' : 'No es posible modificar una obra que su estatus es: ' + estatus);
        },
        visible: function () { return vistaDe('conceptos').classList.contains('visible'); },
        carpeta: function () { return 'P' + sugeridoId; },
        alCambiar: function () { ctCola = ctCola.then(guardarTareas); }
    });

    function guardarTareas() {
        $('ctEstado').textContent = 'Guardando…';
        return fetch('api/tareas.php?accion=guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Acri-Token': token },
            body: JSON.stringify({ presupuesto_id: sugeridoId, tareas: ct.exportar().tareas })
        }).then(respuesta).then(function (j) {
            $('ctEstado').textContent = 'Guardado · avance de las tareas: ' + j.avance + ' %';
            if (j.avance_obra) { avance = j.avance; $('sliderAvance').value = avance; pintarAvance(); }
        }).catch(function (err) {
            $('ctEstado').textContent = '⚠ ' + err.message;
            alert('No se guardaron los conceptos/tareas: ' + err.message);
        });
    }

    function cargarConceptos() {
        if (!obraId) return;
        cargado.conceptos = true;
        if (!sugeridoId) {
            ctPres = null;
            ct.cargar([]);
            ct.render();
            $('ctEstado').textContent = 'La obra no está ligada a un presupuesto de obra.';
            return;
        }
        $('ctEstado').textContent = 'Consultando…';
        return pedir('accion=presupuesto&id=' + encodeURIComponent(sugeridoId)).then(function (j) {
            var p = j.presupuesto;
            ctPres = { datos: AcriTareas.datosDePresupuesto(p), proyecto: p.proyecto, ubicacion: p.ubicacion, fecha: dia(p.fecha) };
            ct.aviso(p.aviso_descripciones || '');
            ct.cargar(p.tareas || []);
            ct.render();
            ct.contarAdjuntos();
            $('ctEstado').textContent = p.aviso_tareas ? '⚠ ' + p.aviso_tareas
                : 'Presupuesto folio ' + p.folio + ' · doble clic en un concepto/tarea para verlo; Modificar para capturar fechas, responsable y avance.';
        }).catch(function (err) {
            cargado.conceptos = false;
            $('ctEstado').textContent = '⚠ ' + err.message;
        });
    }
    $('actualizarCt').addEventListener('click', function () { if (requiereObra()) cargarConceptos(); });
    $('abrirPresupuesto').addEventListener('click', abrirPresupuesto);

    // Qué se consulta al abrir cada pestaña
    var CARGAS = {
        facturacion: cargarFacturacion,
        ordenes:     function () { return cargarListado('ordenes', 'ordenes', 'No existen ordenes de trabajo asignadas a esta obra'); },
        explosion:   function () { return cargarListado('explosion', 'explosion', 'No existen datos para mostrar'); },
        salidas:     function () { return cargarSalidas(); },
        mano:        function () { return cargarListado('mano', 'mano'); },
        consumos:    function () { return cargarListado('consumos', 'consumos'); },
        gastos:      function () { return cargarListado('gastos', 'gastos'); },
        adjuntos:    cargarAdjuntos,
        relacionados: cargarRelacionados,
        conceptos:   cargarConceptos
    };

    // ---------- Barra de herramientas ----------
    function cerrarVentana() {
        if (enPestana) {
            window.parent.postMessage({ tipo: 'cerrar' }, location.origin);
            return;
        }
        window.close();
        setTimeout(function () { location.href = 'principal.php'; }, 200);
    }

    // La pestaña de la pantalla principal consulta esto antes de cerrar
    window.acriHayCambios = function () { return cambios; };

    // El nombre de la obra se muestra en la pestaña
    if (enPestana) {
        $('nombreObra').addEventListener('change', function () {
            var n = this.value.trim().split('\n')[0];
            window.parent.postMessage({ tipo: 'titulo', texto: n ? 'Obra · ' + n : 'Registro de Obra' }, location.origin);
        });
    }

    // Menú desplegable de estatus
    document.querySelectorAll('.tb-drop > .tb').forEach(function (b) {
        b.addEventListener('click', function (e) {
            e.stopPropagation();
            b.parentElement.classList.toggle('abierto');
        });
    });
    document.addEventListener('click', function () {
        document.querySelectorAll('.tb-drop').forEach(function (d) { d.classList.remove('abierto'); });
    });
    // ToolStripButton41: cambiar el estatus a mano lo autoriza un administrador
    document.querySelectorAll('[data-estatus]').forEach(function (b) {
        b.addEventListener('click', function () {
            var e = b.dataset.estatus;
            if (e === estatus) return;
            if (estatus === 'Finalizacion') { alert('No es posible modificar una obra que su estatus es: Finalizacion'); return; }
            if (!confirm('¿Cambiar el estatus de la obra de «' + estatus + '» a «' + e + '»?')) return;
            cambiarEstatus(e, { libre: true, mensaje: 'No tiene permiso para modificar el estatus de una Obra.' });
        });
    });

    // tool_modificar: requiere MODIFICAR_OBRA o que otro usuario lo autorice
    function modificar() {
        if (estatus === 'Finalizacion') { alert('No es posible modificar una obra que su estatus es: Finalizacion'); return; }
        if (estatus === 'Cancelado') { alert('No es posible modificar una obra que su estatus es: Cancelado'); return; }
        if (!obraId || tiene('MODIFICAR_OBRA')) { habilitaControles(true); return; }
        pedirAutorizacion('Modificar la obra requiere el permiso «Modificar obras».').then(function (a) {
            if (!a) return;
            enviar('autorizar', { permiso: 'MODIFICAR_OBRA', autoriza: a }).then(function () {
                autorizaMod = a;
                habilitaControles(true);
            }).catch(avisarError);
        });
    }

    var acciones = {
        'guardar': function () { guardaObra().then(function (ok) { if (ok) habilitaControles(false); }); },
        'guardar-cerrar': function () { guardaObra().then(function (ok) { if (ok) cerrarVentana(); }); },
        'imprimir': function () { window.print(); },
        'ejecucion': function () {
            if (estatus !== 'Planificacion') {
                alert('Para actualizar el estatus de la obra, es necesario que su estatus sea Planificacion. Actualice el estatus para poder continuar.');
                return;
            }
            cambiarEstatus('Ejecucion');
        },
        'terminada': function () {
            if (estatus !== 'Ejecucion') {
                alert('Para actualizar el estatus de la obra, es necesario que su estatus sea Ejecucion. Actualice el estatus para poder continuar.');
                return;
            }
            if (confirm('¿Marcar la obra como Obra Terminada?')) cambiarEstatus('Obra Terminada');
        },
        'finalizar': finalizarObra,
        'modificar': modificar,
        'cancelar': function () {
            if (estatus === 'Finalizacion' || estatus === 'Cancelado') { alert('No es posible modificar una obra que su estatus es: ' + estatus); return; }
            if (!confirm('Al Cancelar la Obra, ' + MSG_CIERRE)) return;
            cambiarEstatus('Cancelado', { mensaje: 'Cancelar la obra requiere el permiso «Cerrar obras».' });
        },
        'cerrar': function () {
            if (!cambios || confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) {
                cambios = false;
                cerrarVentana();
            }
        }
    };
    Object.keys(acciones).forEach(function (a) {
        var b = document.querySelector('.tb[data-accion="' + a + '"]');
        if (b) b.addEventListener('click', acciones[a]);
    });

    window.addEventListener('beforeunload', function (e) {
        if (cambios) { e.preventDefault(); e.returnValue = ''; }
    });

    // ---------- Datos de AW-Management ----------
    function llenarSelect(sel, items, texto) {
        sel.innerHTML = items.length
            ? items.map(function (it) { return '<option value="' + escapar(it.id) + '">' + escapar(it[texto]) + '</option>'; }).join('')
            : '<option value="">(sin registros)</option>';
    }

    function cargarCatalogos() {
        return pedir('accion=catalogos').then(function (j) {
            llenarSelect($('responsable'), j.responsables, 'nombre');
            llenarSelect($('conGasOper'), j.conceptos_gas_oper, 'descripcion');
        }).catch(function (err) {
            $('responsable').innerHTML = '<option value="">(no se pudo cargar)</option>';
            $('conGasOper').innerHTML = '<option value="">(no se pudo cargar)</option>';
            alert('No se pudieron cargar los catálogos: ' + err.message);
        });
    }

    function cargarObra(id) {
        return pedir('accion=obra&id=' + encodeURIComponent(id)).then(function (j) {
            var o = j.obra;
            obraId = parseInt(o.obra_id, 10) || 0;
            sugeridoId = parseInt(o.sugerido_id, 10) || 0;
            cargado = {};
            catObra = null;
            $('presId').textContent = sugeridoId;
            $('presFolio').value = o.folio || '';
            $('presProyecto').value = o.proyecto || '';
            $('nombreObra').value = o.nom_obra || '';
            $('direccion').value = o.direccion || '';
            $('contacto').value = o.contacto || '';
            $('notas').value = o.notas || '';
            $('fechaInicio').value = String(o.fecha_ini || '').substr(0, 10);
            $('fechaTermino').value = String(o.fecha_fin || '').substr(0, 10);
            $('gasAdminObra').value = o.gasto_administrativo || 0;
            avance = Math.round(parseFloat(o.avance_obra) || 0);
            $('sliderAvance').value = avance;
            pintarAvance();
            responsables = o.responsables.map(function (r) { return { id: String(r.vendedor_obra_id), nombre: r.nombre || ('#' + r.vendedor_obra_id) }; });
            ponerEstatus(o.estatus || 'Planificacion');
            mostrarImagen(o.tiene_imagen == 1 ? 'api/obras.php?accion=imagen&id=' + encodeURIComponent(obraId) + '&v=' + Date.now() : '');
            // Igual que en escritorio: se abre en consulta; "Modificar" habilita la captura
            habilitaControles(false);
            cambios = false;
            if (enPestana && o.nom_obra) {
                window.parent.postMessage({ tipo: 'titulo', texto: 'Obra · ' + o.nom_obra.split('\n')[0] }, location.origin);
            }
            // Si ya hay una pestaña con listado abierta, se consulta
            var activa = document.querySelector('.doc-tab.activo');
            if (activa && CARGAS[activa.dataset.vista]) CARGAS[activa.dataset.vista]();
        }).catch(function (err) {
            alert('No se pudo abrir la obra: ' + err.message);
        });
    }

    pintarResponsables();
    pintarAvance();
    ponerEstatus(estatus);

    var idInicial = parseInt(document.body.dataset.obra, 10) || 0;
    cargarCatalogos().then(function () { if (idInicial) return cargarObra(idInicial); });
})();
