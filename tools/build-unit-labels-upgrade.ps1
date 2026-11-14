# ==============================================================================
# DawaCore - Build Unit Labels & Price Override Upgrade Package
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
Set-Location $repoRoot

$packageName = "DawaCore-Unit-Labels-Upgrade-20261111"
$outputDir = Join-Path $repoRoot "installer_package\Output"
$outputZip = Join-Path $outputDir "$packageName.zip"
$stagingBase = Join-Path $repoRoot "installer_package\_unit_labels_upgrade_staging"
$stagingFolder = Join-Path $stagingBase $packageName
$sourceScriptsDir = Join-Path $repoRoot "installer_package\unit-labels-upgrade"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " Building Upgrade Package: $packageName" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

try {
    # 1. Clean staging & output
    if (Test-Path -LiteralPath $stagingBase) {
        Write-Host "Cleaning existing staging directory..."
        Remove-Item -LiteralPath $stagingBase -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }
    if (Test-Path -LiteralPath $outputZip) {
        Remove-Item -LiteralPath $outputZip -Force
    }

    # 2. Verify source prerequisites exist
    $reqSourceDirs = @(
        (Join-Path $repoRoot "dist"),
        (Join-Path $repoRoot "frontend\dist"),
        $sourceScriptsDir
    )
    foreach ($sd in $reqSourceDirs) {
        if (-not (Test-Path -LiteralPath $sd)) {
            throw "Required source directory not found: $sd. Run build first."
        }
    }

    $reqSourceFiles = @(
        (Join-Path $repoRoot "prisma\schema.prisma"),
        (Join-Path $repoRoot "prisma\migrations\20261111000000_medicine_unit_labels\migration.sql"),
        (Join-Path $repoRoot "prisma\migrations\20261111010000_medicine_unit_min_sale_price\migration.sql"),
        (Join-Path $sourceScriptsDir "APPLY-UNIT-LABELS-UPGRADE.bat"),
        (Join-Path $sourceScriptsDir "apply-unit-labels-upgrade.ps1"),
        (Join-Path $sourceScriptsDir "README-AR.txt")
    )
    foreach ($sf in $reqSourceFiles) {
        if (-not (Test-Path -LiteralPath $sf)) {
            throw "Required source file not found: $sf."
        }
    }

    # 3. Create staging layout
    Write-Host "Creating staging structure in $stagingFolder..."
    New-Item -ItemType Directory -Path $stagingFolder -Force | Out-Null
    $payloadDir = Join-Path $stagingFolder "payload"
    New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null

    # 4. Copy top-level scripts and documentation
    Copy-Item (Join-Path $sourceScriptsDir "APPLY-UNIT-LABELS-UPGRADE.bat") (Join-Path $stagingFolder "APPLY-UNIT-LABELS-UPGRADE.bat") -Force
    Copy-Item (Join-Path $sourceScriptsDir "apply-unit-labels-upgrade.ps1") (Join-Path $stagingFolder "apply-unit-labels-upgrade.ps1") -Force
    Copy-Item (Join-Path $sourceScriptsDir "README-AR.txt") (Join-Path $stagingFolder "README-AR.txt") -Force

    # 5. Copy payload artifacts
    Write-Host "Copying backend dist to payload..."
    Copy-Item (Join-Path $repoRoot "dist") (Join-Path $payloadDir "dist") -Recurse -Force

    Write-Host "Copying frontend dist to payload..."
    Copy-Item (Join-Path $repoRoot "frontend\dist") (Join-Path $payloadDir "frontend\dist") -Recurse -Force

    Write-Host "Copying prisma schema and migrations to payload..."
    $payloadPrisma = Join-Path $payloadDir "prisma"
    New-Item -ItemType Directory -Path $payloadPrisma -Force | Out-Null
    Copy-Item (Join-Path $repoRoot "prisma\schema.prisma") (Join-Path $payloadPrisma "schema.prisma") -Force

    $m1Dest = Join-Path $payloadPrisma "migrations\20261111000000_medicine_unit_labels"
    New-Item -ItemType Directory -Path $m1Dest -Force | Out-Null
    Copy-Item (Join-Path $repoRoot "prisma\migrations\20261111000000_medicine_unit_labels\migration.sql") (Join-Path $m1Dest "migration.sql") -Force

    $m2Dest = Join-Path $payloadPrisma "migrations\20261111010000_medicine_unit_min_sale_price"
    New-Item -ItemType Directory -Path $m2Dest -Force | Out-Null
    Copy-Item (Join-Path $repoRoot "prisma\migrations\20261111010000_medicine_unit_min_sale_price\migration.sql") (Join-Path $m2Dest "migration.sql") -Force

    # 6. Verify no forbidden items are in staging
    Write-Host "Checking for forbidden items in staging..."
    $forbiddenMatches = Get-ChildItem -Path $stagingFolder -Recurse -Force | Where-Object {
        $_.Name -match '^\.env' -or
        $_.Name -eq 'license.key' -or
        $_.Name -eq 'node_modules'
    }
    if ($forbiddenMatches.Count -gt 0) {
        $found = ($forbiddenMatches | ForEach-Object { $_.FullName }) -join ', '
        throw "Forbidden files found in staging: $found"
    }

    # 7. Compute SHA-256 and build manifest.json
    Write-Host "Generating manifest.json with SHA-256 checksums..."
    $allFiles = Get-ChildItem -Path $stagingFolder -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' }
    
    $manifestEntries = @()
    foreach ($f in $allFiles) {
        $relPath = $f.FullName.Substring($stagingFolder.Length).TrimStart('\', '/') -replace '\\', '/'
        
        $sha = [System.Security.Cryptography.SHA256]::Create()
        $stream = [System.IO.File]::OpenRead($f.FullName)
        $hashBytes = $sha.ComputeHash($stream)
        $stream.Close()
        $sha.Dispose()
        $hashHex = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
        
        $manifestEntries += [pscustomobject]@{
            path = $relPath
            size = $f.Length
            sha256 = $hashHex
        }
    }

    $manifest = [pscustomobject]@{
        name = $packageName
        version = "1.0.0"
        createdAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
        fileCount = $manifestEntries.Count
        files = $manifestEntries
    }

    $manifestPath = Join-Path $stagingFolder "manifest.json"
    $manifestJson = ConvertTo-Json -InputObject $manifest -Depth 10
    [System.IO.File]::WriteAllText($manifestPath, $manifestJson, [System.Text.Encoding]::UTF8)
    Write-Host "Manifest generated with $($manifestEntries.Count) files."

    # 8. Compress package into output zip (with standard forward-slash entry paths)
    Write-Host "Compressing package to $outputZip..."
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    
    $archive = [System.IO.Compression.ZipFile]::Open($outputZip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $finalFiles = Get-ChildItem -Path $stagingFolder -Recurse -File
        foreach ($f in $finalFiles) {
            $rel = "$packageName/" + ($f.FullName.Substring($stagingFolder.Length).TrimStart('\', '/') -replace '\\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }

    if (-not (Test-Path -LiteralPath $outputZip)) {
        throw "Failed to create output zip: $outputZip"
    }

    $zipItem = Get-Item $outputZip
    $zipSha = [System.Security.Cryptography.SHA256]::Create()
    $zipStream = [System.IO.File]::OpenRead($zipItem.FullName)
    $zipHashBytes = $zipSha.ComputeHash($zipStream)
    $zipStream.Close()
    $zipSha.Dispose()
    $zipHashHex = ([System.BitConverter]::ToString($zipHashBytes)).Replace("-", "").ToLowerInvariant()

    Write-Host ""
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host " Upgrade Package Created Successfully!" -ForegroundColor Green
    Write-Host "==================================================================" -ForegroundColor Green
    Write-Host " File:      $outputZip"
    Write-Host " Size:      $($zipItem.Length) bytes ($([math]::Round($zipItem.Length / 1MB, 2)) MB)"
    Write-Host " SHA-256:   $zipHashHex"
    Write-Host " Files:     $($manifestEntries.Count)"
    Write-Host "==================================================================" -ForegroundColor Green

} finally {
    # 9. Clean up staging directory
    if (Test-Path -LiteralPath $stagingBase) {
        Write-Host "Cleaning up staging directory..."
        Remove-Item -LiteralPath $stagingBase -Recurse -Force -ErrorAction SilentlyContinue
    }
}
