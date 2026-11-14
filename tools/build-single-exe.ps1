$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$staging = Join-Path $root 'installer_package\_staging'
$payloadZip = Join-Path $root 'installer_package\_payload.zip'
$outputDir = Join-Path $root 'installer_package\Output'
$outputExe = Join-Path $outputDir 'DawaCore_Clean_Rebuild_v1.2.0.exe'

Write-Host "[1/4] Cleaning temporary staging directories..." -ForegroundColor Cyan
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
if (Test-Path $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Write-Host "[2/4] Copying release files using robocopy..." -ForegroundColor Cyan
$dirs = @('dist', 'frontend\dist', 'node_modules', 'prisma', 'installer_package\scripts')
foreach ($d in $dirs) {
    $src = Join-Path $root $d
    $dst = Join-Path $staging $d
    & robocopy $src $dst /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Robocopy failed for $d with exit code $LASTEXITCODE" }
}

$toolFiles = @('bootstrap-admin.cjs', 'configure-install.ps1', 'preflight-offline.cjs', 'backup-db.cjs', 'restore-db.cjs')
New-Item -ItemType Directory -Path (Join-Path $staging 'tools') -Force | Out-Null
foreach ($tf in $toolFiles) {
    Copy-Item (Join-Path $root "tools\$tf") (Join-Path $staging "tools\$tf") -Force
}

$rootFiles = @(
    '.env.example', 'license-public.pem', 'package.json', 'package-lock.json',
    'Setup.bat', 'Setup.exe', 'configure-dawacore.bat', 'start-dawacore-server.bat',
    'start-dawacore.bat', 'backup-db.bat', 'restore-db.bat', 'INSTALLATION-GUIDE.txt'
)
foreach ($rf in $rootFiles) {
    $srcFile = Join-Path $root $rf
    if (Test-Path $srcFile) {
        Copy-Item $srcFile (Join-Path $staging $rf) -Force
    }
}

Write-Host "[3/4] Compressing release payload into _payload.zip..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host "[4/4] Compiling standalone single-file installer: DawaCore_Clean_Rebuild_v1.2.0.exe..." -ForegroundColor Cyan
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /target:exe /optimize+ `
    /r:System.IO.Compression.dll `
    /r:System.IO.Compression.FileSystem.dll `
    "/resource:$payloadZip,payload.zip" `
    "/out:$outputExe" `
    (Join-Path $root 'tools\SelfExtractor.cs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile DawaCore_Setup_v1.0.2.exe' }

Write-Host "Cleaning up temporary staging files..." -ForegroundColor Gray
Remove-Item -LiteralPath $staging -Recurse -Force
Remove-Item -LiteralPath $payloadZip -Force

$exeInfo = Get-Item $outputExe
$sizeMB = [Math]::Round($exeInfo.Length / 1MB, 2)
Write-Host "========================================================" -ForegroundColor Green
Write-Host "SUCCESS! Standalone installer created:" -ForegroundColor Green
Write-Host "File: $($exeInfo.FullName)" -ForegroundColor Yellow
Write-Host "Size: $sizeMB MB" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
