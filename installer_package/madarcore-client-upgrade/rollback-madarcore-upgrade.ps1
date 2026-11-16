# ================================================================================
# rollback-madarcore-upgrade.ps1
# سكريبت الاستعادة والتراجع المستقل والآمن لحزمة ترقية MadarCore (RR3-10)
# ================================================================================

param(
    [string]$ReportPath,
    [string]$TargetDirectory,
    [switch]$Force
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "upgrade-common.ps1")

Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  MadarCore Client Upgrade - أداة التراجع والاستعادة اليدوية المستقلة  " -ForegroundColor Magenta
Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host ""

# 1. التحقق من الصلاحيات
if (-not (Test-AdminPrivileges)) {
    Write-FailureLog "يتطلب التراجع تشغيل PowerShell كمسؤول (Administrator)."
    exit 1
}

# 2. قراءة وتحقق مسار التقرير
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
    $inputReport = Read-Host "أدخل مسار ملف تقرير الترقية (upgrade-report.json)"
    $ReportPath = $inputReport.Trim().Trim('"')
}

if (-not (Test-Path -LiteralPath $ReportPath)) {
    Write-FailureLog "ملف التقرير غير موجود: $ReportPath"
    exit 1
}

$report = Get-Content -LiteralPath $ReportPath -Encoding UTF8 | ConvertFrom-Json
if ($report.releaseId -ne "MadarCore-Client-Upgrade-20261116") {
    Write-FailureLog "ملف التقرير لا يطابق هذه الحزمة (Release ID mismatch): $($report.releaseId)"
    exit 1
}

# 3. التحقق من تطابق المسار المستهدف (Canonical Target Binding)
$canonicalReportTarget = (Resolve-Path -LiteralPath $report.targetDirectory -ErrorAction SilentlyContinue)
if (-not $canonicalReportTarget) {
    Write-FailureLog "المسار المستهدف المسجل في التقرير غير صالح: $($report.targetDirectory)"
    exit 1
}
$canonicalReportTarget = $canonicalReportTarget.Path

if (-not [string]::IsNullOrWhiteSpace($TargetDirectory)) {
    $canonicalTarget = (Resolve-Path -LiteralPath $TargetDirectory -ErrorAction SilentlyContinue)
    if (-not $canonicalTarget -or $canonicalTarget.Path -ne $canonicalReportTarget) {
        Write-FailureLog "SAFETY VIOLATION: TargetDirectory ($TargetDirectory) does not match report target ($canonicalReportTarget)."
        exit 1
    }
}
$resolvedTarget = $canonicalReportTarget

