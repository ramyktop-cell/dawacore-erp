# ================================================================================
# build-madarcore-client-upgrade.ps1
# سكريبت بناء وتجهيز حزمة الترقية المستقلة MadarCore-Client-Upgrade-20261116
# ================================================================================

param(
    [switch]$SkipTests,
    [switch]$PackageOnly,
    [string]$NodeExecutable = ""
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Resolve-SupportedNodeToolchain {
    param(
        [string]$ExplicitNode = ""
    )
    $candidateNodes = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitNode)) {
        if (-not (Test-Path -LiteralPath $ExplicitNode)) {
            throw "R3-03 ERROR: Specified NodeExecutable does not exist: $ExplicitNode"
        }
        $candidateNodes.Add((Resolve-Path -LiteralPath $ExplicitNode).Path)
    }

    $pathDirs = ($env:Path -split ';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($p in $pathDirs) {
        $nodeInP = Join-Path $p "node.exe"
        if (Test-Path -LiteralPath $nodeInP) {
            $candidateNodes.Add((Resolve-Path -LiteralPath $nodeInP).Path)
        }
    }

    $foundNode = $null
    $foundNpm = $null
    $nodeVersionStr = ""

    foreach ($cand in $candidateNodes) {
        try {
            $ver = (& $cand -v 2>$null).ToString().Trim()
            $match = [regex]::Match($ver, '^v?(\d+)\.(\d+)(?:\.(\d+))?')
            if ($match.Success) {
                $maj = [int]$match.Groups[1].Value
                $min = [int]$match.Groups[2].Value
                if (($maj -eq 20 -and $min -ge 19) -or ($maj -eq 22)) {
                    $foundNode = $cand
                    $nodeVersionStr = $ver
                    $nodeDir = Split-Path -Parent $cand
                    $npmCmd = Join-Path $nodeDir "npm.cmd"
                    $npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
                    if (Test-Path -LiteralPath $npmCmd) {
                        $foundNpm = $npmCmd
                    } elseif (Test-Path -LiteralPath $npmCli) {
                        $foundNpm = $npmCli
                    } else {
                        $foundNpm = "npm"
                    }
                    break
                }
            }
        } catch {}
    }

    if (-not $foundNode) {
        throw "R3-03 ERROR: No supported Node.js installation (Node 20.19+ or Node 22 LTS) found. Please supply -NodeExecutable <path\\to\\node.exe> or ensure a supported Node is on PATH."
    }

    $nodeDir = Split-Path -Parent $foundNode
    $env:Path = "$nodeDir;" + $env:Path

    return [PSCustomObject]@{
        NodeExe     = $foundNode
        NpmExe      = $foundNpm
        NodeVersion = $nodeVersionStr
        NodeDir     = $nodeDir
    }
}

$nodeToolchain = Resolve-SupportedNodeToolchain -ExplicitNode $NodeExecutable
Write-Host "[PREFLIGHT] Node.js toolchain verified: $($nodeToolchain.NodeVersion) at $($nodeToolchain.NodeExe)" -ForegroundColor Green

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerBase = Join-Path $rootDir "installer_package"
$pkgSourceDir = Join-Path $installerBase "madarcore-client-upgrade"
$outputBase = Join-Path $installerBase "Output"
$releaseId = "MadarCore-Client-Upgrade-20261116"
$stagingDir = Join-Path $outputBase $releaseId
$zipOutputPath = Join-Path $outputBase "$releaseId.zip"

. (Join-Path $pkgSourceDir "upgrade-common.ps1")

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

# 1. Build Gate: Prisma Generate, Backend Build, Frontend Build & Unit Tests (RR6-04)
Write-Host "[BUILD-GATE] 1/4 Running Prisma client generation..." -ForegroundColor Cyan
& npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: npx prisma generate failed." }

Write-Host "[BUILD-GATE] 2/4 Compiling NestJS Backend..." -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: Backend build failed." }

Write-Host "[BUILD-GATE] 3/4 Compiling React SPA Frontend..." -ForegroundColor Cyan
& npm --prefix frontend run build
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: Frontend build failed." }

