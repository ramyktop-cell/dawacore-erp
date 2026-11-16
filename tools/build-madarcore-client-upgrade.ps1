# ================================================================================
# build-madarcore-client-upgrade.ps1
# سكريبت بناء وتجهيز حزمة الترقية المستقلة MadarCore-Client-Upgrade-20261116
# ================================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerBase = Join-Path $rootDir "installer_package"
$pkgSourceDir = Join-Path $installerBase "madarcore-client-upgrade"
$outputBase = Join-Path $installerBase "Output"
$releaseId = "MadarCore-Client-Upgrade-20261116"
$stagingDir = Join-Path $outputBase $releaseId
$zipOutputPath = Join-Path $outputBase "$releaseId.zip"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Building $releaseId  " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# 0. Canonical Containment Guard before clean
$canonicalOutput = (Resolve-Path $outputBase -ErrorAction SilentlyContinue)
if (-not $canonicalOutput) {
    New-Item -ItemType Directory -Path $outputBase -Force | Out-Null
    $canonicalOutput = (Resolve-Path $outputBase).Path
} else {
    $canonicalOutput = $canonicalOutput.Path
}

if (-not $stagingDir.StartsWith($canonicalOutput, [System.StringComparison]::OrdinalIgnoreCase) -or $stagingDir -eq $canonicalOutput) {
    throw "SAFETY VIOLATION: Staging path $stagingDir is not contained within $canonicalOutput"
}

# 1. Build Gate: Prisma Generate, Backend Build & Frontend Build
Write-Host "[BUILD-GATE] 1/3 Running Prisma client generation..." -ForegroundColor Cyan
& npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: npx prisma generate failed." }

Write-Host "[BUILD-GATE] 2/3 Compiling NestJS Backend..." -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: Backend build failed." }

Write-Host "[BUILD-GATE] 3/3 Compiling React SPA Frontend..." -ForegroundColor Cyan
& npm --prefix frontend run build
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: Frontend build failed." }

# 2. Clean Staging Directory
if (Test-Path -LiteralPath $stagingDir) {
    Remove-Item -LiteralPath $stagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$payloadDir = Join-Path $stagingDir "payload"
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null

# 3. Copy Package Orchestration Scripts
Copy-Item (Join-Path $pkgSourceDir "APPLY-MADARCORE-UPGRADE.bat") (Join-Path $stagingDir "APPLY-MADARCORE-UPGRADE.bat") -Force
Copy-Item (Join-Path $pkgSourceDir "apply-madarcore-upgrade.ps1") (Join-Path $stagingDir "apply-madarcore-upgrade.ps1") -Force
Copy-Item (Join-Path $pkgSourceDir "upgrade-common.ps1") (Join-Path $stagingDir "upgrade-common.ps1") -Force
Copy-Item (Join-Path $pkgSourceDir "rollback-madarcore-upgrade.ps1") (Join-Path $stagingDir "rollback-madarcore-upgrade.ps1") -Force
Copy-Item (Join-Path $pkgSourceDir "README-AR.txt") (Join-Path $stagingDir "README-AR.txt") -Force
Copy-Item (Join-Path $pkgSourceDir "compatibility.json") (Join-Path $stagingDir "compatibility.json") -Force

# 4. Populate Payload (dist, frontend/dist, prisma, acceptance runner)
Write-Host "[INFO] Copying backend dist..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $rootDir "dist") -Destination (Join-Path $payloadDir "dist") -Recurse -Force

Write-Host "[INFO] Copying frontend dist..." -ForegroundColor Cyan
$frontPayload = Join-Path $payloadDir "frontend"
New-Item -ItemType Directory -Path $frontPayload -Force | Out-Null
Copy-Item -Path (Join-Path $rootDir "frontend\dist") -Destination (Join-Path $frontPayload "dist") -Recurse -Force

Write-Host "[INFO] Copying prisma schema and migrations..." -ForegroundColor Cyan
$prismaPayload = Join-Path $payloadDir "prisma"
New-Item -ItemType Directory -Path $prismaPayload -Force | Out-Null
Copy-Item (Join-Path $rootDir "prisma\schema.prisma") (Join-Path $prismaPayload "schema.prisma") -Force
Copy-Item -Path (Join-Path $rootDir "prisma\migrations") -Destination (Join-Path $prismaPayload "migrations") -Recurse -Force

Write-Host "[INFO] Copying candidate acceptance runner..." -ForegroundColor Cyan
$toolsPayload = Join-Path $payloadDir "tools"
New-Item -ItemType Directory -Path $toolsPayload -Force | Out-Null
Copy-Item (Join-Path $rootDir "tools\acceptance-upgrade.cjs") (Join-Path $toolsPayload "acceptance-upgrade.cjs") -Force

# 5. Populate Candidate Prisma Runtime Closure
Write-Host "[INFO] Assembling candidate Prisma runtime closure under payload/prisma-runtime..." -ForegroundColor Cyan
$runtimeDest = Join-Path $payloadDir "prisma-runtime\node_modules"
New-Item -ItemType Directory -Path $runtimeDest -Force | Out-Null

# Copy @prisma and prisma CLI
Copy-Item -Path (Join-Path $rootDir "node_modules\prisma") -Destination (Join-Path $runtimeDest "prisma") -Recurse -Force
Copy-Item -Path (Join-Path $rootDir "node_modules\@prisma") -Destination (Join-Path $runtimeDest "@prisma") -Recurse -Force

# Copy .prisma/client
$dotPrismaDest = Join-Path $runtimeDest ".prisma\client"
New-Item -ItemType Directory -Path $dotPrismaDest -Force | Out-Null
Copy-Item -Path (Join-Path $rootDir "node_modules\.prisma\client") -Destination (Join-Path $runtimeDest ".prisma") -Recurse -Force

# Purge any *.tmp* files from the entire runtime tree (RR4-07)
Get-ChildItem -LiteralPath $runtimeDest -Recurse -File | Where-Object { $_.Name -match '\.tmp' } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}

