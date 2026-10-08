param(
    [Parameter(Mandatory = $true)][string]$Dossier,
    [string]$Vignettes = "",
    [string]$Planche = "",
    [double]$Force = 0.7,
    [switch]$Appliquer
)
# Redresse le contraste de chaque photo de plat (étirement des tons clairs et sombres, 70 % par défaut)
# et fabrique des vignettes de 400 px pour les tuiles. Windows PowerShell 5.1 (powershell.exe).
# Sans -Appliquer : n'écrit rien dans le dossier, seulement la planche avant / après (-Planche).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class Retouche {
  public static Bitmap Auto(Bitmap src, double force) {
    int w = src.Width, h = src.Height;
    var bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, w, h);
    var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
    int stride = data.Stride;
    byte[] buf = new byte[stride * h];
    Marshal.Copy(data.Scan0, buf, 0, buf.Length);
    int[] hist = new int[256];
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int o = y * stride + x * 3;
      hist[(int)(0.114 * buf[o] + 0.587 * buf[o + 1] + 0.299 * buf[o + 2])]++;
    }
    long tot = (long)w * h, acc = 0; int lo = 0, hi = 255;
    for (int i = 0; i < 256; i++) { acc += hist[i]; if (acc >= tot * 0.01) { lo = i; break; } }
    acc = 0;
    for (int i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= tot * 0.01) { hi = i; break; } }
    if (hi - lo >= 40) {
      double gain = 255.0 / (hi - lo);
      byte[] lut = new byte[256];
      for (int i = 0; i < 256; i++) {
        double v = Math.Max(0, Math.Min(255, (i - lo) * gain));
        lut[i] = (byte)Math.Round(i * (1 - force) + v * force);
      }
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int o = y * stride + x * 3;
        buf[o] = lut[buf[o]]; buf[o + 1] = lut[buf[o + 1]]; buf[o + 2] = lut[buf[o + 2]];
      }
    }
    Marshal.Copy(buf, 0, data.Scan0, buf.Length);
    bmp.UnlockBits(data);
    return bmp;
  }
  public static void Enregistrer(Bitmap b, string chemin, int taille) {
    Bitmap sortie = b;
    if (taille > 0 && b.Width != taille) {
      sortie = new Bitmap(taille, taille);
      using (var g = Graphics.FromImage(sortie)) {
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.DrawImage(b, 0, 0, taille, taille);
      }
    }
    var enc = Array.Find(ImageCodecInfo.GetImageEncoders(), e => e.MimeType == "image/jpeg");
    var p = new EncoderParameters(1);
    p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 85L);
    sortie.Save(chemin, enc, p);
    if (sortie != b) sortie.Dispose();
  }
}
"@

$dossier = (Resolve-Path $Dossier).Path
$fichiers = Get-ChildItem $dossier -Filter *.jpg | Sort-Object Name
if ($Vignettes) { New-Item -ItemType Directory -Force $Vignettes | Out-Null; $Vignettes = (Resolve-Path $Vignettes).Path }

$t = 200
$echantillon = @()
$i = 0
foreach ($f in $fichiers) {
    $src = [System.Drawing.Bitmap]::FromFile($f.FullName)
    $neuf = [Retouche]::Auto($src, $Force)
    if ($Planche -and ($i % 6 -eq 0) -and $echantillon.Count -lt 8) { $echantillon += , @($f.Name, $src.Clone(), $neuf.Clone()) }
    $src.Dispose()
    if ($Appliquer) {
        [Retouche]::Enregistrer($neuf, $f.FullName + ".tmp", 0)
        Move-Item -Force ($f.FullName + ".tmp") $f.FullName
        if ($Vignettes) { [Retouche]::Enregistrer($neuf, (Join-Path $Vignettes $f.Name), 400) }
    }
    $neuf.Dispose()
    $i++
}
if ($Planche) {
    $feuille = New-Object System.Drawing.Bitmap ($echantillon.Count * $t), (2 * $t)
    $g = [System.Drawing.Graphics]::FromImage($feuille)
    $g.Clear([System.Drawing.Color]::White)
    for ($k = 0; $k -lt $echantillon.Count; $k++) {
        $g.DrawImage($echantillon[$k][1], $k * $t, 0, $t - 4, $t - 4)
        $g.DrawImage($echantillon[$k][2], $k * $t, $t, $t - 4, $t - 4)
    }
    $g.Dispose()
    $feuille.Save($Planche, [System.Drawing.Imaging.ImageFormat]::Jpeg)
}
"{0} photos traitées" -f $fichiers.Count