Write-Host "[BUILD-GATE] 4/4 Running Non-interactive Backend Unit Tests..." -ForegroundColor Cyan
& npx jest src/sales/sales.service.spec.ts
if ($LASTEXITCODE -ne 0) { throw "Build Gate Failure: Backend unit tests failed." }

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

# 4. Clean Build of Candidate Server Runtime (Section 3.1 & 3.2)
Write-Host "[INFO] Assembling clean, self-contained server runtime for candidate package..." -ForegroundColor Cyan
$prevPup = $env:PUPPETEER_SKIP_DOWNLOAD
$prevChrom = $env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
$prevPrisma = $env:PRISMA_SKIP_POSTINSTALL_GENERATE
$tempWorkspace = Join-Path $env:TEMP "MadarCore_Runtime_Build_$([Guid]::NewGuid().ToString('N'))"

try {
    New-Item -ItemType Directory -Path $tempWorkspace -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $rootDir "package.json") -Destination (Join-Path $tempWorkspace "package.json") -Force
    Copy-Item -LiteralPath (Join-Path $rootDir "package-lock.json") -Destination (Join-Path $tempWorkspace "package-lock.json") -Force

    $env:PUPPETEER_SKIP_DOWNLOAD = "true"
    $env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"
    $env:PRISMA_SKIP_POSTINSTALL_GENERATE = "true"

    Write-Host "[INFO] Running clean npm ci --omit=dev in isolated runtime workspace..." -ForegroundColor Cyan
    & npm ci --prefix "$tempWorkspace" --omit=dev --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        throw "Build Gate Failure: Clean npm ci failed in temporary runtime workspace."
    }

    # Generate Prisma Client explicitly using candidate schema and candidate Prisma CLI
    $tempPrismaDir = Join-Path $tempWorkspace "prisma"
    New-Item -ItemType Directory -Path $tempPrismaDir -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $rootDir "prisma\schema.prisma") -Destination (Join-Path $tempPrismaDir "schema.prisma") -Force
    $candPrismaCli = Join-Path $tempWorkspace "node_modules\prisma\build\index.js"
    if (-not (Test-Path -LiteralPath $candPrismaCli)) {
        throw "Build Gate Failure: Prisma CLI build/index.js not found at $candPrismaCli"
    }

    Write-Host "[INFO] Generating Prisma client inside candidate runtime..." -ForegroundColor Cyan
    & node $candPrismaCli generate --schema="$tempPrismaDir\schema.prisma"
    if ($LASTEXITCODE -ne 0) {
        throw "Build Gate Failure: Candidate Prisma CLI generate failed."
    }

    Write-Host "[INFO] Running npm ls --omit=dev --all to verify runtime dependency closure..." -ForegroundColor Cyan
    & npm ls --prefix "$tempWorkspace" --omit=dev --all
    if ($LASTEXITCODE -ne 0) {
        throw "Build Gate Failure: npm ls --omit=dev --all reported missing or invalid dependencies in candidate runtime."
    }

    # Copy compiled backend dist into tempWorkspace/dist
    Write-Host "[INFO] Copying compiled backend dist into candidate runtime..." -ForegroundColor Cyan
    Copy-Item -Path (Join-Path $rootDir "dist") -Destination (Join-Path $tempWorkspace "dist") -Recurse -Force

    # Purge any *.tmp* files from runtime workspace
    Get-ChildItem -LiteralPath $tempWorkspace -Recurse -File -Force | Where-Object { $_.Name -match '\.tmp' } | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }

    # Compute runtime-metadata.json (Section 3.3)
    Write-Host "[INFO] Computing candidate runtime fingerprint and metadata..." -ForegroundColor Cyan
    $sourceLockSha256 = Calculate-FileSHA256 (Join-Path $rootDir "package-lock.json")
    $nodeVer = (& node -v).ToString().Trim()
    $npmVer = (& npm -v).ToString().Trim()

    $pkgJsonContent = Get-Content -LiteralPath (Join-Path $rootDir "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $directDeps = [ordered]@{}
    if ($pkgJsonContent.dependencies) {
        foreach ($prop in $pkgJsonContent.dependencies.PSObject.Properties) {
            $depName = $prop.Name
            $depPkgJson = Join-Path $tempWorkspace "node_modules\$depName\package.json"
            $instVer = if (Test-Path -LiteralPath $depPkgJson) {
                (Get-Content -LiteralPath $depPkgJson -Raw -Encoding UTF8 | ConvertFrom-Json).version
            } else {
                $prop.Value
            }
            $directDeps[$depName] = $instVer
        }
    }

    $runtimeModulesDir = Join-Path $tempWorkspace "node_modules"
    $fpObj = Compute-DirectoryFingerprint -DirPath $runtimeModulesDir
    Write-Host "[INFO] Candidate runtime node_modules fingerprint: $($fpObj.Fingerprint) ($($fpObj.TotalFiles) files, $([Math]::Round($fpObj.TotalBytes / 1MB, 2)) MB)" -ForegroundColor Cyan

    $distFpObj = Compute-DirectoryFingerprint -DirPath (Join-Path $tempWorkspace "dist")
    Write-Host "[INFO] Candidate runtime dist fingerprint: $($distFpObj.Fingerprint)" -ForegroundColor Cyan

    $runtimeMetadataObj = [ordered]@{
        schemaVersion        = "1.0.0"
        releaseId            = $releaseId
        generatedAt          = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
        sourceLockSha256     = $sourceLockSha256
        nodeVersion          = $nodeVer
        npmVersion           = $npmVer
        platform             = "win32"
        arch                 = "x64"
        distFingerprint      = $distFpObj.Fingerprint
        runtimeFileCount     = $fpObj.TotalFiles
        runtimeTotalBytes    = $fpObj.TotalBytes
        runtimeFingerprint   = $fpObj.Fingerprint
        directDependencies   = $directDeps
    }
    $runtimeMetadataJsonPath = Join-Path $tempWorkspace "runtime-metadata.json"
    $runtimeMetaStr = $runtimeMetadataObj | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($runtimeMetadataJsonPath, $runtimeMetaStr, [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $payloadDir "runtime-metadata.json"), $runtimeMetaStr, [System.Text.UTF8Encoding]::new($false))

    # Compress tempWorkspace into payload/server-runtime.zip (R2-01)
    $serverRuntimeZip = Join-Path $payloadDir "server-runtime.zip"
    if (Test-Path -LiteralPath $serverRuntimeZip) {
        Remove-Item -LiteralPath $serverRuntimeZip -Force
    }
    Write-Host "[INFO] Compressing candidate runtime into payload/server-runtime.zip..." -ForegroundColor Cyan
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempWorkspace, $serverRuntimeZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
    $runtimeZipSizeMB = [Math]::Round(((Get-Item $serverRuntimeZip).Length / 1MB), 2)
    Write-Host "[SUCCESS] payload/server-runtime.zip created ($runtimeZipSizeMB MB)" -ForegroundColor Green

    # Ensure no expanded payload/server-runtime directory exists in payload
    $serverRuntimePayload = Join-Path $payloadDir "server-runtime"
    if (Test-Path -LiteralPath $serverRuntimePayload) {
        Remove-Item -LiteralPath $serverRuntimePayload -Recurse -Force -ErrorAction SilentlyContinue
    }

} finally {
    $env:PUPPETEER_SKIP_DOWNLOAD = $prevPup
    $env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = $prevChrom
    $env:PRISMA_SKIP_POSTINSTALL_GENERATE = $prevPrisma

    if (Test-Path -LiteralPath $tempWorkspace) {
        Remove-Item -LiteralPath $tempWorkspace -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 5. Populate Remaining Payload Components (frontend/dist, prisma, acceptance runner)
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

# Verify transitional structures are removed
if (Test-Path -LiteralPath (Join-Path $payloadDir "prisma-runtime")) {
    Remove-Item -LiteralPath (Join-Path $payloadDir "prisma-runtime") -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path -LiteralPath (Join-Path $payloadDir "tools\node_modules")) {
    Remove-Item -LiteralPath (Join-Path $payloadDir "tools\node_modules") -Recurse -Force -ErrorAction SilentlyContinue
}

# 6. Generate manifest.json with SHA-256 for all files in package
Write-Host "[INFO] Generating manifest.json with SHA-256 checksums..." -ForegroundColor Cyan

function Get-RelativePath([string]$basePath, [string]$targetPath) {
    $baseUri = New-Object Uri (($basePath.TrimEnd('\') + '\'))
    $targetUri = New-Object Uri $targetPath
    return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString()).Replace('\', '/')
}

$hasher = [System.Security.Cryptography.SHA256]::Create()
$filesList = [System.Collections.Generic.List[object]]::new()

$stagingFiles = [System.IO.Directory]::GetFiles($stagingDir, "*", [System.IO.SearchOption]::AllDirectories)
$prefixLen = $stagingDir.Length
foreach ($filePath in $stagingFiles) {
    $rel = $filePath.Substring($prefixLen).TrimStart('\', '/').Replace('\', '/')
    $stream = [System.IO.File]::OpenRead($filePath)
    try {
        $len = $stream.Length
        $hashBytes = $hasher.ComputeHash($stream)
        $sha = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
        $filesList.Add([ordered]@{
            path   = $rel
            size   = $len
            sha256 = $sha
        })
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
    $zipSha256 = [System.BitConverter]::ToString($zBytes).Replace("-", "").ToLowerInvariant()
} finally {
    $zipStream.Close()
    $zipHasher.Dispose()
}

$zipSizeMB = [Math]::Round(((Get-Item $zipOutputPath).Length / 1MB), 2)
Set-Content -LiteralPath "$zipOutputPath.sha256" -Value "$zipSha256  $releaseId.zip" -Encoding UTF8
Write-Host "[SUCCESS] Standalone ZIP archive created ($zipSizeMB MB) with SHA256: $zipSha256" -ForegroundColor Green

# 8. Run Gates: Static Verifier & FT Matrix (RR6-04, LC-09)
if (-not $SkipTests -and -not $PackageOnly) {
    Write-Host "[GATE] Verifying staged package and ZIP archive with static verifier..." -ForegroundColor Cyan
    & node (Join-Path $rootDir "tools\verify-madarcore-client-upgrade.cjs")
    if ($LASTEXITCODE -ne 0) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zipOutputPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath "$zipOutputPath.sha256" -Force -ErrorAction SilentlyContinue
        throw "Build Gate Failure: Static verifier rejected staged package or ZIP archive."
    }

    if (-not $env:MADARCORE_BUILD_RUNNING) {
        $env:MADARCORE_BUILD_RUNNING = "1"
        try {
            Write-Host "[GATE] Running Comprehensive FT Matrix against staged package..." -ForegroundColor Cyan
            & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootDir "tools\test-madarcore-client-upgrade.ps1")
            if ($LASTEXITCODE -ne 0) {
                Remove-Item -LiteralPath $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath $zipOutputPath -Force -ErrorAction SilentlyContinue
                Remove-Item -LiteralPath "$zipOutputPath.sha256" -Force -ErrorAction SilentlyContinue
                throw "Build Gate Failure: FT test matrix failed on staged package."
            }
        } finally {
            $env:MADARCORE_BUILD_RUNNING = $null
        }
    }
}

# 9. Post-Build ZIP Verification in Isolated Temp Extraction (RR4-07)
Write-Host "[INFO] Verifying created ZIP archive via isolated temp extraction..." -ForegroundColor Cyan
$testExtractDir = Join-Path $env:TEMP "MadarCore_Zip_Extract_$([Guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Path $testExtractDir -Force | Out-Null
    & tar.exe -xf "$zipOutputPath" -C "$testExtractDir"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to extract ZIP archive using tar.exe"
    }
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
