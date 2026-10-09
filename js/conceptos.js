// Administrador › Conceptos de Materia Prima / Mano de Obra / Gastos de Operacion
(function () {
    var tipo = new URLSearchParams(location.search).get('tipo');
    var conCalculo = tipo === 'mp' || tipo === 'go';
    function si(v, h) { return v ? h.chip('Sí', 'ok') : '–'; }

    var columnas = [
        { id: 'descripcion', titulo: 'Concepto', fija: true },
        { id: 'clave_concepto', titulo: 'Clave', clase: 'centro' }
    ];
    if (conCalculo) {
        columnas.push(
            { id: 'calculo_automatico', titulo: 'Cálculo automático', clase: 'centro',
              html: function (f, h) { return si(f.calculo_automatico, h); }, texto: function (f) { return f.calculo_automatico ? 'si' : ''; } },
            { id: 'porcentaje_calculo', titulo: '%', clase: 'der',
              html: function (f) { return f.porcentaje_calculo ? f.porcentaje_calculo + ' %' : '–'; } }
        );
    }
    if (tipo === 'mp') {
        columnas.push({ id: 'afecta_gasto_oper', titulo: 'Afecta gastos de operación', clase: 'centro',
                        html: function (f, h) { return si(f.afecta_gasto_oper, h); }, texto: function () { return ''; } });
    }
    if (tipo === 'go') {
        columnas.push({ id: 'es_concepto_seguro', titulo: 'Concepto de seguro', clase: 'centro',
                        html: function (f, h) { return si(f.es_concepto_seguro, h); }, texto: function () { return ''; } });
    }
    columnas.push(
        { id: 'usos', titulo: 'Usado en presupuestos', clase: 'centro',
          html: function (f) { return f.usos ? f.usos + ' renglón(es)' : '–'; } },
        { id: 'estado', titulo: 'Estado', clase: 'centro',
          html: function (f, h) { return f.activa ? h.chip('Activo', 'ok') : h.chip('Inactivo'); },
          texto: function (f) { return f.activa ? 'activo' : 'inactivo'; } }
    );

    Catalogo({
        nombre: function (f) { return '«' + (f.descripcion || f.clave) + '»'; },
        columnas: columnas,

        valoresIniciales: function (f) {
            return f ? Object.assign({}, f)
                     : { descripcion: '', clave_concepto: '', calculo_automatico: false, porcentaje_calculo: 0,
                         afecta_gasto_oper: false, es_concepto_seguro: false };
        },

        formulario: function (f) {
            return {
                titulo: f ? 'Concepto ' + f.descripcion : 'Nuevo concepto',
                campos: [
                    { id: 'descripcion', etiqueta: 'Concepto', completo: true, placeholder: 'Ej. ALUMINIO',
                      ayuda: 'Así aparece en la lista desplegable del presupuesto (máximo 80 caracteres).' },
                    { id: 'clave_concepto', etiqueta: 'Clave (opcional)', placeholder: 'Máx. 10' },
                    { id: 'porcentaje_calculo', etiqueta: 'Porcentaje de cálculo', tipo: 'number', visible: conCalculo },
                    { id: 'calculo_automatico', etiqueta: 'Cálculo automático (el importe sale del porcentaje)', tipo: 'check', visible: conCalculo },
                    { id: 'afecta_gasto_oper', etiqueta: 'Afecta los gastos de operación', tipo: 'check', visible: tipo === 'mp' },
                    { id: 'es_concepto_seguro', etiqueta: 'Es concepto de seguro (va al anexo de seguro)', tipo: 'check', visible: tipo === 'go' }
                ]
            };
        }
    });
})();
