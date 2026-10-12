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
    function deEscritorio(que) { alert(que + ' todavía se captura en el sistema de escritorio.'); }
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

    var subAcciones = {
        'consultar': function (vista) {
            if (!requiereObra('Es necesario guardar la obra para consultar su información.')) return;
            var v = vista.dataset.vista;
            if (CARGAS[v]) CARGAS[v]();
        },
        'exportar': function () { exportar(vistaDe('salidas'), 'Materiales de Obra ' + $('nombreObra').value); },
        'nueva-cot': function () {
            if (validaEstatusObra() && requiereObra('Es necesario guardar la obra para registrar una Cotizacion para Facturacion.')) deEscritorio('La cotización de Microsip para facturación');
        },
        'asignar-cot': asignarCotizacion,
        'nueva-ot': function () {
            if (validaEstatusObra() && requiereObra('Es necesario guardar la obra para registrar una orden de trabajo.')) deEscritorio('La orden de trabajo');
        },
        'nueva-explosion': function () { if (validaEstatusObra() && requiereObra()) deEscritorio('La explosión de materiales'); },
        'eliminar-explosion': eliminarExplosion,
        'nuevo-gasto': function () { if (validaEstatusObra() && requiereObra()) deEscritorio('El gasto adicional'); },
        'salidas-doctos':  function () { if (requiereObra()) cargarSalidas('doctos'); },
        'salidas-detalle': function () { if (requiereObra()) cargarSalidas('detalle'); }
    };

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

    // ---------- 13-Conceptos/Tareas (los del presupuesto de la obra) ----------
    function cargarConceptos() {
        if (!obraId) return;
        cargado.conceptos = true;
        $('ctEstado').textContent = 'Consultando…';
        return pedir('accion=conceptos&id=' + encodeURIComponent(obraId)).then(function (j) {
            var tot = { MP: 0, MO: 0, GO: 0 }, grupo = '', n = 0, html = '';
            j.conceptos.forEach(function (c) {
                if (c.agrupador !== grupo) {
                    grupo = c.agrupador;
                    html += '<tr class="ct-grupo"><td colspan="9">' + escapar(grupo) + '</td></tr>';
                }
                tot[c.tipo] += c.importe;
                n++;
                html += '<tr class="ct-concepto" title="' + escapar(c.notas) + '"><td class="sel-col"></td><td class="num">' + n + '</td>' +
                    '<td class="txt">' + escapar(c.clave) + '</td><td class="txt ct-nom">' + escapar(c.concepto) + '</td>' +
                    '<td class="txt">' + escapar(c.agrupador) + '</td><td class="num">' + numero(c.cantidad) + '</td><td class="txt">' + escapar(c.unidad) + '</td>' +
                    '<td class="txt">' + escapar(c.folio) + '</td><td class="num">' + dinero(c.importe) + '</td></tr>';
                c.partidas.forEach(function (p, i) {
                    html += '<tr class="ct-partida"><td class="sel-col"></td><td class="num"><small>' + n + '.' + (i + 1) + '</small></td>' +
                        '<td class="txt">' + escapar(p.clave) + '</td><td class="txt ct-nom" title="' + escapar(p.descripcion) + '">' + escapar(p.concepto) +
                        (p.descripcion && p.descripcion !== p.concepto ? ' <small>' + escapar(p.descripcion) + '</small>' : '') + '</td>' +
                        '<td class="txt">' + escapar(c.agrupador) + '</td><td class="num">' + numero(p.cantidad) + '</td><td class="txt">' + escapar(p.unidad) + '</td>' +
                        '<td class="txt">' + escapar(p.folio) + '</td><td class="num">' + dinero(p.importe) + '</td></tr>';
                });
            });
            $('ctFilas').innerHTML = html || '<tr class="vacio-fila"><td colspan="9">' +
                (j.presupuesto ? 'El presupuesto folio ' + escapar(j.presupuesto.folio) + ' no tiene conceptos capturados.' : 'La obra no está ligada a un presupuesto de obra.') + '</td></tr>';
            $('ctTotMP').textContent = dinero(tot.MP);
            $('ctTotMO').textContent = dinero(tot.MO);
            $('ctTotGO').textContent = dinero(tot.GO);
            $('ctTotal').textContent = dinero(tot.MP + tot.MO + tot.GO);
            $('ctEstado').textContent = j.presupuesto ? 'Presupuesto folio ' + j.presupuesto.folio + ' · ' + n + ' concepto(s)' : '';
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
