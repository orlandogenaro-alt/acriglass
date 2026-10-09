// Administrador › Bases de datos
(function () {
    var CHARSETS = {
        'NONE': 'NONE (texto en Windows-1252, como Easy-Glass / AW / Microsip)',
        'UTF8': 'UTF8',
        'WIN1252': 'WIN1252',
        'ISO8859_1': 'ISO8859_1'
    };

    Catalogo({
        columnas: [
            { id: 'clave', titulo: 'Clave', fija: true, clase: 'centro', html: function (f, h) { return h.chip(f.clave, 'clave'); } },
            { id: 'nombre', titulo: 'Nombre', html: function (f, h) { return h.esc(f.nombre) + (f.sistema ? h.chip('Sistema') : ''); } },
            { id: 'motor', titulo: 'Motor', html: function (f, h) { return h.esc(f.motor_txt); }, texto: function (f) { return f.motor_txt; } },
            { id: 'servidor', titulo: 'Servidor', clase: 'mono' },
            { id: 'base', titulo: 'Base de datos', clase: 'mono corta', titulo_celda: function (f) { return f.base; } },
            { id: 'usuario', titulo: 'Usuario' },
            { id: 'contrasena', titulo: 'Contraseña', clase: 'centro',
              html: function (f, h) {
                  return f.tiene_contrasena ? h.chip('Guardada ✓', 'token')
                       : f.de_easyglass ? h.chip('De Easy-Glass Boss ✓', 'token')
                       : h.chip('Falta', 'falta');
              },
              texto: function (f) { return f.tiene_contrasena ? 'guardada' : f.de_easyglass ? 'de easy-glass boss' : 'falta'; } },
            { id: 'estado', titulo: 'Estado', clase: 'centro',
              html: function (f, h) { return f.activa ? h.chip('Activa', 'ok') : h.chip('Inactiva'); },
              texto: function (f) { return f.activa ? 'activa' : 'inactiva'; } },
            { id: 'prueba', titulo: 'Última prueba',
              html: function (f, h) { return h.prueba(f.prueba); },
              texto: function (f) { return f.prueba ? f.prueba.mensaje : ''; } },
            { id: 'notas', titulo: 'Notas', clase: 'corta', titulo_celda: function (f) { return f.notas; } }
        ],

        redibujanCon: ['motor'],

        valoresIniciales: function (f) {
            return f ? Object.assign({}, f, { contrasena: '' })
                     : { clave: '', nombre: '', motor: 'firebird', servidor: '', base: '', usuario: 'SYSDBA', contrasena: '', charset: 'NONE', notas: '' };
        },

        formulario: function (f, v, cat) {
            var m = v.motor;
            return {
                titulo: f ? 'Conexión ' + f.clave + (f.sistema ? ' (sistema)' : '') : 'Nueva conexión',
                campos: [
                    { id: 'clave', etiqueta: 'Clave', soloLectura: !!f, placeholder: 'Ej. AW', ayuda: f ? '' : 'Con esta clave se usa en el código: bd_pdo(\'CLAVE\').' },
                    { id: 'nombre', etiqueta: 'Nombre' },
                    { id: 'motor', etiqueta: 'Motor', tipo: 'select', opciones: cat.motores || {} },
                    { id: 'servidor', etiqueta: 'Servidor',
                      placeholder: m === 'odbc' ? '192.168.1.227\\INSTANCIA:1433' : (m === 'mysql' ? 'localhost:3306' : '192.168.1.228:3050'),
                      ayuda: m === 'odbc' ? 'Solo informativo: el servidor va dentro de la cadena de conexión.' : 'IP o nombre, con el puerto después de los dos puntos.' },
                    { id: 'base', etiqueta: m === 'odbc' ? 'DSN o cadena de conexión' : (m === 'mysql' ? 'Nombre de la base' : 'Ruta del archivo .FDB en el servidor'),
                      completo: true, placeholder: m === 'odbc' ? 'Driver={ODBC Driver 17 for SQL Server};Server=…;Database=…' : (m === 'mysql' ? 'acriglass' : 'E:\\carpeta\\base.fdb') },
                    { id: 'usuario', etiqueta: 'Usuario' },
                    { id: 'contrasena', etiqueta: 'Contraseña', tipo: 'password',
                      placeholder: f && f.tiene_contrasena ? '•••••••• guardada (vacía = conservarla)'
                                 : f && f.de_easyglass ? 'Vacía = usar la de Easy-Glass Boss' : '' },
                    { id: 'borrar_contrasena', etiqueta: 'Borrar la contraseña guardada', tipo: 'check', visible: !!(f && f.tiene_contrasena) },
                    { id: 'charset', etiqueta: 'Juego de caracteres', tipo: 'select', opciones: CHARSETS, visible: m === 'firebird', completo: true },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', completo: true }
                ]
            };
        },

        // Prueba lo capturado sin guardar
        probarFormulario: function (datos, pedir) {
            return pedir('probar', datos).then(function (j) { return j.prueba; });
        },

        acciones: {
            // Prueba la seleccionada, o todas si no hay selección
            probar: function (h) {
                var sel = document.querySelector('#filas tr.sel');
                var clave = sel ? sel.dataset.clave : '*';
                h.mensaje(clave === '*' ? 'Probando todas las conexiones…' : 'Probando ' + clave + '…', 'info');
                return h.pedir('probar', { clave: clave }).then(function (j) {
                    h.recibir(j);
                    var malas = j.filas.filter(function (f) { return (clave === '*' || f.clave === clave) && f.prueba && !f.prueba.ok; });
                    h.mensaje(malas.length ? 'Con error: ' + malas.map(function (f) { return f.clave; }).join(', ') + ' (pasa el mouse sobre "Error" para ver el detalle).'
                                           : 'Conexión correcta.', malas.length ? 'error' : 'ok');
                });
            }
        }
    });
})();
