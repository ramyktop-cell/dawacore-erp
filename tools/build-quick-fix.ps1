$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$patchDir = Join-Path $root 'installer_package\_patch_staging'
$patchZip = Join-Path $root 'installer_package\_patch.zip'
$outExe = Join-Path $root 'installer_package\Output\DawaCore_Update.exe'
$fixExe = Join-Path $root 'installer_package\Output\DawaCore_Quick_Fix.exe'

if (Test-Path $patchDir) { Remove-Item -LiteralPath $patchDir -Recurse -Force }
if (Test-Path $patchZip) { Remove-Item -LiteralPath $patchZip -Force }

New-Item -ItemType Directory -Path (Join-Path $patchDir 'tools') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $patchDir 'prisma') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $patchDir 'frontend') -Force | Out-Null

# Bundle updated backend dist, frontend dist, and prisma schema
Copy-Item (Join-Path $root 'dist') (Join-Path $patchDir 'dist') -Recurse -Force
Copy-Item (Join-Path $root 'frontend\dist') (Join-Path $patchDir 'frontend\dist') -Recurse -Force
if (Test-Path (Join-Path $root 'frontend\public')) {
    Copy-Item (Join-Path $root 'frontend\public') (Join-Path $patchDir 'frontend\public') -Recurse -Force
}
Copy-Item (Join-Path $root 'prisma\schema.prisma') (Join-Path $patchDir 'prisma\schema.prisma') -Force

Copy-Item (Join-Path $root 'tools\configure-install.ps1') (Join-Path $patchDir 'tools\configure-install.ps1') -Force
Copy-Item (Join-Path $root 'tools\bootstrap-admin.cjs') (Join-Path $patchDir 'tools\bootstrap-admin.cjs') -Force
Copy-Item (Join-Path $root 'tools\preflight-offline.cjs') (Join-Path $patchDir 'tools\preflight-offline.cjs') -Force
Copy-Item (Join-Path $root 'tools\reset-clean.cjs') (Join-Path $patchDir 'tools\reset-clean.cjs') -Force
Copy-Item (Join-Path $root 'tools\enable-autostart-and-backup.ps1') (Join-Path $patchDir 'tools\enable-autostart-and-backup.ps1') -Force
Copy-Item (Join-Path $root 'tools\backup-db.cjs') (Join-Path $patchDir 'tools\backup-db.cjs') -Force
Copy-Item (Join-Path $root 'tools\restore-db.cjs') (Join-Path $patchDir 'tools\restore-db.cjs') -Force
Copy-Item (Join-Path $root 'Setup.bat') (Join-Path $patchDir 'Setup.bat') -Force
Copy-Item (Join-Path $root 'reset-clean-data.bat') (Join-Path $patchDir 'reset-clean-data.bat') -Force
Copy-Item (Join-Path $root 'configure-dawacore.bat') (Join-Path $patchDir 'configure-dawacore.bat') -Force
Copy-Item (Join-Path $root 'start-dawacore-server.bat') (Join-Path $patchDir 'start-dawacore-server.bat') -Force
Copy-Item (Join-Path $root 'start-dawacore.bat') (Join-Path $patchDir 'start-dawacore.bat') -Force
if (Test-Path (Join-Path $root 'installer_package\Output\license.key')) {
    Copy-Item (Join-Path $root 'installer_package\Output\license.key') (Join-Path $patchDir 'license.key') -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($patchDir, $patchZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /target:exe /optimize+ `
    /r:System.IO.Compression.dll `
    /r:System.IO.Compression.FileSystem.dll `
    "/resource:$patchZip,payload.zip" `
    "/out:$outExe" `
    (Join-Path $root 'tools\SelfExtractor.cs')
if ($LASTEXITCODE -ne 0) { throw 'Failed to compile installer executable' }

# Also attempt to copy to DawaCore_Quick_Fix.exe if not locked
try {
    Copy-Item $outExe $fixExe -Force -ErrorAction SilentlyContinue
} catch {}

Remove-Item -LiteralPath $patchDir -Recurse -Force
Remove-Item -LiteralPath $patchZip -Force

Get-Item $outExe | Select-Object FullName, Length, LastWriteTime
if (Test-Path $fixExe) {
    Get-Item $fixExe | Select-Object FullName, Length, LastWriteTime
}
