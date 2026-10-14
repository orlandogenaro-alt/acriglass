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

    function mensaje(t, tipo) { $('mensaje').textContent = t || ''; $('mensaje').className = 'c-mensaje ' + (tipo || ''); }

    function llenar(d) {
        m = d;
        ['empresa', 'datos', 'titulo', 'titulo_detalle', 'codigo', 'revision', 'leyenda_firma', 'pie', 'color'].forEach(function (k) {
            form.elements[k].value = d[k] || '';
        });
        form.elements.mostrar_notas.checked = !!d.mostrar_notas;
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
        ['empresa', 'datos', 'titulo', 'titulo_detalle', 'codigo', 'revision', 'leyenda_firma', 'pie', 'color'].forEach(function (k) {
            v[k] = form.elements[k].value;
        });
        v.mostrar_notas = form.elements.mostrar_notas.checked;
        for (var i = 0; i < 4; i++) v['firma' + i] = form.elements['firma' + i].value;
        return v;
    }

    // La vista previa refleja lo capturado aunque no se haya guardado
    function previa() {
        var v = valores();
        var p = Object.assign({}, m, v, {
            firmas: [0, 1, 2, 3].map(function (i) { return v['firma' + i].trim(); }).filter(Boolean)
        });
        var detalle = document.querySelector('input[name="tipoPrevia"]:checked').value === 'detalle';
        $('previa').innerHTML = FormatoPresupuesto(EJEMPLO, p, detalle);
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
