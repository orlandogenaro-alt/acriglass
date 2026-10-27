# Exporta un presupuesto de Neodata WinPlus (obras locales en SQL Server LocalDB) a dos CSV que lee el sistema:
#   Catalogo <presupuesto>.csv  -> Presupuesto > Catalogo de Conceptos > Importar de Excel
#   Matrices <presupuesto>.csv  -> ventana del analisis de un concepto > Importar matrices de Excel
# Solo lee la base de la obra, no cambia nada en Neodata.
#
# Uso (PowerShell):
#   .\exportar-neodata.ps1                                   lista las obras
#   .\exportar-neodata.ps1 -Obra ACRISTALA                   lista los presupuestos de la obra
#   .\exportar-neodata.ps1 -Obra ACRISTALA -Presupuesto 5    exporta el presupuesto (Id o nombre; * = todos)
param(
    [string]$Obra,
    [string]$Presupuesto,
    [string]$Salida = 'C:\NeodataWinPlusReportesExcel\Para Acriglass',
    [string]$Servidor = '(localdb)\MSSQLLocalDB'
)
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture

function Consultar([string]$base, [string]$sql, [hashtable]$parametros = @{}) {
    $cn = New-Object System.Data.SqlClient.SqlConnection("Server=$Servidor;Integrated Security=true;Database=$base;Connect Timeout=60")
    $cn.Open()
    try {
        $cmd = $cn.CreateCommand()
        $cmd.CommandText = $sql
        $cmd.CommandTimeout = 300
        foreach ($k in $parametros.Keys) { [void]$cmd.Parameters.AddWithValue($k, $parametros[$k]) }
        $t = New-Object System.Data.DataTable
        $t.Load($cmd.ExecuteReader())
        return , $t
    } finally { $cn.Close() }
}
function Numero($v) { if ($v -is [DBNull] -or $null -eq $v) { '' } else { ([decimal]$v).ToString('0.######', $inv) } }
function Texto($v) { if ($v -is [DBNull] -or $null -eq $v) { '' } else { ([string]$v).Trim() } }

# Neodata adjunta cada obra con la ruta del .mdf como nombre de la base
$obras = Consultar 'master' "SELECT d.name base, f.physical_name archivo FROM sys.databases d JOIN sys.master_files f ON f.database_id = d.database_id AND f.type = 0 WHERE d.database_id > 4 AND d.state_desc = 'ONLINE' ORDER BY f.physical_name"
if (-not $Obra) {
    'Obras de Neodata en ' + $Servidor + ':'
    $obras | ForEach-Object { '  ' + [IO.Path]::GetFileNameWithoutExtension($_.archivo) }
    ''
    'Siguiente paso: .\exportar-neodata.ps1 -Obra <nombre>'
    return
}
$fila = $obras | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_.archivo) -eq $Obra } | Select-Object -First 1
if (-not $fila) { throw "No encontre la obra '$Obra'. Ejecuta el script sin parametros para ver la lista." }
$base = $fila.base

$presupuestos = Consultar $base "SELECT p.IdPresupuesto, p.Presupuesto, p.Nombre, (SELECT COUNT(*) FROM PuPresupuestosConceptos c WHERE c.IdPresupuesto = p.IdPresupuesto) Conceptos FROM PuPresupuestos p ORDER BY p.IdPresupuesto"
if (-not $Presupuesto) {
    $presupuestos | Format-Table -AutoSize | Out-String -Width 200
    "Siguiente paso: .\exportar-neodata.ps1 -Obra '$Obra' -Presupuesto <IdPresupuesto o nombre>   (* = todos)"
    return
}
$elegidos = @($presupuestos | Where-Object { $Presupuesto -eq '*' -or [string]$_.IdPresupuesto -eq $Presupuesto -or (Texto $_.Presupuesto) -eq $Presupuesto.Trim() })
if (-not $elegidos.Count) { throw "No encontre el presupuesto '$Presupuesto' en la obra $Obra." }

# Partida con sus padres (PADRE / HIJA, como lo lee el Importar) y la llave para ordenarlas como en Neodata
$sqlCatalogo = @"
WITH ruta AS (
    SELECT IdPresupuestoPartida, CAST(Partida AS nvarchar(max)) Ruta, CAST(RIGHT('0000000000' + CAST(ISNULL(Renglon, 0) AS varchar(10)), 10) AS varchar(max)) Orden
    FROM PuPresupuestosPartidas WHERE IdPresupuesto = @p AND IdPartidaPadre IS NULL
    UNION ALL
    SELECT h.IdPresupuestoPartida, r.Ruta + N' / ' + h.Partida, r.Orden + RIGHT('0000000000' + CAST(ISNULL(h.Renglon, 0) AS varchar(10)), 10)
    FROM PuPresupuestosPartidas h JOIN ruta r ON r.IdPresupuestoPartida = h.IdPartidaPadre
)
SELECT r.Ruta Partida, cat.Codigo, ISNULL(NULLIF(LTRIM(RTRIM(cat.DescripcionLarga)), ''), cat.Descripcion) Concepto, u.Unidad,
       pc.Cantidad, pr.Precio
