<#PS#>
# ACRINEO · Exportador de Neodata (lo descarga cada usuario desde «Importar mis presupuestos de Neodata»).
# Lee SOLO EN LECTURA las bases de Neodata PU Win+ de esta computadora (SQL Server LocalDB, con el usuario de Windows,
# las mismas de C:\NeodataWinPlusObras) y deja un archivo por obra (*.neodata.json) en
# C:\NEODATAWinPlus\Archivos Intercambio\ACRINEO. Luego en ACRINEO: «Volver a leer» y se importan como los respaldos .zip.
# No modifica nada en Neodata. Las bases Construbase (precios del maestro) no se exportan.
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
Write-Host ''
Write-Host '  ACRINEO - Exportar mis presupuestos de Neodata' -ForegroundColor Cyan
Write-Host '  (solo lee las bases de Neodata de esta computadora; no cambia nada)'
Write-Host ''

$servidores = @('(localdb)\MSSQLLocalDB', '(localdb)\v11.0', '.\PUWPS2019', '.\SQLEXPRESS')
$destino = 'C:\NEODATAWinPlus\Archivos Intercambio\ACRINEO'
if ($env:ACRINEO_DESTINO) { $destino = $env:ACRINEO_DESTINO }
try { New-Item -ItemType Directory -Force -Path $destino | Out-Null }
catch {
    $destino = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ACRINEO Neodata'
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
}
Get-ChildItem -Path $destino -Filter '*.neodata.json' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

function Abrir([string]$servidor) {
    $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$servidor;Integrated Security=true;Connect Timeout=8;Application Name=ACRINEO exportador")
    $cn.Open()
    return $cn
}
function Valor($cn, [string]$sql) {
    $cmd = $cn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 600
    $r = $cmd.ExecuteScalar()
    if ($r -eq $null -or $r -is [DBNull]) { return '' }
    return [string]$r
}
function Json($cn, [string]$sql, [string]$vacio = '[]') {
    $v = Valor $cn "select isnull(($sql), '$vacio')"
    if ($v -eq '') { return $vacio }
    return $v
}
function Seguro([string]$t) { return (($t -replace '[\\/:*?"<>|]', '-').Trim()) }

$usados = @{}
$total = 0
$utf8 = New-Object System.Text.UTF8Encoding($false)
$ahora = Get-Date
$sello = '{0}-{1}-{2}_Hr{3}Mn{4}' -f $ahora.Day, $ahora.Month, $ahora.Year, $ahora.Hour, $ahora.Minute
$vistas = @{}

