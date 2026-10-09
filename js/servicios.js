// Administrador › APIs y servicios
(function () {
    function chipCredencial(c, h) {
        if (c.estado === 'na') return '—';
        if (c.estado === 'archivo') return h.chip(c.texto);
        if (c.estado === 'ok') return h.chip(c.texto + ' ✓', 'token');
        return h.chip(c.texto + ' ✗', 'falta', 'Falta capturarla');
    }

    Catalogo({
        columnas: [
            { id: 'clave', titulo: 'Clave', fija: true, clase: 'centro', html: function (f, h) { return h.chip(f.clave, 'clave'); } },
            { id: 'nombre', titulo: 'Nombre', html: function (f, h) { return h.esc(f.nombre) + (f.sistema ? h.chip('Sistema') : ''); } },
            { id: 'proveedor', titulo: 'Proveedor' },
            { id: 'url', titulo: 'URL base', clase: 'mono corta', titulo_celda: function (f) { return f.url; },
              html: function (f, h) { return f.url ? h.esc(f.url) : '–'; } },
            { id: 'auth', titulo: 'Autenticación', clase: 'centro' },
            { id: 'credencial', titulo: 'Credencial', clase: 'centro',
              html: function (f, h) { return chipCredencial(f.credencial, h); },
              texto: function (f) { return f.credencial.texto; } },
            { id: 'espera', titulo: 'Espera', clase: 'centro', html: function (f) { return f.espera + 's'; } },
            { id: 'estado', titulo: 'Estado', clase: 'centro',
              html: function (f, h) { return f.activa ? h.chip('Activa', 'ok') : h.chip('Inactiva'); },
              texto: function (f) { return f.activa ? 'activa' : 'inactiva'; } },
            { id: 'prueba', titulo: 'Última prueba',
              html: function (f, h) { return h.prueba(f.prueba); },
              texto: function (f) { return f.prueba ? f.prueba.mensaje : ''; } },
            { id: 'ruta_prueba', titulo: 'Ruta de prueba', clase: 'mono' },
            { id: 'notas', titulo: 'Notas', clase: 'corta', titulo_celda: function (f) { return f.notas; } }
        ],

        redibujanCon: ['auth'],

        valoresIniciales: function (f) {
            return f ? Object.assign({}, f, { credencial: '', client_id: '' })
                     : { clave: '', nombre: '', proveedor: '', url: 'https://', auth: 'bearer', auth_campo: '', credencial: '',
                         client_id: '', tokens_bd: '', tokens_tabla: '', archivo: '', espera: 30, ruta_prueba: '', notas: '' };
        },

        formulario: function (f, v, cat) {
            var a = v.auth;
            var guardada = f && f.credencial.estado === 'ok';
            var etiquetaCred = { bearer: 'Token', header: 'Token', query: 'Token', basic: 'usuario:contraseña', oauth2: 'Client secret' }[a] || 'Credencial';
            return {
                titulo: f ? 'Servicio ' + f.clave + (f.sistema ? ' (sistema)' : '') : 'Nuevo servicio',
                campos: [
                    { id: 'clave', etiqueta: 'Clave', soloLectura: !!f, placeholder: 'Ej. BANXICO',
                      ayuda: f ? '' : 'Con esta clave se usa en el código: api_http(\'CLAVE\', …).' },
                    { id: 'nombre', etiqueta: 'Nombre' },
                    { id: 'proveedor', etiqueta: 'Proveedor', completo: true },
                    { id: 'url', etiqueta: 'URL base', completo: true, placeholder: 'https://api.ejemplo.com' },
                    { id: 'auth', etiqueta: 'Autenticación', tipo: 'select', opciones: cat.autenticacion || {} },
                    { id: 'auth_campo', etiqueta: a === 'header' ? 'Nombre del encabezado' : 'Nombre del parámetro',
                      placeholder: a === 'header' ? 'Bmx-Token' : 'token', visible: a === 'header' || a === 'query' },
                    { id: 'credencial', etiqueta: etiquetaCred, tipo: 'password', visible: a !== 'ninguna', completo: true,
                      placeholder: guardada ? '•••••••• guardado (vacío = conservarlo)' : '' },
                    { id: 'borrar_credencial', etiqueta: 'Borrar la credencial guardada', tipo: 'check', visible: !!guardada },
                    { id: 'client_id', etiqueta: 'Client ID', visible: a === 'oauth2',
                      placeholder: f && f.client_id ? 'guardado (vacío = conservarlo)' : '' },
                    { id: 'tokens_bd', etiqueta: 'Base de los tokens', visible: a === 'oauth2', placeholder: 'EG',
                      ayuda: 'Conexión de Bases de datos donde se guardan los tokens.' },
                    { id: 'tokens_tabla', etiqueta: 'Tabla de tokens', visible: a === 'oauth2', placeholder: 'QB_TOKENS',
                      ayuda: 'Solo se leen; los renueva el otro sistema.' },
                    { id: 'archivo', etiqueta: 'Archivo de llaves (en config/)', visible: !f || !!f.archivo || a === 'ninguna', placeholder: 'push_keys.php' },
                    { id: 'espera', etiqueta: 'Espera máxima (segundos)', tipo: 'number' },
                    { id: 'ruta_prueba', etiqueta: 'Ruta de prueba (GET)', placeholder: '/v1/estado', completo: true,
                      ayuda: 'Se usa con "Probar". Vacía = basta con que el servidor responda. En QuickBooks {realm} se reemplaza solo.' },
                    { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', completo: true }
                ]
            };
        },

        // En servicios la prueba usa lo guardado: se guarda primero y luego se prueba
        probarFormulario: null,

        acciones: {
            'probar-todas': function (h) {
                h.mensaje('Probando todos los servicios activos… puede tardar según la espera de cada uno.', 'info');
                return h.pedir('probar', { clave: '*' }).then(function (j) {
                    h.recibir(j);
                    var malas = j.filas.filter(function (f) { return f.activa && f.prueba && !f.prueba.ok; });
                    h.mensaje(malas.length ? 'Con error: ' + malas.map(function (f) { return f.clave; }).join(', ') + ' (pasa el mouse sobre "Error" para ver el detalle).'
                                           : 'Todos los servicios respondieron.', malas.length ? 'error' : 'ok');
                });
            }
        }
    });
})();
