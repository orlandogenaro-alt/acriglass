// Administrador › Hoja Membretada
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var form = $('form');
    var token = document.querySelector('meta[name="acri-token"]').content;
    var m = window.ACRI_MEMBRETE;

    // Presupuesto de ejemplo para la vista previa
    var EJEMPLO = {
        folio: 855, fecha: new Date().toISOString().substr(0, 10), estatus: 'Pendiente',
        cliente: 'GUSTAVO GONZALEZ', proyecto: 'CANCELERIA S80 COLOR NEGRO', ubicacion: 'TEMASCALCINGO',
        vendedor: 'RENE ZALDIVAR', elaboro: window.ACRI_USUARIO || '', notas: 'Precios en moneda nacional.',
        utilidad_pct: 25.1266, subtotal: 43986.10, iva_pct: 16,
        secciones: [
            { titulo: 'MATERIA PRIMA', conceptos: [
                { concepto: 'ALUMINIO', importe: 5330.61, folio: '', articulos: [] },
                { concepto: 'HERRAJES', importe: 1403.80, folio: 'A00095432', articulos: [
                    { nombre: 'BRK 7657 JALADERA TOALLERO NEGRO MATE', unidades: 2, um: 'PIEZA', total: 1047.30 },
                    { nombre: 'BRK 212 BOTAGUA DE BURBUJA', unidades: 2, um: 'PIEZA', total: 72.16 }
                ] },
                { concepto: 'CRISTAL', importe: 7768.67, folio: '10740', articulos: [
                    { nombre: 'TEMPLADO CLARO GDN ESPESOR 12 MM', unidades: 5.78, um: 'm²', total: 7768.67 }
                ] }
            ] },
            { titulo: 'MANO DE OBRA', conceptos: [
                { concepto: 'COMISIONES', importe: 2859.09, folio: '', articulos: [] },
                { concepto: 'MANO DE OBRA INTERNA', importe: 4488.00, folio: '', articulos: [
                    { nombre: 'ZALDIVAR CORREA RENE', unidades: 4, um: 'Dias', total: 1660 },
                    { nombre: 'VALENCIA CASTILLO DAVID', unidades: 4, um: 'Dias', total: 1560 },
                    { nombre: 'SANCHEZ LOPEZ FERNANDO', unidades: 4, um: 'Dias', total: 1268 }
                ] }
            ] },
            { titulo: 'GASTOS DE OPERACION', conceptos: [
                { concepto: 'Gastos de Operación', importe: 4480.21, folio: '', articulos: [] },
                { concepto: 'FLETES', importe: 2569.12, folio: '', articulos: [] }
            ] }
        ]
    };

    var TEXTOS = ['empresa', 'datos', 'titulo', 'titulo_detalle', 'codigo', 'revision', 'leyenda_firma', 'pie', 'color',
        'an_titulo', 'an_subtitulo', 'an_codigo', 'an_revision', 'an_fecha_emision', 'an_etiqueta_cliente',
        'an_nota', 'an_autorizo', 'an_puesto', 'an_nombre', 'an_color'];
    var CASILLAS = ['mostrar_notas', 'an_dolares'];

    // Renglones de ejemplo del Análisis de Cancelería (mismo arreglo que filasResumenCc de presupuesto.js)
    function ejemploAnalisis() {
        var sub = 27580.78, iva = sub * 0.16, p = function (v) { return v / sub * 100; };
        var f = function (clase, anexo, nombre, pres, s, tot, pc, como) {
            return { clase: clase, anexo: anexo, nombre: nombre, pres: pres, sub: s, tot: tot, p: pc, como: como };
        };
        var usd = f('ccr-final', '', 'TOTAL EN DÓLARES IVA INCLUIDO', null, null, (sub + iva) / 18.5, null, 'usd');
        usd.extra = 'T.C. 18.50';
        return {
            folio: 1, fecha: new Date().toISOString().substr(0, 10), cliente: 'ARQ. OMAR MIRANDA / ARQ. RAUL DE JESUS',
            proyecto: 'TALLER DE TINTAS INDISA', ubicacion: 'CDMX', tc: 18.5, subtotal: sub, iva: iva, total: sub + iva,
            letra: '(TREINTA Y UN MIL NOVECIENTOS NOVENTA Y TRES PESOS 70/100 M.N.)',
            filas: [
                f('ccr-titulo', '', 'MATERIA PRIMA'),
                f('', 1, 'ALUMINIO', 7044.34, null, null, p(7044.34)),
                f('', 2, 'HERRAJES', 559.04, null, null, p(559.04)),
                f('', 3, 'ACCESORIOS', 534.22, null, null, p(534.22)),
                f('ccr-grupo', 4, 'CRISTAL', null, 5313.60, null, p(5313.60)),
                f('ccr-sub', '4.1', 'PLANILUX 6MM (7.38)', 5313.60),
                f('ccr-total', '(=)', 'TOTAL MATERIA PRIMA', null, null, 13727.01, p(13727.01)),
                f('ccr-titulo', '', 'MANO DE OBRA'),
                f('', 5, 'MANO DE OBRA EXTERNA', 5525, null, null, p(5525)),
                f('', 6, 'MANO DE OBRA INTERNA', 972.86, null, null, p(972.86)),
                f('ccr-calc', 7, 'COMISIONES', 1516.94, null, null, p(1516.94)),
                f('ccr-total', '(+)', 'TOTAL MANO DE OBRA', null, 8014.80, 8014.80, p(8014.80)),
                f('ccr-total ccr-fuerte', '(=)', 'TOTAL COSTO PRIMO', null, null, 21741.81, p(21741.81)),
                f('ccr-total', '(−)(=)', 'MARGEN DE UTILIDAD BRUTA', null, null, 5838.97, p(5838.97)),
                f('ccr-titulo', '', 'GASTOS DE OPERACION'),
                f('ccr-calc', 8, 'INDIRECTOS OFICINA Y CAMPO (4.5%)', 490.64, null, null, p(490.64)),
                f('', 9, 'EQUIPO DE HERRAMIENTA 0.15%', 68.95, null, null, p(68.95)),
                f('', 10, 'COMIDAS', 0, null, null, 0),
                f('', 11, 'FLETES', 0, null, null, 0),
                f('', 12, 'OTROS GASTOS 4%', 179.28, null, null, p(179.28)),
                f('ccr-total', '(−)', 'TOTAL GASTOS DE OPERACION', null, null, 738.87, p(738.87)),
                f('ccr-total ccr-fuerte', '(=)', 'UTILIDAD NETA', null, null, 5100.10, p(5100.10)),
                f('ccr-nota', '', 'PORCENTAJE DE GANANCIA SOBRE PRECIO DE VENTA', null, null, p(5100.10), null, 'pct'),
                f('ccr-final', '', 'SUBTOTAL', null, null, sub, 100, 'fijo'),
                f('ccr-final', '', 'IVA 16.00 %', null, null, iva, null, 'fijo'),
                f('ccr-final ccr-fuerte', '', 'TOTAL', null, null, sub + iva, null, 'fijo'),
                usd
            ]
        };
    }

    function mensaje(t, tipo) { $('mensaje').textContent = t || ''; $('mensaje').className = 'c-mensaje ' + (tipo || ''); }

    function llenar(d) {
        m = d;
        TEXTOS.forEach(function (k) { form.elements[k].value = d[k] || ''; });
        CASILLAS.forEach(function (k) { form.elements[k].checked = !!d[k]; });
        for (var i = 0; i < 4; i++) form.elements['firma' + i].value = d.firmas[i] || '';
        pintarLogo(d);
    }

    // Solo el logo: lo capturado en el formulario y no guardado se conserva
    function pintarLogo(d) {
        m.logo = d.logo;
        m.logo_propio = d.logo_propio;
        $('logo').src = d.logo || '';
        $('logoQuitar').disabled = !d.logo_propio;
        $('logoEstado').textContent = d.logo_propio ? 'Logo propio de la hoja.' : 'Se usa el logo del sistema (Imagen del Sistema).';
        previa();
    }

    function valores() {
        var v = {};
        TEXTOS.forEach(function (k) { v[k] = form.elements[k].value; });
        CASILLAS.forEach(function (k) { v[k] = form.elements[k].checked; });
        for (var i = 0; i < 4; i++) v['firma' + i] = form.elements['firma' + i].value;
        return v;
    }

    // La vista previa refleja lo capturado aunque no se haya guardado
    function previa() {
        var v = valores();
        var p = Object.assign({}, m, v, {
            firmas: [0, 1, 2, 3].map(function (i) { return v['firma' + i].trim(); }).filter(Boolean)
        });
        var tipo = document.querySelector('input[name="tipoPrevia"]:checked').value;
        $('previa').innerHTML = tipo === 'analisis' ? FormatoAnalisis(ejemploAnalisis(), p) : FormatoPresupuesto(EJEMPLO, p, tipo === 'detalle');
    }

    function pedir(url, op) {
        return fetch(url, op).then(function (r) {
            if (r.status === 401) { (window.top || window).location.href = 'index.php'; throw new Error('Sesión expirada'); }
            return r.json().catch(function () { throw new Error('Respuesta no válida del servidor (HTTP ' + r.status + ').'); });
        }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'Error desconocido.');
            return j;
        });
    }
    function postJson(accion, datos) {
        return pedir('api/membrete.php?accion=' + accion, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Acri-Token': token }, body: JSON.stringify(datos || {})
        });
    }
    function imagen(accion, archivo) {
        var f = new FormData();
        f.append('accion', accion);
        f.append('tipo', 'membrete');
        if (archivo) f.append('archivo', archivo);
        return pedir('api/imagenes.php', { method: 'POST', body: f, headers: { 'X-Acri-Token': token } }).then(function (j) {
            return pedir('api/membrete.php?accion=leer').then(function (r) { r.aviso = j.aviso; return r; });
        });
    }

    form.addEventListener('input', previa);
    document.querySelectorAll('input[name="tipoPrevia"]').forEach(function (r) { r.addEventListener('change', previa); });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        $('guardar').disabled = true;
        postJson('guardar', valores())
            .then(function (j) { llenar(j.membrete); mensaje('Hoja membretada guardada.', 'ok'); })
            .catch(function (err) { mensaje(err.message, 'error'); })
            .finally(function () { $('guardar').disabled = false; });
    });

    $('restablecer').addEventListener('click', function () {
        if (!confirm('¿Volver a los textos, firmas y color que trae el sistema? El logo no se toca.')) return;
        postJson('restablecer')
            .then(function (j) { llenar(j.membrete); mensaje('Se restablecieron los textos.', 'ok'); })
            .catch(function (err) { mensaje(err.message, 'error'); });
    });

    $('logoArchivo').addEventListener('change', function () {
        var a = this.files[0];
        if (!a) return;
        mensaje('Subiendo logo…', 'info');
        imagen('subir', a)
            .then(function (j) {
                pintarLogo(j.membrete);
                mensaje('Logo guardado.' + (j.aviso ? ' ' + j.aviso : ''), 'ok');
            })
            .catch(function (err) { mensaje(err.message, 'error'); })
            .finally(function () { $('logoArchivo').value = ''; });
    });

    $('logoQuitar').addEventListener('click', function () {
        if (!confirm('¿Quitar el logo propio de la hoja y usar el logo del sistema?')) return;
        imagen('quitar')
            .then(function (j) { pintarLogo(j.membrete); mensaje('Se usa el logo del sistema.', 'ok'); })
            .catch(function (err) { mensaje(err.message, 'error'); });
    });

    llenar(m);
})();
