<?php
// ACRINEO · Un lugar de documento de la pestaña DOCUMENTOS. Antes de incluirlo: $docTipos = [[tipo, moneda|null], …]
foreach ($docTipos as [$docTipo, $docMoneda]):
    $docEtiqueta = ACRINEO_DOC_TIPOS[$docTipo][0];
    $docId = 'an-doc-' . $docTipo . ($docMoneda ? "-$docMoneda" : ''); ?>
<div class="an-doc" data-doc-tipo="<?= e($docTipo) ?>" data-doc-moneda-valor="<?= $docMoneda ? (int) $docMoneda : '' ?>">
    <label class="an-btn-buscar" title="Subir <?= e($docEtiqueta) ?>" data-doc-subir>
        <?= anIcono('subir') ?>
        <input type="file" id="<?= $docId ?>" hidden accept="<?= e(implode(',', array_map(fn($x) => ".$x", array_keys(ACRINEO_DOC_EXTENSIONES)))) ?>"
               aria-label="Subir <?= e($docEtiqueta) ?>">
    </label>
    <div class="an-doc-info">
        <small><?= e($docEtiqueta) ?>:</small>
        <b class="vacio" data-doc-nombre>Ningún archivo elegido</b>
    </div>
    <div class="an-doc-botones">
        <button type="button" class="an-btn-buscar" data-doc-accion="descargar" title="Descargar" aria-label="Descargar <?= e($docEtiqueta) ?>" disabled><?= anIcono('descargar') ?></button>
        <button type="button" class="an-btn-buscar" data-doc-accion="ver" title="Visualizar" aria-label="Visualizar <?= e($docEtiqueta) ?>" disabled><?= anIcono('ver') ?></button>
        <button type="button" class="an-btn-buscar an-borrar" data-doc-accion="eliminar" title="Eliminar" aria-label="Eliminar <?= e($docEtiqueta) ?>" disabled><?= anIcono('borrar') ?></button>
    </div>
</div>
<?php endforeach;
