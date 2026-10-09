param(
    [string]$Source = "scripts/logo-source.png",
    [string]$Sortie = ".",
    [string]$Couleur = ""
)
# Fabrique, à partir du logo d'origine (fond blanc), le logo transparent de l'en-tête (logo.png)
# et les icônes de l'application (icon-180/192/512.png : fond blanc, logo centré avec marge).
# Windows PowerShell 5.1 (powershell.exe).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source).Path)
$w = $src.Width; $h = $src.Height

# Couleur du logo = pixel le plus foncé ; la transparence vient de la distance au blanc.
$minC = 255; $cr = 0; $cg = 0; $cb = 0
for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
    $p = $src.GetPixel($x, $y); $m = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
    if ($m -lt $minC) { $minC = $m; $cr = $p.R; $cg = $p.G; $cb = $p.B }
} }
if ($Couleur) { $c = [System.Drawing.ColorTranslator]::FromHtml($Couleur); $cr = $c.R; $cg = $c.G; $cb = $c.B }
$clair = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$x0 = $w; $y0 = $h; $x1 = 0; $y1 = 0
for ($y = 0; $y -lt $h; $y++) { for ($x = 0; $x -lt $w; $x++) {
    $p = $src.GetPixel($x, $y); $m = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
    $a = [int][Math]::Max(0, [Math]::Min(255, (255 - $m) * 255 / (255 - $minC)))
    if ($a -lt 8) { $a = 0 }
    $clair.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($a, $cr, $cg, $cb))
    if ($a -gt 40) { if ($x -lt $x0) { $x0 = $x }; if ($x -gt $x1) { $x1 = $x }; if ($y -lt $y0) { $y0 = $y }; if ($y -gt $y1) { $y1 = $y } }
} }
$src.Dispose()
$cadre = New-Object System.Drawing.Rectangle $x0, $y0, ($x1 - $x0 + 1), ($y1 - $y0 + 1)

function Dessiner($largeur, $hauteur, $fond, $zone) {
    $b = New-Object System.Drawing.Bitmap $largeur, $hauteur, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($b)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
    if ($fond) { $g.Clear([System.Drawing.Color]::White) } else { $g.Clear([System.Drawing.Color]::Transparent) }
    $g.DrawImage($clair, $zone, $cadre, [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose(); return $b
}
# Logo de l'en-tête : hauteur 84 px (affiché à 28 px), transparent.
$lh = 84; $lw = [int][Math]::Round($lh * $cadre.Width / $cadre.Height)
$logo = Dessiner $lw $lh $false (New-Object System.Drawing.Rectangle 0, 0, $lw, $lh)
$logo.Save((Join-Path $Sortie "logo.png"), [System.Drawing.Imaging.ImageFormat]::Png); $logo.Dispose()
# Icônes : logo sur 60 % de la largeur (zone sûre des icônes « maskable »), centré, fond blanc.
foreach ($t in 180, 192, 512) {
    $lw2 = $t * 0.60; $lh2 = $lw2 * $cadre.Height / $cadre.Width
    $zone = New-Object System.Drawing.Rectangle ([int](($t - $lw2) / 2)), ([int](($t - $lh2) / 2)), ([int]$lw2), ([int]$lh2)
    $ic = Dessiner $t $t $true $zone
    $ic.Save((Join-Path $Sortie "icon-$t.png"), [System.Drawing.Imaging.ImageFormat]::Png); $ic.Dispose()
}
$clair.Dispose()
"Logo {0}x{1} et 3 icônes écrits dans {2}" -f $lw, $lh, $Sortie