foreach ($servidor in $servidores) {
    try { $cn = Abrir $servidor } catch { continue }
    $bases = @()
    $cmd = $cn.CreateCommand(); $cmd.CommandText = "select name from sys.databases where database_id > 4 and state = 0 order by name"
    $r = $cmd.ExecuteReader(); while ($r.Read()) { $bases += $r.GetString(0) }; $r.Close()
    foreach ($base in $bases) {
        $corto = [IO.Path]::GetFileNameWithoutExtension($base)
        if ($corto -match '^CONSTRUBASE' -or $vistas.ContainsKey($base.ToUpper())) { continue }
        $vistas[$base.ToUpper()] = $true
        try {
            $cn.ChangeDatabase($base)
            if ((Valor $cn "select count(*) from sys.tables where name in ('PuPresupuestos','PuExpIns','PuMatrices','PuCatalogo')") -ne '4') { continue }
            $lista = @()
            $cmd = $cn.CreateCommand(); $cmd.CommandText = "select IdPresupuesto, Presupuesto from PuPresupuestos p where exists (select 1 from PuPresupuestosConceptos c where c.IdPresupuesto = p.IdPresupuesto) order by Presupuesto"
            $r = $cmd.ExecuteReader(); while ($r.Read()) { $lista += ,@($r.GetInt32(0), [string]$r.GetValue(1)) }; $r.Close()
            Write-Host ("  {0}: {1} obra(s)" -f $corto, $lista.Count)
            foreach ($p in $lista) {
                $id = [int]$p[0]
                $nombre = ([string]$p[1]).Trim()
                $obra = Json $cn "select p.Presupuesto as nombre, p.Nombre as descripcion, p.Direccion as direccion, p.Colonia as colonia, p.CodPost as codigo_postal,
                        p.Observaciones as observaciones, p.PorcentajeIVA as iva,
                        (select Parametro as parametro, Valor as valor from PuPresupuestosParametros where IdPresupuesto = p.IdPresupuesto for json path) as parametros
                    from PuPresupuestos p where p.IdPresupuesto = $id for json path, without_array_wrapper" '{}'
                $costo = "outer apply (select top 1 k.Costo from PuExpInsCostos k where k.IdExpIns = e.IdExpIns order by k.IdMoneda) k"
                $catalogo = Json $cn "select c.Codigo as codigo, c.DescripcionLarga as descripcion_completa, c.Descripcion as descripcion, u.Unidad as unidad,
                        c.IdTipo as tipo, cast(c.EsPorcentaje as int) as pct, k.Costo as costo
                    from PuExpIns e join PuCatalogo c on c.IdCodigo = e.IdCodigo left join PuUnidades u on u.IdUnidad = c.IdUnidad $costo
                    where e.IdPresupuesto = $id for json path"
                $partidas = Json $cn "select 'p' + cast(IdPresupuestoPartida as varchar(20)) as wbs,
                        case when IdPartidaPadre is null then '' else 'p' + cast(IdPartidaPadre as varchar(20)) end as padre_wbs,
                        Partida as codigo, Renglon as renglon, DescripcionPartida as descripcion, DescripcionPartidaLarga as descripcion_larga
                    from PuPresupuestosPartidas where IdPresupuesto = $id for json path"
                $conceptos = Json $cn "select 'p' + cast(pc.IdPresupuestoPartida as varchar(20)) as wbs, c.Codigo as codigo, pc.Renglon as renglon, pc.Cantidad as cantidad,
                        k.Costo as costo, pr.Precio as precio
                    from PuPresupuestosConceptos pc join PuExpIns e on e.IdExpIns = pc.IdExpIns join PuCatalogo c on c.IdCodigo = e.IdCodigo $costo
                    outer apply (select top 1 x.Precio from PuPresupuestosConceptosPrecios x where x.IdPresupuestoConcepto = pc.IdPresupuestoConcepto order by x.IdMoneda) pr
                    where pc.IdPresupuesto = $id for json path"
                $matrices = Json $cn "select cm.Codigo as m, ci.Codigo as i, m.Renglon as renglon, case when m.Dividir = 1 then '/' else '*' end as op, m.Volumen as cantidad
                    from PuMatrices m join PuExpIns em on em.IdExpIns = m.IdCodigoMatriz join PuCatalogo cm on cm.IdCodigo = em.IdCodigo
                    join PuExpIns ei on ei.IdExpIns = m.IdCodigoInsumo join PuCatalogo ci on ci.IdCodigo = ei.IdCodigo
                    where em.IdPresupuesto = $id for json path"
                $archivoNombre = Seguro $nombre
                if ($archivoNombre -eq '') { $archivoNombre = "OBRA $id" }
                if ($usados.ContainsKey($archivoNombre.ToUpper())) { $archivoNombre = Seguro "$nombre ($corto)" }
                $usados[$archivoNombre.ToUpper()] = $true
                $texto = '{"formato":"acrineo-neodata","version":1,"base":' + (ConvertTo-Json $corto) + ',"exportado":"' + $ahora.ToString('s') + '"' +
                         ',"obra":' + $obra + ',"catalogo":' + $catalogo + ',"partidas":' + $partidas + ',"conceptos":' + $conceptos + ',"matrices":' + $matrices + '}'
                [IO.File]::WriteAllText((Join-Path $destino ("{0}_{1}.neodata.json" -f $archivoNombre, $sello)), $texto, $utf8)
                $total++
            }
        } catch {
            Write-Host ("  {0}: no se pudo leer ({1})" -f $corto, $_.Exception.Message) -ForegroundColor Yellow
        }
    }
    $cn.Close()
}

Write-Host ''
if ($total -eq 0) {
    Write-Host '  No se encontraron obras. Abre Neodata PU Win+ una vez en esta computadora y vuelve a correr este archivo.' -ForegroundColor Yellow
} else {
    Write-Host ("  Listo: {0} obra(s) en {1}" -f $total, $destino) -ForegroundColor Green
    Write-Host '  Ahora en ACRINEO, en «Importar mis presupuestos de Neodata», da «Volver a leer» (o elige esa carpeta).'
    if (-not $env:ACRINEO_DESTINO) { try { Start-Process explorer.exe $destino } catch {} }
}
Write-Host ''