# 6. Generate manifest.json with SHA-256 for all files in package
Write-Host "[INFO] Generating manifest.json with SHA-256 checksums..." -ForegroundColor Cyan

function Get-RelativePath([string]$basePath, [string]$targetPath) {
    $baseUri = New-Object Uri (($basePath.TrimEnd('\') + '\'))
    $targetUri = New-Object Uri $targetPath
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('\', '/')
}

$hasher = [System.Security.Cryptography.SHA256]::Create()
$filesList = @()

Get-ChildItem -LiteralPath $stagingDir -Recurse -File | ForEach-Object {
    $rel = Get-RelativePath $stagingDir $_.FullName
    $stream = [System.IO.File]::OpenRead($_.FullName)
    try {
        $hashBytes = $hasher.ComputeHash($stream)
        $sha = (-join ($hashBytes | ForEach-Object { $_.ToString("x2") }))
        $filesList += [ordered]@{
            path   = $rel
            size   = $_.Length
            sha256 = $sha
        }
    } finally {
        $stream.Close()
    }
}
$hasher.Dispose()

$manifestObj = [ordered]@{
    releaseId   = $releaseId
    generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
    fileCount   = $filesList.Count
    files       = $filesList
}

$manifestJsonPath = Join-Path $stagingDir "manifest.json"
$manifestJsonStr = $manifestObj | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($manifestJsonPath, $manifestJsonStr, [System.Text.UTF8Encoding]::new($false))

Write-Host "[SUCCESS] manifest.json generated with $($filesList.Count) files." -ForegroundColor Green

# 7. Create Standalone ZIP Archive
if (Test-Path -LiteralPath $zipOutputPath) {
    Remove-Item -LiteralPath $zipOutputPath -Force
}

Write-Host "[INFO] Creating ZIP archive: $zipOutputPath..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $zipOutputPath, [System.IO.Compression.CompressionLevel]::Optimal, $true)

$zipHasher = [System.Security.Cryptography.SHA256]::Create()
$zipStream = [System.IO.File]::OpenRead($zipOutputPath)
try {
    $zBytes = $zipHasher.ComputeHash($zipStream)
    $zipSha256 = (-join ($zBytes | ForEach-Object { $_.ToString("x2") }))
} finally {
    $zipStream.Close()
    $zipHasher.Dispose()
}

$zipSizeMB = [Math]::Round(((Get-Item $zipOutputPath).Length / 1MB), 2)
Set-Content -LiteralPath "$zipOutputPath.sha256" -Value "$zipSha256  $releaseId.zip" -Encoding UTF8

# 8. Post-Build ZIP Verification in Isolated Temp Extraction (RR4-07)
Write-Host "[INFO] Verifying created ZIP archive via isolated temp extraction..." -ForegroundColor Cyan
$testExtractDir = Join-Path $env:TEMP "MadarCore_Zip_Extract_$([Guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Path $testExtractDir -Force | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipOutputPath, $testExtractDir)
    $extractedTarget = if (Test-Path -LiteralPath (Join-Path $testExtractDir $releaseId)) { Join-Path $testExtractDir $releaseId } else { $testExtractDir }
    $verifierPath = Join-Path $rootDir "tools\verify-madarcore-client-upgrade.cjs"
    & node $verifierPath --dir $extractedTarget
    if ($LASTEXITCODE -ne 0) {
        throw "Post-Build Verification Failed on extracted ZIP archive!"
    }
    Write-Host "[SUCCESS] Extracted ZIP archive verified successfully against all static rules." -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $testExtractDir) {
        Remove-Item -LiteralPath $testExtractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  Upgrade Package Build Completed Successfully!  " -ForegroundColor Green
Write-Host "  ZIP: $zipOutputPath" -ForegroundColor Green
Write-Host "  Size: $zipSizeMB MB" -ForegroundColor Green
Write-Host "  SHA256: $zipSha256" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
