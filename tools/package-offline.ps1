param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '..\DawaCore-Release')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

$required = @(
    'dist\main.js', 'frontend\dist', 'node_modules',
    'package.json', 'package-lock.json', 'prisma'
)
foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $root $item))) { throw "Missing required build artifact: $item" }
}

if (Test-Path $OutputDirectory) { Remove-Item -LiteralPath $OutputDirectory -Recurse -Force }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$files = @(
    '.env.example', 'license-public.pem', 'package.json', 'package-lock.json', 'nest-cli.json',
    'Setup.bat', 'configure-dawacore.bat', 'start-dawacore-server.bat', 'start-dawacore.bat',
    'backup-db.bat', 'restore-db.bat', 'INSTALLATION-GUIDE.txt', 'OFFLINE-HANDOVER.md'
)
foreach ($file in $files) {
    $src = Join-Path $root $file
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $OutputDirectory $file) -Force
    }
}

$dirs = @('dist', 'frontend\dist', 'node_modules', 'prisma', 'tools', 'installer_package')
foreach ($item in $dirs) {
    $source = Join-Path $root $item
    $dest = Join-Path $OutputDirectory $item
    if (Test-Path $source) {
        if ((Get-Item $source).PSIsContainer) {
            Copy-Item $source $dest -Recurse -Force
        } else {
            New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
            Copy-Item $source $dest -Force
        }
    }
}

# Keep operational scripts, but never ship application secrets or dev environments.
foreach ($secret in @('.env', 'license.key')) {
    $path = Join-Path $OutputDirectory $secret
    if (Test-Path $path) { Remove-Item $path -Force }
}
$acceptance = Join-Path $OutputDirectory 'tools\acceptance-offline.ts'
if (Test-Path $acceptance) { Remove-Item $acceptance -Force }

Write-Host "========================================================" -ForegroundColor Green
Write-Host "DawaCore release package created successfully at:" -ForegroundColor Green
Write-Host "$OutputDirectory" -ForegroundColor Cyan
Write-Host "You can transfer this folder directly or compress it as a ZIP file." -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
