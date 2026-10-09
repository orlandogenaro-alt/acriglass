// Administrador › Estatus de Presupuestos
(function () {
    function mover(accion) {
        return function (c) {
            var f = c.seleccionada();
            if (!f) return;
            return c.pedir(accion, { clave: f.clave }).then(c.recibir);
        };
    }

    Catalogo({
        nombre: function (f) { return 'el estatus «' + (f.nombre || f.clave) + '»'; },

        columnas: [
            { id: 'orden', titulo: '#', clase: 'centro' },
            { id: 'nombre', titulo: 'Estatus', fija: true,
              html: function (f, h) {
                  return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:' +
                      h.esc(f.muestra) + '"></span>' + h.esc(f.nombre) + (f.sistema ? h.chip('Sistema') : '');
              } },
            { id: 'descripcion', titulo: 'Descripción', clase: 'corta', titulo_celda: function (f) { return f.descripcion; } },
            { id: 'color_nombre', titulo: 'Color', clase: 'centro' },
            { id: 'usos', titulo: 'Presupuestos', clase: 'centro',
              html: function (f) { return f.usos == null ? '–' : String(f.usos); } },
            { id: 'estado', titulo: 'Estado', clase: 'centro',
              html: function (f, h) { return f.activa ? h.chip('Activo', 'ok') : h.chip('Inactivo'); },
              texto: function (f) { return f.activa ? 'activo' : 'inactivo'; } }
        ],

        valoresIniciales: function (f) {
            return f ? { nombre: f.nombre, descripcion: f.descripcion, color: f.color }
                     : { nombre: '', descripcion: '', color: 'azul' };
        },

        formulario: function (f, v, cat) {
            var opciones = {};
            Object.keys(cat.colores || {}).forEach(function (k) { opciones[k] = cat.colores[k][0]; });
            return {
                titulo: f ? 'Estatus ' + f.nombre + (f.sistema ? ' (sistema)' : '') : 'Nuevo estatus',
                campos: [
                    { id: 'nombre', etiqueta: 'Nombre', placeholder: 'Ej. Seguimiento', soloLectura: !!(f && f.sistema),
                      ayuda: f && f.sistema ? 'Lo usa el sistema: no se puede renombrar.' : 'Máximo 15 caracteres.' },
                    { id: 'color', etiqueta: 'Color', tipo: 'select', opciones: opciones },
                    { id: 'descripcion', etiqueta: 'Descripción', completo: true, placeholder: 'Ej. Presupuesto en seguimiento',
                      ayuda: 'Aparece junto al estatus en el menú Actualizar Estatus.' }
                ]
            };
        },

        acciones: { subir: mover('subir'), bajar: mover('bajar') }
    });
})();
