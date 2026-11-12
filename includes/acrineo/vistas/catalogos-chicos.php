<?php
// ACRINEO · Ventanas de catálogos chicos de las lupas (js/acrineo/catalogo-chico.js):
// «Catálogo Unidades» (columna Unidad) y «Catálogo Tipos de insumos» (columna Tipo de la matriz).
require_once __DIR__ . '/campos.php';

function anCatalogoChico(string $id, string $titulo, string $colClave, string $nuevo, string $filtro): void
{
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    ?>
<dialog class="an-dialogo an-buscador an-cat-chico" id="<?= $id ?>" aria-labelledby="<?= $id ?>Titulo">
    <div class="an-titulo-barra">
        <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>
        <h2 id="<?= $id ?>Titulo"><?= $e($titulo) ?></h2>
        <button type="button" class="an-cerrar" data-cat-cerrar aria-label="Cerrar"><?= anIcono('cerrar') ?></button>
    </div>
    <div class="an-cuerpo">
        <label class="an-buscar" style="max-width:none">
            <?= anIcono('buscar') ?>
            <input type="search" id="<?= $id ?>Q" placeholder="Filtrar por cualquier columna" aria-label="<?= $e($filtro) ?>">
        </label>
        <div class="an-tabla-cont">
            <table class="an-tabla">
                <thead><tr>
                    <th scope="col"><div class="an-th"><span><?= $e($colClave) ?>*</span></div></th>
                    <th scope="col"><div class="an-th"><span>Descripción</span></div></th>
                    <th scope="col" class="an-col-acc"><div class="an-th"></div></th>
                </tr></thead>
                <tbody id="<?= $id ?>Filas"></tbody>
            </table>
        </div>
        <div class="an-pie" style="border:none;background:none;padding:0">
            <span># <b id="<?= $id ?>Total">0</b></span>
            <span class="an-flex"></span>
            <button type="button" class="an-btn an-mini" id="<?= $id ?>Nueva" hidden>+ <?= $e($nuevo) ?></button>
        </div>
    </div>
    <div class="an-botonera">
        <span class="an-estado" id="<?= $id ?>Estado" role="status"></span>
        <button type="button" class="an-btn an-primario" id="<?= $id ?>Aceptar" disabled>Aceptar</button>
        <button type="button" class="an-btn an-texto" data-cat-cerrar>Cancelar</button>
    </div>
</dialog>
    <?php
}

anCatalogoChico('anUnidades', 'Catálogo Unidades', 'Unidad', 'Nueva unidad', 'Filtrar unidades');
anCatalogoChico('anTiposInsumo', 'Catálogo Tipos de insumos', 'Tipo', 'Nuevo tipo', 'Filtrar tipos de insumos');
