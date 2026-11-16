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
    acceptanceResults = $null
    stateMachine      = "INITIALIZED"
    result            = "PREFLIGHT_FAILED"
    error             = $null
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
    if ($scriptDir.IndexOf("\Temp\", [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or $scriptDir.IndexOf(".zip", [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        throw "SAFETY VIOLATION: Package is running from a temporary or ZIP compressed directory ($scriptDir). Please extract the ZIP archive completely to a normal folder before running."
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
    foreach ($item in $manifest.files) {
        $fullPath = Join-Path $scriptDir ($item.path.Replace('/', '\'))
        if (-not (Test-Path -LiteralPath $fullPath)) {
            throw "Package file missing according to manifest: $($item.path)"
        }
        $h = Calculate-FileSHA256 $fullPath
        if ($h -ne $item.sha256) {
            throw "Hash mismatch for package file: $($item.path)"
        }
    }
    Write-SuccessLog "Package integrity verified."

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

    # 1.8 Verify Candidate Prisma Runtime Closure (RR3-02)
    $payloadDir = Join-Path $scriptDir "payload"
    $candidatePrismaCli = Join-Path $payloadDir "prisma-runtime\node_modules\prisma\build\index.js"
    if (-not (Test-Path -LiteralPath $candidatePrismaCli)) {
        throw "PREFLIGHT_FAILED: Candidate Prisma runtime CLI missing: $candidatePrismaCli"
    }

    # 1.9 Detect Run Mode (RR4-05)
    $runModeInfo = Detect-ApplicationRunMode -TargetDir $targetDir -Port $appPort
    if ($runModeInfo.Mode -eq "ForeignProcess") {
        throw "PREFLIGHT_FAILED: Port $appPort is occupied by foreign process $($runModeInfo.Name) (PID $($runModeInfo.Id))."
    }
    $reportData.runMode = $runModeInfo.Mode
    Write-InfoLog "Detected target application run mode: $($runModeInfo.Mode)"

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

    # 1.11 Full Idempotency Check across all payload assets, migrations, health & branding (RR4-04)
    $isAlreadyUpToDate = $false
    if ($migAudit.PendingCount -eq 0 -and $runModeInfo.Mode -ne "None") {
        $filesMismatch = $false
        Get-ChildItem -LiteralPath (Join-Path $payloadDir "dist") -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring((Join-Path $payloadDir "dist").Length).TrimStart('\', '/')
            $tgt = Join-Path $targetDir "dist\$rel"
            if (-not (Test-Path -LiteralPath $tgt) -or (Calculate-FileSHA256 $_.FullName) -ne (Calculate-FileSHA256 $tgt)) {
                $filesMismatch = $true
            }
        }
        Get-ChildItem -LiteralPath (Join-Path $payloadDir "frontend\dist") -Recurse -File | ForEach-Object {
            $rel = $_.FullName.Substring((Join-Path $payloadDir "frontend\dist").Length).TrimStart('\', '/')
            $tgt = Join-Path $targetDir "frontend\dist\$rel"
            if (-not (Test-Path -LiteralPath $tgt) -or (Calculate-FileSHA256 $_.FullName) -ne (Calculate-FileSHA256 $tgt)) {
                $filesMismatch = $true
            }
        }

        if (-not $filesMismatch) {
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

    # 2.1 File Backup
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
        "CANDIDATE_DIST_DIR"      = (Join-Path $payloadDir "dist")
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
    $reportData.phases.acceptance = "SUCCESS"

    # Second Confirmation before changing production
    if (-not $NonInteractive) {
        Write-Host ""
        Write-Host "Candidate acceptance passed. Type 'DEPLOY APPROVED CANDIDATE' to update production: " -ForegroundColor Yellow
        $conf2 = Read-Host
        if ($conf2 -ne "DEPLOY APPROVED CANDIDATE") {
            $reportData.result = "CANCELLED"
            Write-WarnLog "Deployment cancelled by operator."
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

    Save-Report $backupDir
    exit 1
}

# --------------------------------------------------------------------------------
# Phase 4 & 5: Production Deployment with Exact Directory Swap & Rollback (RR4-05, RR4-06)
# --------------------------------------------------------------------------------
try {
    $reportData.phases.deployment = "IN_PROGRESS"

    # Stop target process safely according to detected run mode
    Write-InfoLog "Stopping target application using run mode $($runModeInfo.Mode)..."
    Stop-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $targetDir -Port $appPort | Out-Null
    $reportData.stateMachine = "PRODUCTION_STOPPED"

    # Apply Prisma Migrations to Production DB using candidate runtime strictly
    Write-InfoLog "Applying prisma migrations to production database using candidate runtime..."
    $prodMigArgs = @($candidatePrismaCli, "migrate", "deploy", "--schema", (Join-Path $payloadDir "prisma\schema.prisma"))
    $prodMigEnv = @{ "DATABASE_URL" = $dbConnStr }
    $prodMigRes = Execute-NativeProcessSafely -Executable $nodeExe -Arguments $prodMigArgs -EnvironmentVariables $prodMigEnv
    if ($prodMigRes.ExitCode -ne 0) {
        throw "Production prisma migrate deploy failed: $($prodMigRes.StdErr)"
    }
    $reportData.stateMachine = "PRODUCTION_MIGRATED"

    # Exact Atomic Directory Swap for dist, frontend/dist, and prisma
    Write-InfoLog "Performing exact directory swap for candidate dist and frontend/dist..."
    Swap-DirectoryExact -SourceDir (Join-Path $payloadDir "dist") -TargetDir (Join-Path $targetDir "dist") -BackupDir (Join-Path $appBackupDir "dist_swap_backup")
    Swap-DirectoryExact -SourceDir (Join-Path $payloadDir "frontend\dist") -TargetDir (Join-Path $targetDir "frontend\dist") -BackupDir (Join-Path $appBackupDir "frontend_dist_swap_backup")
    Copy-Item -LiteralPath (Join-Path $payloadDir "prisma\schema.prisma") -Destination (Join-Path $targetDir "prisma\schema.prisma") -Force
    if (Test-Path -LiteralPath (Join-Path $payloadDir "prisma\migrations")) {
        Swap-DirectoryExact -SourceDir (Join-Path $payloadDir "prisma\migrations") -TargetDir (Join-Path $targetDir "prisma\migrations") -BackupDir (Join-Path $appBackupDir "prisma_migrations_backup")
    }

    $reportData.stateMachine = "FILES_SWAPPED"
    $reportData.phases.deployment = "SUCCESS"

    # --------------------------------------------------------------------------------
    # Phase 6: Post-Deployment Verification (Health Check & Branding) (RR4-05, RR4-06)
    # --------------------------------------------------------------------------------
    $reportData.phases.health = "IN_PROGRESS"
    Write-InfoLog "Restarting target application using run mode $($runModeInfo.Mode)..."

    Start-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $targetDir -NodeExe $nodeExe | Out-Null
    Start-Sleep -Seconds 3
    $reportData.stateMachine = "APPLICATION_RESTARTED"

    # Verify Health & Branding endpoints strictly
    $healthOk = $false
    $brandingOk = $false
    $healthUrl = "http://127.0.0.1:$appPort/api/health"
    $brandingUrl = "http://127.0.0.1:$appPort/api/branding"

    for ($i = 0; $i -lt 15; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                $hObj = $resp.Content | ConvertFrom-Json
                if ($hObj -and $hObj.status -eq 'ok' -and $hObj.service -eq 'MadarCore ERP') {
                    $healthOk = $true
                }
            }

            $bResp = Invoke-WebRequest -Uri $brandingUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($bResp.StatusCode -eq 200) {
                $bObj = $bResp.Content | ConvertFrom-Json
                if ($bObj -and $bObj.platformName -eq 'MadarCore') {
                    $brandingOk = $true
                }
            }

            if ($healthOk -and $brandingOk) { break }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    if (-not $healthOk) {
        throw "Health verification failed: Service did not respond with valid health contract on port $appPort"
    }

    if (-not $brandingOk) {
        throw "Branding verification failed: Service did not respond with MadarCore branding on port $appPort"
    }

    # Verify Preserved Files (.env and license.key)
    $envHashAfter = Calculate-FileSHA256 $envFile
    $licHashAfter = Calculate-FileSHA256 $licenseFile
    if ($envHashAfter -ne $envHashBefore -or $licHashAfter -ne $licHashBefore) {
        throw "Preserved files check failed: .env or license.key modified during deployment."
    }

    $reportData.stateMachine = "POST_DEPLOY_VERIFIED"
    $reportData.phases.health = "SUCCESS"
    $reportData.stateMachine = "SUCCESS"
    $reportData.result = "SUCCESS"
    Save-Report $backupDir
    Write-SuccessLog "MadarCore Client Upgrade finished successfully!"
    exit 0

} catch {
    Write-FailureLog "Deployment failed: $_. Initiating automatic rollback..."
    $reportData.stateMachine = "ROLLBACK_IN_PROGRESS"
    $reportData.result = "DEPLOYMENT_FAILED_ROLLED_BACK"
    $reportData.error = Sanitize-LogText $_.ToString()
    Save-Report $backupDir

    # Stop failed process
    try { Stop-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $targetDir -Port $appPort | Out-Null } catch {}

    # Perform Rollback using rollback-madarcore-upgrade.ps1
    try {
        $rollbackScript = Join-Path $scriptDir "rollback-madarcore-upgrade.ps1"
        & $rollbackScript -ReportPath (Join-Path $backupDir "upgrade-report.json") -TargetDirectory $targetDir -Force
        $reportData.stateMachine = "ROLLBACK_SUCCESS"
        $reportData.result = "ROLLBACK_SUCCESS"
        Write-SuccessLog "Automatic rollback completed successfully. Application restored to previous state."
    } catch {
        $reportData.stateMachine = "MANUAL_RECOVERY_REQUIRED"
        $reportData.result = "MANUAL_RECOVERY_REQUIRED"
        $reportData.error = Sanitize-LogText "Rollback execution error: $_"
        Write-FailureLog "CRITICAL: Manual recovery required: $($reportData.error)"
    }

    Save-Report $backupDir
    exit 1
}
