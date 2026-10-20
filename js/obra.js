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
            // El servidor dice qué permiso falta (como VB, cada botón pide el suyo)
            return pedirAutorizacion(err.message || mensaje).then(function (a) {
                if (!a) { var c = new Error(''); c.cancelado = true; throw c; }
                return accion(a);
            });
        });
    }
    function avisarError(err) { if (!err.cancelado) alert(err.message); }

    // ---------- Ayudas de los documentos de la obra ----------
    // Aviso breve que se quita solo («Se guardó correctamente»); se muestra sobre el diálogo abierto
    function notificar(texto, tipo) {
        var abiertos = document.querySelectorAll('dialog[open]');
        var host = abiertos.length ? abiertos[abiertos.length - 1] : document.body;
        var t = document.createElement('div');
        t.className = 'aviso-flot' + (tipo ? ' ' + tipo : '');
        t.setAttribute('role', 'status');
        t.textContent = texto;
        host.appendChild(t);
        setTimeout(function () { t.classList.add('fuera'); }, 2600);
        setTimeout(function () { t.remove(); }, 3100);
    }

    // Cambios sin guardar: antes de cerrar (✕, Cerrar o Esc) se pregunta para no perder lo capturado
    function vigilarCambios(dlg) {
        dlg._sucio = false;
        dlg.addEventListener('input', function (e) {
            if (e.target.closest('input, select, textarea') && !e.target.readOnly) dlg._sucio = true;
        });
        dlg.addEventListener('click', function (e) {
            if (e.target.closest('.quitar, .mo-mas, .cot-acciones button, [data-agregar], [data-importar]')) dlg._sucio = true;
        });
        dlg.addEventListener('cancel', function (e) { e.preventDefault(); cerrarDoc(dlg); });
    }
    function cerrarDoc(dlg) {
        if (dlg._sucio && !confirm('Tienes cambios sin guardar.\n\n¿Cerrar de todos modos? Se perderá lo que capturaste.')) return;
        dlg._sucio = false;
        dlg.close();
    }

    // Cantidades negativas en una lista (no se permiten en importes, horas ni unidades)
    function hayNegativos(filas, cols) {
        return filas.some(function (f) { return cols.some(function (c) { return num(f[c]) < 0; }); });
    }

    // Botones y línea de ayuda según el estado del documento: nuevo, guardado (bloqueado), modificando o cancelado
    var AYUDA_BOTONES = {
        'guardar': 'Guarda el documento y lo deja bloqueado',
        'guardar-salir': 'Guarda el documento y cierra la ventana',
        'guardar-cerrar': 'Guarda el documento y cierra la ventana',
        'imprimir': 'Imprime el formato del documento (primero hay que guardarlo)',
        'modificar': 'Desbloquea el documento guardado para hacerle cambios',
        'cancelar': 'Cancela el documento (pide el motivo); ya no cuenta en la obra',
        'bitacora': 'Muestra quién guardó o canceló el documento y cuándo',
        'cerrar': 'Cierra la ventana',
        'entrada-pt': 'Entrada de producto terminado en Microsip (por ahora en el sistema de escritorio)',
        'enviar': 'Enviar la cotización a Microsip (por ahora en el sistema de escritorio)',
        'estatus': 'Cambiar el estatus de la cotización (por ahora en el sistema de escritorio)'
    };
    function estadoDocumento(dlg, d) {   // d = { guardado, editable, cancelado }
        var abierta = obraAbierta();
        dlg.querySelectorAll('.mo-toolbar [data-mo], .mo-toolbar [data-cot]').forEach(function (b) {
            var a = b.dataset.mo || b.dataset.cot;
            if (!b.title) b.title = AYUDA_BOTONES[a] || '';
            if (/^guardar/.test(a)) b.disabled = !d.editable;
            else if (a === 'modificar') b.disabled = d.editable || !d.guardado || d.cancelado || !abierta;
            else if (a === 'cancelar') b.disabled = !d.guardado || d.cancelado || !abierta;
            else if (a === 'imprimir' || a === 'bitacora') b.disabled = !d.guardado;
        });
        var ayuda = dlg.querySelector('.doc-ayuda');
        if (!ayuda) return;
        var txt, cls;
        if (d.cancelado) { txt = 'Documento cancelado: solo se puede consultar.'; cls = 'rojo'; }
        else if (d.editable) {
            txt = d.guardado ? 'Estás modificando el documento. Presiona Guardar para conservar los cambios.' : 'Captura los datos y presiona Guardar.';
            cls = 'azul';
        } else if (!abierta) { txt = 'El estatus de la obra ya no permite cambios: el documento solo se puede consultar.'; cls = 'gris'; }
        else { txt = 'Documento guardado. Para hacerle cambios presiona Modificar.'; cls = 'gris'; }
        ayuda.className = 'doc-ayuda ' + cls;
        ayuda.textContent = txt;
    }

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
            var t = c.tipo === 'number' ? 'number" step="any" min="0' : (c.tipo || 'text');
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
            Promise.resolve(cfg.guardar(datos())).then(function (cerrar) {
                if (cerrar === false) return;
                dlg._sucio = false;
                dlg.close();
                notificar('Se guardó correctamente.');
            })
                .catch(avisarError)
                .finally(function () { $('frmGuardar').disabled = false; });
        };
        dlg._sucio = false;
        dlg.showModal();
    }
    vigilarCambios($('frmDialogo'));
    document.querySelectorAll('[data-frm-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { cerrarDoc($('frmDialogo')); });
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
        conAutorizacion(function (a) {
            return enviar('avance', { id: obraId, avance: avance, autoriza: a || autorizaMod || undefined });
        }, 'Actualizar el avance requiere el permiso «Modificar obras».').then(function (j) {
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
            // Como VB: sin los Cancelados solo en mano de obra, comisiones y gastos; las demás suman todo
            if (SIN_CANCELADOS.indexOf(vista.dataset.vista) < 0 || String(f.estatus || '').trim() !== 'Cancelado') {
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

    var SIN_CANCELADOS = ['mano', 'gastos'];

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
        // Pestaña con subpestañas: solo se pinta si lo pedido es lo de la subpestaña que se ve
        if (MODOS[clave] && MODOS[clave][vista.dataset.modo].tipo !== tipo) { cargado[clave] = false; return Promise.resolve(); }
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
                       ['Concepto', 'nom_concepto', 'txt'], ['Almacen', 'nom_almacen', 'txt'], ['Costo_Total', 'cos_tot', 'dinero']],
            totales: [['totSalidas', 'Total', 'cos_tot']]
        },
        detalle: {
            tipo: 'salidas_det',
            columnas: [['Estatus', 'estatus', 'txt'], ['Clave', 'clave_art', 'txt'], ['Nombre', 'nom_art', 'txt'], ['Uds', 'uds', 'num'],
                       ['Uni.Med', 'unid_med', 'txt'], ['Almacen', 'nom_almacen', 'txt'], ['Costo Total', 'costo_total', 'dinero']],
            totales: [['totSalidas', 'Total', 'costo_total']]
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
            pintarResumenFacturado(j.resumen);
            explicarTotalesFacturacion(j.filas);
        }).catch(function (err) {
            cargado.facturacion = false;
            estado(vista, '⚠ ' + err.message);
        });
    }

    // Facturado contra el presupuesto que se le dio al cliente (con IVA)
    // Cada tarjeta y total explica al pasar el mouse de dónde sale su número
    function pintarResumenFacturado(r) {
        var caja = $('facResumen');
        if (!r || !r.presupuesto) { caja.hidden = true; return; }
        var dif = r.diferencia, proy = r.proyectado;
        var conSigno = function (v) { return (v < 0 ? '−' : '') + dinero(Math.abs(v)); };
        var tarjetas = [];
        var dato = function (etiqueta, valor, clase, nota, explica) {
            tarjetas.push(explica);
            return '<div class="' + (clase || '') + '" tabindex="0"><span>' + etiqueta + ' <i class="ob-tip-ico">ⓘ</i></span><strong>' + valor + '</strong>' + (nota ? '<small>' + nota + '</small>' : '') + '</div>';
        };
        var gastos = tipGrupo('Compras de material · 5-Salidas Material', r.compras_det, r.compras) +
                     tipGrupo('Gastos indirectos · 8-Gastos Adicion. (Imp.Real)', r.indirectos_det, r.indirectos) +
                     tipGrupo('Mano de obra · 6-Mano de Obra (Total Real)', r.mano_obra_det, r.mano_obra);
        caja.innerHTML =
            dato('Presupuesto al cliente', dinero(r.presupuesto), '', r.presupuesto_folio ? 'Folio ' + escapar(r.presupuesto_folio) + ' · con IVA' : 'con IVA',
                 tipTexto('Total con IVA del presupuesto de obra' + (r.presupuesto_folio ? ' folio ' + r.presupuesto_folio : '') + ' ligado a la obra en 1-Datos.') +
                 tipCuenta([['Subtotal', r.presupuesto_sub], ['IVA', r.presupuesto - r.presupuesto_sub], ['Total con IVA', r.presupuesto, true]])) +
            dato('Facturado', dinero(r.facturado), '', r.pct === null ? '' : r.pct.toFixed(1) + ' % del presupuesto',
                 tipTexto('Suma con IVA de las facturas de Microsip (columna IMP.FACTURA) de las cotizaciones y folios de Easy-Glass de la obra, más las notas de cargo.') +
                 tipGrupo('Facturas', r.facturas, r.facturado) +
                 (r.pct === null ? '' : tipTexto(dinero(r.facturado) + ' ÷ ' + dinero(r.presupuesto) + ' = ' + r.pct.toFixed(1) + ' % del presupuesto'))) +
            dato(dif > 0 ? 'Excedido' : 'Falta por facturar', dinero(Math.abs(dif)), dif > 0 ? 'mal' : 'bien',
                 dif > 0 ? 'Se facturó más de lo presupuestado' : 'Dentro del presupuesto',
                 tipCuenta([['Presupuesto al cliente', r.presupuesto], ['− Facturado', r.facturado], [dif > 0 ? 'Excedido' : 'Falta por facturar', Math.abs(dif), true]])) +
            dato('Gastado', dinero(r.gastado), '',
                 'Compras ' + dinero(r.compras) + ' · Indirectos ' + dinero(r.indirectos) + ' · M.O. ' + dinero(r.mano_obra),
                 tipTexto('Lo real registrado en la obra, sin IVA y sin los documentos cancelados. Es la suma de los totales de las pestañas 5, 8 y 6.') +
                 gastos + tipCuenta([['Gastado', r.gastado, true]]) +
                 (r.sin_real > 0 ? tipTexto('Hay ' + dinero(r.sin_real) + ' capturados en mano de obra o gastos que todavía no tienen importe real: no cuentan hasta que se registre lo real.', 'aviso') : '')) +
            dato('Utilidad al momento', conSigno(r.utilidad), r.utilidad < 0 ? 'mal' : 'bien',
                 'Facturado sin IVA − gastado' + (r.margen === null ? '' : ' · margen ' + r.margen.toFixed(1) + ' %'),
                 tipTexto('Lo facturado sin IVA menos lo gastado (los costos van sin IVA).') +
                 tipCuenta([['Facturado con IVA', r.facturado], ['÷ ' + (1 + r.iva_pct / 100).toFixed(2) + ' (IVA ' + r.iva_pct + ' %)', r.facturado_sin_iva], ['− Gastado', r.gastado],
                            ['Utilidad', r.utilidad, true]]) +
                 (r.margen === null ? '' : tipTexto('Margen: ' + conSigno(r.utilidad) + ' ÷ ' + dinero(r.facturado_sin_iva) + ' = ' + r.margen.toFixed(1) + ' %'))) +
            dato('Proyectado al terminar', (proy > 0 ? '+' : proy < 0 ? '−' : '') + dinero(Math.abs(proy)), proy > 0 ? 'mal' : 'bien',
                 proy > 0 ? 'Se pasaría del presupuesto' : 'Quedaría dentro del presupuesto',
                 tipTexto('Cómo quedaría contra el presupuesto si se facturan todos los pedidos y folios que aún no tienen factura.') +
                 tipGrupo('Pendiente de facturar', r.pendientes, r.por_facturar) +
                 tipCuenta([['Facturado', r.facturado], ['+ Pendiente de facturar', r.por_facturar], ['− Presupuesto', r.presupuesto], ['Proyectado', proy, true]]));
        Array.prototype.forEach.call(caja.children, function (d, i) { d._tip = tarjetas[i]; });
        caja.hidden = false;
    }

    // Totales de abajo de 2-Facturacion: qué suma cada uno, renglón por renglón
    function explicarTotalesFacturacion(filas) {
        var lineas = function (campo) {
            return filas.filter(function (f) { return +f[campo]; }).map(function (f) {
                return { doc: f.tipo_docto + ' ' + f.folio + (f.factura && f.factura !== f.folio && f.factura !== 'NO FACTUR' ? ' · Fact. ' + f.factura : ''), fecha: f.fecha, importe: +f[campo] };
            });
        };
        var suma = function (campo) { return filas.reduce(function (s, f) { return s + (+f[campo] || 0); }, 0); };
        [['totImpCot', 'importe', 'Importe con IVA de cada renglón: el total de la cotización, pedido o factura de Microsip, o el folio de Easy-Glass; en AW, el pago en efectivo, nota de cargo o anticipo.'],
         ['totCargos', 'cargos', 'Lo que se le cobra al cliente: el total de la factura si ya está facturado; si no, el importe del pedido o folio. Más las notas de cargo.'],
         ['totCred', 'creditos', 'Lo que el cliente ya pagó: cobros, anticipos y notas de crédito aplicados en Microsip, más los pagos en efectivo y anticipos capturados en AW.'],
         ['totSaldo', 'saldo', 'Lo que falta por cobrar: Total Cargos − Total Creditos.']].forEach(function (t) {
            var o = $(t[0]);
            if (!o) return;
            var etiqueta = o.parentNode;
            etiqueta._tip = tipTexto(t[2]) + (t[1] === 'saldo'
                ? tipCuenta([['Total Cargos', suma('cargos')], ['− Total Creditos', suma('creditos')], ['Saldo', suma('saldo'), true]])
                : tipGrupo('', lineas(t[1]), suma(t[1])));
            etiqueta.classList.add('ob-tip-ancla');
        });
    }

    function tipTexto(texto, clase) { return '<p' + (clase ? ' class="' + clase + '"' : '') + '>' + escapar(texto) + '</p>'; }
    function tipCuenta(renglones) {
        return '<table>' + renglones.map(function (x) {
            return '<tr' + (x[2] ? ' class="tot"' : '') + '><td>' + escapar(x[0]) + '</td><td class="num">' + (x[1] < 0 ? '−' : '') + dinero(Math.abs(x[1])) + '</td></tr>';
        }).join('') + '</table>';
    }
    function tipGrupo(titulo, lineas, total) {
        lineas = lineas || [];
        var max = 12, resto = lineas.slice(max);
        return (titulo ? '<h4>' + escapar(titulo) + '</h4>' : '') + '<table>' +
            (lineas.length ? lineas.slice(0, max).map(function (l) {
                return '<tr><td>' + escapar(l.doc) + (l.fecha ? ' <small>' + fechaDMY(l.fecha) + '</small>' : '') +
                    (l.capturado && l.capturado !== l.importe ? ' <small>(capturado ' + dinero(l.capturado) + ')</small>' : '') +
                    '</td><td class="num">' + dinero(l.importe) + '</td></tr>';
            }).join('') : '<tr><td colspan="2"><small>Sin documentos</small></td></tr>') +
            (resto.length ? '<tr><td><small>y ' + resto.length + ' más</small></td><td class="num">' +
                dinero(resto.reduce(function (s, l) { return s + l.importe; }, 0)) + '</td></tr>' : '') +
            '<tr class="tot"><td>Total</td><td class="num">' + dinero(total) + '</td></tr></table>';
    }

    // Un solo recuadro flotante para todas las explicaciones (fixed: no lo recorta ningún contenedor)
    (function () {
        var tip = document.createElement('div');
        tip.className = 'ob-tip';
        tip.hidden = true;
        document.body.appendChild(tip);
        var actual = null;
        function mostrar(el) {
            actual = el;
            tip.innerHTML = el._tip;
            tip.hidden = false;
            var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
            var x = Math.max(8, Math.min(r.left, innerWidth - w - 8));
            var y = r.bottom + 6 + h > innerHeight ? r.top - h - 6 : r.bottom + 6;
            tip.style.left = x + 'px';
            tip.style.top = Math.max(8, y) + 'px';
        }
        function ocultar() { actual = null; tip.hidden = true; }
        var anclaDe = function (t) { while (t && t !== document) { if (t._tip) return t; t = t.parentNode; } return null; };
        document.addEventListener('mouseover', function (e) { var el = anclaDe(e.target); if (el && el !== actual) mostrar(el); else if (!el && actual) ocultar(); });
        document.addEventListener('focusin', function (e) { var el = anclaDe(e.target); if (el) mostrar(el); else if (actual) ocultar(); });
        document.addEventListener('scroll', ocultar, true);
    })();

    function verDetalleFactura(f) {
        $('facDetalleTitulo').textContent = 'Documentos en Microsip · ' + f.folio + (f.cobranza ? ' · Cobranza: ' + f.cobranza : '');
        $('facDetalleFilas').innerHTML = f.detalle.map(function (d) {
            return '<tr><td>' + escapar(d.tipo) + '</td><td>' + escapar(d.folio) + '</td><td>' + fechaDMY(d.fecha) + '</td><td>' + escapar(d.estatus) +
                '</td><td class="num">' + dinero(d.importe) + '</td><td>' + escapar(d.moneda) + '</td></tr>';
        }).join('');
        $('facDetalle').hidden = false;
    }

    // asigna_cot_de_obra: ventana flotante que sugiere folios de Microsip y de Easy-Glass mientras se escribe.
    // También acepta un folio que no aparezca en la lista (p. ej. una factura A00002080) escribiéndolo completo.
    var ac = { filas: [], sel: -1, espera: null, pedido: 0 };
    function asignarCotizacion() {
        if (!validaEstatusObra() || !requiereObra('Es necesario guardar la obra para asignar una Cotizacion.')) return;
        $('acFolio').value = '';
        ac.filas = []; ac.sel = -1;
        acPintar('Escribe al menos 2 caracteres del folio, del cliente o del proyecto.');
        $('acDialogo').showModal();
        $('acFolio').focus();
        // Deja listas en el servidor las facturas de Microsip (tardan unos segundos la primera vez)
        pedir('accion=folios_eg&precargar=1').catch(function () {});
    }
    function acResaltar(texto, q) {
        var t = String(texto == null ? '' : texto), i = q ? t.toUpperCase().indexOf(q) : -1;
        return i < 0 ? escapar(t) : escapar(t.substr(0, i)) + '<mark>' + escapar(t.substr(i, q.length)) + '</mark>' + escapar(t.substr(i + q.length));
    }
    function acPintar(estado) {
        var q = $('acFolio').value.trim().toUpperCase();
        $('acFilas').innerHTML = ac.filas.length ? ac.filas.map(function (f, i) {
            return '<tr data-i="' + i + '" role="option" aria-selected="' + (i === ac.sel) + '" class="' + (i === ac.sel ? 'sel ' : '') + (f.asignado ? 'asignado' : '') + '"' +
                (f.asignado ? ' title="Ya está asignado a esta obra"' : '') + '>' +
                '<td><b>' + acResaltar(f.folio, q) + '</b></td>' +
                '<td><span class="ac-origen ' + (f.origen === 'Easy-Glass' ? 'eg' : f.origen === 'Factura Microsip' ? 'fa' : 'ms') + '">' + escapar(f.origen) + '</span></td>' +
                '<td>' + acResaltar(f.cliente, q) + '<span class="ac-det">' + acResaltar(f.detalle, q) + '</span></td>' +
                '<td>' + fechaDMY(f.fecha) + '</td>' +
                '<td class="num">' + dinero(f.total) + ' ' + escapar(f.moneda) + '</td>' +
                '<td>' + (f.asignado ? 'Asignado' : escapar(f.estatus)) + '</td></tr>';
        }).join('') : '<tr class="vacio"><td colspan="6">' + escapar(estado || '') + '</td></tr>';
        $('acEstado').textContent = ac.filas.length ? ac.filas.length + ' folio(s) · ↑ ↓ para elegir, Enter para asignar' : '';
        $('acFolio').setAttribute('aria-expanded', ac.filas.length ? 'true' : 'false');
        $('acAsignar').disabled = !q;
        var tr = $('acFilas').querySelector('tr.sel');
        if (tr) tr.scrollIntoView({ block: 'nearest' });
    }
    function acBuscar() {
        var q = $('acFolio').value.trim();
        var n = ++ac.pedido;
        if (q.length < 2) { ac.filas = []; ac.sel = -1; acPintar('Escribe al menos 2 caracteres del folio, del cliente o del proyecto.'); return; }
        $('acEstado').textContent = 'Buscando…';
        pedir('accion=folios_eg&id=' + encodeURIComponent(obraId) + '&q=' + encodeURIComponent(q)).then(function (j) {
            if (n !== ac.pedido) return;   // ya se escribió otra cosa
            ac.filas = j.filas;
            ac.sel = -1;
            // Se preselecciona solo el que empieza con lo escrito; si no, Enter asigna el texto tal cual
            var qU = q.toUpperCase();
            for (var i = 0; i < ac.filas.length; i++) {
                var f = ac.filas[i];
                if (!f.asignado && (f.exacto || f.folio.indexOf(qU) === 0 || f.valor.indexOf(qU) === 0)) { ac.sel = i; break; }
            }
            acPintar('No hay pedidos, facturas ni presupuestos de los últimos 24 meses que coincidan. Si conoces el folio exacto, escríbelo completo y presiona Asignar.');
        }).catch(function (err) {
            if (n !== ac.pedido) return;
            ac.filas = []; ac.sel = -1;
            acPintar(err.message);
        });
    }
    function acMover(paso) {
        if (!ac.filas.length) return;
        var i = ac.sel;
        for (var k = 0; k < ac.filas.length; k++) {
            i = (i + paso + ac.filas.length) % ac.filas.length;
            if (!ac.filas[i].asignado) { ac.sel = i; break; }
        }
        acPintar();
    }
    function acAsignar(folio) {
        folio = String(folio || '').trim();
        if (!folio) return;
        $('acDialogo').close();
        conAutorizacion(function (a) {
            return enviar('asignar_cot', { id: obraId, folio: folio, autoriza: a });
        }, 'Asignar cotizaciones requiere el permiso «Modificar obras».').then(function (j) {
            alert('Se asignó el folio ' + j.folio + (j.cliente ? ' (' + j.cliente + ')' : '') + ' a la obra.');
            cargarFacturacion();
        }).catch(avisarError);
    }
    $('acFolio').addEventListener('input', function () {
        clearTimeout(ac.espera);
        $('acAsignar').disabled = !this.value.trim();
        ac.espera = setTimeout(acBuscar, 300);
    });
    $('acFolio').addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); acMover(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); acMover(-1); }
    });
    $('acForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var f = ac.filas[ac.sel];
        acAsignar(f && !f.asignado ? f.valor : $('acFolio').value);
    });
    $('acFilas').addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr || ac.filas[tr.dataset.i].asignado) return;
        ac.sel = +tr.dataset.i;
        $('acFolio').value = ac.filas[ac.sel].folio;
        acPintar();
        $('acFolio').focus();
    });
    $('acFilas').addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (tr && !ac.filas[tr.dataset.i].asignado) acAsignar(ac.filas[tr.dataset.i].valor);
    });
    document.querySelectorAll('[data-ac-cerrar]').forEach(function (b) { b.addEventListener('click', function () { clearTimeout(ac.espera); $('acDialogo').close(); }); });

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
    // Antes de una captura nueva: obra guardada y con estatus abierto (valida_estatus_obra)
    function puedeCapturar(msg) { return validaEstatusObra() && requiereObra(msg); }

    // 3-Orden de trabajo (nuevo_orden_trabajo / Dialog242): la misma ventana de la Cotizacion, en modo Orden de Trabajo
    function dialogoOrden(orden) {
        catalogosObra().then(function (cat) {
            cot.cat = cat;
            cotAbrir(orden, 'ot');
        }).catch(avisarError);
    }
    function recargarOrdenes() {
        catObra = null;
        cargarListado('ordenes', 'ordenes', 'No existen ordenes de trabajo asignadas a esta obra');
    }

    // 2-Facturacion: Cotizacion Microsip (encabezado, General, Quejas de Cliente y Otros Datos)
    // tipo 'ot': Orden de Trabajo (3-Orden Trabajo) con Salidas y Consumos de Material; estatus O, P, F o C
    var IVA = 0.16;
    var cot = { id: 0, tipo: 'cot', partidas: [], estatus: 'P', editable: true, cliente_id: null };
    function esOt() { return cot.tipo === 'ot'; }

    function cotHabilita(val) {
        cot.editable = val;
        $('cotDialogo').querySelectorAll('.cot-edit').forEach(function (el) { el.disabled = !val; });
        if (esOt()) $('cotFolio').disabled = true;   // el folio de la orden lo asigna el sistema
        estadoDocumento($('cotDialogo'), { guardado: !!cot.id, editable: val, cancelado: cot.estatus === 'C' });
        cotPintar();
    }
    function cotPonerEstatus(e) {
        cot.estatus = e;
        $('cotEstatus').textContent = e === 'C' ? 'Cancelado'
            : esOt() ? ({ P: 'Produccion', F: 'Fin Produccion' }[e] || (cot.id ? 'Orden Creada' : 'Orden Nueva'))
            : (cot.id ? 'Documento Creado' : 'Documento Nuevo');
        $('cotEstatus').classList.toggle('cancelado', e === 'C');
    }
    function cotPestana(t) {
        $('cotDialogo').querySelectorAll('[data-cot-tab]').forEach(function (b) { b.classList.toggle('activo', b.dataset.cotTab === t); });
        $('cotDialogo').querySelectorAll('[data-cot-panel]').forEach(function (p) { p.classList.toggle('visible', p.dataset.cotPanel === t); });
        if (t === 'quejas') cotQuejas();
        if (t === 'salidas' || t === 'consumos') cotMaterial(t);
    }
    // Pestaña General: Clave, Descripcion, Uds., U.Med., Precio.Unit., Total y Costo.Unita
    function cotPintar() {
        var dis = cot.editable ? '' : ' disabled';
        var campo = function (f, c, num) {
            return '<input' + (num ? ' type="number" step="any" min="0"' : ' class="txt"') + ' data-col="' + c + '" value="' + escapar(f[c] == null ? '' : f[c]) + '"' + dis + '>';
        };
        $('cotPartidas').innerHTML = cot.partidas.length ? cot.partidas.map(function (f, i) {
            return '<tr data-i="' + i + '"><td>' + campo(f, 'clave_articulo') + '</td><td>' + campo(f, 'descripcion') + '</td>' +
                '<td>' + campo(f, 'unidades', true) + '</td><td>' + campo(f, 'um') + '</td><td>' + campo(f, 'precio_unitario', true) + '</td>' +
                '<td class="num">' + (dinero(num(f.unidades) * num(f.precio_unitario)) || '$0.00') + '</td>' + (esOt() ? '' : '<td>' + campo(f, 'costo_unit', true) + '</td>') +
                '<td>' + (cot.editable ? '<button type="button" class="quitar" title="Quitar">🗑</button>' : '') + '</td></tr>';
        }).join('') : '<tr class="vacio"><td colspan="8">Sin partidas. Agregue un renglón o importe ' + (esOt() ? 'los artículos' : 'la materia prima') + ' del presupuesto.</td></tr>';
        cotTotales();
    }
    function cotTotales() {
        var sub = 0, costo = 0;
        cot.partidas.forEach(function (f) { sub += num(f.unidades) * num(f.precio_unitario); costo += num(f.unidades) * num(f.costo_unit); });
        var iva = Math.round(sub * IVA * 100) / 100;
        $('cotSubtotal').value = dinero(sub) || '$0.00';
        $('cotCosto').value = dinero(costo) || '$0.00';
        $('cotIva').value = dinero(iva) || '$0.00';
        $('cotTotal').value = dinero(sub + iva) || '$0.00';
        $('cotImporteNeto').value = $('cotSubtotal').value;
        return sub;
    }

    // f = renglón de 2-Facturación (tipo -1) o null para una nueva
    function dialogoCotizacion(f) {
        catalogosObra().then(function (cat) {
            cot.cat = cat;
            if (!f) return cotAbrir(null, 'cot');
            return pedir('accion=documento&tipo=cot&id=' + encodeURIComponent(obraId) + '&doc=' + encodeURIComponent(f.id))
                .then(function (j) { cotAbrir(j.documento, 'cot'); });
        }).catch(avisarError);
    }
    function cotAbrir(doc, tipo) {
        cot.tipo = tipo;
        var ot = esOt();
        $('cotDialogo').classList.toggle('es-ot', ot);
        $('cotCaption').textContent = ot ? 'Orden de Trabajo' : 'Cotizacion Microsip';
        $('cotTituloDoc').textContent = ot ? 'Orden de Trabajo' : 'Cotizacion';
        $('cotImportarTxt').textContent = ot ? 'Artículos del presupuesto' : 'Materia prima del presupuesto';
        cot.id = doc ? doc.id : 0;
        cot.cliente_id = doc ? doc.cliente_id : null;
        cot.partidas = doc ? doc.partidas.map(function (p) { return Object.assign({}, p); }) : [{}];
        $('cotObra').textContent = $('nombreObra').value;
        $('cotFecha').value = doc ? dia(doc.fecha) || hoy() : hoy();
        $('cotFolio').value = doc ? (doc.folio || '') : '';
        $('cotClave').value = doc ? (doc.clave_cliente || '') : '';
        $('cotNombre').value = doc ? (doc.nom_cliente || '') : (cot.cat.cliente || '');
        $('cotEntrega').value = doc ? dia(doc.fecha_entrega) : hoy();
        $('cotUrgencia').value = doc && doc.urgencia ? doc.urgencia : 'Nesesaria (Normal)';
        $('cotDescripcion').value = doc ? (doc.descripcion || '') : '';
        // Datos de entrega de la orden; una nueva toma el contacto y la dirección de la obra (1-Datos)
        $('otUbicacion').value = doc ? (doc.ubicacion_empresa || '') : '';
        $('otLugarEntrega').value = doc ? (doc.lugar_entrega || '') : $('direccion').value;
        $('otContacto').value = doc ? (doc.contacto || '') : $('contacto').value;
        $('otFacturarA').value = doc ? (doc.facturar_a || '') : $('cotNombre').value;
        $('cotDocId').value = cot.id || '';
        $('cotCreo').value = doc ? (doc.usuario_creacion || '') : '';
        $('cotCreoFecha').value = doc ? String(doc.fecha_creacion || '').substr(0, 16) : '';
        $('cotModifico').value = doc ? (doc.usuario_modificacion || '') : '';
        $('cotModificoFecha').value = doc ? String(doc.fecha_mod || '').substr(0, 16) : '';
        cotPonerEstatus(doc ? String((ot ? doc.estatus_2 : doc.estatus) || '').trim().toUpperCase() : (ot ? 'O' : 'P'));
        $('cotQuejas').innerHTML = '';
        $('cotQuejasAviso').hidden = true;
        cotPestana('general');
        cotHabilita(!doc && obraAbierta());
        $('cotDialogo')._sucio = false;
        $('cotDialogo').showModal();
    }

    // Partidas
    $('cotAgregar').addEventListener('click', function () { cot.partidas.push({}); cotPintar(); });
    $('cotImportar').addEventListener('click', function () {
        var nuevas = (cot.cat.articulos || []).map(function (a) {
            return { articulo_id: a.articulo_id, clave_articulo: a.clave, descripcion: a.nombre, unidades: a.uds, um: a.um,
                     precio_unitario: esOt() ? a.costo_unit : 0, costo_unit: a.costo_unit };
        });
        if (!nuevas.length) { alert('El presupuesto no tiene materia prima para importar.'); return; }
        cot.partidas = cot.partidas.filter(function (f) { return String(f.clave_articulo || f.descripcion || '').trim(); }).concat(nuevas);
        cotPintar();
    });
    $('cotPartidas').addEventListener('input', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr || !e.target.dataset.col) return;
        var f = cot.partidas[tr.dataset.i];
        f[e.target.dataset.col] = e.target.value;
        tr.querySelector('td.num').textContent = dinero(num(f.unidades) * num(f.precio_unitario)) || '$0.00';
        cotTotales();
    });
    $('cotPartidas').addEventListener('click', function (e) {
        if (!e.target.closest('.quitar')) return;
        cot.partidas.splice(e.target.closest('tr').dataset.i, 1);
        cotPintar();
    });

    // Quejas de Cliente: por el folio de la cotización o por el nombre del cliente
    function cotQuejas() {
        $('cotQuejas').innerHTML = '<tr class="vacio"><td colspan="6">Consultando…</td></tr>';
        pedir('accion=quejas&folio=' + encodeURIComponent($('cotFolio').value.trim()) + '&cliente=' + encodeURIComponent($('cotNombre').value.trim()))
            .then(function (j) {
                $('cotQuejasAviso').hidden = !j.aviso;
                $('cotQuejasAviso').textContent = j.aviso || '';
                $('cotQuejas').innerHTML = j.filas.length ? j.filas.map(function (q) {
                    return '<tr><td>' + escapar(q.folio) + '</td><td>' + escapar(q.cliente) + '</td><td>' + escapar(fechaDMY(dia(q.fecha))) + '</td>' +
                        '<td>' + escapar(q.vendedor) + '</td><td>' + escapar(q.proceso) + '</td><td>' + escapar(q.estado || q.estatus) + '</td></tr>';
                }).join('') : '<tr class="vacio"><td colspan="6">El cliente no tiene quejas registradas.</td></tr>';
            }).catch(function (err) {
                $('cotQuejas').innerHTML = '<tr class="vacio"><td colspan="6">' + escapar(err.message) + '</td></tr>';
            });
    }
    // Orden de Trabajo: salidas de material (retorna_doctos_salidas_por_obra) y consumos en obra registrados con esta OT
    function cotMaterial(t) {
        var tb = $(t === 'salidas' ? 'cotSalidas' : 'cotConsumos'), cols = t === 'salidas' ? 6 : 4;
        var fila = function (txt) { return '<tr class="vacio"><td colspan="' + cols + '">' + escapar(txt) + '</td></tr>'; };
        if (!cot.id) { tb.innerHTML = fila('Guarda la orden de trabajo para ver su material.'); return; }
        tb.innerHTML = fila('Consultando…');
        var folio = String($('cotFolio').value).trim();
        pedir('accion=listado&tipo=' + t + '&id=' + encodeURIComponent(obraId)).then(function (j) {
            var filas = j.filas.filter(function (f) { return String(t === 'salidas' ? f.ot : f.folio_orden).trim() === folio; });
            tb.innerHTML = filas.length ? filas.map(function (f) {
                return t === 'salidas'
                    ? '<tr><td>' + escapar(f.folio_microsip) + '</td><td>' + escapar(fechaDMY(dia(f.fecha))) + '</td><td>' + escapar(f.estatus) + '</td><td>' + escapar(f.nom_concepto) +
                      '</td><td>' + escapar(f.nom_almacen) + '</td><td class="num">' + (dinero(num(f.cos_tot)) || '$0.00') + '</td></tr>'
                    : '<tr><td>' + escapar(f.folio) + '</td><td>' + escapar(fechaDMY(dia(f.fecha))) + '</td><td>' + escapar(f.estatus) + '</td><td class="num">' + escapar(f.uds_salida) + '</td></tr>';
            }).join('') : fila(t === 'salidas' ? 'La orden de trabajo no tiene salidas de material.' : 'La orden de trabajo no tiene consumos de material en obra.');
        }).catch(function (err) { tb.innerHTML = fila(err.message); });
    }
    $('cotDialogo').addEventListener('click', function (e) {
        var t = e.target.closest('[data-cot-tab]');
        if (t) { cotPestana(t.dataset.cotTab); return; }
        var q = e.target.closest('[data-queja]');
        if (!q) return;
        if (q.dataset.queja === 'mostrar') cotQuejas();
        else alert('La captura de quejas de clientes todavía no está en la web: se registra en el módulo de Quejas de Clientes del sistema de escritorio. Aquí se muestran las del cliente.');
    });

    // Guardar / Guardar y Cerrar
    function cotGuardar(cerrar) {
        if (esOt()) { otGuardar(cerrar); return; }
        if (!$('cotNombre').value.trim()) {
            alert('Falta el cliente. Búscalo con el botón del embudo junto a «Nombre».');
            $('cotNombre').focus();
            return;
        }
        var partidas = cot.partidas.filter(function (f) { return String(f.clave_articulo || '').trim() || String(f.descripcion || '').trim(); });
        if (!partidas.length) {
            alert('Agrega al menos una partida en la pestaña General (botón «Agregar renglón»).');
            cotPestana('general');
            return;
        }
        if (hayNegativos(partidas, ['unidades', 'precio_unitario', 'costo_unit'])) {
            alert('Hay cantidades negativas en las partidas. Corrígelas para poder guardar.');
            cotPestana('general');
            return;
        }
        var d = {
            id: obraId, docto_id: cot.id, folio: $('cotFolio').value, fecha: $('cotFecha').value, fecha_entrega: $('cotEntrega').value,
            cliente_id: cot.cliente_id, clave_cliente: $('cotClave').value, nom_cliente: $('cotNombre').value,
            urgencia: $('cotUrgencia').value, descripcion: $('cotDescripcion').value, partidas: partidas
        };
        guardarCon('guardar_cot', d).then(function (j) {
            cot.id = j.docto_id;
            $('cotDocId').value = cot.id;
            cotPonerEstatus('P');
            cargarFacturacion();
            $('cotDialogo')._sucio = false;
            if (cerrar) $('cotDialogo').close();
            else cotHabilita(false);
            notificar('Se guardó correctamente.');
        }).catch(avisarError);
    }
    function otGuardar(cerrar) {
        var partidas = cot.partidas.filter(function (f) { return String(f.clave_articulo || '').trim() || String(f.descripcion || '').trim(); });
        if (!partidas.length) {
            alert('Agrega al menos una partida en la pestaña General (botón «Agregar renglón»).');
            cotPestana('general');
            return;
        }
        if (hayNegativos(partidas, ['unidades', 'precio_unitario'])) {
            alert('Hay cantidades negativas en las partidas. Corrígelas para poder guardar.');
            cotPestana('general');
            return;
        }
        if (!$('cotDescripcion').value.trim()) {
            alert('Captura la descripción de la orden de trabajo en la pestaña Otros Datos.');
            cotPestana('otros');
            $('cotDescripcion').focus();
            return;
        }
        var nueva = !cot.id;
        guardarCon('guardar_orden', {
            orden_id: cot.id, fecha: $('cotFecha').value, fecha_entrega: $('cotEntrega').value,
            cliente_id: cot.cliente_id, clave_cliente: $('cotClave').value, nom_cliente: $('cotNombre').value,
            urgencia: $('cotUrgencia').value, descripcion: $('cotDescripcion').value, partidas: partidas,
            ubicacion_empresa: $('otUbicacion').value, contacto: $('otContacto').value,
            facturar_a: $('otFacturarA').value, lugar_entrega: $('otLugarEntrega').value
        }).then(function (j) {
            cot.id = j.orden_id;
            $('cotDocId').value = cot.id;
            $('cotFolio').value = j.folio || '';
            cotPonerEstatus('O');
            recargarOrdenes();
            $('cotDialogo')._sucio = false;
            if (cerrar) $('cotDialogo').close();
            else cotHabilita(false);
            if (nueva) alert('Se registró la orden de trabajo folio ' + j.folio + '.');
            else notificar('Se guardó correctamente.');
        }).catch(avisarError);
    }
    // Enviar a Produccion (O→P), Fin de Produccion (P→F) o Cancelar (O/P→C)
    function otEstatus(est, pregunta, aviso) {
        if (!confirm(pregunta)) return;
        guardarCon('estatus_orden', { orden_id: cot.id, estatus: est }).then(function () {
            cotPonerEstatus(est);
            cotHabilita(false);
            recargarOrdenes();
            notificar(aviso);
        }).catch(avisarError);
    }
    function otProduccion() {
        if (!validaEstatusObra()) return;
        if (!cot.id) { alert('Guarda la orden de trabajo antes de enviarla a producción.'); return; }
        if (cot.editable) { alert('Guarda los cambios de la orden antes de enviarla a producción.'); return; }
        if (cot.estatus !== 'O') { alert('La orden ya se envió a producción o está cancelada.'); return; }
        otEstatus('P', '¿Liberar la orden ' + $('cotFolio').value + ' a producción?', 'La orden se envió a producción.');
    }
    function otModificarEstatus() {
        if (!validaEstatusObra()) return;
        if (cot.estatus !== 'P') { alert('Solo una orden en producción se puede pasar a Fin de Producción.'); return; }
        otEstatus('F', '¿Enviar la orden ' + $('cotFolio').value + ' a Fin de Producción?', 'La orden quedó en Fin de Producción.');
    }

    function cotModificar() {
        if (!validaEstatusObra()) return;
        if (cot.estatus === 'C') { alert('No es posible modificar un documento cancelado'); return; }
        if (esOt() && cot.estatus !== 'O') { alert('Solo se puede modificar una orden que no se ha liberado a producción.'); return; }
        cotHabilita(true);
    }
    function cotCancelar() {
        if (!validaEstatusObra()) return;
        if (!cot.id) { alert('El documento aún no se ha guardado.'); return; }
        if (cot.estatus === 'C') { alert('El documento ya está cancelado.'); return; }
        if (esOt()) {
            if (cot.estatus === 'F') { alert('La orden ya terminó su producción: no se puede cancelar.'); return; }
            otEstatus('C', '¿Cancelar la orden ' + $('cotFolio').value + '?', 'La orden de trabajo quedó cancelada.');
            return;
        }
        if (!confirm('¿Deseas archivar como cancelado este documento?')) return;
        var motivo = prompt('INGRESA EL MOTIVO DE CANCELACION: ', '');
        if (motivo === null) return;
        guardarCon('cancelar_cot', { doc_id: cot.id, motivo: motivo }).then(function () {
            cotPonerEstatus('C');
            cotHabilita(false);
            cargarFacturacion();
            notificar('La cotización quedó cancelada.');
        }).catch(avisarError);
    }
    function cotImprimir() {
        if (!cot.id) { alert('Guarda el documento para poder imprimirlo.'); return; }
        var sub = cotTotales(), iva = Math.round(sub * IVA * 100) / 100;
        var filas = cot.partidas.filter(function (f) { return String(f.clave_articulo || f.descripcion || '').trim(); });
        // Orden de Trabajo: datos de entrega capturados (solo los que tienen algo)
        var entrega = !esOt() ? '' : [['UBICACIÓN DE LA EMPRESA', 'otUbicacion'], ['CONTACTO', 'otContacto'], ['FACTURAR A NOMBRE DE', 'otFacturarA'], ['LUGAR DE ENTREGA', 'otLugarEntrega']]
            .filter(function (c) { return $(c[1]).value.trim(); })
            .map(function (c) { return '<br><b>' + c[0] + ': </b>' + escapar($(c[1]).value.trim()); }).join('');
        imprimirFormato({
            titulo: esOt() ? 'ORDEN DE TRABAJO' : 'COTIZACION', id: cot.id, folioOt: 'RS ' + ($('cotFolio').value || '0'), fecha: fechaDMY($('cotFecha').value),
            concepto: 'Entrega ' + fechaDMY($('cotEntrega').value) + ' · ' + $('cotUrgencia').value, estatus: $('cotEstatus').textContent,
            unidad: '—', descripcion: $('cotDescripcion').value,
            cuerpo: '<b>CLIENTE: </b>' + escapar(($('cotClave').value ? $('cotClave').value + ' · ' : '') + $('cotNombre').value) + entrega +
                '<table style="width:100%;margin-top:8px;border-collapse:collapse"><tr style="font-weight:bold"><td>Clave</td><td>Descripcion</td><td style="text-align:right">Uds.</td><td>U.Med.</td><td style="text-align:right">Precio.Unit.</td><td style="text-align:right">Total</td></tr>' +
                filas.map(function (f) {
                    return '<tr><td>' + escapar(f.clave_articulo || '') + '</td><td>' + escapar(f.descripcion || '') + '</td><td style="text-align:right">' + escapar(f.unidades || 0) +
                        '</td><td>' + escapar(f.um || '') + '</td><td style="text-align:right">' + (dinero(num(f.precio_unitario)) || '$0.00') +
                        '</td><td style="text-align:right">' + (dinero(num(f.unidades) * num(f.precio_unitario)) || '$0.00') + '</td></tr>';
                }).join('') +
                '<tr><td colspan="5" style="text-align:right;padding-top:8px"><b>Sub Total:</b></td><td style="text-align:right;padding-top:8px">' + (dinero(sub) || '$0.00') + '</td></tr>' +
                '<tr><td colspan="5" style="text-align:right"><b>IVA:</b></td><td style="text-align:right">' + (dinero(iva) || '$0.00') + '</td></tr>' +
                '<tr><td colspan="5" style="text-align:right"><b>Total:</b></td><td style="text-align:right"><b>' + (dinero(sub + iva) || '$0.00') + '</b></td></tr></table>'
        });
    }
    var COT_BOTONES = {
        'guardar': function () { cotGuardar(false); },
        'guardar-cerrar': function () { cotGuardar(true); },
        'imprimir': cotImprimir,
        'modificar': cotModificar,
        'cancelar': cotCancelar,
        'bitacora': function () { verBitacora(esOt() ? 'orden' : 'cot', cot.id); },
        'produccion': otProduccion,
        'cerrar': function () { cerrarDoc($('cotDialogo')); },
        // Escriben en Microsip: la web solo puede hacerlo por la API de Easy-Glass, que aún no tiene esos recursos
        'entrada-pt': function () { alert('Entrada PT da de alta la entrada de producto terminado en Microsip. La API de Easy-Glass aún no tiene ese recurso, así que se sigue haciendo en el sistema de escritorio.'); },
        'enviar': function () { alert('Enviar a Microsip de una cotización capturada aquí necesita un recurso nuevo en la API de Easy-Glass (hoy solo envía presupuestos de Easy-Glass con folio EG). Mientras tanto se envía desde el sistema de escritorio.'); },
        'estatus': function () {
            if (esOt()) otModificarEstatus();
            else alert('Modificar Estatus aún no está disponible en la web.');
        }
    };
    $('cotDialogo').querySelector('.mo-toolbar').addEventListener('click', function (e) {
        var b = e.target.closest('[data-cot]');
        if (b && !b.disabled) COT_BOTONES[b.dataset.cot]();
    });
    $('cotDialogo').querySelector('.hs-cerrar').addEventListener('click', function () { cerrarDoc($('cotDialogo')); });
    vigilarCambios($('cotDialogo'));

    // Busca Cliente: clientes de Easy-Glass por la API (la clave es el número de cliente)
    function buscaCliente(modo, texto) {
        var radios = document.getElementsByName('bcModo');
        radios.forEach(function (r) { r.checked = r.value === modo; });
        $('bcClave').value = modo === 'clave' ? texto : '';
        $('bcNombre').value = modo === 'nombre' ? texto : '';
        bcModo();
        $('bcFilas').innerHTML = '';
        $('bcEstado').textContent = '';
        $('bcDialogo').showModal();
        if (texto) bcBuscar();
    }
    function bcModo() {
        var porClave = document.querySelector('input[name="bcModo"]:checked').value === 'clave';
        $('bcClave').disabled = !porClave;
        $('bcNombre').disabled = porClave;
        (porClave ? $('bcClave') : $('bcNombre')).focus();
    }
    var bcResultados = [];
    function bcBuscar() {
        var porClave = document.querySelector('input[name="bcModo"]:checked').value === 'clave';
        var q = (porClave ? $('bcClave') : $('bcNombre')).value.trim();
        if (!q) { $('bcEstado').textContent = 'Escribe la ' + (porClave ? 'clave' : 'nombre') + ' a buscar.'; return; }
        $('bcEstado').textContent = 'Buscando…';
        pedir('accion=clientes_eg&q=' + encodeURIComponent(q)).then(function (j) {
            bcResultados = porClave ? j.filas.filter(function (c) { return c.clave === q; }).concat(j.filas.filter(function (c) { return c.clave !== q && c.clave.indexOf(q) === 0; })) : j.filas;
            $('bcFilas').innerHTML = bcResultados.length ? bcResultados.map(function (c, i) {
                return '<tr data-i="' + i + '" title="' + escapar([c.contacto, c.telefono, c.vendedor].filter(Boolean).join(' · ')) + '"><td>' + escapar(c.clave) + '</td><td>' + escapar(c.nombre) + '</td></tr>';
            }).join('') : '<tr class="vacio"><td colspan="2">No se encontraron clientes.</td></tr>';
            $('bcEstado').textContent = bcResultados.length ? bcResultados.length + ' cliente(s) · doble clic para elegir' : '';
        }).catch(function (err) { $('bcEstado').textContent = err.message; });
    }
    document.getElementsByName('bcModo').forEach(function (r) { r.addEventListener('change', bcModo); });
    $('bcForm').addEventListener('submit', function (e) { e.preventDefault(); bcBuscar(); });
    $('bcFilas').addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        var c = bcResultados[tr.dataset.i];
        cot.cliente_id = c.cliente_id;
        $('cotClave').value = c.clave;
        $('cotNombre').value = c.nombre;
        $('cotDialogo')._sucio = true;
        $('bcDialogo').close();
    });
    document.querySelectorAll('[data-bc-cerrar]').forEach(function (b) { b.addEventListener('click', function () { $('bcDialogo').close(); }); });
    $('cotDialogo').querySelectorAll('[data-buscar]').forEach(function (b) {
        b.addEventListener('click', function () {
            buscaCliente(b.dataset.buscar, (b.dataset.buscar === 'clave' ? $('cotClave') : $('cotNombre')).value.trim());
        });
    });
    // Enter en Cliente (No) o Nombre también abre la búsqueda
    ['cotClave', 'cotNombre'].forEach(function (id) {
        $(id).addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            buscaCliente(id === 'cotClave' ? 'clave' : 'nombre', this.value.trim());
        });
        $(id).addEventListener('input', function () { cot.cliente_id = null; });
    });

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
    // Explosión automática: insumos del Análisis P.U. del presupuesto aprobado. Primero se ve el resumen y se confirma;
    // se agregan los materiales y se reemplazan solo los que antes se generaron así (lo capturado a mano no se toca).
    function explosionDesdePresupuesto() {
        enviar('explosion_presupuesto', { id: obraId }).then(function (j) {
            var cuenta = { MAT: 0, MO: 0, EQ: 0 };
            j.insumos.forEach(function (i) { cuenta[i.tipo]++; });
            var t = j.totales;
            var msg = 'Explosión del presupuesto folio ' + j.folio + ' (' + j.origen + '):\n\n' +
                '• Materiales: ' + cuenta.MAT + ' insumos · ' + dinero(t.MAT) + '\n' +
                '• Mano de obra: ' + cuenta.MO + ' categorías · ' + dinero(t.MO) + ' (con FSR)\n' +
                '• Equipo y herramienta: ' + cuenta.EQ + ' · ' + dinero(t.EQ) + (t.hm ? ' + herramienta menor ' + dinero(t.hm) : '') + '\n' +
                '• Total costo directo: ' + dinero(t.total) + '\n\n' +
                'Se agregan los ' + cuenta.MAT + ' materiales a la explosión de la obra' +
                (j.anteriores ? ' y se reemplazan los ' + j.anteriores + ' que se generaron antes desde el presupuesto' : '') +
                '. Lo capturado a mano no se toca.\n\n¿Continuar?';
            if (!cuenta.MAT) { alert(msg.split('\n\nSe agregan')[0] + '\n\nNo hay materiales que agregar.'); return; }
            if (!confirm(msg)) return;
            return guardarCon('explosion_presupuesto', { aplicar: true }).then(function (r) {
                notificar('Explosión generada: ' + r.agregadas + ' materiales' + (r.reemplazadas ? ' (reemplazó ' + r.reemplazadas + ')' : '') + '.', 'ok');
                cargarListado('explosion', 'explosion', 'No existen datos para mostrar');
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

    // 6-Mano de obra asignada: Costo de Mano de Obra (Dialog275)
    var SIN_UNIDAD = 'SIN UNIDAD DE TRANSPORTE REQUERIDA';
    var mo = { id: 0, filas: [], estatus: 'Normal', editable: true, cat: null };

    function moOpciones(el, ops, valor) {
        el.innerHTML = ops.map(function (o) {
            return '<option value="' + escapar(o.v) + '"' + (String(o.v) === String(valor) ? ' selected' : '') + '>' + escapar(o.t) + '</option>';
        }).join('');
    }
    function moTextoSel(el) { return el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : ''; }
    // habilita_controles
    function moHabilita(val) {
        mo.editable = val;
        $('moDialogo').querySelectorAll('.mo-edit').forEach(function (el) { el.disabled = !val; });
        estadoDocumento($('moDialogo'), { guardado: !!mo.id, editable: val, cancelado: mo.estatus === 'Cancelado' });
        moPintar();
    }
    function moPonerEstatus(e) {
        mo.estatus = e;
        $('moEstatus').textContent = e;
        $('moEstatus').classList.toggle('cancelado', e === 'Cancelado');
    }
    // grid_responsables: Nombre, Costo_x_Hrs, Hrs.de_Trab., Hrs.Trab.Real, Costo.Total
    function moPintar() {
        var dis = mo.editable ? '' : ' disabled';
        $('moFilas').innerHTML = mo.filas.length ? mo.filas.map(function (f, i) {
            return '<tr data-i="' + i + '"><td>' + escapar(f.nombre) + '</td>' +
                ['costo_x_hrs', 'hrs_trabajo', 'hrs_trabajo_real'].map(function (c) {
                    return '<td style="width:92px"><input type="number" step="any" min="0" data-col="' + c + '" value="' + escapar(f[c]) + '"' + dis + '></td>';
                }).join('') +
                '<td class="num" style="width:96px">' + (dinero(num(f.costo_x_hrs) * num(f.hrs_trabajo)) || '$0.00') + '</td>' +
                '<td style="width:26px">' + (mo.editable ? '<button type="button" class="quitar" title="Quitar">🗑</button>' : '') + '</td></tr>';
        }).join('') : '<tr class="vacio"><td colspan="6">Elija al personal de obra y presione +</td></tr>';
        moTotales();
    }
    // calcula_total_mo
    function moTotales() {
        var t1 = 0, t2 = 0;
        mo.filas.forEach(function (f) {
            t1 += num(f.costo_x_hrs) * num(f.hrs_trabajo);
            t2 += num(f.costo_x_hrs) * num(f.hrs_trabajo_real);
        });
        $('moImporte').value = dinero(t1) || '$0.00';
        $('moImpReal').value = dinero(t2) || '$0.00';
    }

    // carga_inicial; doc = documento guardado (doble clic en 6-Mano de Obra): se consulta y se desbloquea con Modificar
    function dialogoManoObra(doc) {
        catalogosObra().then(function (cat) {
            mo.cat = cat;
            mo.id = doc ? doc.id : 0;
            mo.filas = doc ? doc.empleados.map(function (e) { return Object.assign({}, e); }) : [];
            moOpciones($('moOrden'), [{ v: '', t: '' }].concat(cat.ordenes.map(function (o) { return { v: o.id, t: o.folio }; })),
                doc ? (doc.docto_orden_obra_id || '') : (cat.ordenes[0] ? cat.ordenes[0].id : ''));
            var unidad = 0;
            if (doc) unidad = num(doc.unidad_transporte_id) || (cat.unidades.filter(function (u) { return u.nombre === doc.nom_unidad; })[0] || { id: 0 }).id;
            moOpciones($('moUnidad'), [{ v: 0, t: SIN_UNIDAD }].concat(cat.unidades.map(function (u) { return { v: u.id, t: u.nombre }; })), unidad);
            moOpciones($('moPersonal'), cat.empleados.map(function (e) { return { v: e.id, t: e.nombre }; }), '');
            $('moFecha').value = doc ? dia(doc.fecha) : hoy();
            $('moNotas').value = doc ? (doc.notas || '') : '';
            moPonerEstatus(doc && doc.estatus === 'Cancelado' ? 'Cancelado' : 'Normal');
            moHabilita(!doc && obraAbierta());
            $('moDialogo')._sucio = false;
            $('moDialogo').showModal();
        }).catch(avisarError);
    }

    // Button2 (+): sueldo diario / 8 h y 1 hr de trabajo
    $('moAgregar').addEventListener('click', function () {
        var sel = $('moPersonal');
        if (!sel.value) return;
        if (mo.filas.some(function (f) { return String(f.id_empleado) === sel.value; })) {
            alert('El empleado seleccionado ya se encuentra asignado en el presupuesto');
            return;
        }
        var e = mo.cat.empleados.filter(function (x) { return String(x.id) === sel.value; })[0];
        var costo = Math.round(num(e.sueldo_diario) / 8 * 100) / 100;
        mo.filas.push({ id_empleado: e.id, nombre: e.nombre, costo_x_hrs: costo, hrs_trabajo: 1, hrs_trabajo_real: 0 });
        moPintar();
    });
    // CellEndEdit: recalcula el renglón y los importes
    $('moFilas').addEventListener('input', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr || !e.target.dataset.col) return;
        var f = mo.filas[tr.dataset.i];
        f[e.target.dataset.col] = e.target.value;
        tr.querySelector('td.num').textContent = dinero(num(f.costo_x_hrs) * num(f.hrs_trabajo)) || '$0.00';
        moTotales();
    });
    $('moFilas').addEventListener('click', function (e) {
        if (!e.target.closest('.quitar')) return;
        mo.filas.splice(e.target.closest('tr').dataset.i, 1);
        moPintar();
    });

    // toll_guardar2 (Guardar: queda bloqueado) y tol_guardar (Guardar y Salir)
    function moGuardar(salir) {
        if (!mo.filas.length) {
            alert('Aún no se ha asignado personal a la obra. Elija al empleado en «Personal de Obra» y presione + para agregarlo.');
            $('moPersonal').focus();
            return;
        }
        if (hayNegativos(mo.filas, ['costo_x_hrs', 'hrs_trabajo', 'hrs_trabajo_real'])) {
            alert('Hay costos u horas negativos en la lista. Corrígelos para poder guardar.');
            return;
        }
        var d = {
            id: obraId, mo_id: mo.id, fecha: $('moFecha').value, docto_orden_obra_id: $('moOrden').value,
            unidad_transporte_id: $('moUnidad').value, nom_unidad: moTextoSel($('moUnidad')),
            notas: $('moNotas').value, empleados: mo.filas
        };
        conAutorizacion(function (a) {
            return enviar('guardar_mo', Object.assign({ autoriza: a }, d));
        }, mo.id ? 'Modificar la mano de obra asignada requiere el permiso «Modificar mano de obra asignada a la obra».'
                 : 'Esta captura requiere el permiso «Modificar obras».').then(function (j) {
            mo.id = j.mo_id;
            cargarListado('mano', 'mano');
            $('moDialogo')._sucio = false;
            if (salir) $('moDialogo').close();
            else moHabilita(false);
            notificar('Se guardó correctamente.');
        }).catch(avisarError);
    }

    // tool_modificar
    function moModificar() {
        if (!validaEstatusObra()) return;
        if (mo.estatus === 'Cancelado') { alert('No es posible modificar un documento cancelado'); return; }
        moHabilita(true);
    }

    // ToolStripButton1: archivar como cancelado con su motivo
    function moCancelar() {
        if (!validaEstatusObra()) return;
        if (!mo.id) { alert('El documento aún no se ha guardado.'); return; }
        if (mo.estatus === 'Cancelado') { alert('El documento ya está cancelado.'); return; }
        if (!confirm('¿Deseas archivar como cancelado este documento?')) return;
        var motivo = prompt('INGRESA EL MOTIVO DE CANCELACION: ', '');
        if (motivo === null) return;
        conAutorizacion(function (a) {
            return enviar('cancelar_mo', { id: obraId, doc_id: mo.id, motivo: motivo, autoriza: a });
        }, 'Cancelar la mano de obra asignada requiere el permiso «Cancelar mano de obra asignada a la obra».').then(function () {
            moPonerEstatus('Cancelado');
            moHabilita(false);
            cargarListado('mano', 'mano');
            notificar('La asignación quedó cancelada.');
        }).catch(avisarError);
    }

    // ToolStripButton6: bitácora del documento (Dialog58); tipo = mo | gasto
    function verBitacora(tipo, id) {
        var mostrar = function (lineas) { $('moBitTexto').value = lineas.join('\n'); $('moBitacora').showModal(); };
        if (!id) { mostrar([]); return; }
        pedir('accion=documento&tipo=' + tipo + '&id=' + encodeURIComponent(obraId) + '&doc=' + encodeURIComponent(id))
            .then(function (j) { mostrar(j.documento.bitacora || []); }).catch(avisarError);
    }

    // Formato impreso de los documentos de la obra (CN-REG-35)
    // o = { titulo, id, folioOt, fecha, concepto, estatus, unidad, cuerpo (html), total, descripcion }
    function imprimirFormato(o) {
        var m = window.ACRI_MEMBRETE || {};
        var logo = m.logo ? '<img src="' + escapar(new URL(m.logo, location.href).href) + '">' : '';
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapar(o.titulo) + ' ' + o.id + '</title><style>' +
            '@page{size:letter;margin:12mm}body{font:13px Arial,sans-serif;color:#000;margin:0}' +
            '.hoja{border:1px solid #000;min-height:250mm;position:relative}' +
            '.cab{display:grid;grid-template-columns:170px 1fr;border-bottom:1px solid #000}' +
            '.logo{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #000}.logo img{max-width:150px;max-height:80px}' +
            '.r1{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #000}.r1 b{font-size:16px}' +
            '.r2{display:grid;grid-template-columns:1fr 1fr 1.2fr}.r2>div{padding:4px 10px;font-weight:bold;font-size:12px}.r2>div+div{border-left:1px solid #000}' +
            '.sec{padding:6px 10px}.obra{font-size:15px;font-weight:bold}.est{float:right;text-align:center;font-weight:bold;margin-right:60px}.est b{display:block;font-size:20px}' +
            '.barra{border-top:8px solid #000;margin:10px 0 6px}.per{padding:4px 10px}.per div{padding:3px 10px}.per td{padding:2px 10px}' +
            '.total{float:right;font-size:34px;margin:10px 40px 0 0}' +
            '.firmas{position:absolute;left:10px;right:150px;top:110mm;display:flex;gap:16px}.firmas div{flex:1;border-top:1px solid #000;padding:2px 0 0 10px}' +
            '</style></head><body><div class="hoja"><div class="cab"><div class="logo">' + logo + '</div><div>' +
            '<div class="r1"><div><b>' + escapar(m.empresa || 'MEGALUMINIO SERVICIOS SA DE CV') + '</b><br>' + escapar(o.titulo) + '</div>' +
            '<div style="text-align:right"><b>Docto_id: ' + o.id + '</b><br><small>Fecha Imp. ' + escapar(new Date().toLocaleString('es-MX')) + '</small></div></div>' +
            '<div class="r2"><div>Codigo: CN-REG-35</div><div>FOLIO OT:<br>&nbsp;&nbsp;' + escapar(o.folioOt) + '</div>' +
            '<div>Fecha: ' + escapar(o.fecha) + (o.concepto ? '<br><span style="font-weight:400">Concepto: ' + escapar(o.concepto) + '</span>' : '') + '</div></div></div></div>' +
            '<div class="sec"><div class="est">ESTATUS:<b>' + escapar(o.estatus) + '</b></div>' +
            '<div class="obra">Obra: ' + escapar($('nombreObra').value) + '</div><br>' +
            (o.unidad != null ? '<b>Unidad de Transporte: ' + escapar(o.unidad) + '</b>' : '') + '</div>' +
            '<div class="barra"></div>' + (o.total ? '<div class="total">Total: ' + escapar(o.total) + '</div>' : '') +
            '<div class="per">' + o.cuerpo + '</div>' +
            '<div class="sec">Descripcion: ' + escapar(o.descripcion) + '</div>' +
            '<div class="firmas"><div>REALIZO</div><div>RECIBIO</div><div>REVISO</div><div>AUTORIZO</div></div>' +
            '</div></body></html>';
        var w = window.open('', '_blank');
        if (!w) { alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio.'); return; }
        w.document.write(html);
        w.document.close();
        w.onload = function () { w.focus(); w.print(); };
    }

    // imprime_salida_de_personal_a_obra
    function moImprimir() {
        if (!mo.id) { alert('Guarda el documento para poder imprimirlo.'); return; }
        imprimirFormato({
            titulo: 'SALIDA DE PERSONAL A OBRA', id: mo.id, folioOt: moTextoSel($('moOrden')), fecha: fechaDMY($('moFecha').value),
            estatus: mo.estatus, unidad: moTextoSel($('moUnidad')), descripcion: $('moNotas').value,
            cuerpo: '<b>PERSONAL ASIGNADO A TRABAJAR EN OBRA: </b>' + mo.filas.map(function (f) { return '<div>' + escapar(f.nombre) + '</div>'; }).join('')
        });
    }

    var MO_BOTONES = {
        'guardar': function () { moGuardar(false); },
        'guardar-salir': function () { moGuardar(true); },
        'imprimir': moImprimir,
        'modificar': moModificar,
        'cancelar': moCancelar,
        'bitacora': function () { verBitacora('mo', mo.id); },
        'cerrar': function () { cerrarDoc($('moDialogo')); }
    };
    $('moDialogo').addEventListener('click', function (e) {
        var b = e.target.closest('[data-mo]');
        if (b && !b.disabled) MO_BOTONES[b.dataset.mo]();
    });
    vigilarCambios($('moDialogo'));
    document.querySelectorAll('[data-mo-bit-cerrar]').forEach(function (b) {
        b.addEventListener('click', function () { $('moBitacora').close(); });
    });

    // 8-Gastos adicionales: Gastos de Obra (Dialog274)
    var ga = { id: 0, personal: [], conceptos: [], estatus: 'Normal', editable: true, cat: null };

    function gaHabilita(val) {
        ga.editable = val;
        $('gaDialogo').querySelectorAll('.mo-edit').forEach(function (el) { el.disabled = !val; });
        estadoDocumento($('gaDialogo'), { guardado: !!ga.id, editable: val, cancelado: ga.estatus === 'Cancelado' });
        gaPintar();
    }
    function gaPonerEstatus(e) {
        ga.estatus = e;
        $('gaEstatus').textContent = e;
        $('gaEstatus').classList.toggle('cancelado', e === 'Cancelado');
    }
    // grid_responsables y grid_gas_det
    function gaPintar() {
        var dis = ga.editable ? '' : ' disabled';
        var quitar = ga.editable ? '<button type="button" class="quitar" title="Quitar">🗑</button>' : '';
        $('gaPersonalFilas').innerHTML = ga.personal.length ? ga.personal.map(function (f, i) {
            return '<tr data-i="' + i + '"><td>' + escapar(f.nombre) + '</td><td style="width:26px">' + quitar + '</td></tr>';
        }).join('') : '<tr class="vacio"><td colspan="2">Elija al personal de obra y presione +</td></tr>';
        $('gaConceptos').innerHTML = ga.conceptos.length ? ga.conceptos.map(function (f, i) {
            return '<tr data-i="' + i + '"><td><input class="txt" list="gaListaConceptos" autocomplete="off" data-col="concepto" value="' + escapar(f.concepto) + '"' + dis + '></td>' +
                ['imp_presupuestado', 'imp_real'].map(function (c) {
                    return '<td style="width:120px"><input type="number" step="any" min="0" data-col="' + c + '" value="' + escapar(f[c]) + '"' + dis + '></td>';
                }).join('') + '<td style="width:26px">' + quitar + '</td></tr>';
        }).join('') : '<tr class="vacio"><td colspan="4">Agregue los conceptos del gasto con el botón +</td></tr>';
        gaTotales();
    }
    // calcula_tot_grid_gastos
    function gaTotales() {
        var t1 = 0, t2 = 0;
        ga.conceptos.forEach(function (f) { t1 += num(f.imp_presupuestado); t2 += num(f.imp_real); });
        $('gaImporte').value = dinero(t1) || '$0.00';
        $('gaImpReal').value = dinero(t2) || '$0.00';
        return t1;
    }
    function ahoraLocal() {
        var d = new Date();
        return hoy() + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }

    // carga_inicial; doc = gasto guardado (doble clic en 8-Gastos): se consulta y se desbloquea con Modificar
    function dialogoGasto(doc) {
        catalogosObra().then(function (cat) {
            ga.cat = cat;
            ga.id = doc ? doc.id : 0;
            ga.personal = doc ? doc.personal.map(function (p) { return Object.assign({}, p); }) : [];
            ga.conceptos = doc ? doc.detalle.map(function (p) { return Object.assign({}, p); }) : [{ concepto: '', imp_presupuestado: 0, imp_real: 0 }];
            moOpciones($('gaOrden'), [{ v: '', t: '' }].concat(cat.ordenes.map(function (o) { return { v: o.id, t: o.folio }; })),
                doc ? (doc.docto_orden_obra_id || '') : (cat.ordenes[0] ? cat.ordenes[0].id : ''));
            var unidad = 0;
            if (doc) unidad = num(doc.unidad_transporte_id) || (cat.unidades.filter(function (u) { return u.nombre === doc.nom_unidad; })[0] || { id: 0 }).id;
            moOpciones($('gaUnidad'), [{ v: 0, t: SIN_UNIDAD }].concat(cat.unidades.map(function (u) { return { v: u.id, t: u.nombre }; })), unidad);
            moOpciones($('gaPersonal'), cat.empleados.map(function (e) { return { v: e.id, t: e.nombre }; }), '');
            $('gaListaConceptos').innerHTML = cat.conceptos_gasto.map(function (c) { return '<option value="' + escapar(c.nombre) + '">'; }).join('');
            $('gaFecha').value = doc && doc.fecha ? String(doc.fecha).substr(0, 16) : ahoraLocal();
            $('gaNotas').value = doc ? (doc.notas || '') : '';
            gaPonerEstatus(doc && doc.estatus === 'Cancelado' ? 'Cancelado' : 'Normal');
            gaHabilita(!doc && obraAbierta());
            $('gaDialogo')._sucio = false;
            $('gaDialogo').showModal();
        }).catch(avisarError);
    }

    // Button2 (+): personal que solicita el recurso
    $('gaAgregar').addEventListener('click', function () {
        var sel = $('gaPersonal');
        if (!sel.value) return;
        if (ga.personal.some(function (f) { return String(f.id_empleado) === sel.value; })) {
            alert('El empleado seleccionado ya se encuentra en el gasto');
            return;
        }
        ga.personal.push({ id_empleado: +sel.value, nombre: moTextoSel(sel) });
        gaPintar();
    });
    $('gaAgregarConcepto').addEventListener('click', function () {
        ga.conceptos.push({ concepto: '', imp_presupuestado: 0, imp_real: 0 });
        gaPintar();
    });
    // CellEndEdit: recalcula los importes
    $('gaConceptos').addEventListener('input', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr || !e.target.dataset.col) return;
        ga.conceptos[tr.dataset.i][e.target.dataset.col] = e.target.value;
        gaTotales();
    });
    // EliminarArchivoToolStripMenuItem / ToolStripMenuItem1: quitar un concepto o un empleado
    $('gaConceptos').addEventListener('click', function (e) {
        if (!e.target.closest('.quitar')) return;
        if (!confirm('¿Deseas archivar como eliminado el concepto seleccionado?')) return;
        ga.conceptos.splice(e.target.closest('tr').dataset.i, 1);
        gaPintar();
    });
    $('gaPersonalFilas').addEventListener('click', function (e) {
        if (!e.target.closest('.quitar')) return;
        if (!confirm('¿Deseas archivar como eliminado el empleado seleccionado?')) return;
        ga.personal.splice(e.target.closest('tr').dataset.i, 1);
        gaPintar();
    });

    // toll_guardar2 (Guardar: queda bloqueado) y tol_guardar (Guardar y Salir)
    function gaGuardar(salir) {
        if (hayNegativos(ga.conceptos, ['imp_presupuestado', 'imp_real'])) {
            alert('Hay importes negativos en los conceptos. Corrígelos para poder guardar.');
            return;
        }
        if (gaTotales() <= 0) {
            alert('No se agregaron gastos a la obra. Escriba el concepto y su importe presupuestado para poder guardar.');
            var primero = $('gaConceptos').querySelector('input');
            if (primero) primero.focus();
            return;
        }
        var d = {
            id: obraId, gasto_id: ga.id, fecha: $('gaFecha').value, docto_orden_obra_id: $('gaOrden').value,
            unidad_transporte_id: $('gaUnidad').value, nom_unidad: moTextoSel($('gaUnidad')),
            notas: $('gaNotas').value, detalle: ga.conceptos, personal: ga.personal
        };
        conAutorizacion(function (a) {
            return enviar('guardar_gasto', Object.assign({ autoriza: a }, d));
        }, ga.id ? 'Modificar el gasto requiere el permiso «Modificar gastos adicionales de la obra».'
                 : 'Esta captura requiere el permiso «Modificar obras».').then(function (j) {
            ga.id = j.gasto_id;
            catObra = null;   // pudo darse de alta un concepto nuevo
            cargarListado('gastos', 'gastos');
            $('gaDialogo')._sucio = false;
            if (salir) $('gaDialogo').close();
            else gaHabilita(false);
            notificar('Se guardó correctamente.');
        }).catch(avisarError);
    }

    // tool_modificar
    function gaModificar() {
        if (!validaEstatusObra()) return;
        if (ga.estatus === 'Cancelado') { alert('No es posible modificar un documento cancelado'); return; }
        gaHabilita(true);
    }

    // ToolStripButton1: archivar como cancelado con su motivo
    function gaCancelar() {
        if (!validaEstatusObra()) return;
        if (!ga.id) { alert('El documento aún no se ha guardado.'); return; }
        if (ga.estatus === 'Cancelado') { alert('El documento ya está cancelado.'); return; }
        if (!confirm('¿Deseas archivar como cancelado este documento?')) return;
        var motivo = prompt('INGRESA EL MOTIVO DE CANCELACION: ', '');
        if (motivo === null) return;
        conAutorizacion(function (a) {
            return enviar('cancelar_gasto', { id: obraId, doc_id: ga.id, motivo: motivo, autoriza: a });
        }, 'Cancelar el gasto requiere el permiso «Cancelar gastos adicionales de la obra».').then(function () {
            gaPonerEstatus('Cancelado');
            gaHabilita(false);
            cargarListado('gastos', 'gastos');
            notificar('El gasto quedó cancelado.');
        }).catch(avisarError);
    }

    // imprime_gasto_adicional_obra: RECIBO DE GASTO PARA OBRA
    function gaImprimir() {
        if (!ga.id) { alert('Guarda el documento para poder imprimirlo.'); return; }
        var conceptos = ga.conceptos.filter(function (c) { return String(c.concepto || '').trim(); });
        var f = $('gaFecha').value;
        imprimirFormato({
            titulo: 'RECIBO DE GASTO PARA OBRA', id: ga.id, folioOt: moTextoSel($('gaOrden')),
            fecha: fechaDMY(f.substr(0, 10)) + (f.length > 10 ? ' ' + f.substr(11, 5) : ''),
            concepto: conceptos[0] ? conceptos[0].concepto : '', estatus: ga.estatus, unidad: moTextoSel($('gaUnidad')),
            descripcion: $('gaNotas').value, total: dinero(gaTotales()) || '$0.00',
            cuerpo: (ga.personal.length ? '<b>PERSONAL QUE SOLICITA RECURSO: </b>' + ga.personal.map(function (p) { return '<div>' + escapar(p.nombre) + '</div>'; }).join('') : '') +
                (conceptos.length ? '<br><b>CONCEPTOS: </b><table>' + conceptos.map(function (c) {
                    return '<tr><td>' + escapar(c.concepto) + '</td><td>' + escapar(dinero(num(c.imp_presupuestado)) || '$0.00') + '</td></tr>';
                }).join('') + '</table>' : '')
        });
    }

    var GA_BOTONES = {
        'guardar': function () { gaGuardar(false); },
        'guardar-salir': function () { gaGuardar(true); },
        'imprimir': gaImprimir,
        'modificar': gaModificar,
        'cancelar': gaCancelar,
        'bitacora': function () { verBitacora('gasto', ga.id); },
        'cerrar': function () { cerrarDoc($('gaDialogo')); }
    };
    $('gaDialogo').addEventListener('click', function (e) {
        var b = e.target.closest('[data-mo]');
        if (b && !b.disabled) GA_BOTONES[b.dataset.mo]();
    });
    vigilarCambios($('gaDialogo'));

    function abrirDocumento(tipo, id, dialogo) {
        pedir('accion=documento&tipo=' + tipo + '&id=' + encodeURIComponent(obraId) + '&doc=' + encodeURIComponent(id))
            .then(function (j) { dialogo(j.documento); }).catch(avisarError);
    }

    // Form21.abre_salida_materiales / Dialog59: la salida de material con sus artículos, solo consulta
    function verSalida(d) {
        formulario({
            titulo: 'Movimiento de Inventario · ' + (d.estatus || ''), soloLectura: true,
            campos: [
                { id: 'concepto', etiqueta: 'Concepto', valor: d.nom_concepto }, { id: 'almacen', etiqueta: 'Almacen', valor: d.nom_almacen },
                { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: dia(d.fecha) }, { id: 'folio', etiqueta: 'Folio', valor: d.folio_microsip },
                { id: 'ot', etiqueta: 'Orden de Trabajo', valor: d.ot }, { id: 'docto', etiqueta: 'Docto_In_Id (Microsip)', valor: d.docto_in_id },
                { id: 'descripcion', etiqueta: 'Descripcion', tipo: 'textarea', valor: d.descripcion }
            ],
            grids: [{ id: 'articulos', titulo: 'Documento', filas: d.articulos, columnas: [
                { id: 'id', etiqueta: 'ID', ancho: '90px' }, { id: 'clave_art', etiqueta: 'Clave', ancho: '110px' }, { id: 'nom_art', etiqueta: 'Descripcion' },
                { id: 'unidades', etiqueta: 'Unidades', ancho: '80px' }, { id: 'costo_unitario', etiqueta: 'Costo', ancho: '100px' },
                { id: 'costo_total', etiqueta: 'Costo Total', ancho: '110px', total: true, calc: function (f) { return num(f.costo_total); } }
            ] }]
        });
    }
    // Form21.abre_consumo_material_en_obra, solo consulta
    function verConsumo(d) {
        formulario({
            titulo: 'Consumible de Material en Obra · ' + (d.estatus || ''), soloLectura: true,
            campos: [
                { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: dia(d.fecha) }, { id: 'folio', etiqueta: 'Folio', valor: d.folio },
                { id: 'ot', etiqueta: 'Orden de Trabajo', valor: d.ot }, { id: 'unidad', etiqueta: 'Unidad', valor: d.nom_unidad },
                { id: 'usuario', etiqueta: 'Usuario', valor: d.usuario_creacion },
                { id: 'descripcion', etiqueta: 'Descripcion', tipo: 'textarea', valor: d.descripcion }
            ],
            grids: [{ id: 'articulos', titulo: 'Documento', filas: d.articulos, columnas: [
                { id: 'clave', etiqueta: 'Clave', ancho: '110px' }, { id: 'descripcion', etiqueta: 'Descripcion' },
                { id: 'uds_consumo', etiqueta: 'Uds.Consumo', ancho: '100px' }, { id: 'unimed', etiqueta: 'U.Med.', ancho: '70px' }
            ] }]
        });
    }

    // Doble clic en un renglón de cada pestaña
    var DOBLE_CLIC = {
        ordenes: function (f) { abrirDocumento('orden', f.orden_id || f.id, dialogoOrden); },
        mano: function (f) {
            if (vistaDe('mano').dataset.modo === 'comisiones') abrirDocumento('comision', f.id, function (d) { dialogoComision(d); });
            else abrirDocumento('mo', f.id, dialogoManoObra);
        },
        gastos: function (f) { abrirDocumento('gasto', f.id, dialogoGasto); },
        explosion: dialogoPartidaExplosion,
        salidas: function (f) { if (modoSalidas === 'doctos') abrirDocumento('salida', f.id, verSalida); },
        microsip: function (f) { abrirDocumento('salida', f.id, verSalida); },
        consumos: function (f) { abrirDocumento('consumo', f.id, verConsumo); },
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
        'exportar': function (vista) {
            exportar(vista, (vista.dataset.vista === 'microsip' ? 'Movimientos Microsip ' : 'Materiales de Obra ') + $('nombreObra').value);
        },
        'imprimir-salidas': function () { if (requiereObra()) imprimirExplosionSalidas(); },
        'importar-explosion': function () { if (puedeCapturar()) dialogoImportarExplosion(); },
        'nueva-comis-admin': function () { if (puedeCapturar()) dialogoComision(null, 1); },
        'nueva-comis-oper': function () { if (puedeCapturar()) dialogoComision(null, 2); },
        'nueva-cot': function () {
            if (puedeCapturar('Es necesario guardar la obra para registrar una Cotizacion para Facturacion.')) dialogoCotizacion(null);
        },
        'asignar-cot': asignarCotizacion,
        'nuevo-cobro': function () { if (puedeCapturar('Es necesario guardar la obra para registrar un documento de cobro.')) dialogoCobro(null); },
        'nueva-ot': function () {
            if (puedeCapturar('Es necesario guardar la obra para registrar una orden de trabajo.')) dialogoOrden(null);
        },
        'nueva-explosion': function () { if (puedeCapturar()) dialogoExplosion(); },
        'explosion-presupuesto': function () { if (puedeCapturar('Es necesario guardar la obra.')) explosionDesdePresupuesto(); },
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
            if (!tr || !tr.dataset.i || e.target.closest('a, button, input, select')) return;
            tr.classList.toggle('sel');
            if (vista.dataset.vista === 'facturacion') {
                var f = (datosListado.facturacion || [])[tr.dataset.i];
                if (f && f.detalle && f.detalle.length) verDetalleFactura(f); else $('facDetalle').hidden = true;
            }
        });
    });

    // Respuesta de la API de Easy-Glass en líneas legibles (texto y valores sueltos, sin el JSON completo)
    function resumenEnvio(d, prefijo) {
        if (d == null || typeof d !== 'object') return d == null || d === '' ? [] : [String(d)];
        var lineas = [];
        Object.keys(d).forEach(function (k) {
            var v = d[k], et = (prefijo ? prefijo + ' › ' : '') + k.replace(/_/g, ' ');
            if (v == null || v === '') return;
            if (typeof v !== 'object') lineas.push(et + ': ' + v);
            else if (Array.isArray(v) && v.every(function (x) { return typeof x !== 'object'; })) { if (v.length) lineas.push(et + ': ' + v.join(', ')); }
            else if (!Array.isArray(v)) lineas = lineas.concat(resumenEnvio(v, et));
            else lineas.push(et + ': ' + v.length + ' renglón(es)');
        });
        return lineas.slice(0, 25);
    }
    // «Enviar a Facturacion» de Easy-Glass: primero simula (valida sin escribir), luego confirma y envía
    function enviarMicrosip(f) {
        var folio = 'EG' + ('0000000' + f.eg_folio).slice(-7);
        enviar('enviar_microsip', { id: obraId, folio: f.eg_folio, simular: 1 }).then(function (j) {
            var res = resumenEnvio(j.resultado);
            if (!confirm('Validación correcta del folio ' + folio + (res.length ? ':\n\n' + res.join('\n') : '.') +
                '\n\n¿Enviar a Microsip? Se dará de alta el Pedido de venta y la Orden de compra, y el presupuesto pasará a Facturación.')) return;
            return conAutorizacion(function (a) {
                return enviar('enviar_microsip', { id: obraId, folio: f.eg_folio, autoriza: a });
            }, 'Enviar a Microsip requiere el permiso «Enviar presupuestos de Easy-Glass a Microsip».').then(function (r) {
                var lin = resumenEnvio(r.resultado);
                alert('Se envió a Microsip el folio ' + folio + '.' + (lin.length ? '\n\n' + lin.join('\n') : ''));
                cargarFacturacion();
            });
        }).catch(function (err) {
            if (!err.cancelado) alert('No se puede enviar el folio ' + folio + ' a Microsip:\n\n' + err.message);
        });
    }

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
        if (f.eg_folio && obraAbierta()) opciones.push(['📤 Enviar a Microsip', function () { enviarMicrosip(f); }]);
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

    // ---------- Subpestañas: 3-Orden Trabajo (Ordenes / Produccion) y 6-Mano de Obra (Mano de Obra / Comisiones) ----------
    var MODOS = {
        ordenes: {
            ordenes: {
                tipo: 'ordenes', vacio: 'No existen ordenes de trabajo asignadas a esta obra',
                columnas: [['Folio', 'folio', 'txt'], ['Estatus', 'estatus', 'txt'], ['Fecha Inicio', 'fecha', 'fecha'], ['Fecha Cierre', 'fecha_entrega', 'fecha'],
                           ['Importe', 'importe_neto', 'dinero']],
                totales: [['totOrdenes', 'Sub Total', 'importe_neto']]
            },
            // retorna_material_a_producir_por_obra (ToolStripButton8)
            produccion: {
                tipo: 'produccion', vacio: 'Las ordenes de trabajo de esta obra no tienen material a producir',
                columnas: [['Folio OT', 'folio', 'txt'], ['Estatus', 'estatus', 'txt'], ['Clave', 'clave_articulo', 'txt'], ['Descripcion', 'descripcion', 'txt'],
                           ['Unidades', 'unidades', 'num'], ['Uds. Producidas', 'uds_prod', 'num'], ['U.M.', 'um', 'txt'], ['Notas', 'notas_adic', 'txt']],
                totales: []
            }
        },
        mano: {
            mano: {
                tipo: 'mano',
                columnas: [['Fecha', 'fecha', 'fecha'], ['Estatus', 'estatus', 'txt'], ['Folio_RS', 'folio', 'txt'], ['Unidad transporte', 'nom_unidad', 'txt'],
                           ['Importe', 'importe_mo', 'dinero'], ['Imp.Real', 'importe_mo_real', 'dinero'], ['Notas', 'notas', 'txt']],
                totales: [['totMoPres', 'Total', 'importe_mo'], ['totMoReal', 'Total Real', 'importe_mo_real']]
            },
            // retorna_empleados_para_pago_comisiones_por_obra (ToolStripButton29)
            comisiones: {
                tipo: 'comisiones', vacio: 'No existen comisiones calculadas para esta obra',
                columnas: [['Fecha', 'fecha', 'fecha'], ['Estatus', 'estatus', 'txt'], ['Tipo', 'tipo_comis', 'txt'], ['Importe Neto', 'importe_neto', 'dinero'],
                           ['Notas', 'notas', 'txt'], ['Usuario', 'usuario_creacion', 'txt']],
                totales: [['totComis', 'Total comisiones', 'importe_neto']]
            }
        }
    };
    // Botones y totales de la subpestaña visible
    function marcarModo(vista) {
        vista.querySelectorAll('[data-modo-tab]').forEach(function (b) { b.classList.toggle('activo', b.dataset.modoTab === vista.dataset.modo); });
        vista.querySelectorAll('[data-solo-modo]').forEach(function (el) { el.hidden = el.dataset.soloModo !== vista.dataset.modo; });
    }
    function cargarModo(clave, modo) {
        var vista = vistaDe(clave);
        if (modo) vista.dataset.modo = modo;
        marcarModo(vista);
        var m = MODOS[clave][vista.dataset.modo];
        cambiarColumnas(vista, m.columnas, m.totales);
        datosListado[clave] = [];
        pintarListado(vista, [], obraId ? 'Consultando…' : 'Guarda la obra para consultar.');
        return cargarListado(clave, m.tipo, m.vacio);
    }
    document.querySelectorAll('.ob-modos').forEach(function (nav) {
        var vista = nav.closest('.vista');
        marcarModo(vista);
        nav.addEventListener('click', function (e) {
            var b = e.target.closest('[data-modo-tab]');
            if (b && b.dataset.modoTab !== vista.dataset.modo) cargarModo(vista.dataset.vista, b.dataset.modoTab);
        });
    });

    // ---------- 6-Mano de Obra › Comisiones (Dialog29): administrativos (tipo 1) u operativos (tipo 2) ----------
    // Operativos nace con los empleados que trabajaron en la obra y sus horas (retorna_empleados_asignados_por_obra_resumen)
    var PERMISO_COMIS = 'Calcular comisiones requiere el permiso «Calcular y cancelar comisiones de la obra».';
    function dialogoComision(doc, tipoNuevo, editar) {
        var tipo = doc ? parseInt(doc.tipo_id, 10) : tipoNuevo;
        var resumen = !doc && tipo === 2 ? pedir('accion=listado&tipo=mo_resumen&id=' + encodeURIComponent(obraId)) : Promise.resolve({ filas: [] });
        Promise.all([catalogosObra(), resumen]).then(function (r) {
            var cat = r[0], horas = r[1].filas;
            var cancelado = !!doc && String(doc.estatus).trim() === 'Cancelado';
            var filas = doc ? doc.empleados : horas.map(function (e) {
                return { empleado_id: e.id_empleado, nombre: e.nombre, hrs_trabajadas: e.hrs_trab, por_comision: 0, importe_pagar: 0, descuentos: 0 };
            });
            if (!filas.length) filas = [{}];
            var acciones = [];
            if (doc) acciones.push({ texto: '🖨 Imprimir', fn: function () { imprimirComision(doc); } });
            if (doc && !editar && !cancelado && obraAbierta()) acciones.push({ texto: '✎ Modificar', fn: function () {
                setTimeout(function () { dialogoComision(doc, null, true); }, 0);
                return Promise.resolve();
            } });
            if (doc && !cancelado && obraAbierta()) acciones.push({ texto: '✕ Cancelar comisión', fn: function () {
                if (!confirm('¿Deseas archivar como cancelado este documento?')) return Promise.resolve(false);
                var motivo = prompt('INGRESA EL MOTIVO DE CANCELACION: ', '');
                if (motivo === null) return Promise.resolve(false);
                return conAutorizacion(function (a) {
                    return enviar('cancelar_comision', { id: obraId, doc_id: doc.id, motivo: motivo, autoriza: a });
                }, PERMISO_COMIS).then(function () {
                    notificar('La comisión quedó cancelada.');
                    cargarModo('mano', 'comisiones');
                });
            } });
            formulario({
                titulo: (tipo === 1 ? 'Calculo de Comisiones Administrativos' : 'Calculo de Comisiones Operativos') +
                        (doc ? ' · ' + doc.id + ' · ' + doc.estatus : ''),
                aviso: cancelado ? 'Comisión cancelada: solo se puede consultar.'
                    : !doc && tipo === 2 && !horas.length ? 'La obra aún no tiene mano de obra asignada: agrega a los empleados a mano.'
                    : 'Neto de cada empleado = importe a pagar − descuentos. El total entra como mano de obra real en la analítica.',
                soloLectura: cancelado || !obraAbierta() || (!!doc && !editar),
                campos: [
                    { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', valor: doc ? dia(doc.fecha) : hoy() },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: doc ? doc.notas : '' }
                ],
                grids: [{
                    id: 'empleados', titulo: 'Empleados', filas: filas,
                    columnas: [
                        { id: 'nombre', etiqueta: 'Empleado', tipo: 'lista', opciones: cat.empleados.map(function (e) { return { t: e.nombre, id: e.id }; }),
                          alElegir: function (f, item) { f.empleado_id = item ? item.id : ''; } },
                        { id: 'hrs_trabajadas', etiqueta: 'Hrs. trabajadas', tipo: 'number', ancho: '100px' },
                        { id: 'por_comision', etiqueta: '% Comisión', tipo: 'number', ancho: '90px' },
                        { id: 'importe_pagar', etiqueta: 'Importe a pagar', tipo: 'number', ancho: '120px', total: true },
                        { id: 'descuentos', etiqueta: 'Descuentos', tipo: 'number', ancho: '110px', total: true },
                        { id: 'neto', etiqueta: 'Neto', ancho: '110px', total: true, calc: function (f) { return num(f.importe_pagar) - num(f.descuentos); } }
                    ]
                }],
                acciones: acciones,
                guardar: function (d) {
                    var emp = d.empleados.filter(function (f) { return String(f.nombre || '').trim(); });
                    if (!emp.length) { alert('Agrega al menos un empleado a la comisión.'); return false; }
                    if (hayNegativos(emp, ['hrs_trabajadas', 'por_comision', 'importe_pagar', 'descuentos'])) { alert('Hay cantidades negativas en la lista.'); return false; }
                    return conAutorizacion(function (a) {
                        return enviar('guardar_comision', { id: obraId, comision_id: doc ? doc.id : 0, tipo_id: tipo, fecha: d.fecha, notas: d.notas, empleados: emp, autoriza: a });
                    }, PERMISO_COMIS).then(function () { cargarModo('mano', 'comisiones'); });
                }
            });
        }).catch(avisarError);
    }

    function imprimirComision(c) {
        var tot = 0;
        var filas = c.empleados.map(function (e) {
            var neto = num(e.importe_pagar) - num(e.descuentos);
            tot += neto;
            return '<tr><td>' + escapar(e.nombre) + '</td><td class="n">' + numero(e.hrs_trabajadas) + '</td><td class="n">' + numero(e.por_comision) + ' %</td>' +
                '<td class="n">' + dinero(e.importe_pagar) + '</td><td class="n">' + dinero(e.descuentos) + '</td><td class="n">' + dinero(neto) + '</td></tr>';
        }).join('');
        imprimirFormato({
            titulo: parseInt(c.tipo_id, 10) === 1 ? 'CALCULO DE COMISIONES ADMINISTRATIVOS' : 'CALCULO DE COMISIONES OPERATIVOS',
            id: c.id, folioOt: '', fecha: fechaDMY(dia(c.fecha)), estatus: c.estatus, unidad: null, descripcion: c.notas || '', total: dinero(tot),
            cuerpo: '<style>.cm{width:100%;border-collapse:collapse;margin-top:60px}.cm th,.cm td{border:1px solid #000;padding:2px 6px}.cm .n{text-align:right}</style>' +
                '<table class="cm"><thead><tr><th>Empleado</th><th>Hrs.</th><th>% Comisión</th><th>Importe</th><th>Descuentos</th><th>Neto</th></tr></thead><tbody>' + filas + '</tbody></table>'
        });
    }

    // ---------- 4-Explosion de material › Importar: renglones copiados de Excel o un archivo CSV ----------
    // Columnas en orden: Clave, Nombre, U.M., Uds, Costo Unit. Un encabezado (Uds no numérica) se salta.
    function leerTabla(texto) {
        var lineas = String(texto || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
        var sep = lineas.some(function (l) { return l.indexOf('\t') >= 0; }) ? '\t' : (lineas.some(function (l) { return l.indexOf(';') >= 0; }) ? ';' : ',');
        return lineas.map(function (l) {
            var cols = [], actual = '', comillas = false;
            for (var i = 0; i < l.length; i++) {
                var ch = l[i];
                if (ch === '"') { if (comillas && l[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
                else if (ch === sep && !comillas) { cols.push(actual); actual = ''; }
                else actual += ch;
            }
            cols.push(actual);
            return cols.map(function (c) { return c.trim(); });
        });
    }
    function numeroTexto(v) { return parseFloat(String(v || '').replace(/[$\s,]/g, '')); }
    function dialogoImportarExplosion() {
        formulario({
            titulo: 'Explosión de Material · Importar',
            aviso: 'Copia de Excel las columnas Clave, Nombre, U.M., Uds y Costo Unit. (en ese orden) y pégalas aquí, o elige un archivo CSV con esas columnas. Si el primer renglón es el encabezado, se salta.',
            campos: [{ id: 'texto', etiqueta: 'Renglones', tipo: 'textarea', ancho: true }],
            acciones: [{ texto: '📂 Elegir CSV…', fn: function () {
                var inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = '.csv,.txt,text/csv,text/plain';
                inp.onchange = function () {
                    var f = inp.files[0];
                    if (!f) return;
                    f.text().then(function (t) {
                        var area = document.querySelector('#frmCuerpo [data-campo="texto"]');
                        area.value = t.replace(/^﻿/, '');
                        $('frmDialogo')._sucio = true;
                    });
                };
                inp.click();
            } }],
            guardar: function (d) {
                var partidas = [], malas = [];
                leerTabla(d.texto).forEach(function (c, i) {
                    var uds = numeroTexto(c[3]), cu = numeroTexto(c[4]);
                    if (isNaN(uds)) { if (i > 0 || c.length < 4) malas.push(i + 1); return; }   // el encabezado no cuenta
                    if (!c[1]) { malas.push(i + 1); return; }
                    partidas.push({ clave: c[0], nombre: c[1], um: c[2] || '', uds: uds, costo_unit: isNaN(cu) ? 0 : cu, tipo_docto: 'IMPORTACION' });
                });
                if (!partidas.length) { alert('No se encontró ningún renglón con nombre y unidades numéricas.'); return false; }
                if (hayNegativos(partidas, ['uds', 'costo_unit'])) { alert('Hay unidades o costos negativos. Corrígelos para importar.'); return false; }
                var total = partidas.reduce(function (s, p) { return s + p.uds * p.costo_unit; }, 0);
                if (!confirm('Se agregarán ' + partidas.length + ' artículos a la explosión por ' + dinero(total) + '.' +
                    (malas.length ? '\n\nSe omiten los renglones ' + malas.join(', ') + ' (sin nombre o con unidades no numéricas).' : '') + '\n\n¿Continuar?')) return false;
                return guardarCon('agregar_explosion', { partidas: partidas }).then(function (j) {
                    notificar('Se importaron ' + j.agregadas + ' artículos.', 'ok');
                    cargarListado('explosion', 'explosion', 'No existen datos para mostrar');
                });
            }
        });
    }

    // ---------- 11-Parametros › Pedidos relacionados y Costos adicionales ----------
    var catGasOper = [];
    var pedidos = [], costosAdic = [], pedEdit = false, cadEdit = false;
    var TIPOS_PEDIDO = [{ v: 'PV', t: 'Pedido de venta' }, { v: 'PE', t: 'Pedido Easy-Glass' }, { v: 'OC', t: 'Orden de compra' }, { v: 'OT', t: 'Otro' }];

    function pintarPedidos() {
        var tot = 0;
        $('pedFilas').innerHTML = pedidos.length ? pedidos.map(function (p, i) {
            tot += num(p.costo_tot);
            return '<tr data-i="' + i + '"><td class="sel-col"></td><td class="txt">' + escapar(p.tipo) + '</td><td class="txt">' + escapar(p.folio) + '</td>' +
                '<td class="num">' + numero(p.uds) + '</td><td class="num">' + dinero(p.costo_tot) + '</td></tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="5">Sin pedidos relacionados.</td></tr>';
        $('pedTotal').textContent = dinero(tot) || '$0.00';
    }
    function cargarPedidos() {
        $('pedEstado').textContent = 'Consultando…';
        return pedir('accion=listado&tipo=pedidos&id=' + encodeURIComponent(obraId)).then(function (j) {
            pedidos = j.filas;
            pintarPedidos();
            $('pedEstado').textContent = pedidos.length + ' pedido(s)' + (pedEdit ? ' · doble clic para modificar' : '');
        }).catch(function (err) { $('pedEstado').textContent = '⚠ ' + err.message; });
    }
    // habilita_controles3
    function habilitaPedidos(val) {
        pedEdit = val;
        document.querySelectorAll('.ped-edit').forEach(function (b) { b.disabled = !val; });
        $('pedModificar').disabled = val;
    }
    function dialogoPedido(p) {
        formulario({
            titulo: p ? 'Pedido relacionado · ' + p.folio : 'Agregar Pedido relacionado',
            campos: [
                { id: 'tipo_docto', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS_PEDIDO, valor: p ? String(p.tipo_docto).trim() : 'PV' },
                { id: 'folio', etiqueta: 'Folio', valor: p ? p.folio : '' },
                { id: 'unidades', etiqueta: 'Unidades (m²)', tipo: 'number', valor: p ? p.uds : '' },
                { id: 'importe', etiqueta: 'Importe (costo)', tipo: 'number', valor: p ? p.costo_tot : '' }
            ],
            guardar: function (d) {
                if (!d.folio.trim()) { alert('Indica el folio del pedido.'); return false; }
                return guardarCon('guardar_pedido', { pedido_id: p ? p.id : 0, tipo_docto: d.tipo_docto, folio: d.folio.trim(), unidades: d.unidades, importe: d.importe })
                    .then(cargarPedidos);
            }
        });
    }
    $('pedMostrar').addEventListener('click', function () { if (requiereObra()) cargarPedidos(); });
    $('pedModificar').addEventListener('click', function () {
        if (!requiereObra() || !validaEstatusObra()) return;
        habilitaPedidos(true);
        $('pedEstado').textContent = 'Agrega, elimina o haz doble clic en un pedido para modificarlo.';
    });
    $('pedAgregar').addEventListener('click', function () { if (validaEstatusObra()) dialogoPedido(null); });
    $('pedFilas').addEventListener('dblclick', function (e) {
        var tr = e.target.closest('tr[data-i]');
        if (!tr) return;
        if (!pedEdit) { alert('Presiona Modificar para cambiar los pedidos relacionados.'); return; }
        dialogoPedido(pedidos[tr.dataset.i]);
    });
    // ToolStripButton38: elimina los pedidos seleccionados
    $('pedEliminar').addEventListener('click', function () {
        if (!validaEstatusObra()) return;
        var sel = Array.prototype.map.call($('pedFilas').querySelectorAll('tr.sel'), function (tr) { return pedidos[tr.dataset.i]; });
        if (!sel.length) { alert('Selecciona el pedido a eliminar.'); return; }
        if (!confirm(sel.length === 1 ? '¿Deseas eliminar el pedido seleccionado ?' : '¿Deseas eliminar los ' + sel.length + ' pedidos seleccionados ?')) return;
        sel.reduce(function (p, x) {
            return p.then(function () { return guardarCon('eliminar_pedido', { pedido_id: x.id }); });
        }, Promise.resolve()).then(cargarPedidos).catch(function (err) { avisarError(err); cargarPedidos(); });
    });

    function pintarCostosAdic() {
        var dis = cadEdit ? '' : ' disabled';
        $('cadFilas').innerHTML = costosAdic.length ? costosAdic.map(function (c, i) {
            return '<tr data-i="' + i + '"><td class="sel-col"></td><td class="txt">' + escapar(c.concepto_id) + '</td><td class="txt">' + escapar(c.concepto) + '</td>' +
                '<td><input type="number" class="num" step="any" min="0" max="100" data-pct value="' + escapar(c.porcentaje) + '"' + dis + '></td></tr>';
        }).join('') : '<tr class="vacio-fila"><td colspan="4">Sin costos adicionales.</td></tr>';
    }
    function cargarCostosAdic() {
        $('cadEstado').textContent = 'Consultando…';
        return pedir('accion=listado&tipo=costos_adic&id=' + encodeURIComponent(obraId)).then(function (j) {
            costosAdic = j.filas;
            pintarCostosAdic();
            $('cadEstado').textContent = costosAdic.length + ' concepto(s)';
        }).catch(function (err) { $('cadEstado').textContent = '⚠ ' + err.message; });
    }
    // habilita_controles23
    function habilitaCostosAdic(val) {
        cadEdit = val;
        document.querySelectorAll('.cad-edit').forEach(function (b) { b.disabled = !val; });
        $('cadModificar').disabled = val;
        pintarCostosAdic();
    }
    $('cadMostrar').addEventListener('click', function () {
        if (!requiereObra()) return;
        if (cadEdit && !confirm('Se perderán los cambios que no guardaste. ¿Volver a consultar?')) return;
        habilitaCostosAdic(false);
        cargarCostosAdic();
    });
    $('cadModificar').addEventListener('click', function () {
        if (!requiereObra() || !validaEstatusObra()) return;
        habilitaCostosAdic(true);
        $('cadEstado').textContent = 'Agrega conceptos, captura su % y presiona Guardar.';
    });
    $('cadFilas').addEventListener('input', function (e) {
        if (!e.target.matches('[data-pct]')) return;
        costosAdic[e.target.closest('tr').dataset.i].porcentaje = e.target.value;
    });
    // Button3: el concepto con su % de cálculo del catálogo (retorna_porcentaje_gastos_de_operacion)
    $('cadAgregar').addEventListener('click', function () {
        var sel = $('conGasOper');
        if (!sel.value) return;
        if (costosAdic.some(function (c) { return String(c.concepto_id) === sel.value; })) { alert('Ese concepto ya está en la lista.'); return; }
        var c = catGasOper.filter(function (x) { return String(x.id) === sel.value; })[0] || {};
        costosAdic.push({ id: 0, concepto_id: sel.value, concepto: sel.options[sel.selectedIndex].text, porcentaje: num(c.porcentaje) });
        pintarCostosAdic();
    });
    // ToolStripButton31: los guardados se borran en la base; los recién agregados solo de la lista
    $('cadEliminar').addEventListener('click', function () {
        var sel = Array.prototype.map.call($('cadFilas').querySelectorAll('tr.sel'), function (tr) { return costosAdic[tr.dataset.i]; });
        if (!sel.length) { alert('Selecciona el gasto adicional a eliminar.'); return; }
        if (!confirm('¿Deseas eliminar el gasto adicional seleccionado ?')) return;
        var guardados = sel.filter(function (c) { return num(c.id) > 0; });
        guardados.reduce(function (p, x) {
            return p.then(function () { return guardarCon('eliminar_costo_adic', { costo_id: x.id }); });
        }, Promise.resolve()).then(function () {
            costosAdic = costosAdic.filter(function (c) { return sel.indexOf(c) < 0; });
            pintarCostosAdic();
        }).catch(avisarError);
    });
    // ToolStripButton24 (guarda_conceptos_gas_adic_obra)
    $('cadGuardar').addEventListener('click', function () {
        if (costosAdic.some(function (c) { return num(c.porcentaje) < 0 || num(c.porcentaje) > 100; })) { alert('Cada % debe estar entre 0 y 100.'); return; }
        guardarCon('guardar_costos_adic', { conceptos: costosAdic.map(function (c) { return { concepto_id: c.concepto_id, porcentaje: c.porcentaje }; }) })
            .then(function () {
                notificar('Se guardaron los costos adicionales.', 'ok');
                habilitaCostosAdic(false);
                cargarCostosAdic();
            }).catch(avisarError);
    });
    function cargarParametros() {
        if (!obraId) return;
        cargado.parametros = true;
        habilitaPedidos(false);
        habilitaCostosAdic(false);
        return Promise.all([cargarPedidos(), cargarCostosAdic()]);
    }

    // ---------- Formatos impresos (Form4 del escritorio) ----------
    function ventanaImpresion(titulo, css, cuerpo) {
        var w = window.open('', '_blank');
        if (!w) { alert('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio.'); return; }
        w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escapar(titulo) + '</title><style>' +
            'body{font:11px Arial,sans-serif;color:#000;margin:0}table{width:100%;border-collapse:collapse}th,td{padding:2px 5px;vertical-align:top}' +
            '.n{text-align:right;white-space:nowrap}.b{font-weight:bold}.cab{display:grid;grid-template-columns:170px 1fr;border:1px solid #000}' +
            '.logo{display:flex;align-items:center;justify-content:center;padding:6px;border-right:1px solid #000}.logo img{max-width:150px;max-height:70px}' +
            '.cel{border-bottom:1px solid #000;padding:3px 8px}.fila{display:flex}.fila>div{flex:1;padding:3px 8px;border-left:1px solid #000}.fila>div:first-child{border-left:0}' +
            'h1{font-size:15px;margin:0}h2{font-size:12px;margin:10px 0 2px;padding:2px 5px;background:#eee;border:1px solid #000}' +
            '.t td,.t th{border:1px solid #999}.t th{background:#f2f2f2;text-align:left}.t tfoot td{font-weight:bold;border-top:2px solid #000}' +
            '.firmas{display:flex;gap:14px;margin-top:40px}.firmas div{flex:1;border-top:1px solid #000;text-align:center;padding-top:2px;font-weight:bold}' +
            '.neg{color:#c00}.avisos{color:#555;font-size:10px;margin-top:6px}' + css + '</style></head><body>' + cuerpo + '</body></html>');
        w.document.close();
        w.onload = function () { w.focus(); w.print(); };
    }
    // Encabezado: logo, empresa, título, Id de la obra, fecha de impresión, código y renglón de datos
    function encabezadoImpresion(titulo, codigo, datos) {
        var m = window.ACRI_MEMBRETE || {};
        var logo = m.logo ? '<img src="' + escapar(new URL(m.logo, location.href).href) + '">' : '';
        return '<div class="cab"><div class="logo">' + logo + '</div><div>' +
            '<div class="cel fila" style="padding:0"><div><h1>' + escapar(m.empresa || 'MEGALUMINIO SERVICIOS SA DE CV') + '</h1>' + escapar(titulo) + '</div>' +
            '<div style="flex:0 0 220px;text-align:right"><b>Id_Obra: ' + obraId + '</b><br><small>Fe.Imp: ' + escapar(new Date().toLocaleString('es-MX')) + '</small></div></div>' +
            '<div class="fila"><div class="b">Codigo: ' + codigo + '</div>' + datos.map(function (d) {
                return '<div><b>' + escapar(d[0]) + ':</b><br>' + escapar(d[1]) + '</div>';
            }).join('') + '</div></div></div>';
    }
    function difCelda(v) { return '<td class="n' + (v < 0 ? ' neg' : '') + '">' + dinero(v) + '</td>'; }

    // imprime_analitica_de_obra / imprime_analitica_de_obra_detalle (CT-REG-13)
    function imprimirAnalitica(detalle) {
        pedir('accion=analitica&id=' + encodeURIComponent(obraId) + (detalle ? '&detalle=1' : '')).then(function (a) {
            var o = a.obra, html = '';
            html += encabezadoImpresion('ANALITICA DE EJECUCION POR OBRA' + (detalle ? ' DETALLE' : ''), 'CT-REG-13', [
                ['Obra', o.nom_obra], ['Cliente', o.cliente || ''], ['Vendedor', o.vendedor || ''], ['Contacto', o.contacto || ''],
                ['Estatus', o.estatus], ['Fecha termino', fechaDMY(dia(o.fecha_fin))]
            ]);
            html += '<p><b>Presupuesto folio:</b> ' + escapar(o.folio || '—') + ' · <b>Orden de Trabajo (RS):</b> ' + escapar(a.ordenes.join(' ') || '—') +
                ' · <b>% Gastos de operación de la obra:</b> ' + numero(a.pct_admin) + ' %</p>';
            var tot = {};
            function seccion(clave, titulo) {
                var p = 0, r = 0;
                var filas = a[clave].map(function (l) {
                    p += l.presupuesto; r += l.real;
                    return '<tr><td>' + escapar(l.concepto) + '</td><td class="n">' + dinero(l.presupuesto) + '</td><td class="n">' + dinero(l.real) + '</td>' + difCelda(l.presupuesto - l.real) + '</tr>';
                }).join('') || '<tr><td colspan="4">Sin movimientos.</td></tr>';
                tot[clave] = { p: p, r: r };
                return '<h2>' + titulo + '</h2><table class="t"><thead><tr><th>Concepto</th><th class="n">Imp. Presupuestado</th><th class="n">Imp. Real</th><th class="n">Diferencia $</th></tr></thead>' +
                    '<tbody>' + filas + '</tbody><tfoot><tr><td>TOTAL ' + titulo + '</td><td class="n">' + dinero(p) + '</td><td class="n">' + dinero(r) + '</td>' + difCelda(p - r) + '</tr></tfoot></table>';
            }
            html += seccion('mp', 'MATERIA PRIMA') + seccion('mo', 'MANO DE OBRA') + seccion('go', 'GASTOS DE OPERACION');
            // Resumen: presupuestado (costo + utilidad del presupuesto) contra real (costo real y lo facturado sin IVA)
            var costoP = tot.mp.p + tot.mo.p + tot.go.p, costoR = tot.mp.r + tot.mo.r + tot.go.r;
            var u = num(o.utilidad_neta_por);
            // VB: utilidad = costo / ((100 − u) × 0.01) − costo
            var totalP = u < 100 ? costoP / ((100 - u) * 0.01) : costoP;
            var filasRes = [
                ['Subtotal (materia prima + mano de obra)', tot.mp.p + tot.mo.p, tot.mp.r + tot.mo.r],
                ['+ Gastos de operación', tot.go.p, tot.go.r],
                ['= Costo total', costoP, costoR],
                ['+ Utilidad neta' + (u ? ' (' + numero(u) + ' %)' : ''), totalP - costoP, a.facturado_sin_iva - costoR],
                ['= Total antes de IVA (presupuesto / facturado)', totalP, a.facturado_sin_iva]
            ];
            html += '<h2>RESUMEN</h2><table class="t"><thead><tr><th></th><th class="n">Presupuestado</th><th class="n">Real</th><th class="n">Diferencia $</th></tr></thead><tbody>' +
                filasRes.map(function (f) { return '<tr' + (f[0].charAt(0) === '=' ? ' class="b"' : '') + '><td>' + escapar(f[0]) + '</td><td class="n">' + dinero(f[1]) + '</td><td class="n">' + dinero(f[2]) + '</td>' + difCelda(f[1] - f[2]) + '</tr>'; }).join('') +
                '</tbody></table>';
            // Estatus del proceso de facturación
            var saldo = 0;
            html += '<h2>ESTATUS DEL PROCESO DE FACTURACION</h2><table class="t"><thead><tr><th>Folio</th><th>Tipo</th><th>Estatus</th><th>Cliente</th><th>Factura</th>' +
                '<th class="n">Imp. Factura</th><th class="n">Cargos</th><th class="n">Créditos</th><th class="n">Saldo</th></tr></thead><tbody>' +
                (a.facturacion.map(function (f) {
                    // VB: saldo de las cotizaciones de Microsip menos los pagos en efectivo
                    if (f.tipo === -1) saldo += num(f.saldo);
                    else if (f.tipo === 0) saldo -= num(f.importe);
                    return '<tr><td>' + escapar(f.folio) + '</td><td>' + escapar(f.tipo_docto) + '</td><td>' + escapar(f.estatus) + '</td><td>' + escapar(f.cliente) + '</td>' +
                        '<td>' + escapar(f.factura) + '</td><td class="n">' + dinero(f.imp_factura) + '</td><td class="n">' + dinero(f.cargos) + '</td>' +
                        '<td class="n">' + dinero(f.creditos) + '</td><td class="n">' + dinero(f.saldo) + '</td></tr>';
                }).join('') || '<tr><td colspan="9">Sin documentos de facturación.</td></tr>') +
                '</tbody><tfoot><tr><td colspan="8">Saldo</td><td class="n">' + dinero(saldo) + '</td></tr></tfoot></table>';

            if (detalle && a.detalle) {
                var d = a.detalle;
                var tabla = function (titulo, cols, filas) {
                    var suma = cols.map(function () { return 0; });
                    var cuerpo = filas.map(function (f) {
                        return '<tr>' + cols.map(function (c, k) {
                            var v = f[c[1]];
                            if (c[2] === '$') { suma[k] += num(v); return '<td class="n">' + dinero(v) + '</td>'; }
                            if (c[2] === 'n') return '<td class="n">' + numero(v) + '</td>';
                            if (c[2] === 'f') return '<td>' + fechaDMY(dia(v)) + '</td>';
                            return '<td>' + escapar(v) + '</td>';
                        }).join('') + '</tr>';
                    }).join('') || '<tr><td colspan="' + cols.length + '">Sin registros.</td></tr>';
                    var pie = cols.some(function (c) { return c[2] === '$'; }) ? '<tfoot><tr>' + cols.map(function (c, k) {
                        return c[2] === '$' ? '<td class="n">' + dinero(suma[k]) + '</td>' : '<td>' + (k === 0 ? 'Total' : '') + '</td>';
                    }).join('') + '</tr></tfoot>' : '';
                    return '<h2>' + titulo + '</h2><table class="t"><thead><tr>' + cols.map(function (c) {
                        return '<th' + (c[2] === '$' || c[2] === 'n' ? ' class="n"' : '') + '>' + c[0] + '</th>';
                    }).join('') + '</tr></thead><tbody>' + cuerpo + '</tbody>' + pie + '</table>';
                };
                html += tabla('DETALLE · MATERIALES ENTREGADOS A OBRA', [['OT', 'ot'], ['Folio Microsip', 'folio_microsip'], ['Fecha', 'fecha', 'f'], ['Clave', 'clave_art'],
                    ['Artículo', 'nom_art'], ['Uds', 'unidades', 'n'], ['U.M.', 'unid_med'], ['Costo', 'costo_total', '$']], d.salidas);
                html += tabla('DETALLE · MANO DE OBRA ASIGNADA', [['Fecha', 'fecha', 'f'], ['OT', 'folio'], ['Unidad', 'nom_unidad'], ['Importe MO', 'importe_mo', '$'],
                    ['Importe real', 'importe_real', '$'], ['Notas', 'notas']], d.mano);
                if (d.comisiones.length) html += tabla('DETALLE · COMISIONES', [['Fecha', 'fecha', 'f'], ['Notas', 'notas'], ['Importe neto', 'importe_neto', '$']], d.comisiones);
                html += tabla('DETALLE · GASTOS ADICIONALES', [['Fecha', 'fecha', 'f'], ['Concepto', 'concepto'], ['Importe', 'importe', '$'], ['Importe real', 'importe_real', '$'],
                    ['Notas', 'notas']], d.gastos);
                if (d.costos_adic.length) html += tabla('DETALLE · COSTOS ADICIONALES (% SOBRE ' + dinero(a.facturado_sin_iva) + ' FACTURADO SIN IVA)',
                    [['Concepto', 'concepto'], ['%', 'porcentaje', 'n'], ['Importe', 'importe', '$']], d.costos_adic);
            }
            if (o.notas) html += '<p><b>Notas:</b> ' + escapar(o.notas) + '</p>';
            html += '<div class="firmas"><div>ELABORO</div><div>REVISO</div><div>REVISO</div><div>AUTORIZO</div></div>' +
                '<div class="firmas" style="margin-top:28px"><div>Nombre y Firma</div><div>Nombre y Firma</div><div>Nombre y Firma</div><div>Nombre y Firma</div></div>';
            if (a.avisos.length) html += '<div class="avisos">Avisos: ' + a.avisos.map(escapar).join(' · ') + '</div>';
            ventanaImpresion('Analítica obra ' + obraId, '@page{size:letter;margin:10mm}', html);
        }).catch(avisarError);
    }

    // ToolStripButton30: explosión de materiales contra salidas a obra y material extra en producción (CT-REG-03)
    function imprimirExplosionSalidas() {
        var q = function (t) { return pedir('accion=listado&tipo=' + t + '&id=' + encodeURIComponent(obraId)); };
        Promise.all([q('explosion'), q('salidas_det')]).then(function (r) {
            var explo = r[0].filas, sal = r[1].filas.filter(function (s) { return !/^c/i.test(String(s.estatus || '').trim()); });
            if (!explo.length) { alert('No se asignó la explosión de materiales a la obra. Relaciónela para poder continuar con el reporte.'); return; }
            var filas = explo.map(function (x) {
                return { id: num(x.articulo_id), clave: x.clave, nombre: x.nombre, um: x.um, uds: num(x.uds), costo: num(x.costo_tot),
                         clave_s: '', nombre_s: '', um_s: '', uds_s: 0, costo_s: 0 };
            });
            sal.forEach(function (s) {
                var nom = String(s.nom_art || '').trim().toUpperCase();
                var f = filas.filter(function (y) { return (y.id && y.id === num(s.articulo_id)) || String(y.nombre || '').trim().toUpperCase() === nom; })[0];
                if (!f) { f = { id: 0, clave: '', nombre: '', um: '', uds: 0, costo: 0, clave_s: '', nombre_s: '', um_s: '', uds_s: 0, costo_s: 0 }; filas.push(f); }
                f.clave_s = s.clave_art; f.nombre_s = s.nom_art; f.um_s = s.unid_med;
                f.uds_s += num(s.uds); f.costo_s += num(s.costo_total);
            });
            var tE = 0, tS = 0, extra = [];
            var cuerpo = filas.map(function (f) {
                tE += f.costo; tS += f.costo_s;
                if (f.uds - f.uds_s < 0) {
                    var ue = Math.abs(f.uds - f.uds_s);
                    extra.push({ clave: f.clave_s, nombre: f.nombre_s, uds: ue, costo: f.uds === 0 ? Math.abs(f.costo_s) : Math.abs(f.costo_s / f.uds_s * ue) });
                }
                return '<tr><td>' + escapar(f.clave) + '</td><td>' + escapar(f.nombre) + '</td><td class="n">' + numero(f.uds) + '</td><td>' + escapar(f.um) + '</td><td class="n">' + dinero(f.costo) + '</td>' +
                    '<td>' + escapar(f.clave_s) + '</td><td>' + escapar(f.nombre_s) + '</td><td>' + escapar(f.um_s) + '</td><td class="n">' + numero(f.uds_s) + '</td><td class="n">' + dinero(f.costo_s) + '</td>' +
                    '<td class="n">' + numero(f.uds - f.uds_s) + '</td>' + difCelda(f.costo - f.costo_s) + '</tr>';
            }).join('');
            var tUx = 0, tCx = 0;
            var cuerpoExtra = extra.map(function (x) {
                tUx += x.uds; tCx += x.costo;
                return '<tr><td>' + escapar(x.clave) + '</td><td>' + escapar(x.nombre) + '</td><td class="n">' + numero(x.uds) + '</td><td class="n">' + dinero(x.costo) + '</td></tr>';
            }).join('') || '<tr><td colspan="4">Sin material extra.</td></tr>';
            var html = encabezadoImpresion('EXPLOSION DE MATERIALES · OBRA: ' + $('nombreObra').value, 'CT-REG-03', [
                ['Estatus', estatus], ['Fecha Inicio', fechaDMY($('fechaInicio').value)], ['Fecha Termino', fechaDMY($('fechaTermino').value)], ['Contacto', $('contacto').value]
            ]) +
                '<table class="t" style="margin-top:8px"><thead><tr><th colspan="5">EXPLOSION DE MATERIALES</th><th colspan="5">SALIDAS DE MATERIALES A OBRA</th><th colspan="2">DIFERENCIA</th></tr>' +
                '<tr><th>Clave</th><th>Descripcion</th><th class="n">Uds</th><th>UM</th><th class="n">Costo.tot</th><th>Clave</th><th>Descripcion</th><th>UM</th><th class="n">Uds</th>' +
                '<th class="n">Costo.tot</th><th class="n">Dif.Uds</th><th class="n">Dif.Costo</th></tr></thead><tbody>' + cuerpo + '</tbody>' +
                '<tfoot><tr><td colspan="4">Totales</td><td class="n">' + dinero(tE) + '</td><td colspan="4"></td><td class="n">' + dinero(tS) + '</td><td></td>' + difCelda(tE - tS) + '</tr></tfoot></table>' +
                '<table style="width:280px;margin:10px 0 0 auto"><tr><td class="b">Cotizado:</td><td class="n">' + dinero(tE) + '</td></tr><tr><td class="b">Real Utilizado:</td><td class="n">' + dinero(tS) + '</td></tr>' +
                '<tr><td class="b" style="border-top:1px solid #000">Diferencia:</td><td class="n b" style="border-top:1px solid #000">' + dinero(tE - tS) + '</td></tr></table>' +
                '<h2>MATERIAL EXTRA EN PRODUCCION</h2><table class="t"><thead><tr><th>Clave</th><th>Descripcion</th><th class="n">Uds.Extra</th><th class="n">Costo.Tot.Extra</th></tr></thead>' +
                '<tbody>' + cuerpoExtra + '</tbody><tfoot><tr><td colspan="2">Totales</td><td class="n">' + numero(tUx) + '</td><td class="n">' + dinero(tCx) + '</td></tr></tfoot></table>' +
                '<div class="firmas"><div>REALIZO</div><div>REVISO</div><div>AUTORIZO</div></div>';
            ventanaImpresion('Explosión de materiales obra ' + obraId, '@page{size:letter landscape;margin:8mm}', html);
        }).catch(avisarError);
    }

    // Qué se consulta al abrir cada pestaña
    var CARGAS = {
        facturacion: cargarFacturacion,
        ordenes:     function () { return cargarModo('ordenes'); },
        explosion:   function () { return cargarListado('explosion', 'explosion', 'No existen datos para mostrar'); },
        salidas:     function () { return cargarSalidas(); },
        mano:        function () { return cargarModo('mano'); },
        consumos:    function () { return cargarListado('consumos', 'consumos'); },
        gastos:      function () { return cargarListado('gastos', 'gastos'); },
        adjuntos:    cargarAdjuntos,
        microsip:    function () { return cargarListado('microsip', 'microsip', 'No existen movimientos de Microsip para esta obra'); },
        parametros:  cargarParametros,
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
        'imprimir': function () { if (requiereObra('Es necesario guardar la obra para imprimir su analítica.')) imprimirAnalitica(false); },
        'imprimir-detalle': function () { if (requiereObra('Es necesario guardar la obra para imprimir su analítica.')) imprimirAnalitica(true); },
        // Estimaciones de la obra (estimaciones-obra.php) en su propia pestaña
        'estimaciones': function () {
            if (!requiereObra('Es necesario guardar la obra para registrar estimaciones.')) return;
            var titulo = 'Estimaciones · ' + ($('nombreObra').value || obraId);
            if (window.parent !== window) window.parent.postMessage({ tipo: 'abrir', modulo: 'Estimaciones de Obra', id: obraId, titulo: titulo }, location.origin);
            else window.open('estimaciones-obra.php?id=' + encodeURIComponent(obraId), '_blank');
        },
        // Contrato de obra y convenios (contrato-obra.php) en su propia pestaña
        'contrato': function () {
            if (!requiereObra('Es necesario guardar la obra para registrar su contrato.')) return;
            var titulo = 'Contrato · ' + ($('nombreObra').value || obraId);
            if (window.parent !== window) window.parent.postMessage({ tipo: 'abrir', modulo: 'Contrato de Obra', id: obraId, titulo: titulo }, location.origin);
            else window.open('contrato-obra.php?id=' + encodeURIComponent(obraId), '_blank');
        },
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
            catGasOper = j.conceptos_gas_oper;
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