# Backup path containment check
$backupDir = $report.backupPaths.directory
if (-not $backupDir -or -not (Test-Path -LiteralPath $backupDir) -or -not $backupDir.StartsWith($resolvedTarget, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-FailureLog "SAFETY VIOLATION: Backup directory is invalid or not contained within target: $backupDir"
    exit 1
}

Write-InfoLog "المسار المستهدف للاستعادة: $resolvedTarget"
Write-InfoLog "قاعدة البيانات المسجلة: $($report.database.database)"

# 4. التأكيد الصارم
if (-not $Force) {
    Write-Host ""
    Write-Host "تحذير: سيتم التراجع عن ترقية MadarCore واستعادة ملفات النسخة السابقة وقاعدة البيانات المسجلة في التقرير." -ForegroundColor Yellow
    Write-Host "للتأكيد والمتابعة، اكتب حرفياً العبارة التالية:" -ForegroundColor Yellow
    Write-Host "ROLLBACK MADARCORE UPGRADE" -ForegroundColor White
    $confirm = Read-Host
    if ($confirm -ne "ROLLBACK MADARCORE UPGRADE") {
        Write-WarnLog "تم إلغاء عملية التراجع بطلب من المستخدم."
        exit 0
    }
}

# 5. إيقاف التطبيق الحالي إذا كان قيد التشغيل
$appPort = if ($report.applicationPort) { [int]$report.applicationPort } else { 3002 }
try {
    Terminate-TargetProcessOnly -TargetDir $resolvedTarget -Port $appPort | Out-Null
} catch {
    Write-WarnLog "تحذير أثناء إيقاف العملية السابقة: $_"
}

# 6. استعادة ملفات التطبيق بتقنية Exact Swap
$appBackupDir = $report.backupPaths.applicationBackup
if ($appBackupDir -and (Test-Path -LiteralPath $appBackupDir)) {
    Write-InfoLog "جاري استعادة ملفات التطبيق من: $appBackupDir..."

    $distSrc = Join-Path $appBackupDir "dist"
    if (Test-Path -LiteralPath $distSrc) {
        $currDist = Join-Path $resolvedTarget "dist"
        if (Test-Path -LiteralPath $currDist) { Remove-Item -LiteralPath $currDist -Recurse -Force }
        Copy-DirectorySafely -SourceDir $distSrc -DestinationDir $currDist
    }

    $frontendSrc = Join-Path $appBackupDir "frontend\dist"
    if (Test-Path -LiteralPath $frontendSrc) {
        $currFront = Join-Path $resolvedTarget "frontend\dist"
        if (Test-Path -LiteralPath $currFront) { Remove-Item -LiteralPath $currFront -Recurse -Force }
        Copy-DirectorySafely -SourceDir $frontendSrc -DestinationDir $currFront
    }

    $prismaSchemaSrc = Join-Path $appBackupDir "prisma\schema.prisma"
    if (Test-Path -LiteralPath $prismaSchemaSrc) {
        Copy-Item -LiteralPath $prismaSchemaSrc -Destination (Join-Path $resolvedTarget "prisma\schema.prisma") -Force
    }

    $prismaMigSrc = Join-Path $appBackupDir "prisma\migrations"
    if (Test-Path -LiteralPath $prismaMigSrc) {
        $currMig = Join-Path $resolvedTarget "prisma\migrations"
        if (Test-Path -LiteralPath $currMig) { Remove-Item -LiteralPath $currMig -Recurse -Force }
        Copy-DirectorySafely -SourceDir $prismaMigSrc -DestinationDir $currMig
    }

    Write-SuccessLog "تمت استعادة ملفات التطبيق بنجاح."
} else {
    Write-FailureLog "مجلد النسخ الاحتياطي لملفات التطبيق غير موجود: $appBackupDir"
    exit 1
}

# 7. استعادة قاعدة البيانات مع التحقق الصارم من Dump SHA256 (RR3-10)
$dbDumpFile = $report.backupPaths.databaseDump
$postgresTools = Discover-PostgresTools -targetDir $resolvedTarget

if ($report.phases.deployment -eq "SUCCESS" -or $report.stateMachine -eq "PRODUCTION_MIGRATED") {
    # If production DB was touched, DB restore is strictly mandatory!
    if (-not $dbDumpFile -or -not (Test-Path -LiteralPath $dbDumpFile)) {
        Write-FailureLog "CRITICAL: Database dump file missing for rollback. State is MANUAL_RECOVERY_REQUIRED."
        exit 1
    }

    $actualDumpHash = Calculate-FileSHA256 $dbDumpFile
    if ($actualDumpHash -ne $report.backupPaths.databaseDumpHash) {
        Write-FailureLog "CRITICAL: Database dump hash mismatch! Expected: $($report.backupPaths.databaseDumpHash), Actual: $actualDumpHash"
        exit 1
    }

    if (-not $postgresTools.pg_restore) {
        Write-FailureLog "CRITICAL: pg_restore is missing. Cannot restore database. State is MANUAL_RECOVERY_REQUIRED."
        exit 1
    }

    # Verify dump archive with pg_restore --list before restoration
    $listRes = Execute-PostgresCommand -Executable $postgresTools.pg_restore -Arguments @("-l", $dbDumpFile) -Password $report.database.password
    if ($listRes.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($listRes.StdOut)) {
        Write-FailureLog "CRITICAL: pg_restore --list failed on dump file. Archive is corrupted. State is MANUAL_RECOVERY_REQUIRED."
        exit 1
    }

    Write-InfoLog "جاري استعادة قاعدة البيانات من النسخة الاحتياطية: $dbDumpFile..."
    $dbMeta = $report.database

    # Validate database name characters
    if ($dbMeta.database -notmatch '^[a-zA-Z0-9_\-]+$') {
        Write-FailureLog "CRITICAL: Invalid database name in report: $($dbMeta.database)"
        exit 1
    }

    # قراءة كلمة المرور من .env للمسار المستهدف
    $envFile = Join-Path $resolvedTarget ".env"
    $dbPass = ""
    if (Test-Path -LiteralPath $envFile) {
        foreach ($line in (Get-Content -LiteralPath $envFile -Encoding UTF8)) {
            if ($line.Trim() -match '^DATABASE_URL\s*=\s*["'']?(.*?)["'']?$') {
                $parsed = Parse-DatabaseConnectionString $matches[1]
                $dbPass = $parsed.Password
                break
            }
        }
    }

    # قطع الاتصالات المفتوحة بالقاعدة قبل الاستعادة
    if ($postgresTools.psql) {
        $disconnectSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$($dbMeta.database)' AND pid <> pg_backend_pid();"
        Execute-PostgresCommand -Executable $postgresTools.psql -Arguments @("-h", $dbMeta.host, "-p", $dbMeta.port.ToString(), "-U", $dbMeta.user, "-d", "postgres", "-c", $disconnectSql) -Password $dbPass | Out-Null
    }

    # تنفيذ الاستعادة بـ pg_restore
    $restoreArgs = @(
        "-h", $dbMeta.host,
        "-p", $dbMeta.port.ToString(),
        "-U", $dbMeta.user,
        "-d", $dbMeta.database,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        $dbDumpFile
    )
    $restoreRes = Execute-PostgresCommand -Executable $postgresTools.pg_restore -Arguments $restoreArgs -Password $dbPass
    if ($restoreRes.ExitCode -ne 0) {
        Write-FailureLog "فشلت استعادة قاعدة البيانات. رمز الخطأ: $($restoreRes.ExitCode)"
        Write-FailureLog $restoreRes.StdErr
        Write-FailureLog "CRITICAL: Database restore failed. State is MANUAL_RECOVERY_REQUIRED."
        exit 1
    }

    # Verify table counts against baseline
    $baselineCounts = if ($report.backupPaths.tableCountsBefore) { $report.backupPaths.tableCountsBefore } elseif ($report.restoreComparison.baseline) { $report.restoreComparison.baseline } else { $null }
    if ($baselineCounts -and $postgresTools.psql) {
        $dbConnObj = [PSCustomObject]@{
            Host     = $dbMeta.host
            Port     = $dbMeta.port
            User     = $dbMeta.user
            Password = $dbPass
            Database = $dbMeta.database
        }
        $restoredCounts = Get-DatabaseTableCounts -PsqlExe $postgresTools.psql -DbConn $dbConnObj
        foreach ($k in $baselineCounts.PSObject.Properties.Name) {
            $expected = $baselineCounts.$k
            $actual = $restoredCounts[$k]
            if ($expected -ge 0 -and $actual -ne $expected) {
                Write-FailureLog "CRITICAL: Table count mismatch for $k after rollback restore. Expected: $expected, Actual: $actual. State is MANUAL_RECOVERY_REQUIRED."
                exit 1
            }
        }
    }

    Write-SuccessLog "تمت استعادة قاعدة البيانات ومطابقة عدد الجداول بنجاح."
}

# 8. استعادة نمط التشغيل والتحقق من صحة التطبيق السابق (RR4-05, RR4-06)
$nodeExe = Discover-Node -targetDir $resolvedTarget
$runModeRecorded = if ($report.runMode) { $report.runMode } else { "ManualProcess" }
$runModeObj = [PSCustomObject]@{
    Mode = $runModeRecorded
    Name = ""
    Id   = 0
}

Write-InfoLog "جاري إعادة تشغيل التطبيق بالنمط المسجل: $runModeRecorded..."
Start-ApplicationRunMode -RunModeInfo $runModeObj -TargetDir $resolvedTarget -NodeExe $nodeExe | Out-Null
Start-Sleep -Seconds 3

# Verify previous health
$healthVerified = $false
$healthUrl = "http://127.0.0.1:$appPort/api/health"
for ($i = 0; $i -lt 15; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) {
            $hObj = $resp.Content | ConvertFrom-Json
            if ($hObj -and ($hObj.status -eq 'ok' -or $resp.Content -match 'MadarCore')) {
                $healthVerified = $true
                break
            }
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $healthVerified) {
    Write-FailureLog "CRITICAL: Application failed to respond to health check after rollback. State is MANUAL_RECOVERY_REQUIRED."
    exit 1
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Green
Write-Host "  اكتملت عملية التراجع بنجاح. تم استعادة الملفات وقاعدة البيانات ونمط التشغيل السابق.  " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
exit 0
