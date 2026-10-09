(function () {
    var $ = function (id) { return document.getElementById(id); };

    // Estado del documento (en memoria hasta tener base de datos)
    var obraId = 0;              // obra_id: 0 = obra nueva sin guardar
    var estatus = 'Planificacion';
    var responsables = [];       // [{ id, nombre }]
    var avance = 0;
    var editable = true;
    var cambios = false;

    // Estatus que permiten agregar documentos a la obra (valida_estatus_obra)
    var ABIERTOS = ['Planificacion', 'Ejecucion', 'Obra Terminada'];
    var PASOS = { 'Ejecucion': 1, 'Obra Terminada': 2, 'Finalizacion': 3 };

    function marcarCambio() { cambios = true; }
    function pendiente() { alert('Función pendiente: se activará al conectar la base de datos.'); }
    function escapar(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    // ---------- Pestañas del documento ----------
    document.querySelectorAll('.doc-tab').forEach(function (t) {
        t.addEventListener('click', function () {
            document.querySelectorAll('.doc-tab').forEach(function (x) { x.classList.remove('activo'); });
            document.querySelectorAll('.vista').forEach(function (v) { v.classList.remove('visible'); });
            t.classList.add('activo');
            document.querySelector('.vista[data-vista="' + t.dataset.vista + '"]').classList.add('visible');
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

    // Doble clic en el Id abre el presupuesto de origen
    $('presId').addEventListener('click', function (e) { e.preventDefault(); });
    $('presId').addEventListener('dblclick', function () {
        if ($('presId').textContent === '0') { alert('Esta obra no está ligada a un presupuesto.'); return; }
        pendiente();
    });

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

    // ---------- Imagen de obra ----------
    var urlImagen = null;
    $('examinar').addEventListener('click', function () { $('archivoImagen').click(); });
    $('archivoImagen').addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        if (!/^image\//.test(f.type)) { alert('Selecciona un archivo de imagen (jpg o png).'); return; }
        if (urlImagen) URL.revokeObjectURL(urlImagen);
        urlImagen = URL.createObjectURL(f);
        $('imgObra').src = urlImagen;
        $('imgObra').hidden = false;
        marcarCambio();
    });
    // Doble clic: visor de imagen
    $('marcoImagen').addEventListener('dblclick', function () {
        if (!$('imgObra').hidden) window.open($('imgObra').src, '_blank');
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

    // ---------- Avance de obra ----------
    function pintarAvance() {
        $('pctAvance').textContent = avance;
        $('barraAvance').style.width = avance + '%';
    }
    $('actualizarAvance').addEventListener('click', function () {
        avance = parseInt($('sliderAvance').value, 10) || 0;
        marcarCambio();
        pintarAvance();
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
    }

    function estatusBloqueado() {
        if (estatus === 'Finalizacion' || estatus === 'Cancelado') {
            alert('No es posible modificar una obra que su estatus es: ' + estatus);
            return true;
        }
        return false;
    }

    function cambiarEstatus(e) {
        if (estatusBloqueado() || e === estatus) return;
        ponerEstatus(e);
        marcarCambio();
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

    // cerrar_obra
    function finalizarObra() {
        if (estatus !== 'Obra Terminada') {
            alert('Para finalizar la obra, es necesario que su estatus sea Obra Terminada. Actualice el estatus para poder continuar.');
            return;
        }
        if (!confirm('Al cerrar la Obra, todas las ordenes que se encuentran en produccion se enviaran a Fin de Produccion, ' +
            'las que no se liberan a produccion se estaran Cancelando, No sera posible agregar mas ordenes de trabajo o materiales, ¿Deseas Continuar?')) return;
        // Pendiente con BD: cerrar órdenes, cancelar salidas pendientes y generar movimientos en Microsip
        ponerEstatus('Finalizacion');
        habilitaControles(false);
        marcarCambio();
    }

    // ---------- Guardar (guarda_obra) ----------
    function guardaObra() {
        var faltan = [];
        document.querySelectorAll('[data-req]').forEach(function (el) {
            if (!el.value.trim()) faltan.push('No se ha indicado ' + el.dataset.req + '.');
        });
        if (!responsables.length) faltan.push('No se ha seleccionado un responsable de Obra.');
        if (faltan.length) {
            alert(faltan.join('\n'));
            return false;
        }
        // Pendiente: REGISTRA_OBRAS (módulo VB que aún no tenemos) y marcar el presupuesto como "Aceptado"
        alert('Datos completos. Guardar en AW-Management aún no está activo: falta la función REGISTRA_OBRAS del sistema de escritorio.');
        cambios = false;
        return true;
    }

    // ---------- Pestañas con listado ----------
    var COLS_SALIDAS = {
        'salidas-doctos':  ['Folio', 'OT', 'Fecha', 'Estatus', 'Concepto', 'Almacen', 'Costo Total'],
        'salidas-detalle': ['Estatus', 'Clave', 'Nombre', 'Uds', 'Uni.Med', 'Almacen', 'Costo Total']
    };
    function cambiarColumnas(vista, columnas) {
        var tabla = vista.querySelector('table');
        tabla.querySelector('thead tr').innerHTML = '<th class="sel-col"></th>' +
            columnas.map(function (c) { return '<th>' + c + '</th>'; }).join('');
        tabla.querySelector('tbody').innerHTML = '<tr class="vacio-fila"><td colspan="' + (columnas.length + 1) + '">Sin registros.</td></tr>';
    }

    var subAcciones = {
        'consultar': function () { if (requiereObra('Es necesario guardar la obra para consultar su información.')) pendiente(); },
        'exportar': pendiente,
        'nueva-cot': function () {
            if (validaEstatusObra() && requiereObra('Es necesario guardar la obra para registrar una Cotizacion para Facturacion.')) pendiente();
        },
        'asignar-cot': function () {
            if (!validaEstatusObra() || !requiereObra('Es necesario guardar la obra para asignar una Cotizacion.')) return;
            var fol = prompt('Ingresa el Folio de la Cotizacion', '');
            if (fol && fol.trim()) pendiente();
        },
        'nueva-ot': function () {
            if (requiereObra('Es necesario guardar la obra para registrar una orden de trabajo.')) pendiente();
        },
        'nueva-explosion':  function () { if (validaEstatusObra() && requiereObra()) pendiente(); },
        'guardar-explosion': function () { if (validaEstatusObra() && requiereObra()) pendiente(); },
        'eliminar-explosion': function (vista) {
            if (!validaEstatusObra() || !requiereObra()) return;
            var sel = vista.querySelectorAll('tbody tr.sel');
            if (!sel.length) { alert('Selecciona las partidas a eliminar.'); return; }
            if (confirm('¿Deseas eliminar las partidas seleccionadas?')) pendiente();
        },
        'nuevo-gasto': function () { if (validaEstatusObra() && requiereObra()) pendiente(); },
        'salidas-doctos':  function (vista) { cambiarColumnas(vista, COLS_SALIDAS['salidas-doctos']); },
        'salidas-detalle': function (vista) { cambiarColumnas(vista, COLS_SALIDAS['salidas-detalle']); }
    };

    document.querySelectorAll('.ob-listado').forEach(function (vista) {
        vista.addEventListener('click', function (e) {
            var b = e.target.closest('[data-sub]');
            if (b && subAcciones[b.dataset.sub]) { subAcciones[b.dataset.sub](vista); return; }
            var tr = e.target.closest('tbody tr:not(.vacio-fila)');
            if (tr) tr.classList.toggle('sel');
        });
    });

    // ---------- Adjuntos ----------
    var archivoAdjunto = null;
    $('examinarAdjunto').addEventListener('click', function () { $('archivoAdjunto').click(); });
    $('archivoAdjunto').addEventListener('change', function () {
        archivoAdjunto = this.files[0] || null;
        $('adjNombre').value = archivoAdjunto ? archivoAdjunto.name : '';
    });
    $('adjuntar').addEventListener('click', function () {
        if (!requiereObra('Es necesario guardar el documento para que se permita adjuntar archivos.')) return;
        if (!archivoAdjunto) { alert('Selecciona el archivo a adjuntar.'); return; }
        if (!$('adjDesc').value.trim()) { alert('Ingresar una descripcion corta maximo 50 caracteres.'); return; }
        pendiente();
    });

    // ---------- Barra de herramientas ----------
    var enPestana = window.parent !== window;

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
    document.querySelectorAll('[data-estatus]').forEach(function (b) {
        b.addEventListener('click', function () { cambiarEstatus(b.dataset.estatus); });
    });

    var acciones = {
        'guardar': function () { if (guardaObra()) habilitaControles(false); },
        'guardar-cerrar': function () { if (guardaObra()) cerrarVentana(); },
        'imprimir': function () { window.print(); },
        'ejecucion': function () { cambiarEstatus('Ejecucion'); },
        'terminada': function () {
            if (estatus === 'Obra Terminada' || estatusBloqueado()) return;
            if (confirm('¿Marcar la obra como Obra Terminada?')) cambiarEstatus('Obra Terminada');
        },
        'finalizar': finalizarObra,
        'modificar': function () {
            if (estatus === 'Finalizacion') {
                alert('No es posible modificar una obra que su estatus es: Finalizacion');
                return;
            }
            habilitaControles(true);
        },
        'cancelar': function () {
            if (estatusBloqueado()) return;
            if (confirm('¿Cancelar esta obra?')) { ponerEstatus('Cancelado'); habilitaControles(false); marcarCambio(); }
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

    // ---------- Datos de AW-Management (solo lectura) ----------
    function pedir(q) {
        return fetch('api/obras.php?' + q).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error);
            return j;
        });
    }

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
            obraId = o.obra_id;
            $('presId').textContent = o.sugerido_id || 0;
            $('presFolio').value = o.folio || '';
            $('presProyecto').value = o.proyecto || '';
            $('nombreObra').value = o.nom_obra || '';
            $('direccion').value = o.direccion || '';
            $('contacto').value = o.contacto || '';
            $('notas').value = o.notas || '';
            $('fechaInicio').value = o.fecha_ini || '';
            $('fechaTermino').value = o.fecha_fin || '';
            $('gasAdminObra').value = o.gasto_administrativo || 0;
            avance = Math.round(parseFloat(o.avance_obra) || 0);
            $('sliderAvance').value = avance;
            pintarAvance();
            responsables = o.responsables.map(function (r) { return { id: String(r.vendedor_obra_id), nombre: r.nombre || ('#' + r.vendedor_obra_id) }; });
            if (o.tiene_imagen == 1) {
                $('imgObra').src = 'api/obras.php?accion=imagen&id=' + encodeURIComponent(obraId);
                $('imgObra').hidden = false;
            }
            ponerEstatus(o.estatus || 'Planificacion');
            // Igual que en escritorio: se abre en consulta; "Modificar" habilita la captura
            habilitaControles(false);
            cambios = false;
            if (enPestana && o.nom_obra) {
                window.parent.postMessage({ tipo: 'titulo', texto: 'Obra · ' + o.nom_obra.split('\n')[0] }, location.origin);
            }
        }).catch(function (err) {
            alert('No se pudo abrir la obra: ' + err.message);
        });
    }

    // ---------- 12-HubSpot / Easy-Glass ----------
    var relCargado = false;

    function dinero(v) {
        var n = parseFloat(v);
        return isNaN(n) ? '' : '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fechaDMY(v) { return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : (v || ''); }
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
        relCargado = true;
        $('relAvisos').innerHTML = '<li>Consultando AW, Easy-Glass y HubSpot…</li>';
        $('relFolios').innerHTML = '<tr class="vacio-fila"><td colspan="11">Cargando…</td></tr>';
        pedir('accion=relacionados&id=' + encodeURIComponent(obraId)).then(function (j) {
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
            relCargado = false;
            $('relAvisos').innerHTML = '<li>' + escapar(err.message) + '</li>';
            $('relFolios').innerHTML = '<tr class="vacio-fila"><td colspan="11">No se pudo consultar.</td></tr>';
        });
    }

    document.querySelector('.doc-tab[data-vista="relacionados"]').addEventListener('click', function () {
        if (!relCargado) cargarRelacionados();
    });
    $('actualizarRel').addEventListener('click', cargarRelacionados);

    pintarResponsables();
    pintarAvance();
    ponerEstatus(estatus);

    var idInicial = parseInt(document.body.dataset.obra, 10) || 0;
    cargarCatalogos().then(function () { if (idInicial) return cargarObra(idInicial); });
})();
