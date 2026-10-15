// Fichas de los catálogos (Catalogos › Clientes, Vendedores de Obra, Empleados, Tipos de Empleados).
// Ventana con pestañas como la «Ficha de Clientes» de Easy-Glass:
//   Fichas.abrir(tipo, id, alGuardar)   id 0 = nuevo; alGuardar() se llama cada vez que se guarda o elimina
window.Fichas = (function () {
    var token = (window.ACRI || {}).token || '';

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
    function fechaDMY(v) {
        return /^\d{4}-\d{2}-\d{2}/.test(v || '') ? v.substr(8, 2) + '/' + v.substr(5, 2) + '/' + v.substr(0, 4) : (v == null ? '' : v);
    }
    function moneda(v) {
        var n = parseFloat(v);
        return isNaN(n) ? '' : n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function pedir(url, datos) {
        var op = { method: datos ? 'POST' : 'GET', headers: { 'X-Acri-Token': token } };
        if (datos) {
            op.headers['Content-Type'] = 'application/json';
            op.body = JSON.stringify(datos);
        }
        return fetch(url, op).then(function (r) {
            if (r.status === 401) { location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Error desconocido.');
            return j;
        });
    }
    function url(api, accion, extra) { return api + (api.indexOf('?') < 0 ? '?' : '&') + 'accion=' + accion + (extra || ''); }

    // ================= Condiciones comerciales predeterminadas =================
    var CONDICIONES = {
        es: [
            '- Precios en Pesos MXN incluyen IVA',
            '- Tiempo de entrega PPD',
            '- Megaglass requiere el 70% de anticipo para empezar la orden y el 30 % antes de enviarla',
            '- Cuando una orden es enviada a Megaglass el comprador acuerda con CONDICIONES Y TERMINOS GENERALES',
            '- El Comprador reconoce que es responsable del impuesto estatal y local sobre las ventas/uso de los bienes que está comprando, ' +
                'a menos que el Comprador proporcione una copia válida y un certificado de exención de impuestos sobre las ventas/uso previamente a la factura del pedido',
            '- Todos los productos de Megaglass son fabricados de acuerdo a nuestras directrices estándar y tolerancias',
            '- El comprador es responsable de verificar los detalles en la cotización así como medidas, tipo de vidrio a utilizar y descuentos',
            '- Las medidas aquí presentadas en la cotización son medidas de producción y no incluyen descuentos de herrajes ni perfiles',
            '- Es responsabilidad del comprador realizar los descuentos a los vidrios',
            '- Si la cotización aquí presentada es por m2 se tomará un estándar en el desperdicio de 30 % (Vidrio y entrecapa)',
            '- Es responsabilidad del cliente utilizar el vidrio adecuado para su proyecto'
        ].join('\n'),
        en: [
            '- Prices in MXN pesos include VAT',
            '- Lead time PPD',
            '- Megaglass requires a 70% down payment to start the order and the remaining 30% before shipping',
            '- When an order is placed with Megaglass, the buyer agrees to the GENERAL TERMS AND CONDITIONS',
            '- Buyer acknowledges that it is responsible for state and local sales/use tax on the goods it is purchasing, ' +
                'unless Buyer provides a valid copy of a sales/use tax exemption certificate prior to the order being invoiced',
            '- All Megaglass products are manufactured according to our standard guidelines and tolerances',
            '- The buyer is responsible for verifying the details of the quote, including sizes, type of glass to be used and deductions',
            '- The sizes shown in this quote are production sizes and do not include hardware or frame deductions',
            '- The buyer is responsible for applying the deductions to the glass',
            '- If this quote is per m2, a standard waste of 30% will be considered (glass and interlayer)',
            '- The customer is responsible for using the right glass for their project'
        ].join('\n')
    };

    // ================= Definición de cada ficha =================
    // campo: { id, etiqueta, tipo: texto|number|select|textarea|check, req, completo, mayus, auto (solo lectura),
    //          lista (llave de la respuesta 'ficha'), vacio (opción sin asignar), defecto (regex del nombre por omisión) }
    var TIPOS = {
        vendedores: {
            titulo: 'Ficha de Vendedores de Obra',
            api: 'api/catalogos.php?tipo=vendedores',
            pestanas: [{ titulo: 'General', campos: [
                { id: 'nombre', etiqueta: 'Nombre', req: true, completo: true, mayus: true },
                { id: 'activo', etiqueta: 'Activo', tipo: 'check', valor: true }
            ] }]
        },
        empleados: {
            titulo: 'Ficha de Empleados',
            api: 'api/catalogos.php?tipo=empleados',
            pestanas: [{ titulo: 'General', campos: [
                { id: 'numero_empleado', etiqueta: 'Número de empleado', tipo: 'number' },
                { id: 'tipo', etiqueta: 'Tipo de empleado', tipo: 'select', lista: 'tipos', vacio: '— Sin asignar —' },
                { id: 'nombre', etiqueta: 'Nombre', req: true, completo: true, mayus: true },
                { id: 'telefono', etiqueta: 'Teléfono' },
                { id: 'sueldo_diario', etiqueta: 'Sueldo diario', tipo: 'number' },
                { id: 'comision', etiqueta: 'Comisión', tipo: 'number' },
                { id: 'direccion', etiqueta: 'Dirección', tipo: 'textarea', completo: true },
                { id: 'activo', etiqueta: 'Activo', tipo: 'check', valor: true }
            ] }]
        },
        tipos: {
            titulo: 'Ficha de Tipos de Empleados',
            api: 'api/catalogos.php?tipo=tipos',
            pestanas: [{ titulo: 'General', campos: [
                { id: 'clave', etiqueta: 'Clave', mayus: true },
                { id: 'porcentaje', etiqueta: 'Porcentaje de comisión (%)', tipo: 'number' },
                { id: 'nombre', etiqueta: 'Nombre', req: true, completo: true, mayus: true }
            ] }]
        },
        insumos: {
            titulo: 'Ficha de Insumo',
            api: 'api/insumos.php',
            pestanas: [
                { titulo: 'General', campos: [
                    { id: 'clave', etiqueta: 'Clave', req: true, mayus: true },
                    { id: 'tipo', etiqueta: 'Tipo', tipo: 'select', lista: 'tipos', req: true },
                    { id: 'descripcion', etiqueta: 'Descripción', req: true, completo: true },
                    { id: 'unidad_id', etiqueta: 'Unidad', tipo: 'select', lista: 'unidades', vacio: '— Seleccione —', req: true },
                    { id: 'familia', etiqueta: 'Familia (vidrio, aluminio, herrajes…)', mayus: true },
                    { id: 'fsr', etiqueta: 'FSR (solo mano de obra)', tipo: 'number' },
                    { id: 'fasar_id', etiqueta: 'FASAR (si se elige, el FSR sale de ahí)', tipo: 'select', lista: 'fasar', vacio: '— FSR capturado a mano —' },
                    { id: 'clave_microsip', etiqueta: 'Clave del artículo en Microsip', mayus: true },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', completo: true },
                    { id: 'activo', etiqueta: 'Activo', tipo: 'check', valor: true }
                ] },
                { titulo: 'Precios', render: pestanaPrecios },
                { titulo: 'Componentes', render: pestanaComponentes },
                { titulo: 'Costo horario', render: pestanaCostoHorario }
            ]
        },
        conceptos_pu: {
            titulo: 'Ficha de Concepto P.U.',
            api: 'api/conceptos-pu.php',
            pestanas: [
                { titulo: 'General', campos: [
                    { id: 'codigo', etiqueta: 'Código', req: true, mayus: true },
                    { id: 'unidad_id', etiqueta: 'Unidad', tipo: 'select', lista: 'unidades', vacio: '— Seleccione —', req: true },
                    { id: 'descripcion', etiqueta: 'Descripción corta', req: true, completo: true },
                    { id: 'familia', etiqueta: 'Familia / partida sugerida (cancelería, fachadas, barandales…)', mayus: true, completo: true },
                    { id: 'descripcion_tecnica', etiqueta: 'Descripción técnica completa (la que va en la propuesta)', tipo: 'textarea', completo: true },
                    { id: 'notas', etiqueta: 'Notas internas', tipo: 'textarea', completo: true },
                    { id: 'activo', etiqueta: 'Activo', tipo: 'check', valor: true }
                ] },
                { titulo: 'Matriz de insumos', render: pestanaMatriz }
            ]
        },
        plantillas: {
            titulo: 'Plantilla de presupuesto',
            api: 'api/plantillas.php',
            pestanas: [
                { titulo: 'General', campos: [
                    { id: 'nombre', etiqueta: 'Nombre (p. ej. Baño completo, Fachada tipo)', req: true, completo: true },
                    { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', completo: true },
                    { id: 'activo', etiqueta: 'Activa', tipo: 'check', valor: true }
                ] },
                { titulo: 'Conceptos', render: pestanaPlantillaConceptos }
            ]
        },
        clientes: {
            titulo: 'Ficha de Clientes',
            api: 'api/clientes.php',
            impuesto: true,
            pestanas: [
                { titulo: 'General', campos: [
                    { id: 'clave_cliente', etiqueta: 'Clave', req: true, auto: true },
                    { id: 'rfc', etiqueta: 'RFC', mayus: true },
                    { id: 'contacto', etiqueta: 'Nombre Contacto', req: true },
                    { id: 'nombre', etiqueta: 'Empresa', req: true },
                    { id: 'telefono', etiqueta: 'Teléfono', req: true },
                    { id: 'email', etiqueta: 'E-mail', req: true },
                    { id: 'cond_pago_id', etiqueta: 'Condición de pago', tipo: 'select', lista: 'condiciones_pago', defecto: /SIN CONDICI/i },
                    { id: 'tipo_cliente_id', etiqueta: 'Tipo de cliente', tipo: 'select', lista: 'tipos_cliente', defecto: /SIN ASIGNA/i },
                    { id: 'moneda_id', etiqueta: 'Tipo de Moneda', tipo: 'select', lista: 'monedas', defecto: /NACIONAL/i },
                    { id: 'zona_cliente_id', etiqueta: 'Zona de cliente', tipo: 'select', lista: 'zonas', defecto: /SIN ASIGNA/i },
                    { id: 'sistema_dim_id', etiqueta: 'Sis. de Dimensiones', tipo: 'select', lista: 'sistemas_dim', defecto: /METRIC/i },
                    { id: 'vendedor_id', etiqueta: 'Vendedor', tipo: 'select', lista: 'vendedores' },
                    { id: 'vendedor_campo_id', etiqueta: 'Vendedor en Campo', tipo: 'select', lista: 'vendedores', vacio: '— Sin asignar —',
                      si: function (cat) { return cat.vendedor_campo; } }
                ] },
                { titulo: 'Direcciones', campos: [
                    { id: 'direccion', etiqueta: '(x)Dirección', tipo: 'textarea', completo: true },
                    { id: 'referencia', etiqueta: 'Referencia', completo: true },
                    { id: 'ciudad_id', etiqueta: 'Ciudad', req: true, tipo: 'select', lista: 'ciudades', vacio: '— Seleccione —' },
                    { id: 'codigo_postal', etiqueta: 'Código Postal' }
                ] },
                { titulo: 'Condiciones Comerciales', render: pestanaCondiciones },
                { titulo: 'Historial', render: pestanaHistorial },
                { titulo: 'Hubspot', render: pestanaHubspot }
            ]
        }
    };

    // ================= Ventana =================
    var dlg = document.createElement('dialog');
    dlg.className = 'fi-dialogo';
    dlg.innerHTML =
        '<div class="fi-cabecera"><h2></h2><button type="button" class="fi-x" title="Cerrar">✕</button></div>' +
        '<nav class="fi-pestanas"></nav>' +
        '<div class="fi-cuerpo"></div>' +
        '<div class="fi-impuesto" hidden>' +
            '<b>Impuesto del cliente</b>' +
            '<label>Tipo de impuesto <input type="number" step="1" min="0" data-imp="impuesto"></label>' +
            '<label>Total impuesto (%) <input type="number" step="0.01" min="0" max="100" data-imp="total_impuesto"></label>' +
            '<button type="button" class="fi-btn azul" data-imp-accion="aplicar">Aplicar</button>' +
            '<button type="button" class="fi-btn" data-imp-accion="cancelar">Cancelar</button>' +
        '</div>' +
        '<p class="fi-mensaje" role="status"></p>' +
        '<div class="fi-pie">' +
            '<button type="button" class="fi-btn azul" data-b="guardar-nuevo">💾 Guardar y nuevo</button>' +
            '<button type="button" class="fi-btn azul" data-b="guardar-cerrar">💾 Guardar y cerrar</button>' +
            '<button type="button" class="fi-btn" data-b="modificar">✏️ Modificar</button>' +
            '<button type="button" class="fi-btn" data-b="impuesto">🧾 Modificar el impuesto</button>' +
            '<button type="button" class="fi-btn peligro" data-b="eliminar">🗑 Eliminar</button>' +
            '<button type="button" class="fi-btn" data-b="cerrar">✕ Cerrar</button>' +
        '</div>';
    document.body.appendChild(dlg);
    var q = function (sel) { return dlg.querySelector(sel); };

    var st = null;   // { tipo, def, id, cat, registro, editable, cambios, alGuardar, ocupado }

    function mensaje(texto, tipo) {
        var m = q('.fi-mensaje');
        m.textContent = texto || '';
        m.className = 'fi-mensaje ' + (tipo || '');
    }

    function abrir(tipo, id, alGuardar) {
        var def = TIPOS[tipo];
        if (!def) return;
        st = { tipo: tipo, def: def, id: parseInt(id, 10) || 0, cat: {}, registro: null, editable: false, cambios: false, alGuardar: alGuardar };
        q('.fi-cabecera h2').textContent = def.titulo + (st.id ? '' : ' — Nuevo');
        q('.fi-cuerpo').innerHTML = '<div class="fi-cargando">Cargando…</div>';
        q('.fi-pestanas').innerHTML = '';
        q('.fi-impuesto').hidden = true;
        mensaje('');
        pintarBotones(true);
        if (!dlg.open) dlg.showModal();
        cargar();
    }

    function cargar() {
        var s = st;
        pedir(url(s.def.api, 'ficha', '&id=' + s.id)).then(function (j) {
            if (s !== st) return;
            s.cat = j;
            s.registro = j.registro;
            s.editable = !s.id && j.puede_modificar !== false;
            s.cambios = false;
            q('.fi-cabecera h2').textContent = s.def.titulo + (s.id ? ' — ' + (s.registro.nombre || s.id) : ' — Nuevo');
            dibujar();
        }).catch(function (err) {
            if (s !== st) return;
            q('.fi-cuerpo').innerHTML = '<div class="fi-cargando error">⚠ ' + esc(err.message) + '</div>';
            pintarBotones(true);
        });
    }

    function valorInicial(c) {
        var r = st.registro;
        if (c.id === 'clave_cliente' && !r) return st.cat.clave_siguiente || '';
        if (r) {
            if (c.tipo === 'check') return !!r[c.id];
            return r[c.id] == null ? '' : String(r[c.id]).trim();
        }
        if (c.tipo === 'check') return c.valor !== false;
        if (c.tipo === 'select' && c.lista) {
            var lista = st.cat[c.lista] || [];
            if (c.defecto) for (var i = 0; i < lista.length; i++) if (c.defecto.test(lista[i].nombre)) return String(lista[i].id);
            return c.vacio || !lista.length ? '' : String(lista[0].id);
        }
        return '';
    }

    function htmlCampo(c) {
        var v = valorInicial(c);
        var etiqueta = esc(c.etiqueta) + (c.req ? ' <i class="fi-req">*</i>' : '') + (c.auto ? ' <em>(automática)</em>' : '');
        var attrs = ' data-campo="' + c.id + '"' + (c.auto ? ' readonly data-auto="1"' : '') + (c.mayus ? ' data-mayus="1"' : '');
        var control;
        if (c.tipo === 'check') {
            return '<label class="fi-check' + (c.completo ? ' completo' : '') + '"><input type="checkbox"' + attrs + (v ? ' checked' : '') + '> ' + esc(c.etiqueta) + '</label>';
        } else if (c.tipo === 'select') {
            var ops = (c.vacio ? '<option value="">' + esc(c.vacio) + '</option>' : '') + (st.cat[c.lista] || []).map(function (o) {
                return '<option value="' + esc(o.id) + '"' + (String(o.id) === v ? ' selected' : '') + '>' + esc(o.nombre) + '</option>';
            }).join('');
            // El registro puede traer un id que ya no está en la lista
            if (v && !(st.cat[c.lista] || []).some(function (o) { return String(o.id) === v; })) ops += '<option value="' + esc(v) + '" selected>(Id ' + esc(v) + ')</option>';
            control = '<select' + attrs + '>' + ops + '</select>';
        } else if (c.tipo === 'textarea') {
            control = '<textarea rows="4"' + attrs + '>' + esc(v) + '</textarea>';
        } else {
            control = '<input type="' + (c.tipo === 'number' ? 'number" step="any' : 'text') + '"' + attrs + ' value="' + esc(v) + '" autocomplete="off">';
        }
        return '<label class="fi-campo' + (c.completo ? ' completo' : '') + '"><span>' + etiqueta + '</span>' + control + '</label>';
    }

    function dibujar() {
        var nav = q('.fi-pestanas'), cuerpo = q('.fi-cuerpo');
        var pestanas = st.def.pestanas;
        nav.innerHTML = pestanas.length > 1 ? pestanas.map(function (p, i) {
            return '<button type="button" class="fi-pestana' + (i ? '' : ' activa') + '" data-p="' + i + '">' + esc(p.titulo) + '</button>';
        }).join('') : '';
        nav.hidden = pestanas.length < 2;
        cuerpo.innerHTML = '';
        pestanas.forEach(function (p, i) {
            var sec = document.createElement('section');
            sec.className = 'fi-seccion';
            sec.hidden = i > 0;
            if (p.render) p.render(sec, ctx());
            else sec.innerHTML = '<div class="fi-campos">' + p.campos.filter(function (c) { return !c.si || c.si(st.cat); }).map(htmlCampo).join('') + '</div>';
            cuerpo.appendChild(sec);
        });
        aplicarModo();
        var primero = cuerpo.querySelector('[data-campo]:not([readonly]):not([disabled])');
        if (primero) primero.focus();
    }

    // Lo que necesita una pestaña con contenido propio
    function ctx() {
        return {
            st: st, pedir: pedir, url: url, esc: esc, mensaje: mensaje, fechaDMY: fechaDMY, moneda: moneda, iso: iso,
            valor: function (campo) { var el = q('[data-campo="' + campo + '"]'); return el ? el.value.trim() : ''; }
        };
    }

    function aplicarModo() {
        dlg.classList.toggle('fi-lectura', !st.editable);
        dlg.querySelectorAll('[data-campo]').forEach(function (el) {
            if (el.dataset.auto) return;
            el.disabled = !st.editable;
        });
        // Controles de las pestañas propias que no son campos (renglones de una tabla, botones)
        dlg.querySelectorAll('[data-editable]').forEach(function (el) { el.disabled = !st.editable; });
        pintarBotones(false);
    }

    function pintarBotones(bloquear) {
        var puede = st && st.cat.puede_modificar !== false;
        var listo = !bloquear && st && (st.registro || !st.id);
        function b(n, activo) { var el = q('[data-b="' + n + '"]'); el.disabled = !activo; return el; }
        b('guardar-nuevo', listo && puede && st.editable);
        b('guardar-cerrar', listo && puede && st.editable);
        b('modificar', listo && puede && !!st.id).classList.toggle('activo', !!(st && st.id && st.editable));
        b('impuesto', listo && puede && !!st.id).hidden = !(st && st.def.impuesto);
        b('eliminar', listo && puede && !!st.id);
        b('cerrar', true);
    }

    function datosFormulario() {
        var d = { id: st.id };
        dlg.querySelectorAll('[data-campo]').forEach(function (el) {
            var v = el.type === 'checkbox' ? el.checked : el.value;
            if (typeof v === 'string' && el.tagName !== 'TEXTAREA') v = v.trim();
            if (el.dataset.mayus && typeof v === 'string') v = v.toUpperCase();
            d[el.dataset.campo] = v;
        });
        return d;
    }

    // Obligatorios vacíos: se marcan y se muestra la pestaña del primero
    function validar() {
        var faltan = [];
        dlg.querySelectorAll('.fi-invalido').forEach(function (el) { el.classList.remove('fi-invalido'); });
        st.def.pestanas.forEach(function (p, i) {
            (p.campos || []).forEach(function (c) {
                if (!c.req || c.auto) return;
                var el = q('[data-campo="' + c.id + '"]');
                if (el && !el.value.trim()) { el.classList.add('fi-invalido'); faltan.push({ c: c, el: el, i: i }); }
            });
        });
        if (!faltan.length) return true;
        verPestana(faltan[0].i);
        faltan[0].el.focus();
        mensaje('Faltan datos obligatorios: ' + faltan.map(function (f) { return f.c.etiqueta; }).join(', ') + '.', 'error');
        return false;
    }

    function guardar(despues) {
        if (!st || st.ocupado || !validar()) return;
        var s = st;
        s.ocupado = true;
        pintarBotones(true);
        mensaje('Guardando…');
        pedir(url(s.def.api, 'guardar'), datosFormulario()).then(function (j) {
            s.cambios = false;
            if (s.alGuardar) s.alGuardar();
            var aviso = (s.id ? 'Cambios guardados' : 'Registro guardado') + (j.clave ? ' con clave ' + j.clave : '') + '.';
            if (despues === 'cerrar') { cerrar(true); return; }
            // Guardar y nuevo: ficha en blanco con la siguiente clave
            abrir(s.tipo, 0, s.alGuardar);
            mensaje(aviso, 'ok');
        }).catch(function (err) {
            mensaje(err.message, 'error');
        }).then(function () {
            s.ocupado = false;
            if (s === st) pintarBotones(false);
        });
    }

    function cerrar(sinPreguntar) {
        if (!sinPreguntar && st && st.cambios && !confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return;
        st = null;
        dlg.close();
    }

    function verPestana(i) {
        dlg.querySelectorAll('.fi-pestana').forEach(function (b) { b.classList.toggle('activa', +b.dataset.p === i); });
        dlg.querySelectorAll('.fi-seccion').forEach(function (s, k) { s.hidden = k !== i; });
    }

    // ================= Eventos =================
    q('.fi-pestanas').addEventListener('click', function (e) {
        var b = e.target.closest('.fi-pestana');
        if (b) verPestana(+b.dataset.p);
    });
    q('.fi-x').addEventListener('click', function () { cerrar(false); });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(false); });
    dlg.addEventListener('input', function (e) {
        if (e.target.dataset && e.target.dataset.campo && st) { st.cambios = true; e.target.classList.remove('fi-invalido'); }
    });
    dlg.addEventListener('change', function (e) {
        if (e.target.dataset && e.target.dataset.campo && st) st.cambios = true;
    });

    q('.fi-pie').addEventListener('click', function (e) {
        var b = e.target.closest('[data-b]');
        if (!b || b.disabled || !st) return;
        switch (b.dataset.b) {
            case 'guardar-nuevo': guardar('nuevo'); break;
            case 'guardar-cerrar': guardar('cerrar'); break;
            case 'cerrar': cerrar(false); break;
            case 'modificar':
                if (st.editable && st.cambios) {
                    if (!confirm('¿Descartar los cambios sin guardar?')) return;
                    cargar();
                    return;
                }
                st.editable = !st.editable;
                aplicarModo();
                break;
            case 'impuesto':
                var r = st.registro || {};
                q('[data-imp="impuesto"]').value = r.impuesto != null ? parseInt(r.impuesto, 10) || 0 : 0;
                q('[data-imp="total_impuesto"]').value = r.total_impuesto != null ? parseFloat(r.total_impuesto) || 0 : 0;
                q('.fi-impuesto').hidden = false;
                q('[data-imp="total_impuesto"]').focus();
                break;
            case 'eliminar':
                if (!confirm('¿Eliminar «' + (st.registro.nombre || st.id) + '»? No se puede deshacer.')) return;
                var s = st;
                pedir(url(s.def.api, 'eliminar'), { id: s.id }).then(function () {
                    if (s.alGuardar) s.alGuardar();
                    cerrar(true);
                }).catch(function (err) { mensaje(err.message, 'error'); });
                break;
        }
    });

    q('.fi-impuesto').addEventListener('click', function (e) {
        var b = e.target.closest('[data-imp-accion]');
        if (!b || !st) return;
        if (b.dataset.impAccion === 'cancelar') { q('.fi-impuesto').hidden = true; return; }
        var s = st;
        var d = { id: s.id, impuesto: q('[data-imp="impuesto"]').value, total_impuesto: q('[data-imp="total_impuesto"]').value };
        pedir(url(s.def.api, 'impuesto'), d).then(function () {
            s.registro.impuesto = d.impuesto;
            s.registro.total_impuesto = d.total_impuesto;
            q('.fi-impuesto').hidden = true;
            mensaje('Impuesto actualizado.', 'ok');
        }).catch(function (err) { mensaje(err.message, 'error'); });
    });

    // ================= Pestañas propias de la ficha de insumos =================
    function dinero6(v) { return v == null || v === '' ? 'Pendiente' : '$ ' + moneda(v); }

    // Costo actual, precio nuevo (agrega al historial, no sobrescribe) e historial de precios
    function pestanaPrecios(sec, c) {
        var cat = c.st.cat, tc = cat.tipos_cambio || {};
        var ops = function (lista, sel) {
            return (lista || []).map(function (o) { return '<option value="' + c.esc(o.id) + '"' + (o.id === sel ? ' selected' : '') + '>' + c.esc(o.nombre) + '</option>'; }).join('');
        };
        var costo = '<div class="fi-costo"><b>Costo actual:</b> ' + (cat.costo == null ? '<span class="fi-pendiente">Pendiente</span>' : c.esc(dinero6(cat.costo)) + ' MXN') +
            (cat.faltan && cat.faltan.length ? '<br><small>Falta precio de: ' + c.esc(cat.faltan.join(', ')) + '</small>' : '') +
            (c.st.registro && c.st.registro.tipo === 'MO' ? '<br><small>Mano de obra: salario base × FSR ' + c.esc(c.st.registro.fsr) + '</small>' : '') +
            (tc.USD ? '<br><small>Tipo de cambio USD: ' + c.esc(tc.USD) + '</small>' : '') + '</div>';
        var nuevo = cat.puede_precios
            ? '<h4 class="fi-sub">Precio nuevo <small>(sin IVA; se agrega al historial con su fecha, no reemplaza los anteriores)</small></h4>' +
              '<div class="fi-campos tres">' +
                '<label class="fi-campo"><span>Precio</span><input type="number" step="any" min="0" data-campo="precio_nuevo"></label>' +
                '<label class="fi-campo"><span>Moneda</span><select data-campo="moneda_nuevo">' + ops(cat.monedas, 'MXN') + '</select></label>' +
                '<label class="fi-campo"><span>Vigente desde</span><input type="date" data-campo="vigente_desde" value="' + c.iso(new Date()) + '"></label>' +
                '<label class="fi-campo"><span>Fuente</span><select data-campo="fuente">' + ops(cat.fuentes, 'captura') + '</select></label>' +
                '<label class="fi-campo"><span>Proveedor</span><input type="text" data-campo="proveedor"></label>' +
                '<label class="fi-campo"><span>Notas del precio</span><input type="text" data-campo="notas_precio"></label>' +
              '</div>'
            : '<p class="fi-nota">Para capturar precios se necesita el permiso «Capturar precios de insumos».</p>';
        var hist = (cat.precios || []).map(function (p) {
            return '<tr><td>' + c.esc(c.fechaDMY(p.vigente_desde)) + '</td><td class="num">' + c.esc(dinero6(p.precio)) + ' ' + c.esc(p.moneda) + '</td><td>' +
                c.esc(p.fuente) + '</td><td>' + c.esc(p.proveedor || '') + '</td><td>' + c.esc(p.usuario || '') + '</td><td>' + c.esc(p.notas || '') + '</td></tr>';
        }).join('');
        sec.innerHTML = costo + nuevo +
            '<h4 class="fi-sub">Historial de precios</h4>' +
            '<div class="fi-tabla"><table><thead><tr><th>Vigente desde</th><th class="num">Precio</th><th>Fuente</th><th>Proveedor</th><th>Capturó</th><th>Notas</th></tr></thead><tbody>' +
            (hist || '<tr><td colspan="6" class="fi-vacio">Sin precios capturados: el insumo queda pendiente en los análisis.</td></tr>') + '</tbody></table></div>';
    }

    // Tabla de insumos de la ficha: componentes de un básico o matriz de un concepto. Cada renglón: insumo, cantidad
    // (o rendimiento por jornada, si op.rendimiento), % de desperdicio, costo e importe. Se guarda como JSON en el campo 'componentes'.
    //   op: { total (título del total), vacio, rendimiento, excluir (id a no ofrecer), pie, visible() y aviso(visible) }
    function tablaInsumos(sec, c, op) {
        var filas = (c.st.cat.componentes || []).map(function (f) {
            return { insumo_id: f.insumo_id, clave: f.clave, descripcion: f.descripcion, unidad: f.unidad, cantidad: f.cantidad,
                     rendimiento: f.rendimiento || '', desperdicio_pct: f.desperdicio_pct, costo: f.costo };
        });
        var cols = op.rendimiento ? 9 : 8;
        sec.innerHTML =
            '<p class="fi-nota" data-c="aviso"></p>' +
            '<div data-c="editor">' +
                '<div class="fi-fila"><label class="fi-campo completo"><span>Agregar insumo (clave o descripción)</span>' +
                '<input type="text" data-c="buscar" data-editable autocomplete="off" placeholder="Escribe al menos 2 letras…"></label></div>' +
                '<div class="fi-sugerencias" data-c="sugerencias" hidden></div>' +
                '<div class="fi-tabla"><table><thead><tr><th>Clave</th><th>Descripción</th><th>Unidad</th><th class="num">Cantidad</th>' +
                (op.rendimiento ? '<th class="num" title="Unidades del concepto por jornada (mano de obra o cuadrilla): la cantidad es 1 / rendimiento">Rend./jor.</th>' : '') +
                '<th class="num">% Desp.</th><th class="num">Costo</th><th class="num">Importe</th><th></th></tr></thead><tbody></tbody>' +
                '<tfoot><tr><td colspan="' + (cols - 2) + '" class="num"><b>' + c.esc(op.total) + '</b></td><td class="num" data-c="total"></td><td></td></tr></tfoot></table></div>' +
                '<input type="hidden" data-campo="componentes">' +
            '</div>' + (op.pie || '');
        var tbody = sec.querySelector('tbody'), oculto = sec.querySelector('[data-campo="componentes"]');
        var buscar = sec.querySelector('[data-c="buscar"]'), sug = sec.querySelector('[data-c="sugerencias"]');

        function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
        function cantidad(f) { return op.rendimiento && num(f.rendimiento) > 0 ? 1 / num(f.rendimiento) : num(f.cantidad); }
        function importe(f) { return f.costo == null ? null : f.costo * cantidad(f) * (1 + num(f.desperdicio_pct) / 100); }
        function sincronizar() {
            oculto.value = JSON.stringify(filas.map(function (f) {
                return { insumo_id: f.insumo_id, cantidad: f.cantidad, rendimiento: op.rendimiento ? f.rendimiento : '', desperdicio_pct: f.desperdicio_pct };
            }));
            var total = 0, pendiente = false;
            filas.forEach(function (f) { var i = importe(f); if (i === null) pendiente = true; else total += i; });
            sec.querySelector('[data-c="total"]').textContent = filas.length ? (pendiente ? 'Pendiente' : dinero6(total)) : '';
        }
        function pintar() {
            tbody.innerHTML = filas.length ? filas.map(function (f, i) {
                var conRend = op.rendimiento && num(f.rendimiento) > 0;
                return '<tr data-i="' + i + '"><td>' + c.esc(f.clave) + '</td><td>' + c.esc(f.descripcion) + '</td><td>' + c.esc(f.unidad) + '</td>' +
                    '<td class="num"><input type="number" step="any" min="0" data-k="cantidad" data-editable value="' +
                        c.esc(conRend ? Math.round(1 / num(f.rendimiento) * 1e6) / 1e6 : f.cantidad) + '"' + (conRend ? ' readonly title="Sale del rendimiento"' : '') + '></td>' +
                    (op.rendimiento ? '<td class="num"><input type="number" step="any" min="0" data-k="rendimiento" data-editable value="' + c.esc(f.rendimiento) + '"></td>' : '') +
                    '<td class="num"><input type="number" step="any" min="0" max="99.99" data-k="desperdicio_pct" data-editable value="' + c.esc(f.desperdicio_pct) + '"></td>' +
                    '<td class="num">' + c.esc(dinero6(f.costo)) + '</td><td class="num">' + c.esc(dinero6(importe(f))) + '</td>' +
                    '<td><button type="button" class="fi-btn peligro" data-k="quitar" data-editable title="Quitar">✕</button></td></tr>';
            }).join('') : '<tr><td colspan="' + cols + '" class="fi-vacio">' + c.esc(op.vacio) + '</td></tr>';
            tbody.querySelectorAll('[data-editable]').forEach(function (el) { el.disabled = !c.st.editable; });
            sincronizar();
        }
        function revisar() {
            var ver = op.visible ? op.visible() : true;
            sec.querySelector('[data-c="editor"]').hidden = !ver;
            sec.querySelector('[data-c="aviso"]').textContent = op.aviso(ver);
        }

        tbody.addEventListener('input', function (e) {
            var k = e.target.dataset.k, tr = e.target.closest('tr');
            if (!k || !tr || k === 'quitar') return;
            filas[+tr.dataset.i][k] = e.target.value;
            c.st.cambios = true;
            sincronizar();
        });
        tbody.addEventListener('change', function () { pintar(); });
        tbody.addEventListener('click', function (e) {
            var b = e.target.closest('[data-k="quitar"]');
            if (!b || b.disabled) return;
            filas.splice(+b.closest('tr').dataset.i, 1);
            c.st.cambios = true;
            pintar();
        });
        var espera = null;
        buscar.addEventListener('input', function () {
            clearTimeout(espera);
            var q = buscar.value.trim();
            if (q.length < 2) { sug.hidden = true; return; }
            espera = setTimeout(function () {
                c.pedir('api/insumos.php?accion=buscar&q=' + encodeURIComponent(q) + '&excluir=' + (op.excluir || 0)).then(function (j) {
                    sug.innerHTML = j.filas.length ? j.filas.map(function (f, i) {
                        return '<button type="button" data-s="' + i + '">' + c.esc(f.clave) + ' · ' + c.esc(f.descripcion) + ' <small>(' + c.esc(f.unidad) + ', ' +
                            c.esc(dinero6(f.costo)) + ')</small></button>';
                    }).join('') : '<p class="fi-vacio">Sin coincidencias.</p>';
                    sug.hidden = false;
                    sug.onclick = function (e) {
                        var b = e.target.closest('[data-s]');
                        if (!b) return;
                        var f = j.filas[+b.dataset.s];
                        if (filas.some(function (x) { return x.insumo_id === f.id; })) { c.mensaje('Ese insumo ya está en la lista.', 'error'); return; }
                        filas.push({ insumo_id: f.id, clave: f.clave, descripcion: f.descripcion, unidad: f.unidad, cantidad: 1, rendimiento: '', desperdicio_pct: 0, costo: f.costo });
                        c.st.cambios = true;
                        buscar.value = '';
                        sug.hidden = true;
                        pintar();
                    };
                }).catch(function (err) { c.mensaje(err.message, 'error'); });
            }, 250);
        });
        var selTipo = dlg.querySelector('[data-campo="tipo"]');
        if (selTipo && op.visible) selTipo.addEventListener('change', revisar);
        pintar();
        revisar();
    }

    // Componentes de un básico o cuadrilla (insumos)
    function pestanaComponentes(sec, c) {
        var usadoEn = (c.st.cat.usado_en || []).map(function (u) { return c.esc(u.clave); }).join(', ');
        tablaInsumos(sec, c, {
            total: 'Costo del básico', excluir: c.st.id,
            vacio: 'Sin componentes. Busca arriba los insumos que lleva una unidad del básico.',
            pie: usadoEn ? '<p class="fi-nota">Se usa en: ' + usadoEn + '</p>' : '',
            visible: function () { var t = dlg.querySelector('[data-campo="tipo"]'); return t && t.value === 'BAS'; },
            aviso: function (ver) {
                return ver ? 'El costo del básico es la suma de sus componentes: costo × cantidad × (1 + % desperdicio). En una cuadrilla, la cantidad es cuántos de cada categoría trabajan en una jornada.'
                           : 'Solo los insumos de tipo «Básico / cuadrilla» llevan componentes.';
            }
        });
    }

    // Matriz de un concepto del catálogo (conceptos P.U.)
    function pestanaMatriz(sec, c) {
        var cat = c.st.cat;
        tablaInsumos(sec, c, {
            total: 'Costo directo por unidad', rendimiento: true,
            vacio: 'Sin insumos. Busca arriba lo que lleva una unidad del concepto (materiales, mano de obra o cuadrilla, equipo).',
            pie: cat.faltan && cat.faltan.length ? '<p class="fi-nota">Falta precio de: ' + c.esc(cat.faltan.join(', ')) + '</p>' : '',
            aviso: function () {
                return 'Lo que lleva UNA unidad del concepto. Para mano de obra o cuadrillas puedes capturar el rendimiento (unidades por jornada) y la cantidad sale sola. ' +
                       'El costo directo usa el costo de catálogo (mano de obra con su FSR); indirectos, financiamiento y utilidad se aplican en el presupuesto.';
            }
        });
    }

    // Costo horario de una máquina (Reglamento de la LOPSRM). Misma fórmula que includes/pu.php puCostoHorario;
    // al guardar, el servidor lo calcula y lo agrega al historial de precios. Se manda como JSON en el campo 'costo_horario'.
    var CH_DATOS = [
        ['vm', 'Valor de la máquina (Vm) $'], ['vr', 'Valor de rescate (Vr) $'], ['ve', 'Vida económica (Ve) horas'], ['hea', 'Horas efectivas por año (Hea)'],
        ['i', 'Tasa de interés anual (i) %'], ['s', 'Prima anual de seguros (s) %'], ['ko', 'Factor de mantenimiento (Ko)'],
        ['gh', 'Combustible por hora (Gh) litros'], ['pc', 'Precio del combustible (Pc) $/l'],
        ['ah', 'Aceite por hora (Ah) litros'], ['ga', 'Aceite entre cambios por hora (Ga) litros'], ['pa', 'Precio del aceite (Pa) $/l'],
        ['pn', 'Valor de las llantas (Pn) $'], ['vn', 'Vida de las llantas (Vn) horas'], ['pe', 'Valor de piezas especiales (Pe) $'], ['va', 'Vida de las piezas (Va) horas'],
        ['sr', 'Salario real del operador por turno (Sr) $'], ['ht', 'Horas efectivas por turno (Ht)']
    ];
    function pestanaCostoHorario(sec, c) {
        var ch = c.st.cat.costo_horario, previos = (ch && ch.parametros) || {};
        if (!c.st.cat.con_costo_horario) { sec.innerHTML = '<p class="fi-nota">Falta aplicar la migración 005 para calcular costos horarios.</p>'; return; }
        sec.innerHTML = '<p class="fi-nota" data-c="aviso"></p>' +
            '<div data-c="editor">' +
                '<div class="fi-campos tres">' + CH_DATOS.map(function (d) {
                    return '<label class="fi-campo"><span>' + c.esc(d[1]) + '</span><input type="number" step="any" min="0" data-ch="' + d[0] + '" data-editable value="' +
                        c.esc(previos[d[0]] != null && previos[d[0]] !== 0 ? previos[d[0]] : '') + '"></label>';
                }).join('') + '</div>' +
                '<div class="fi-costo" data-c="resultado"></div>' +
                '<input type="hidden" data-campo="costo_horario">' +
            '</div>';
        var oculto = sec.querySelector('[data-campo="costo_horario"]'), cambiado = false;
        function v(k) { var n = parseFloat((sec.querySelector('[data-ch="' + k + '"]') || {}).value); return isFinite(n) && n > 0 ? n : 0; }
        function calcular() {
            var p = {};
            CH_DATOS.forEach(function (d) { p[d[0]] = v(d[0]); });
            // Solo se manda si se modificó algo en esta pestaña
            oculto.value = cambiado ? JSON.stringify(p) : '';
            var res = sec.querySelector('[data-c="resultado"]');
            if (!(p.vm > 0 && p.ve > 0 && p.hea > 0)) {
                res.innerHTML = ch ? '<b>Costo horario guardado:</b> ' + c.esc(dinero6(ch.costo)) + ' <small>(' + c.esc(c.fechaDMY(ch.fecha)) + ', ' + c.esc(ch.usuario || '') + ')</small>'
                    : 'Captura al menos Vm, Ve y Hea para calcular.';
                return;
            }
            var D = (p.vm - p.vr) / p.ve;
            var partes = [
                ['Depreciación', D], ['Inversión', (p.vm + p.vr) * p.i / 100 / (2 * p.hea)], ['Seguros', (p.vm + p.vr) * p.s / 100 / (2 * p.hea)],
                ['Mantenimiento', p.ko * D], ['Combustible', p.gh * p.pc], ['Lubricantes', (p.ah + p.ga) * p.pa],
                ['Llantas', p.pn > 0 && p.vn > 0 ? p.pn / p.vn : 0], ['Piezas especiales', p.pe > 0 && p.va > 0 ? p.pe / p.va : 0],
                ['Operación', p.sr > 0 && p.ht > 0 ? p.sr / p.ht : 0]
            ];
            var total = partes.reduce(function (s, x) { return s + x[1]; }, 0);
            res.innerHTML = partes.filter(function (x) { return x[1]; }).map(function (x) { return c.esc(x[0]) + ' ' + c.esc(dinero6(x[1])); }).join(' · ') +
                '<br><b>Costo horario: ' + c.esc(dinero6(total)) + ' por hora</b>' + (cambiado ? ' <small>(se agrega al historial de precios al guardar)</small>' : '');
        }
        function revisarTipo() {
            var t = dlg.querySelector('[data-campo="tipo"]'), eq = t && t.value === 'EQ';
            sec.querySelector('[data-c="editor"]').hidden = !eq;
            sec.querySelector('[data-c="aviso"]').textContent = eq
                ? 'Costo directo por hora efectiva de la máquina. Lo que no aplique déjalo vacío. Cambiarlo requiere el permiso «Capturar precios de insumos».'
                : 'El costo horario es solo para insumos de tipo «Equipo / maquinaria».';
        }
        sec.addEventListener('input', function (e) { if (e.target.dataset.ch) { cambiado = true; c.st.cambios = true; calcular(); } });
        var selTipo = dlg.querySelector('[data-campo="tipo"]');
        if (selTipo) selTipo.addEventListener('change', revisarTipo);
        calcular();
        revisarTipo();
    }

    // Conceptos de una plantilla de presupuesto: concepto del catálogo, partida («Partida / Subpartida») y cantidad.
    // Se guardan como JSON en el campo 'conceptos'.
    function pestanaPlantillaConceptos(sec, c) {
        var filas = (c.st.cat.conceptos || []).map(function (f) {
            return { concepto_pu_id: f.concepto_pu_id, codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad,
                     familia: f.familia || '', partida: f.partida || '', cantidad: f.cantidad, baja: String(f.estatus || '').trim() === 'B' };
        });
        sec.innerHTML =
            '<p class="fi-nota">Conceptos del catálogo que se agregan al Análisis P.U. al cargar la plantilla, con los precios vigentes del catálogo. ' +
            'Sin partida se usa la familia del concepto; para una subpartida escribe «Partida / Subpartida».</p>' +
            '<div class="fi-fila"><label class="fi-campo completo"><span>Agregar concepto (código o descripción)</span>' +
            '<input type="text" data-c="buscar" data-editable autocomplete="off" placeholder="Escribe al menos 2 letras…"></label></div>' +
            '<div class="fi-sugerencias" data-c="sugerencias" hidden></div>' +
            '<div class="fi-tabla"><table><thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th>Partida</th><th class="num">Cantidad</th><th></th></tr></thead>' +
            '<tbody></tbody></table></div><input type="hidden" data-campo="conceptos">';
        var tbody = sec.querySelector('tbody'), oculto = sec.querySelector('[data-campo="conceptos"]');
        var buscar = sec.querySelector('[data-c="buscar"]'), sug = sec.querySelector('[data-c="sugerencias"]');
        function sincronizar() {
            oculto.value = JSON.stringify(filas.map(function (f) { return { concepto_pu_id: f.concepto_pu_id, cantidad: f.cantidad, partida: f.partida }; }));
        }
        function pintar() {
            tbody.innerHTML = filas.length ? filas.map(function (f, i) {
                return '<tr data-i="' + i + '"><td>' + c.esc(f.codigo) + (f.baja ? ' <small>(baja)</small>' : '') + '</td><td>' + c.esc(f.descripcion) + '</td><td>' + c.esc(f.unidad) + '</td>' +
                    '<td><input type="text" data-k="partida" data-editable maxlength="100" style="width:160px;text-align:left" placeholder="' + c.esc(f.familia) + '" value="' + c.esc(f.partida) + '"></td>' +
                    '<td class="num"><input type="number" step="any" min="0" data-k="cantidad" data-editable value="' + c.esc(f.cantidad) + '"></td>' +
                    '<td><button type="button" class="fi-btn peligro" data-k="quitar" data-editable title="Quitar">✕</button></td></tr>';
            }).join('') : '<tr><td colspan="6" class="fi-vacio">Sin conceptos. Búscalos arriba en el catálogo de Conceptos P.U.</td></tr>';
            tbody.querySelectorAll('[data-editable]').forEach(function (el) { el.disabled = !c.st.editable; });
            sincronizar();
        }
        tbody.addEventListener('input', function (e) {
            var k = e.target.dataset.k, tr = e.target.closest('tr');
            if (!k || !tr || k === 'quitar') return;
            filas[+tr.dataset.i][k] = e.target.value;
            c.st.cambios = true;
            sincronizar();
        });
        tbody.addEventListener('click', function (e) {
            var b = e.target.closest('[data-k="quitar"]');
            if (!b || b.disabled) return;
            filas.splice(+b.closest('tr').dataset.i, 1);
            c.st.cambios = true;
            pintar();
        });
        var espera = null;
        buscar.addEventListener('input', function () {
            clearTimeout(espera);
            var q = buscar.value.trim();
            if (q.length < 2) { sug.hidden = true; return; }
            espera = setTimeout(function () {
                c.pedir(c.url(c.st.def.api, 'buscar', '&q=' + encodeURIComponent(q))).then(function (j) {
                    sug.innerHTML = j.filas.length ? j.filas.map(function (f, i) {
                        return '<button type="button" data-s="' + i + '">' + c.esc(f.codigo) + ' · ' + c.esc(f.descripcion) + ' <small>(' + c.esc(f.unidad) + ')</small></button>';
                    }).join('') : '<p class="fi-vacio">Sin coincidencias.</p>';
                    sug.hidden = false;
                    sug.onclick = function (e) {
                        var b = e.target.closest('[data-s]');
                        if (!b) return;
                        var f = j.filas[+b.dataset.s];
                        filas.push({ concepto_pu_id: f.concepto_pu_id, codigo: f.codigo, descripcion: f.descripcion, unidad: f.unidad, familia: f.familia || '', partida: '', cantidad: 1 });
                        c.st.cambios = true;
                        buscar.value = '';
                        sug.hidden = true;
                        pintar();
                    };
                }).catch(function (err) { c.mensaje(err.message, 'error'); });
            }, 250);
        });
        pintar();
    }

    // ================= Pestañas propias de la ficha de clientes =================
    function pestanaCondiciones(sec, c) {
        var r = c.st.registro;
        var texto = r ? (r.condiciones_com || '') : CONDICIONES.es;
        var ingles = !!r && texto.trim() !== '' && texto.trim() === CONDICIONES.en;
        sec.innerHTML = '<label class="fi-check"><input type="checkbox" data-ingles' + (ingles ? ' checked' : '') + '> Inglés</label>' +
            '<textarea class="fi-condiciones" rows="14" data-campo="condiciones_com">' + c.esc(texto) + '</textarea>';
        var chk = sec.querySelector('[data-ingles]'), area = sec.querySelector('textarea');
        chk.addEventListener('change', function () {
            if (!c.st.editable) { chk.checked = !chk.checked; return; }
            var actual = area.value.trim();
            var nuevo = chk.checked ? CONDICIONES.en : CONDICIONES.es;
            var esPredeterminado = actual === '' || actual === CONDICIONES.es || actual === CONDICIONES.en;
            if (!esPredeterminado && !confirm('¿Reemplazar las condiciones capturadas por las predeterminadas en ' + (chk.checked ? 'inglés' : 'español') + '?')) {
                chk.checked = !chk.checked;
                return;
            }
            area.value = nuevo;
            c.st.cambios = true;
        });
    }

    function pestanaHistorial(sec, c) {
        var hoy = new Date(), antes = new Date(hoy.getFullYear() - 1, hoy.getMonth(), hoy.getDate());
        sec.innerHTML =
            '<div class="fi-fila">' +
                '<label class="fi-campo"><span>Periodo de</span><input type="date" data-h="ini" value="' + c.iso(antes) + '"></label>' +
                '<label class="fi-campo"><span>al</span><input type="date" data-h="fin" value="' + c.iso(hoy) + '"></label>' +
                '<button type="button" class="fi-btn azul" data-h="mostrar">Mostrar</button>' +
            '</div>' +
            '<div class="fi-tabla"><table><thead><tr><th>Folio</th><th>Fecha</th><th>Estatus</th><th>Vendedor</th><th class="num">Importe</th></tr></thead>' +
            '<tbody><tr><td colspan="5" class="fi-vacio">' + (c.st.id ? 'Presiona «Mostrar» para ver las cotizaciones del periodo.'
                : 'El historial está disponible para clientes ya guardados.') + '</td></tr></tbody></table></div>';
        var tbody = sec.querySelector('tbody');
        sec.querySelector('[data-h="mostrar"]').addEventListener('click', function () {
            if (!c.st.id) return;
            var ini = sec.querySelector('[data-h="ini"]').value, fin = sec.querySelector('[data-h="fin"]').value;
            if (!ini || !fin || ini > fin) { c.mensaje('Revisa el periodo del historial.', 'error'); return; }
            tbody.innerHTML = '<tr><td colspan="5" class="fi-vacio">Consultando…</td></tr>';
            c.pedir(c.url(c.st.def.api, 'historial', '&id=' + c.st.id + '&ini=' + ini + '&fin=' + fin)).then(function (j) {
                tbody.innerHTML = j.filas.length ? j.filas.map(function (f) {
                    return '<tr><td>' + c.esc(f.folio) + '</td><td>' + c.esc(c.fechaDMY(f.fecha)) + '</td><td>' + c.esc(f.estatus) + '</td><td>' +
                        c.esc(f.vendedor) + '</td><td class="num">' + c.esc((f.moneda || '$') + ' ' + c.moneda(f.importe_con_iva)) + '</td></tr>';
                }).join('') : '<tr><td colspan="5" class="fi-vacio">Sin cotizaciones en el periodo.</td></tr>';
            }).catch(function (err) {
                tbody.innerHTML = '<tr><td colspan="5" class="fi-vacio error">⚠ ' + c.esc(err.message) + '</td></tr>';
            });
        });
    }

    function pestanaHubspot(sec, c) {
        var encontrados = [], relaciones = c.st.cat.relaciones_hs || [];
        var selHs = null, selRel = null;
        sec.innerHTML =
            '<div class="fi-campos tres">' +
                '<label class="fi-campo"><span>Nombre</span><input type="text" data-hs="nombre"></label>' +
                '<label class="fi-campo"><span>Correo</span><input type="text" data-hs="correo"></label>' +
                '<label class="fi-campo"><span>Teléfono</span><input type="text" data-hs="telefono"></label>' +
            '</div>' +
            '<div class="fi-fila"><button type="button" class="fi-btn azul" data-hsb="buscar">Buscar</button>' +
                '<button type="button" class="fi-btn" data-hsb="registrar">Registrar en Hubspot</button></div>' +
            '<div class="fi-dos">' +
                '<div><b>Clientes registrados Hubspot</b><div class="fi-tabla"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th></tr></thead>' +
                    '<tbody data-t="hs"></tbody></table></div></div>' +
                '<div><b>Cliente relacionado con easy-glass y Hubspot</b><div class="fi-tabla"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th></tr></thead>' +
                    '<tbody data-t="rel"></tbody></table></div></div>' +
            '</div>' +
            '<div class="fi-fila entre"><button type="button" class="fi-btn azul" data-hsb="asociar">✔ Asociar Contacto</button>' +
                '<button type="button" class="fi-btn" data-hsb="quitar">✕ Eliminar Relación</button></div>' +
            '<p class="fi-nota" data-hs-nota></p>';

        var inp = function (n) { return sec.querySelector('[data-hs="' + n + '"]'); };
        var nota = sec.querySelector('[data-hs-nota]');
        var guardado = !!c.st.id;
        nota.textContent = guardado ? 'Busca el contacto en HubSpot por nombre, correo o teléfono y asócialo; o regístralo si todavía no existe.'
            : 'La búsqueda y registro en HubSpot, así como las relaciones de contactos, se habilitan al guardar primero el cliente.';
        sec.querySelectorAll('[data-hsb]').forEach(function (b) { b.disabled = !guardado || c.st.cat.puede_modificar === false; });
        // Los datos de la pestaña General sirven de punto de partida
        if (c.st.registro) {
            inp('nombre').value = c.st.registro.contacto || '';
            inp('correo').value = c.st.registro.email || '';
            inp('telefono').value = c.st.registro.telefono || '';
        }

        function fila(r, i, sel) {
            return '<tr data-i="' + i + '"' + (sel ? ' class="sel"' : '') + '><td>' + c.esc(r.nombre) + '</td><td>' + c.esc(r.correo) + '</td><td>' + c.esc(r.telefono) + '</td></tr>';
        }
        function pintar() {
            sec.querySelector('[data-t="hs"]').innerHTML = encontrados.map(function (r, i) { return fila(r, i, i === selHs); }).join('');
            sec.querySelector('[data-t="rel"]').innerHTML = relaciones.map(function (r, i) {
                return fila({ nombre: r.hs_nombre, correo: r.hs_correo, telefono: r.hs_telefono }, i, i === selRel);
            }).join('');
        }
        pintar();

        sec.querySelector('[data-t="hs"]').addEventListener('click', function (e) {
            var tr = e.target.closest('tr[data-i]');
            if (tr) { selHs = +tr.dataset.i; pintar(); }
        });
        sec.querySelector('[data-t="rel"]').addEventListener('click', function (e) {
            var tr = e.target.closest('tr[data-i]');
            if (tr) { selRel = +tr.dataset.i; pintar(); }
        });

        function trabajar(promesa, aviso) {
            nota.textContent = 'Consultando HubSpot…';
            return promesa.then(function (j) {
                if (j.relaciones_hs) { relaciones = j.relaciones_hs; selRel = null; }
                nota.textContent = aviso(j);
                pintar();
            }).catch(function (err) { nota.textContent = '⚠ ' + err.message; });
        }

        sec.addEventListener('click', function (e) {
            var b = e.target.closest('[data-hsb]');
            if (!b || b.disabled) return;
            var api = c.st.def.api, id = c.st.id;
            if (b.dataset.hsb === 'buscar') {
                var texto = inp('correo').value.trim() || inp('nombre').value.trim() || inp('telefono').value.trim();
                if (texto.length < 3) { nota.textContent = 'Escribe al menos 3 letras del nombre, correo o teléfono.'; return; }
                trabajar(c.pedir('api/hubspot.php?accion=contactos&q=' + encodeURIComponent(texto)), function (j) {
                    encontrados = j.contactos.map(function (x) { return { id: x.id, nombre: x.nombre, correo: x.correo, telefono: x.telefono }; });
                    selHs = encontrados.length === 1 ? 0 : null;
                    return encontrados.length ? encontrados.length + ' contacto(s) encontrados: selecciona uno y presiona «Asociar Contacto».'
                        : 'No se encontró el contacto en HubSpot. Puedes registrarlo con «Registrar en Hubspot».';
                });
            } else if (b.dataset.hsb === 'registrar') {
                var nuevo = { id: id, nombre: inp('nombre').value.trim(), correo: inp('correo').value.trim(), telefono: inp('telefono').value.trim() };
                if (!confirm('¿Registrar a «' + nuevo.nombre + '» (' + nuevo.correo + ') como contacto nuevo en HubSpot?')) return;
                trabajar(c.pedir(c.url(api, 'hs_registrar'), nuevo), function () { return 'Contacto registrado en HubSpot y relacionado con el cliente.'; });
            } else if (b.dataset.hsb === 'asociar') {
                if (selHs === null) { nota.textContent = 'Selecciona primero un contacto de «Clientes registrados Hubspot».'; return; }
                var x = encontrados[selHs];
                trabajar(c.pedir(c.url(api, 'hs_asociar'), { id: id, id_hubspot: x.id, nombre: x.nombre, correo: x.correo, telefono: x.telefono }),
                    function () { return 'Contacto relacionado con el cliente.'; });
            } else if (b.dataset.hsb === 'quitar') {
                if (selRel === null) { nota.textContent = 'Selecciona primero la relación a eliminar.'; return; }
                if (!confirm('¿Eliminar la relación con «' + relaciones[selRel].hs_nombre + '»?')) return;
                trabajar(c.pedir(c.url(api, 'hs_quitar'), { id: id, id_rel: relaciones[selRel].id_rel_clientes }),
                    function () { return 'Relación eliminada.'; });
            }
        });
    }

    return { abrir: abrir };
})();
