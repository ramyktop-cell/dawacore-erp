# ================================================================================
# apply-madarcore-upgrade.ps1
# محرك ترقية MadarCore المستقل لعملاء التثبيت المكتبي والسحابي
# Release: MadarCore-Client-Upgrade-20261116
# State Machine: PREFLIGHT -> BACKUP -> ACCEPTANCE -> DEPLOYMENT -> HEALTH -> SUCCESS
# ================================================================================

param(
    [string]$TargetDirectory = "",
    [switch]$NonInteractive
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "upgrade-common.ps1")

$releaseId = "MadarCore-Client-Upgrade-20261116"
$runId = [Guid]::NewGuid().ToString("N")

$reportData = [ordered]@{
    schemaVersion     = "1.0.0"
    releaseId         = $releaseId
    runId             = $runId
    startedAtUtc      = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    endedAtUtc        = $null
    targetDirectory   = ""
    applicationPort   = 3002
    runMode           = "Unknown"
    database          = [ordered]@{
        host          = ""
        port          = 5432
        database      = ""
        user          = ""
        serverVersion = ""
    }
    tools             = [ordered]@{
        node          = ""
        psql          = ""
        pg_dump       = ""
        pg_restore    = ""
        createdb      = ""
        dropdb        = ""
    }
    backupPaths       = [ordered]@{
        directory         = ""
        databaseDump      = ""
        databaseDumpHash  = ""
        databaseDumpSize  = 0
        applicationBackup = ""
        listVerified      = $false
        restoreVerified   = $false
        tableCountsBefore = $null
        tableCountsAfter  = $null
    }
    phases            = [ordered]@{
        preflight     = "NOT_STARTED"
        backup        = "NOT_STARTED"
        acceptance    = "NOT_STARTED"
        deployment    = "NOT_STARTED"
        health        = "NOT_STARTED"
    }
    durations         = [ordered]@{
        manifestVerificationMs    = 0
        archiveExtractionMs       = 0
        fingerprintVerificationMs = 0
        oldRuntimeBackupMs        = 0
        deploymentMs              = 0
        rollbackMs                = 0
    }
    acceptanceResults    = $null
    stateMachine         = "INITIALIZED"
    result               = "PREFLIGHT_FAILED"
    lastSuccessfulState  = "INITIALIZED"
    rollbackTriggerPhase = $null
    error                = $null
}

