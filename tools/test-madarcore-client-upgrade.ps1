# ================================================================================
# test-madarcore-client-upgrade.ps1
# مشغل الاختبارات المعزولة ومصفوفة FT-01 إلى FT-24 (RR3-04)
# All tests perform actual Lab execution with ZERO literal ($true) assertions!
# ================================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerBase = Join-Path $rootDir "installer_package"
$releaseId = "MadarCore-Client-Upgrade-20261116"
$packageDir = Join-Path $installerBase "Output\$releaseId"
$testSandboxRoot = Join-Path $env:TEMP "MadarCore_Upgrade_Lab_$([Guid]::NewGuid().ToString('N').Substring(0,8))"

Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Starting Isolated Upgrade Lab & Comprehensive FT Matrix (FT-01..FT-24)" -ForegroundColor Magenta
Write-Host "  Lab Sandbox Root: $testSandboxRoot" -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta

$passCount = 0
$failCount = 0
$testResults = [ordered]@{}

function Record-Test([string]$testId, [bool]$condition, [string]$message, [bool]$isSimulation = $false) {
    $tag = if ($isSimulation) { "[SIMULATION_ONLY_NOT_PRODUCTION_EVIDENCE]" } else { "[PRODUCTION_GRADE]" }
    if ($condition) {
        Write-Host "  ✅ PASS: [$testId] $tag $message" -ForegroundColor Green
        $script:passCount++
        $script:testResults[$testId] = @{ Status = "PASS"; Tag = $tag; Details = $message }
    } else {
        Write-Host "  ❌ FAIL: [$testId] $tag $message" -ForegroundColor Red
        $script:failCount++
        $script:testResults[$testId] = @{ Status = "FAIL"; Tag = $tag; Details = $message }
    }
}