FROM PuPresupuestosConceptos pc
JOIN PuExpIns e ON e.IdExpIns = pc.IdExpIns
JOIN PuCatalogo cat ON cat.IdCodigo = e.IdCodigo
LEFT JOIN PuUnidades u ON u.IdUnidad = cat.IdUnidad
LEFT JOIN ruta r ON r.IdPresupuestoPartida = pc.IdPresupuestoPartida
LEFT JOIN PuPresupuestosConceptosPrecios pr ON pr.IdPresupuestoConcepto = pc.IdPresupuestoConcepto AND pr.IdMoneda = 1
WHERE pc.IdPresupuesto = @p
ORDER BY r.Orden, pc.Renglon
OPTION (MAXRECURSION 100)
"@

# Insumos de la matriz de cada concepto del presupuesto, con su costo vigente en pesos
$sqlMatrices = @"
SELECT cm.Codigo, ISNULL(NULLIF(LTRIM(RTRIM(cm.DescripcionLarga)), ''), cm.Descripcion) Concepto, t.Descripcion Tipo,
       ci.Descripcion Insumo, u.Unidad, m.Volumen Cantidad, k.Costo
FROM (SELECT DISTINCT pc.IdExpIns, MIN(pc.Renglon) OVER (PARTITION BY pc.IdExpIns) Renglon FROM PuPresupuestosConceptos pc WHERE pc.IdPresupuesto = @p) c
JOIN PuExpIns em ON em.IdExpIns = c.IdExpIns
JOIN PuCatalogo cm ON cm.IdCodigo = em.IdCodigo
JOIN PuMatrices m ON m.IdCodigoMatriz = c.IdExpIns
JOIN PuExpIns ei ON ei.IdExpIns = m.IdCodigoInsumo
JOIN PuCatalogo ci ON ci.IdCodigo = ei.IdCodigo
LEFT JOIN PuTipoInsumos t ON t.IdTipo = ci.IdTipo
LEFT JOIN PuUnidades u ON u.IdUnidad = ci.IdUnidad
OUTER APPLY (SELECT TOP 1 x.Costo FROM PuExpInsCostos x WHERE x.IdExpIns = ei.IdExpIns ORDER BY CASE WHEN x.IdMoneda = 1 THEN 0 ELSE 1 END, x.Fecha DESC) k
ORDER BY c.Renglon, cm.Codigo, m.Renglon
"@

if (-not (Test-Path $Salida)) { New-Item -ItemType Directory -Path $Salida | Out-Null }
foreach ($p in $elegidos) {
    $id = [int]$p.IdPresupuesto
    $nombre = (Texto $p.Presupuesto) -replace '[\\/:*?"<>|]', '-'

    $catalogo = Consultar $base $sqlCatalogo @{ '@p' = $id }
    $filas = foreach ($r in $catalogo.Rows) {
        $importe = if ($r.Precio -is [DBNull]) { '' } else { Numero ([decimal]$r.Cantidad * [decimal]$r.Precio) }
        [pscustomobject][ordered]@{ 'Partida' = Texto $r.Partida; 'Codigo' = Texto $r.Codigo; 'Concepto' = Texto $r.Concepto; 'Unidad' = Texto $r.Unidad
                                    'Cantidad' = Numero $r.Cantidad; 'P. Unitario' = Numero $r.Precio; 'Importe' = $importe }
    }
    $archivoCat = Join-Path $Salida "Catalogo $Obra - $nombre.csv"
    $filas | Export-Csv -Path $archivoCat -NoTypeInformation -Encoding UTF8

    $matrices = Consultar $base $sqlMatrices @{ '@p' = $id }
    $filas = foreach ($r in $matrices.Rows) {
        $importe = if ($r.Costo -is [DBNull]) { '' } else { Numero ([decimal]$r.Cantidad * [decimal]$r.Costo) }
        [pscustomobject][ordered]@{ 'Codigo' = Texto $r.Codigo; 'Concepto' = Texto $r.Concepto; 'Tipo' = Texto $r.Tipo; 'Insumo' = Texto $r.Insumo
                                    'Unidad' = Texto $r.Unidad; 'Cantidad' = Numero $r.Cantidad; 'Costo unitario' = Numero $r.Costo; 'Importe' = $importe }
    }
    $archivoMat = Join-Path $Salida "Matrices $Obra - $nombre.csv"
    $filas | Export-Csv -Path $archivoMat -NoTypeInformation -Encoding UTF8

    '{0} ({1}): {2} conceptos, {3} insumos de matriz' -f $nombre, $id, $catalogo.Rows.Count, $matrices.Rows.Count
    '  ' + $archivoCat
    '  ' + $archivoMat
}