function Save-Report([string]$destDir) {
    $reportData.endedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    if (-not [string]::IsNullOrWhiteSpace($destDir)) {
        Save-UpgradeReport -DestDir $destDir -ReportData $reportData -RunId $runId | Out-Null
    }
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  MadarCore Client Upgrade Orchestrator — Release: $releaseId  " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------------------------------------
# Phase 1: Preflight Verification
# --------------------------------------------------------------------------------
try {
    $reportData.phases.preflight = "IN_PROGRESS"

    # 1.1 Check Admin Privileges
    if (-not (Test-AdminPrivileges)) {
        throw "Administrator privileges required. Please run PowerShell as Administrator."
    }

    # 1.2 Validate Execution Location (Prevent running from ZIP temp path)
    if (-not $env:MADARCORE_LAB_AUTH_TOKEN) {
        if ($scriptDir.IndexOf("\Temp\", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or $scriptDir.IndexOf(".zip", [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            throw "SAFETY VIOLATION: Package is running from a temporary or ZIP compressed directory ($scriptDir). Please extract the ZIP archive completely to a normal folder before running."
        }
    }

    # 1.3 Target Directory Resolution
    $defaultTarget = "C:\DawaCore"
    if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
        if ($NonInteractive) {
            $TargetDirectory = $defaultTarget
        } else {
            Write-Host "Enter MadarCore installation directory [Default: $defaultTarget]: " -NoNewline
            $inputTarget = Read-Host
            $TargetDirectory = if ([string]::IsNullOrWhiteSpace($inputTarget)) { $defaultTarget } else { $inputTarget.Trim().Trim('"') }
        }
    }

    if (-not (Test-Path -LiteralPath $TargetDirectory)) {
        throw "Target installation directory does not exist: $TargetDirectory"
    }
    $targetDir = (Resolve-Path -LiteralPath $TargetDirectory).Path
    $reportData.targetDirectory = $targetDir

    # NonInteractive safety guard (RR3-11)
    if ($NonInteractive) {
        $isLabTarget = ($targetDir.IndexOf("MadarCore_Upgrade_Lab_", [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($targetDir.IndexOf("Lab", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
        if (-not $isLabTarget -or -not $env:MADARCORE_LAB_AUTH_TOKEN) {
            throw "SAFETY VIOLATION: NonInteractive execution is permitted only within authorized lab sandboxes with a valid lab run token."
        }
    }

    # Prevent running from inside target directory itself
    if ($scriptDir.StartsWith($targetDir, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "SAFETY VIOLATION: Upgrade package cannot be placed inside the target directory to be upgraded."
    }

    # 1.4 Validate Target Core Files
    $envFile = Join-Path $targetDir ".env"
    $licenseFile = Join-Path $targetDir "license.key"
    $distMain = Join-Path $targetDir "dist\main.js"
    $frontIndex = Join-Path $targetDir "frontend\dist\index.html"
    $prismaSchema = Join-Path $targetDir "prisma\schema.prisma"

    if (-not (Test-Path -LiteralPath $envFile)) { throw "Target .env file missing: $envFile" }
    if (-not (Test-Path -LiteralPath $distMain)) { throw "Target backend dist/main.js missing: $distMain" }
    if (-not (Test-Path -LiteralPath $frontIndex)) { throw "Target frontend dist/index.html missing: $frontIndex" }
    if (-not (Test-Path -LiteralPath $prismaSchema)) { throw "Target prisma/schema.prisma missing: $prismaSchema" }

    # 1.5 Package Integrity & Manifest Check
    $manifestFile = Join-Path $scriptDir "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestFile)) {
        throw "Upgrade manifest.json missing from package."
    }
    $manifest = Get-Content -LiteralPath $manifestFile -Encoding UTF8 | ConvertFrom-Json
    Write-InfoLog "Verifying manifest hashes..."
    $swManifest = [System.Diagnostics.Stopwatch]::StartNew()
    $manifestHasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($item in $manifest.files) {
            $fullPath = Join-Path $scriptDir ($item.path.Replace('/', '\'))
            if (-not (Test-Path -LiteralPath $fullPath)) {
                throw "Package file missing according to manifest: $($item.path)"
            }
            $stream = [System.IO.File]::OpenRead($fullPath)
            try {
                $hashBytes = $manifestHasher.ComputeHash($stream)
                $h = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
                if ($h -ne $item.sha256) {
                    throw "Hash mismatch for package file: $($item.path)"
                }
            } finally {
                $stream.Close()
            }
        }
    } finally {
        $manifestHasher.Dispose()
    }
    $swManifest.Stop()
    $reportData.durations.manifestVerificationMs = $swManifest.ElapsedMilliseconds
    Write-SuccessLog "Package integrity verified in $($swManifest.ElapsedMilliseconds) ms."

    # 1.6 Environment Configuration Parsing
    $dbConnStr = $null
    $appPort = 3002
    foreach ($line in (Get-Content -LiteralPath $envFile -Encoding UTF8)) {
        $t = $line.Trim()
        if ($t.StartsWith('#') -or [string]::IsNullOrWhiteSpace($t)) { continue }
        if ($t -match '^DATABASE_URL\s*=\s*["'']?(.*?)["'']?$') { $dbConnStr = $matches[1] }
        if ($t -match '^PORT\s*=\s*["'']?(\d+)["'']?$') { $appPort = [int]$matches[1] }
    }
    if ([string]::IsNullOrWhiteSpace($dbConnStr)) { throw "DATABASE_URL not found in target .env" }
    $reportData.applicationPort = $appPort

    $dbConn = Parse-DatabaseConnectionString $dbConnStr
    $reportData.database.host = $dbConn.Host
    $reportData.database.port = $dbConn.Port
    $reportData.database.database = $dbConn.Database
    $reportData.database.user = $dbConn.User

    # 1.7 Tool Discovery (Node & PostgreSQL) & Node Version Validation (RR3-01)
    $nodeExe = Discover-NodeExecutable $targetDir
    if (-not $nodeExe) { throw "Node.js executable could not be found." }
    $nodeVerOut = (& $nodeExe -v).ToString().Trim()
    if (-not (Test-NodeVersionSupported $nodeVerOut)) {
        throw "PREFLIGHT_FAILED: Unsupported Node.js version '$nodeVerOut'. Only Node 20.x (>=20.19.0) or Node 22.x LTS are supported."
    }
    $reportData.tools.node = $nodeExe
    Write-InfoLog "Discovered Node: $nodeExe ($nodeVerOut)"

    $pgTools = Discover-PostgresTools $targetDir
    $reportData.tools.psql = [string]$pgTools.psql
    $reportData.tools.pg_dump = [string]$pgTools.pg_dump
    $reportData.tools.pg_restore = [string]$pgTools.pg_restore
    $reportData.tools.createdb = [string]$pgTools.createdb
    $reportData.tools.dropdb = [string]$pgTools.dropdb
    $reportData.database.serverVersion = [string]$pgTools.version

    # Strict check: all required PostgreSQL tools must be present and supported
    $missingTools = @()
    if (-not $pgTools.psql) { $missingTools += "psql" }
    if (-not $pgTools.pg_dump) { $missingTools += "pg_dump" }
    if (-not $pgTools.pg_restore) { $missingTools += "pg_restore" }
    if (-not $pgTools.createdb) { $missingTools += "createdb" }
    if (-not $pgTools.dropdb) { $missingTools += "dropdb" }

    if ($missingTools.Count -gt 0) {
        throw "PREFLIGHT_FAILED: Missing required PostgreSQL 15/16 tools: $($missingTools -join ', ')."
    }

    if ($pgTools.major -lt 15 -or $pgTools.major -gt 16) {
        throw "PREFLIGHT_FAILED: Unsupported PostgreSQL version: $($pgTools.version). Only PostgreSQL 15 and 16 are supported."
    }

    Write-InfoLog "Discovered PostgreSQL tools: psql=$($pgTools.psql), pg_dump=$($pgTools.pg_dump), pg_restore=$($pgTools.pg_restore)"

    # 1.8 Verify Candidate Server Runtime & Prisma CLI (Section 3.1 & 3.3, Revision 2)
    $payloadDir = Join-Path $scriptDir "payload"
    $candidateMetadataFile = if (Test-Path -LiteralPath (Join-Path $payloadDir "runtime-metadata.json")) {
        Join-Path $payloadDir "runtime-metadata.json"
    } else {
        Join-Path $payloadDir "server-runtime\runtime-metadata.json"
    }
    if (-not (Test-Path -LiteralPath $candidateMetadataFile)) {
        throw "PREFLIGHT_FAILED: Candidate runtime metadata missing: $candidateMetadataFile"
    }
    $candMeta = Get-Content -LiteralPath $candidateMetadataFile -Raw -Encoding UTF8 | ConvertFrom-Json

    # R2-02 Check: Enforce supported Node version on candidate runtime
    if (-not (Test-NodeVersionSupported $candMeta.nodeVersion)) {
        throw "PREFLIGHT_FAILED (R2-02): Candidate runtime was built with unsupported Node.js version '$($candMeta.nodeVersion)'. Required: Node 20.19+ or Node 22."
    }

    $runtimeZip = Join-Path $payloadDir "server-runtime.zip"
    $hasRuntimeZip = Test-Path -LiteralPath $runtimeZip
    $hasExpandedRuntime = Test-Path -LiteralPath (Join-Path $payloadDir "server-runtime")
    if (-not $hasRuntimeZip -and -not $hasExpandedRuntime) {
        throw "PREFLIGHT_FAILED: Candidate server runtime archive missing: $runtimeZip"
    }

    $reportData.candidateRuntime = [ordered]@{
        fingerprint      = $candMeta.runtimeFingerprint
        totalFiles       = $candMeta.runtimeFileCount
        totalBytes       = $candMeta.runtimeTotalBytes
        sourceLockSha256 = $candMeta.sourceLockSha256
        nodeVersion      = $candMeta.nodeVersion
    }

    # 1.8.1 Dynamic Free Disk Space Calculation & Preflight Gate (Section 3.7)
    $candBytes = [int64]$candMeta.runtimeTotalBytes
    $diskCalc = Calculate-RequiredFreeDiskSpace -TargetDir $targetDir -CandidateRuntimeBytes $candBytes -FloorRequiredMB 2048 -SafetyReserveBytes (1024 * 1024 * 1024) -DbDumpAllowanceBytes (500 * 1024 * 1024)
    $reportData.diskSpace = [ordered]@{
        targetVolume         = $diskCalc.TargetDrive
        availableFreeBytes   = $diskCalc.AvailableBytes
        requiredBytes        = $diskCalc.RequiredBytes
        availableMB          = $diskCalc.AvailableMB
        requiredMB           = $diskCalc.RequiredMB
        calculationBreakdown = [ordered]@{
            oldRuntimeMB       = $diskCalc.OldRuntimeMB
            candidateRuntimeMB = $diskCalc.CandidateRuntimeMB
            floorRequiredMB    = 2048
        }
    }

    Write-InfoLog "Disk space check: Available = $($diskCalc.AvailableMB) MB, Required = $($diskCalc.RequiredMB) MB"
    if (-not $diskCalc.HasSufficientSpace) {
        throw "PREFLIGHT_FAILED: Insufficient free disk space on volume $($diskCalc.TargetDrive). Available: $($diskCalc.AvailableMB) MB, Required: $($diskCalc.RequiredMB) MB."
    }

    # 1.9 Detect Run Mode (RR4-05, RR5-05)
    $runModeInfo = Detect-ApplicationRunMode -TargetDir $targetDir -Port $appPort
    if ($runModeInfo.Mode -eq "ForeignProcess") {
        throw "PREFLIGHT_FAILED: Port $appPort is occupied by foreign process $($runModeInfo.Name) (PID $($runModeInfo.Id))."
    }
    $reportData.runMode = [ordered]@{
        mode            = $runModeInfo.Mode
        name            = $runModeInfo.Name
        executable      = $runModeInfo.Executable
        arguments       = $runModeInfo.Arguments
        targetDirectory = $runModeInfo.TargetDirectory
        processIdentity = $runModeInfo.ProcessIdentity
        id              = $runModeInfo.Id
    }
    Write-InfoLog "Detected target application run mode: $($runModeInfo.Mode) (Name: '$($runModeInfo.Name)')"

    # 1.10 Database Connection & Migration Audit Check (RR4-03)
    $dbPing = Execute-SqlQuery -PsqlExe $pgTools.psql -DbConn $dbConn -Query "SELECT 1;"
    if ($dbPing.ExitCode -ne 0 -or $dbPing.StdOut -ne "1") {
        throw "Failed to connect to database $($dbConn.Host):$($dbConn.Port)/$($dbConn.Database): $($dbPing.StdErr)"
    }

    # Audit migrations using candidate migrations directory
    $candMigrationsDir = Join-Path $payloadDir "prisma\migrations"
    $migAudit = Audit-TargetMigrations -PsqlExe $pgTools.psql -DbConn $dbConn -CandidateMigrationsDir $candMigrationsDir
    $reportData.migrationAudit = [ordered]@{
        appliedCount   = $migAudit.AppliedCount
        candidateCount = $migAudit.CandidateCount
        pendingCount   = $migAudit.PendingCount
    }
    Write-InfoLog "Migration audit passed: $($migAudit.AppliedCount) applied, $($migAudit.PendingCount) pending."

    # 1.11 Full Idempotency Check across all payload assets, migrations, health & branding (RR4-04, RR5-04)
    $isAlreadyUpToDate = $false
    if ($migAudit.PendingCount -eq 0 -and $runModeInfo.Mode -ne "ForeignProcess") {
        $exactPayloadCheck = Compare-DeployedPayloadExact -PayloadDir $payloadDir -TargetDir $targetDir

        # Check preserved files
        $envBefore = Calculate-FileSHA256 $envFile
        $licBefore = Calculate-FileSHA256 $licenseFile

        if ($exactPayloadCheck.IsIdentical) {
            # If application is running on port, verify health and branding
            $portConn = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($portConn) {
                try {
                    $hResp = Invoke-WebRequest -Uri "http://127.0.0.1:$appPort/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                    $bResp = Invoke-WebRequest -Uri "http://127.0.0.1:$appPort/api/branding" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                    if ($hResp.StatusCode -eq 200 -and $bResp.StatusCode -eq 200) {
                        $hObj = $hResp.Content | ConvertFrom-Json
                        $bObj = $bResp.Content | ConvertFrom-Json
                        if ($hObj.status -eq 'ok' -and $hObj.service -eq 'MadarCore ERP' -and $bObj.platformName -eq 'MadarCore') {
                            $isAlreadyUpToDate = $true
                        }
                    }
                } catch {}
            } else {
                # Target files, migrations, and schema are completely up-to-date and offline
                $isAlreadyUpToDate = $true
            }
        }
    }

    if ($isAlreadyUpToDate) {
        $reportData.phases.preflight = "SUCCESS"
        $reportData.stateMachine = "PREFLIGHT_PASSED"
        $reportData.result = "ALREADY_UP_TO_DATE"
        Save-Report (Join-Path $targetDir "backups")
        Write-SuccessLog "System is ALREADY_UP_TO_DATE. All files, migrations, health, and branding match candidate perfectly. No modifications made."
        exit 0
    }

    # 1.12 Operator Confirmation
    if (-not $NonInteractive) {
        Write-Host ""
        Write-Host "Type exactly 'APPLY MADARCORE CLIENT UPGRADE' to proceed with backup and upgrade: " -ForegroundColor Yellow
        $conf = Read-Host
        if ($conf -ne "APPLY MADARCORE CLIENT UPGRADE") {
            $reportData.result = "CANCELLED"
            Write-WarnLog "Upgrade cancelled by operator."
            exit 0
        }
    }

    $reportData.phases.preflight = "SUCCESS"
    $reportData.stateMachine = "PREFLIGHT_PASSED"
    $reportData.lastSuccessfulState = "PREFLIGHT_PASSED"
    Write-SuccessLog "Preflight checks passed."

} catch {
    $reportData.phases.preflight = "FAILED"
    $reportData.result = "PREFLIGHT_FAILED"
    $reportData.error = Sanitize-LogText $_.ToString()
    Write-FailureLog "Preflight check failed: $($reportData.error)"
    Save-Report $scriptDir
    exit 1
}

# --------------------------------------------------------------------------------
# Phase 2: Backup & Restore Verification Drill (RR3-05)
# --------------------------------------------------------------------------------
$timestamp = (Get-Date).ToString("yyyyMMdd-HHmmss")
$backupDir = Join-Path $targetDir "backups\madarcore-upgrade-$timestamp"
$reportData.backupPaths.directory = $backupDir

try {
    $reportData.phases.backup = "IN_PROGRESS"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    # 2.0 Capture Baseline Critical Table Counts
    $baselineCounts = Get-DatabaseTableCounts -PsqlExe $pgTools.psql -DbConn $dbConn
    $reportData.backupPaths.tableCountsBefore = $baselineCounts

    # 2.1 File & Runtime Backup (RR6-01)
    $appBackupDir = Join-Path $backupDir "application-backup"
    New-Item -ItemType Directory -Path $appBackupDir -Force | Out-Null
    $reportData.backupPaths.applicationBackup = $appBackupDir

    Write-InfoLog "Backing up target application files to: $appBackupDir..."
    Copy-DirectorySafely -SourceDir (Join-Path $targetDir "dist") -DestinationDir (Join-Path $appBackupDir "dist")
    Copy-DirectorySafely -SourceDir (Join-Path $targetDir "frontend\dist") -DestinationDir (Join-Path $appBackupDir "frontend\dist")
    if (Test-Path -LiteralPath (Join-Path $targetDir "prisma\schema.prisma")) {
        New-Item -ItemType Directory -Path (Join-Path $appBackupDir "prisma") -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $targetDir "prisma\schema.prisma") -Destination (Join-Path $appBackupDir "prisma\schema.prisma") -Force
    }
    if (Test-Path -LiteralPath (Join-Path $targetDir "prisma\migrations")) {
        Copy-DirectorySafely -SourceDir (Join-Path $targetDir "prisma\migrations") -DestinationDir (Join-Path $appBackupDir "prisma\migrations")
    }

    # 2.1.1 Full Target node_modules Backup & Manifest (Section 3.5 & 3.6)
    $targetNodeModules = Join-Path $targetDir "node_modules"
    $nodeModulesBackupDir = Join-Path $appBackupDir "node_modules-backup"
    if (Test-Path -LiteralPath $targetNodeModules) {
        Write-InfoLog "Computing baseline target node_modules fingerprint and manifest..."
        $targetFpObj = Compute-DirectoryFingerprint -DirPath $targetNodeModules -IncludeFileMap
        Write-InfoLog "Target node_modules: $($targetFpObj.TotalFiles) files, $([Math]::Round($targetFpObj.TotalBytes / 1MB, 2)) MB, Fingerprint: $($targetFpObj.Fingerprint)"

        Write-InfoLog "Backing up complete target node_modules to: $nodeModulesBackupDir..."
        $swBackup = [System.Diagnostics.Stopwatch]::StartNew()
        Copy-DirectorySafely -SourceDir $targetNodeModules -DestinationDir $nodeModulesBackupDir
        $swBackup.Stop()
        $reportData.durations.oldRuntimeBackupMs = $swBackup.ElapsedMilliseconds

        $backupFpObj = Compute-DirectoryFingerprint -DirPath $nodeModulesBackupDir
        if ($backupFpObj.Fingerprint -ne $targetFpObj.Fingerprint) {
            throw "BACKUP_FAILED: node_modules backup verification failed! Target FP: $($targetFpObj.Fingerprint), Backup FP: $($backupFpObj.Fingerprint)"
        }

        $runtimeManifestObj = [ordered]@{
            targetDirectory = $targetDir
            backupTimestamp = $timestamp
            totalFiles      = $targetFpObj.TotalFiles
            totalBytes      = $targetFpObj.TotalBytes
            fingerprint     = $targetFpObj.Fingerprint
            files           = $targetFpObj.Files
        }
        $runtimeManifestPath = Join-Path $appBackupDir "runtime-backup-manifest.json"
        $runtimeManifestJson = $runtimeManifestObj | ConvertTo-Json -Depth 6
        [System.IO.File]::WriteAllText($runtimeManifestPath, $runtimeManifestJson, [System.Text.UTF8Encoding]::new($false))
        $runtimeManifestSha256 = Calculate-FileSHA256 $runtimeManifestPath

        $reportData.backupPaths.nodeModulesBackup = $nodeModulesBackupDir
        $reportData.backupPaths.runtimeBackupManifest = $runtimeManifestPath
        $reportData.backupPaths.runtimeBackupManifestSha256 = $runtimeManifestSha256
        $reportData.backupPaths.runtimeBackupFingerprint = $targetFpObj.Fingerprint
    }

    # 2.2 Database Custom-format Dump
    $dbDumpFile = Join-Path $backupDir "database_backup.dump"
    $reportData.backupPaths.databaseDump = $dbDumpFile
    Write-InfoLog "Creating database dump using pg_dump custom format (-Fc)..."

    $dumpArgs = @(
        "-h", $dbConn.Host,
        "-p", $dbConn.Port.ToString(),
        "-U", $dbConn.User,
        "-F", "c",
        "--no-owner",
        "--no-privileges",
        "-b",
        "-f", $dbDumpFile,
        $dbConn.Database
    )
    $dumpRes = Execute-PostgresCommand -Executable $pgTools.pg_dump -Arguments $dumpArgs -Password $dbConn.Password
    if ($dumpRes.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $dbDumpFile) -or (Get-Item $dbDumpFile).Length -eq 0) {
        throw "pg_dump failed to create custom format backup. ExitCode: $($dumpRes.ExitCode) Error: $($dumpRes.StdErr)"
    }
    $dumpHash = Calculate-FileSHA256 $dbDumpFile
    $dumpSize = (Get-Item $dbDumpFile).Length
    $reportData.backupPaths.databaseDumpHash = $dumpHash
    $reportData.backupPaths.databaseDumpSize = $dumpSize
    Write-SuccessLog "Database dump created ($dumpHash, $dumpSize bytes)."

    # 2.3 Verify dump with pg_restore --list
    $listArgs = @("-l", $dbDumpFile)
    $listRes = Execute-PostgresCommand -Executable $pgTools.pg_restore -Arguments $listArgs -Password $dbConn.Password
    if ($listRes.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($listRes.StdOut)) {
        throw "pg_restore --list verification failed on database dump. Archive may be corrupt."
    }
    $reportData.backupPaths.listVerified = $true
    Write-SuccessLog "Database dump archive verified with pg_restore --list."

    $reportData.stateMachine = "BACKUP_CREATED"
    $reportData.lastSuccessfulState = "BACKUP_CREATED"
    $reportData.phases.backup = "SUCCESS"
    Write-SuccessLog "Backup completed successfully."

} catch {
    $reportData.phases.backup = "FAILED"
    $reportData.result = "BACKUP_FAILED"
    $reportData.error = Sanitize-LogText $_.ToString()
    Write-FailureLog "Backup failed: $($reportData.error)"
    Save-Report $backupDir
    exit 1
}

# --------------------------------------------------------------------------------
# Phase 3: Candidate Acceptance on Temporary Database (RR3-03, RR3-05)
# --------------------------------------------------------------------------------
$randSuffix = (Get-Random -Minimum 1000 -Maximum 9999)
$tempDbName = "dawacore_upgrade_accept_$timestamp" + "_$randSuffix"

try {
    $reportData.phases.acceptance = "IN_PROGRESS"
    Write-InfoLog "Starting candidate acceptance drill on isolated database: $tempDbName..."

    # Create temporary database
    $createArgs = @("-h", $dbConn.Host, "-p", $dbConn.Port.ToString(), "-U", $dbConn.User, $tempDbName)
    $createRes = Execute-PostgresCommand -Executable $pgTools.createdb -Arguments $createArgs -Password $dbConn.Password
    if ($createRes.ExitCode -ne 0) {
        throw "createdb failed to create temporary acceptance database: $($createRes.StdErr)"
    }

    # Restore dump into temporary database to prove backup restoreability
    $tempRestoreArgs = @(
        "-h", $dbConn.Host,
        "-p", $dbConn.Port.ToString(),
        "-U", $dbConn.User,
        "-d", $tempDbName,
        "--no-owner",
        "--no-privileges",
        $dbDumpFile
    )
    $restoreRes = Execute-PostgresCommand -Executable $pgTools.pg_restore -Arguments $tempRestoreArgs -Password $dbConn.Password
    if ($restoreRes.ExitCode -ne 0) {
        throw "pg_restore failed to restore backup dump into temporary acceptance database: $($restoreRes.StdErr)"
    }
    $reportData.backupPaths.restoreVerified = $true
    $reportData.stateMachine = "BACKUP_RESTORE_VERIFIED"
    Write-SuccessLog "Backup restoreability verified on temporary database."

    # Compare restored counts with baseline (RR3-05)
    $restoredCounts = Get-DatabaseTableCounts -PsqlExe $pgTools.psql -DbConn $dbConn -TargetDatabase $tempDbName
    $reportData.backupPaths.tableCountsAfter = $restoredCounts

    foreach ($tbl in $baselineCounts.Keys) {
        if ($baselineCounts[$tbl] -ge 0 -and $restoredCounts[$tbl] -ne $baselineCounts[$tbl]) {
            throw "RESTORE_COUNT_MISMATCH: Table $tbl row count mismatch after restore. Before: $($baselineCounts[$tbl]), After: $($restoredCounts[$tbl])"
        }
    }
    Write-SuccessLog "Database table count comparison verified successfully."

    # Extract candidate server-runtime.zip once to GUID staging directory on target volume (Section 3.5, Revision 2)
    $stagedRuntimeDir = Join-Path $targetDir ".staging_runtime_$runId"
    if ($hasRuntimeZip) {
        $swExtract = [System.Diagnostics.Stopwatch]::StartNew()
        Extract-RuntimeArchive -ArchiveZipPath $runtimeZip -DestinationDir $stagedRuntimeDir
        $swExtract.Stop()
        $reportData.durations.archiveExtractionMs = $swExtract.ElapsedMilliseconds

        $swFp = [System.Diagnostics.Stopwatch]::StartNew()
        $stagedFpObj = Compute-DirectoryFingerprint -DirPath (Join-Path $stagedRuntimeDir "node_modules")
        $swFp.Stop()
        $reportData.durations.fingerprintVerificationMs = $swFp.ElapsedMilliseconds

        if ($stagedFpObj.Fingerprint -ne $candMeta.runtimeFingerprint) {
            throw "PREFLIGHT_FAILED: Staged runtime fingerprint mismatch! Expected: $($candMeta.runtimeFingerprint), Computed: $($stagedFpObj.Fingerprint)"
        }
        Write-SuccessLog "Staged candidate runtime fingerprint verified successfully ($($stagedFpObj.Fingerprint)) in $($swFp.ElapsedMilliseconds) ms."
    } else {
        $stagedRuntimeDir = Join-Path $payloadDir "server-runtime"
    }

    $candidatePrismaCli = Join-Path $stagedRuntimeDir "node_modules\prisma\build\index.js"
    if (-not (Test-Path -LiteralPath $candidatePrismaCli)) {
        throw "PREFLIGHT_FAILED: Candidate Prisma runtime CLI missing: $candidatePrismaCli"
    }

    # Apply candidate migrations on temp DB using candidate runtime strictly (RR3-02)
    $tempDbUrl = "postgresql://$($dbConn.User):$($dbConn.Password)@$($dbConn.Host):$($dbConn.Port)/$tempDbName"
    $candSchema = Join-Path $payloadDir "prisma\schema.prisma"
    $migArgs = @($candidatePrismaCli, "migrate", "deploy", "--schema", $candSchema)
    $migEnv = @{ "DATABASE_URL" = $tempDbUrl }

    Write-InfoLog "Applying candidate migrations on temporary database using candidate runtime..."
    $migRes = Execute-NativeProcessSafely -Executable $nodeExe -Arguments $migArgs -EnvironmentVariables $migEnv
    if ($migRes.ExitCode -ne 0) {
        throw "Candidate prisma migrate deploy failed on temporary database: $($migRes.StdErr)"
    }
    Write-SuccessLog "Candidate migrations applied to temporary database."

    # Run Candidate Acceptance Script (RR3-03)
    $acceptanceRunner = Join-Path $payloadDir "tools\acceptance-upgrade.cjs"
    if (-not (Test-Path -LiteralPath $acceptanceRunner)) {
        throw "ACCEPTANCE_FAILED: Candidate acceptance test runner missing from payload: $acceptanceRunner"
    }

    Write-InfoLog "Executing acceptance test runner on temporary database..."
    $accEnv = @{
        "ACCEPTANCE_DATABASE_URL" = $tempDbUrl
        "TARGET_DIRECTORY"        = $targetDir
        "CANDIDATE_RUNTIME_DIR"   = $stagedRuntimeDir
        "CANDIDATE_DIST_DIR"      = (Join-Path $stagedRuntimeDir "dist")
    }
    $accArgs = @($acceptanceRunner)
    $accRes = Execute-NativeProcessSafely -Executable $nodeExe -Arguments $accArgs -EnvironmentVariables $accEnv -TimeoutSeconds 180

    if ($accRes.ExitCode -ne 0) {
        throw "Candidate acceptance tests failed on temp database. Details: $($accRes.StdErr) $($accRes.StdOut)"
    }
    $reportData.acceptanceResults = $accRes.StdOut
    Write-SuccessLog "Candidate acceptance tests passed on temp database."

    # Clean up temporary acceptance database
    $dropArgs = @("-h", $dbConn.Host, "-p", $dbConn.Port.ToString(), "-U", $dbConn.User, "--if-exists", $tempDbName)
    $dropRes = Execute-PostgresCommand -Executable $pgTools.dropdb -Arguments $dropArgs -Password $dbConn.Password
    if ($dropRes.ExitCode -ne 0) {
        throw "ACCEPTANCE_CLEANUP_FAILED: Failed to drop temporary acceptance database: $($dropRes.StdErr)"
    }

    $reportData.stateMachine = "TEMP_ACCEPTANCE_PASSED"
    $reportData.lastSuccessfulState = "TEMP_ACCEPTANCE_PASSED"
    $reportData.phases.acceptance = "SUCCESS"

    # Second Confirmation before changing production
    if (-not $NonInteractive) {
        Write-Host ""
        Write-Host "Candidate acceptance passed. Type 'DEPLOY APPROVED CANDIDATE' to update production: " -ForegroundColor Yellow
        $conf2 = Read-Host
        if ($conf2 -ne "DEPLOY APPROVED CANDIDATE") {
            $reportData.result = "CANCELLED"
            Write-WarnLog "Deployment cancelled by operator."
            if ($stagedRuntimeDir -and (Test-Path -LiteralPath $stagedRuntimeDir) -and $hasRuntimeZip) {
                Remove-Item -LiteralPath $stagedRuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
            }
            exit 0
        }
    }
    $reportData.stateMachine = "DEPLOYMENT_CONFIRMED"

} catch {
    $reportData.phases.acceptance = "FAILED"
    $reportData.result = "ACCEPTANCE_FAILED"
    $reportData.error = Sanitize-LogText $_.ToString()
    Write-FailureLog "Candidate acceptance failed: $($reportData.error)"

    # Attempt cleanup of temporary database
    try {
        if ($pgTools.dropdb) {
            Execute-PostgresCommand -Executable $pgTools.dropdb -Arguments @("-h", $dbConn.Host, "-p", $dbConn.Port.ToString(), "-U", $dbConn.User, "--if-exists", $tempDbName) -Password $dbConn.Password | Out-Null
        }
    } catch {}

    # Clean up staged runtime on acceptance failure
    if ($stagedRuntimeDir -and (Test-Path -LiteralPath $stagedRuntimeDir) -and $hasRuntimeZip) {
        Remove-Item -LiteralPath $stagedRuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    Save-Report $backupDir
    exit 1
}

# --------------------------------------------------------------------------------
# Phase 4 & 5: Production Deployment with Exact Directory Swap & Rollback (RR4-05, RR4-06)
# --------------------------------------------------------------------------------
try {
    $reportData.phases.deployment = "IN_PROGRESS"

    # Pre-deployment staging assertion (R3-01)
    Write-InfoLog "Asserting integrity and presence of staged candidate runtime..."
    $candidatePrismaCli = Join-Path $stagedRuntimeDir "node_modules\prisma\build\index.js"
    $stagedDistDir = Join-Path $stagedRuntimeDir "dist"
    $stagedModulesDir = Join-Path $stagedRuntimeDir "node_modules"
    $stagedPkgJson = Join-Path $stagedRuntimeDir "package.json"
    $stagedLockJson = Join-Path $stagedRuntimeDir "package-lock.json"

    if (-not (Test-Path -LiteralPath $stagedRuntimeDir)) {
        throw "PREFLIGHT_FAILED: Staged runtime directory does not exist: $stagedRuntimeDir"
    }
    if (-not (Test-Path -LiteralPath $candidatePrismaCli)) {
        throw "PREFLIGHT_FAILED: Staged Prisma CLI does not exist: $candidatePrismaCli"
    }
    if (-not (Test-Path -LiteralPath $stagedDistDir)) {
        throw "PREFLIGHT_FAILED: Staged dist directory does not exist: $stagedDistDir"
    }
    if (-not (Test-Path -LiteralPath $stagedModulesDir)) {
        throw "PREFLIGHT_FAILED: Staged node_modules directory does not exist: $stagedModulesDir"
    }
    if (-not (Test-Path -LiteralPath $stagedPkgJson)) {
        throw "PREFLIGHT_FAILED: Staged package.json does not exist: $stagedPkgJson"
    }
    if (-not (Test-Path -LiteralPath $stagedLockJson)) {
        throw "PREFLIGHT_FAILED: Staged package-lock.json does not exist: $stagedLockJson"
    }
    Write-SuccessLog "Staged candidate runtime assertion passed."

    # Stop target process safely according to detected run mode
    Write-InfoLog "Stopping target application using run mode $($runModeInfo.Mode)..."
    Stop-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $targetDir -Port $appPort | Out-Null
    $reportData.stateMachine = "PRODUCTION_STOPPED"
    $reportData.lastSuccessfulState = "PRODUCTION_STOPPED"

    # Apply Prisma Migrations to Production DB using candidate runtime strictly
    Write-InfoLog "Applying prisma migrations to production database using candidate runtime..."
    $prodMigArgs = @($candidatePrismaCli, "migrate", "deploy", "--schema", (Join-Path $payloadDir "prisma\schema.prisma"))
    $prodMigEnv = @{ "DATABASE_URL" = $dbConnStr }
    $prodMigRes = Execute-NativeProcessSafely -Executable $nodeExe -Arguments $prodMigArgs -EnvironmentVariables $prodMigEnv
    if ($prodMigRes.ExitCode -ne 0) {
        throw "Production prisma migrate deploy failed: $($prodMigRes.StdErr)"
    }
    $reportData.stateMachine = "PRODUCTION_MIGRATED"
    $reportData.lastSuccessfulState = "PRODUCTION_MIGRATED"

    # Atomic Guarded Directory Deployment using the ALREADY VERIFIED staged runtime (Section 3.5, Revision 2)
    $swDeploy = [System.Diagnostics.Stopwatch]::StartNew()
    Write-InfoLog "Activating verified candidate runtime into target via guarded atomic swap..."
    Deploy-VerifiedRuntimeGuarded -StagedRuntimeDir $stagedRuntimeDir -TargetDir $targetDir -RunId $runId

    Write-InfoLog "Deploying frontend dist via guarded atomic staging..."
    Deploy-DirectoryGuarded -SourceDir (Join-Path $payloadDir "frontend\dist") -TargetDir (Join-Path $targetDir "frontend\dist")

    Copy-Item -LiteralPath (Join-Path $payloadDir "prisma\schema.prisma") -Destination (Join-Path $targetDir "prisma\schema.prisma") -Force
    if (Test-Path -LiteralPath (Join-Path $payloadDir "prisma\migrations")) {
        Deploy-DirectoryGuarded -SourceDir (Join-Path $payloadDir "prisma\migrations") -TargetDir (Join-Path $targetDir "prisma\migrations")
    }

    Copy-Item -LiteralPath (Join-Path $stagedRuntimeDir "package.json") -Destination (Join-Path $targetDir "package.json") -Force
    Copy-Item -LiteralPath (Join-Path $stagedRuntimeDir "package-lock.json") -Destination (Join-Path $targetDir "package-lock.json") -Force
    Copy-Item -LiteralPath $candidateMetadataFile -Destination (Join-Path $targetDir "runtime-metadata.json") -Force
    $swDeploy.Stop()
    $reportData.durations.deploymentMs = $swDeploy.ElapsedMilliseconds

    $reportData.stateMachine = "FILES_SWAPPED"
    $reportData.lastSuccessfulState = "FILES_SWAPPED"
    $reportData.phases.deployment = "SUCCESS"

    # --------------------------------------------------------------------------------
    # Phase 6: Post-Deployment Verification (Health Check, Branding, and Payload) (RR4-05, RR5-04, RR6-05)
    # --------------------------------------------------------------------------------
    $reportData.phases.health = "IN_PROGRESS"
    Write-InfoLog "Restarting target application using run mode $($runModeInfo.Mode)..."

    Start-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $targetDir -NodeExe $nodeExe | Out-Null
    Start-Sleep -Seconds 3
    $reportData.stateMachine = "APPLICATION_RESTARTED"
    $reportData.lastSuccessfulState = "APPLICATION_RESTARTED"

    # Verify listening process owner and target path (RR6-05)
    $postDeployRunMode = Detect-ApplicationRunMode -TargetDir $targetDir -Port $appPort
    if ($postDeployRunMode.Mode -eq "ForeignProcess") {
        throw "Post-deploy verification failed: Port $appPort is occupied by foreign process $($postDeployRunMode.Name)."
    }
    if ($runModeInfo.Mode -ne "None") {
        if ($postDeployRunMode.Mode -ne $runModeInfo.Mode) {
            throw "Post-deploy run mode mismatch: Expected '$($runModeInfo.Mode)', detected '$($postDeployRunMode.Mode)'."
        }
        if ($runModeInfo.Mode -eq "WindowsService" -and $postDeployRunMode.Name -ne $runModeInfo.Name) {
            throw "Post-deploy service name mismatch: Expected '$($runModeInfo.Name)', detected '$($postDeployRunMode.Name)'."
        }
        if ($runModeInfo.Mode -eq "ScheduledTask" -and $postDeployRunMode.Name -ne $runModeInfo.Name) {
            throw "Post-deploy task name mismatch: Expected '$($runModeInfo.Name)', detected '$($postDeployRunMode.Name)'."
        }
    }

    # Verify Health & Branding endpoints strictly with full 60s timeout for cold boot (LC-05)
    $healthOk = $false
    $brandingOk = $false
    $healthUrl = "http://127.0.0.1:$appPort/api/health"
    $brandingUrl = "http://127.0.0.1:$appPort/api/branding"
    $healthDeadline = (Get-Date).AddSeconds(60)

    while ((Get-Date) -lt $healthDeadline) {
        try {
            $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                $hObj = $resp.Content | ConvertFrom-Json
                if ($hObj -and $hObj.status -eq 'ok' -and $hObj.service -eq 'MadarCore ERP') {
                    $healthOk = $true
                }
            }

            if ($healthOk) {
                $bResp = Invoke-WebRequest -Uri $brandingUrl -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
                if ($bResp.StatusCode -eq 200) {
                    $bObj = $bResp.Content | ConvertFrom-Json
                    if ($bObj -and $bObj.platformName -eq 'MadarCore') {
                        $brandingOk = $true
                    }
                }
            }

            if ($healthOk -and $brandingOk) { break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }

    if (-not $healthOk) {
        throw "Health verification failed: Service did not respond with valid health contract on port $appPort"
    }

    if (-not $brandingOk) {
        throw "Branding verification failed: Service did not respond with MadarCore branding on port $appPort"
    }

    # Verify Deployed Payload Exact Match
    $postPayloadAudit = Compare-DeployedPayloadExact -PayloadDir $payloadDir -TargetDir $targetDir
    if (-not $postPayloadAudit.IsIdentical) {
        throw "Post-deploy payload verification failed: $($postPayloadAudit.Differences -join '; ')"
    }

    # Verify Preserved Files (.env and license.key)
    $envHashAfter = Calculate-FileSHA256 $envFile
    $licHashAfter = Calculate-FileSHA256 $licenseFile
    if ($envHashAfter -ne $envHashBefore -or $licHashAfter -ne $licHashBefore) {
        throw "Preserved files check failed: .env or license.key modified during deployment."
    }

    $reportData.stateMachine = "POST_DEPLOY_VERIFIED"
    $reportData.lastSuccessfulState = "POST_DEPLOY_VERIFIED"
    $reportData.phases.health = "SUCCESS"
    $reportData.stateMachine = "SUCCESS"
    $reportData.result = "SUCCESS"
    Save-Report $backupDir
    Write-SuccessLog "MadarCore Client Upgrade finished successfully!"
    exit 0

} catch {
    $errStr = $_.ToString()
    Write-FailureLog "Deployment failed: $errStr. Initiating automatic rollback..."

    $triggerPhase = if ($reportData.phases.health -eq "IN_PROGRESS") {
        "HEALTH"
    } elseif ($reportData.phases.deployment -eq "IN_PROGRESS") {
        if ($reportData.stateMachine -eq "FILES_SWAPPED" -or $reportData.stateMachine -eq "APPLICATION_RESTARTED") {
            "POST_DEPLOY_VERIFICATION"
        } elseif ($reportData.stateMachine -eq "PRODUCTION_MIGRATED") {
            "ACTIVATION"
        } else {
            "MIGRATION"
        }
    } else {
        "DEPLOYMENT"
    }
    $reportData.rollbackTriggerPhase = $triggerPhase
    if ($triggerPhase -eq "HEALTH") {
        $reportData.phases.health = "FAILED"
    } else {
        $reportData.phases.deployment = "FAILED"
    }

    $reportData.stateMachine = "ROLLBACK_IN_PROGRESS"
    $reportData.result = "DEPLOYMENT_FAILED_ROLLED_BACK"
    $reportData.error = Sanitize-LogText $errStr
    Save-Report $backupDir

    # LC-08: Safely terminate the currently running process on target port/directory
    try {
        Terminate-TargetProcessOnly -TargetDir $targetDir -Port $appPort | Out-Null
    } catch {
        Write-WarnLog "Could not terminate currently running target process: $_"
    }

    # LC-07: Perform Rollback and explicitly verify its exit code and report outcome
    $rollbackScript = Join-Path $scriptDir "rollback-madarcore-upgrade.ps1"
    $rollbackReportPath = Join-Path $backupDir "upgrade-report.json"
    $rollbackExit = 1

    try {
        $rbEnv = @{}
        if ($env:MADARCORE_LAB_AUTH_TOKEN) { $rbEnv["MADARCORE_LAB_AUTH_TOKEN"] = $env:MADARCORE_LAB_AUTH_TOKEN }
        if ($env:MADARCORE_LAB_ROOT) { $rbEnv["MADARCORE_LAB_ROOT"] = $env:MADARCORE_LAB_ROOT }
        $rbArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", $rollbackReportPath, "-TargetDirectory", $targetDir, "-Force")
        $swRb = [System.Diagnostics.Stopwatch]::StartNew()
        $rbRes = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments $rbArgs -EnvironmentVariables $rbEnv -TimeoutSeconds 300
        $swRb.Stop()
        $reportData.durations.rollbackMs = $swRb.ElapsedMilliseconds
        $rollbackExit = $rbRes.ExitCode
        if ($rbRes.StdOut) { Write-InfoLog $rbRes.StdOut }
        if ($rbRes.StdErr) { Write-WarnLog $rbRes.StdErr }
    } catch {
        $rollbackExit = 1
        $reportData.error = Sanitize-LogText "Rollback invocation error: $_"
    }

    # Verify disk report state to prevent false ROLLBACK_SUCCESS
    if (Test-Path -LiteralPath $rollbackReportPath) {
        try {
            $diskReport = Get-Content -LiteralPath $rollbackReportPath -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($diskReport.stateMachine -eq "MANUAL_RECOVERY_REQUIRED" -or $diskReport.result -eq "MANUAL_RECOVERY_REQUIRED") {
                $rollbackExit = 1
            }
        } catch {}
    }

    if ($rollbackExit -eq 0) {
        $reportData.stateMachine = "ROLLBACK_SUCCESS"
        $reportData.result = "ROLLBACK_SUCCESS"
        Save-Report $backupDir
        Write-SuccessLog "Automatic rollback completed successfully. Application restored to previous state."
    } else {
        $reportData.stateMachine = "MANUAL_RECOVERY_REQUIRED"
        $reportData.result = "MANUAL_RECOVERY_REQUIRED"
        if (-not $reportData.error) {
            $reportData.error = "Rollback tool failed or exited with non-zero exit code ($rollbackExit)."
        }
        Save-Report $backupDir
        Write-FailureLog "CRITICAL: Manual recovery required: $($reportData.error)"
    }

    Save-Report $backupDir
    exit 1
} finally {
    if ($stagedRuntimeDir -and (Test-Path -LiteralPath $stagedRuntimeDir) -and $hasRuntimeZip) {
        Remove-Item -LiteralPath $stagedRuntimeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