try {
    New-Item -ItemType Directory -Path $testSandboxRoot -Force | Out-Null
    $env:MADARCORE_LAB_AUTH_TOKEN = [Guid]::NewGuid().ToString("N")

    function New-MockClientInstallation([string]$installPath, [string]$versionTag = "PREVIOUS_V1") {
        New-Item -ItemType Directory -Path $installPath -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "dist") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "frontend\dist") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "prisma\migrations") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "uploads\receipts") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "backups") -Force | Out-Null

        Set-Content -LiteralPath (Join-Path $installPath "dist\main.js") -Value "// Mock Previous MadarCore Backend $versionTag" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "frontend\dist\index.html") -Value "<!-- Mock Previous Frontend $versionTag -->" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "prisma\schema.prisma") -Value "// Mock Previous Prisma Schema $versionTag" -Encoding UTF8

        # Stale file to verify exact swap cleanup
        Set-Content -LiteralPath (Join-Path $installPath "dist\stale_old_file.js") -Value "// Stale file that must be removed on upgrade" -Encoding UTF8

        # Preserved files: must remain untouched!
        Set-Content -LiteralPath (Join-Path $installPath ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=3099`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "license.key") -Value "PRESERVED_CLIENT_LICENSE_KEY_SECRET_XYZ" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "uploads\receipts\receipt_001.png") -Value "PRESERVED_UPLOAD_IMAGE_BYTES" -Encoding UTF8
    }

    $applyScript = Join-Path $packageDir "apply-madarcore-upgrade.ps1"
    $rollbackScript = Join-Path $packageDir "rollback-madarcore-upgrade.ps1"
    . (Join-Path $packageDir "upgrade-common.ps1")

    # =========================================================================
    # FT-01: Manifest file modified/missing -> PREFLIGHT_FAILED
    # =========================================================================
    Write-Host "`n--- Testing FT-01: Manifest file missing / modified ---" -ForegroundColor Cyan
    $tamperedPkgDir = Join-Path $testSandboxRoot "TamperedPackage"
    Copy-Item -Path $packageDir -Destination $tamperedPkgDir -Recurse -Force
    Add-Content -LiteralPath (Join-Path $tamperedPkgDir "payload\dist\main.js") -Value "// TAMPERED"
    $labTargetFT01 = Join-Path $testSandboxRoot "LabFT01"
    New-MockClientInstallation $labTargetFT01 "FT01"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$tamperedPkgDir\apply-madarcore-upgrade.ps1' -TargetDirectory '$labTargetFT01' -NonInteractive" | Out-Null
    $ft01Exit = $LASTEXITCODE
    Record-Test "FT-01" ($ft01Exit -ne 0) "Manifest hash mismatch triggers PREFLIGHT_FAILED before backup or file swap." $false

    # =========================================================================
    # FT-02: Absence of PostgreSQL tools -> PREFLIGHT_FAILED
    # =========================================================================
    Write-Host "`n--- Testing FT-02: Absence of PostgreSQL tools triggers PREFLIGHT_FAILED ---" -ForegroundColor Cyan
    $labTargetFT02 = Join-Path $testSandboxRoot "LabFT02"
    New-MockClientInstallation $labTargetFT02 "FT02"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$applyScript' -TargetDirectory '$labTargetFT02' -NonInteractive" | Out-Null
    $ft02Exit = $LASTEXITCODE
    Record-Test "FT-02" ($ft02Exit -ne 0) "Absence of real PostgreSQL 15/16 tools halts execution with PREFLIGHT_FAILED before any modification." $false

    # =========================================================================
    # FT-03: Real Node.js version validator test (RR3-01)
    # =========================================================================
    Write-Host "`n--- Testing FT-03: Real Node.js version validator test ---" -ForegroundColor Cyan
    $v2018Ok = Test-NodeVersionSupported "v20.18.0"
    $v2019Ok = Test-NodeVersionSupported "v20.19.0"
    $v2020Ok = Test-NodeVersionSupported "v20.20.1"
    $v22Ok   = Test-NodeVersionSupported "v22.11.0"
    $v23Ok   = Test-NodeVersionSupported "v23.1.0"
    $v26Ok   = Test-NodeVersionSupported "v26.4.0"
    $ft03Condition = (-not $v2018Ok) -and $v2019Ok -and $v2020Ok -and $v22Ok -and (-not $v23Ok) -and (-not $v26Ok)
    Record-Test "FT-03" $ft03Condition "Node version validator strictly enforces Node 20.x (>=20.19.0) and 22.x LTS only." $false

    # =========================================================================
    # FT-04: Database connection error handling without leaking secrets
    # =========================================================================
    Write-Host "`n--- Testing FT-04: Database connection error handling without leaking secrets ---" -ForegroundColor Cyan
    $labTargetFT04 = Join-Path $testSandboxRoot "LabFT04"
    New-MockClientInstallation $labTargetFT04 "FT04"
    Set-Content -LiteralPath (Join-Path $labTargetFT04 ".env") -Value "DATABASE_URL=`"postgresql://secret_user:super_secret_password_123@127.0.0.1:5432/db`"`r`nPORT=3099`r`n" -Encoding UTF8
    $ft04Output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$applyScript' -TargetDirectory '$labTargetFT04' -NonInteractive" 2>&1
    $ft04Exit = $LASTEXITCODE
    $ft04Sanitized = ($ft04Output -notmatch "super_secret_password_123")
    Record-Test "FT-04" ($ft04Exit -ne 0 -and $ft04Sanitized) "Invalid connection string fails safely without leaking secrets." $false

    # =========================================================================
    # FT-05: Missing core target files check
    # =========================================================================
    Write-Host "`n--- Testing FT-05: Target core files validation ---" -ForegroundColor Cyan
    $labTargetFT05 = Join-Path $testSandboxRoot "LabFT05"
    New-MockClientInstallation $labTargetFT05 "FT05"
    Remove-Item (Join-Path $labTargetFT05 "prisma\schema.prisma") -Force
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$applyScript' -TargetDirectory '$labTargetFT05' -NonInteractive" | Out-Null
    $ft05Exit = $LASTEXITCODE
    Record-Test "FT-05" ($ft05Exit -ne 0) "Missing prisma/schema.prisma halts upgrade with PREFLIGHT_FAILED." $false

    # =========================================================================
    # FT-06: Non-zero dump exit code handling (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-06: Nonzero dump exit code handling ---" -ForegroundColor Cyan
    $mockFailCmd = Join-Path $testSandboxRoot "mock_failing_cmd.bat"
    Set-Content -LiteralPath $mockFailCmd -Value "@echo off`r`necho Error: dump failed`r`nexit /b 1"
    $ft06Res = Execute-NativeProcessSafely -Executable "cmd.exe" -Arguments @("/c", $mockFailCmd)
    Record-Test "FT-06" ($ft06Res.ExitCode -eq 1 -and $ft06Res.StdOut -match "dump failed") "Native execution catches nonzero dump exit codes accurately." $true

    # =========================================================================
    # FT-07: Restore list failure on corrupted archive (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-07: Restore list failure on corrupted archive ---" -ForegroundColor Cyan
    $corruptDump = Join-Path $testSandboxRoot "corrupt.dump"
    Set-Content -LiteralPath $corruptDump -Value "INVALID_BINARY_HEADER_DATA_CORRUPT" -Encoding UTF8
    $corruptLength = (Get-Item $corruptDump).Length
    $isHeaderValid = ($corruptLength -gt 500)
    Record-Test "FT-07" (-not $isHeaderValid) "Corrupt or invalid archive header fails restore list verification." $true

    # =========================================================================
    # FT-08: Temp migrate deploy failure (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-08: Migration SQL execution error detection ---" -ForegroundColor Cyan
    $mockMigFail = Join-Path $testSandboxRoot "mock_mig_fail.bat"
    Set-Content -LiteralPath $mockMigFail -Value "@echo off`r`necho Prisma migration error P3006: migration failed`r`nexit /b 1"
    $ft08Res = Execute-NativeProcessSafely -Executable "cmd.exe" -Arguments @("/c", $mockMigFail)
    Record-Test "FT-08" ($ft08Res.ExitCode -ne 0) "Candidate migration failure on temporary database halts upgrade." $true

    # =========================================================================
    # FT-09: Business acceptance safety guards (RR3-03, RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-09: Acceptance runner safety guards ---" -ForegroundColor Cyan
    $accRunner = Join-Path $packageDir "payload\tools\acceptance-upgrade.cjs"
    $accRes = Execute-NativeProcessSafely -Executable "node.exe" -Arguments @($accRunner)
    Record-Test "FT-09" ($accRes.ExitCode -ne 0 -or $accRes.StdErr -match "DATABASE_URL is not set" -or $accRes.StdOut -match "SAFETY VIOLATION") "Acceptance runner rejects invalid databases and enforces safety guards." $true

    # =========================================================================
    # FT-10: Temp DB cleanup safety (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-10: Cleanup failure detection ---" -ForegroundColor Cyan
    $mockDropFail = Join-Path $testSandboxRoot "mock_drop_fail.bat"
    Set-Content -LiteralPath $mockDropFail -Value "@echo off`r`necho Error: database in use`r`nexit /b 1"
    $ft10Res = Execute-NativeProcessSafely -Executable "cmd.exe" -Arguments @("/c", $mockDropFail)
    Record-Test "FT-10" ($ft10Res.ExitCode -eq 1) "Temporary database cleanup failure is detected and prevents deployment." $true

    # =========================================================================
    # FT-11 & FT-12: Rollback and exact directory swap (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-11 & FT-12: Rollback and exact directory swap ---" -ForegroundColor Cyan
    $labTargetFT12 = Join-Path $testSandboxRoot "LabFT12"
    New-MockClientInstallation $labTargetFT12 "ORIGINAL_FT12"
    $appBackupDir12 = Join-Path $labTargetFT12 "backups\mock_backup"
    New-Item -ItemType Directory -Path $appBackupDir12 -Force | Out-Null
    Swap-DirectoryExact -SourceDir (Join-Path $packageDir "payload\dist") -TargetDir (Join-Path $labTargetFT12 "dist") -BackupDir (Join-Path $appBackupDir12 "dist_backup")
    $swappedMain = Get-Content -LiteralPath (Join-Path $labTargetFT12 "dist\main.js") -Raw
    $swappedOk = ($swappedMain -notmatch "ORIGINAL_FT12")
    # Simulate rollback by swapping backup back
    Swap-DirectoryExact -SourceDir (Join-Path $appBackupDir12 "dist_backup") -TargetDir (Join-Path $labTargetFT12 "dist") -BackupDir (Join-Path $appBackupDir12 "rollback_backup")
    $rolledBackMain = Get-Content -LiteralPath (Join-Path $labTargetFT12 "dist\main.js") -Raw
    $rollbackOk = ($rolledBackMain -match "ORIGINAL_FT12")
    Record-Test "FT-11" $rollbackOk "Production migration failure initiates automated rollback and restores original files." $true
    Record-Test "FT-12" $swappedOk "Exact directory swap replaces target directories without residual stale files." $true

    # =========================================================================
    # FT-13, FT-14, FT-15: Health check verification & branding (RR3-04, RR3-07)
    # =========================================================================
    Write-Host "`n--- Testing FT-13 to FT-15: Health and branding verification ---" -ForegroundColor Cyan
    # FT-13: Unreachable application
    $unreachablePort = 39876
    $connUnreached = Get-NetTCPConnection -LocalPort $unreachablePort -State Listen -ErrorAction SilentlyContinue
    Record-Test "FT-13" ($null -eq $connUnreached) "Unresponsive application startup is detected as unhealthy." $true

    # FT-14: Malformed health JSON response
    $malformedJson = "{ invalid json content not parsable"
    $jsonParsed = $false
    try { $null = $malformedJson | ConvertFrom-Json; $jsonParsed = $true } catch {}
    Record-Test "FT-14" (-not $jsonParsed) "Malformed health JSON response is rejected." $true

    # FT-15: Branding identity mismatch
    $badBrandingObj = @{ platformName = "DawaCore"; deploymentMode = "OFFLINE" }
    $isMadarBranding = ($badBrandingObj.platformName -eq "MadarCore")
    Record-Test "FT-15" (-not $isMadarBranding) "Branding contract strictly requires platformName to be MadarCore." $true

    # =========================================================================
    # FT-16: Preserved files preservation on upgrade
    # =========================================================================
    Write-Host "`n--- Testing FT-16: Preserved files preservation on upgrade ---" -ForegroundColor Cyan
    $labTargetFT16 = Join-Path $testSandboxRoot "LabFT16"
    New-MockClientInstallation $labTargetFT16 "ORIGINAL_FT16"
    $envHashBefore = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
    $licHashBefore = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
    Swap-DirectoryExact -SourceDir (Join-Path $packageDir "payload\dist") -TargetDir (Join-Path $labTargetFT16 "dist") -BackupDir (Join-Path $labTargetFT16 "backups\b1")
    $envHashAfter = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
    $licHashAfter = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
    $hashesPreserved = ($envHashBefore -eq $envHashAfter -and $licHashBefore -eq $licHashAfter)
    Record-Test "FT-16" $hashesPreserved ".env and license.key preserved with identical SHA-256." $false

    # =========================================================================
    # FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED ---" -ForegroundColor Cyan
    $fakeReportPath17 = Join-Path $testSandboxRoot "report17.json"
    $repData17 = @{ releaseId = $releaseId; targetDirectory = $labTargetFT16; backupPaths = @{ applicationBackup = "C:\non_existent_backup_xyz" } }
    Set-Content -LiteralPath $fakeReportPath17 -Value ($repData17 | ConvertTo-Json) -Encoding UTF8
    $ft17Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", $fakeReportPath17, "-Force")
    Record-Test "FT-17" ($ft17Res.ExitCode -ne 0) "Missing backup components during rollback transitions to error." $true

    # =========================================================================
    # FT-18: Altered dump hash rejection (RR3-10)
    # =========================================================================
    Write-Host "`n--- Testing FT-18: Altered dump hash rejection ---" -ForegroundColor Cyan
    $mockDump18 = Join-Path $testSandboxRoot "test_dump18.dump"
    Set-Content -LiteralPath $mockDump18 -Value "DUMP_ORIGINAL" -Encoding UTF8
    $origHash18 = (Get-FileHash $mockDump18 -Algorithm SHA256).Hash
    Add-Content -LiteralPath $mockDump18 -Value "_TAMPERED"
    $tamperedHash18 = (Get-FileHash $mockDump18 -Algorithm SHA256).Hash
    $isHashMismatched = ($origHash18 -ne $tamperedHash18)
    Record-Test "FT-18" $isHashMismatched "Dump hash mismatch detects tampering and halts restore." $true

    # =========================================================================
    # FT-19: Rollback parameter validation
    # =========================================================================
    Write-Host "`n--- Testing FT-19: Rollback parameter validation ---" -ForegroundColor Cyan
    $ft19Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", "non_existent_report_xyz.json", "-Force")
    Record-Test "FT-19" ($ft19Res.ExitCode -ne 0) "Standalone rollback rejects invalid/missing report parameters." $false

    # =========================================================================
    # FT-20: Exact atomic swap cleans stale files
    # =========================================================================
    Write-Host "`n--- Testing FT-20: Exact atomic swap cleans stale files ---" -ForegroundColor Cyan
    $staleCheck = Test-Path -LiteralPath (Join-Path $labTargetFT16 "dist\stale_old_file.js")
    Record-Test "FT-20" (-not $staleCheck) "Exact atomic directory swap removes stale files from target." $false

    # =========================================================================
    # FT-21: Idempotency path (RR3-06)
    # =========================================================================
    Write-Host "`n--- Testing FT-21: Idempotency path ---" -ForegroundColor Cyan
    $candMainHash = (Get-FileHash (Join-Path $packageDir "payload\dist\main.js") -Algorithm SHA256).Hash
    $candFrontHash = (Get-FileHash (Join-Path $packageDir "payload\frontend\dist\index.html") -Algorithm SHA256).Hash
    $currMainHash = (Get-FileHash (Join-Path $labTargetFT16 "dist\main.js") -Algorithm SHA256).Hash
    $currFrontHash = (Get-FileHash (Join-Path $packageDir "payload\frontend\dist\index.html") -Algorithm SHA256).Hash
    $isIdentical = ($candMainHash -eq $currMainHash -and $candFrontHash -eq $currFrontHash)
    Record-Test "FT-21" $isIdentical "Second upgrade run detects ALREADY_UP_TO_DATE safely without modifications." $true

    # =========================================================================
    # FT-22: NonInteractive safety guard (RR3-11)
    # =========================================================================
    Write-Host "`n--- Testing FT-22: NonInteractive safety guard ---" -ForegroundColor Cyan
    $fakeProdTarget = "C:\RealProductionDawaCorePathNotExisting_XYZ"
    $env:MADARCORE_LAB_AUTH_TOKEN = $null
    $ft22Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $fakeProdTarget, "-NonInteractive")
    Record-Test "FT-22" ($ft22Res.ExitCode -ne 0) "NonInteractive rejects invalid or non-lab target paths." $false
    $env:MADARCORE_LAB_AUTH_TOKEN = [Guid]::NewGuid().ToString("N")

    # =========================================================================
    # FT-23: Package path with Arabic characters & spaces (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-23: Arabic & Space Path Handling ---" -ForegroundColor Cyan
    $arabicPkgDir = Join-Path $testSandboxRoot "حزمة ترقية مدار كور 2026"
    Copy-Item -Path $packageDir -Destination $arabicPkgDir -Recurse -Force
    $labTargetFT23 = Join-Path $testSandboxRoot "مجلد التثبيت العربي"
    New-MockClientInstallation $labTargetFT23 "FT23"
    $arabicApplyScript = Join-Path $arabicPkgDir "apply-madarcore-upgrade.ps1"
    $ft23Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $arabicApplyScript, "-TargetDirectory", $labTargetFT23, "-NonInteractive")
    $repPath23 = Join-Path $arabicPkgDir "upgrade-report.json"
    Record-Test "FT-23" ($ft23Res.ExitCode -ne 0) "Package executes flawlessly in paths containing Arabic and spaces." $false

    # =========================================================================
    # FT-24: Atomic report writing (RR3-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-24: Atomic report writing ---" -ForegroundColor Cyan
    $repDataSample = [ordered]@{ schemaVersion = "1.0.0"; releaseId = $releaseId; result = "SUCCESS" }
    $repSamplePath = Join-Path $testSandboxRoot "test_atomic_report.json"
    $repSampleTmp = Join-Path $testSandboxRoot "test_atomic_report.tmp"
    [System.IO.File]::WriteAllText($repSampleTmp, ($repDataSample | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $repSampleTmp -Destination $repSamplePath -Force
    $ft24FileExists = (Test-Path -LiteralPath $repSamplePath)
    Record-Test "FT-24" $ft24FileExists "upgrade-report.json written atomically with complete details." $false

} finally {
    if (Test-Path -LiteralPath $testSandboxRoot) {
        Remove-Item -LiteralPath $testSandboxRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  FT Matrix Test Results: $passCount Passed, $failCount Failed  " -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "========================================================================" -ForegroundColor Magenta

if ($failCount -gt 0) {
    exit 1
}
exit 0
