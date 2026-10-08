param(
    [Parameter(Mandatory = $true)][string]$Dossier,
    [Parameter(Mandatory = $true)][string]$Sortie,
    [int]$Largeur = 1600
)
# Convertit chaque .HEIC / .HEIF du dossier en JPEG (largeur max $Largeur) avec les outils Windows.
# Windows PowerShell 5.1 uniquement (powershell.exe), extension « HEIF » de Windows requise.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapEncoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Attendre($op, [Type]$type) {
    $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
    $t.Wait() | Out-Null
    $t.Result
}
$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function AttendreAction($action) {
    $asTaskAction.Invoke($null, @($action)).Wait() | Out-Null
}

$dossier = (Resolve-Path $Dossier).Path
New-Item -ItemType Directory -Force $Sortie | Out-Null
$sortie = (Resolve-Path $Sortie).Path

$fichiers = Get-ChildItem $dossier -File | Where-Object { $_.Extension -match '^\.(heic|heif)$' } | Sort-Object Name
foreach ($f in $fichiers) {
    $dest = Join-Path $sortie ($f.BaseName + '.jpg')
    $fichier = Attendre ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
    $flux = Attendre ($fichier.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decodeur = Attendre ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($flux)) ([Windows.Graphics.Imaging.BitmapDecoder])

    $fichierSortie = Attendre ([Windows.Storage.StorageFile]::GetFileFromPathAsync((New-Item -ItemType File -Force $dest).FullName)) ([Windows.Storage.StorageFile])
    $fluxSortie = Attendre ($fichierSortie.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
    $fluxSortie.Size = 0
    $encodeur = Attendre ([Windows.Graphics.Imaging.BitmapEncoder]::CreateAsync([Windows.Graphics.Imaging.BitmapEncoder]::JpegEncoderId, $fluxSortie)) ([Windows.Graphics.Imaging.BitmapEncoder])

    # Réduction (plus grand côté = $Largeur) et rotation iPhone appliquées par le décodeur.
    $transfo = New-Object Windows.Graphics.Imaging.BitmapTransform
    $r = [Math]::Min(1.0, $Largeur / [Math]::Max($decodeur.PixelWidth, $decodeur.PixelHeight))
    $transfo.ScaledWidth = [uint32][Math]::Round($decodeur.PixelWidth * $r)
    $transfo.ScaledHeight = [uint32][Math]::Round($decodeur.PixelHeight * $r)
    $transfo.InterpolationMode = [Windows.Graphics.Imaging.BitmapInterpolationMode]::Fant
    $pixels = Attendre ($decodeur.GetSoftwareBitmapAsync(
            [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,
            [Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore,
            $transfo,
            [Windows.Graphics.Imaging.ExifOrientationMode]::RespectExifOrientation,
            [Windows.Graphics.Imaging.ColorManagementMode]::ColorManageToSRgb)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $encodeur.SetSoftwareBitmap($pixels)
    AttendreAction ($encodeur.FlushAsync())
    $fluxSortie.Dispose(); $flux.Dispose()
    $dest
}
