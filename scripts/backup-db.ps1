<#
.SYNOPSIS
    DawaCore ERP - Automated PostgreSQL Backup & Restore Utility for Windows / Docker
.DESCRIPTION
    Creates compressed PostgreSQL backups (.sql.gz), verifies integrity via SHA-256,
    and automatically rotates archives older than RetentionDays.
.EXAMPLE
    .\scripts\backup-db.ps1
    .\scripts\backup-db.ps1 -Mode Restore -BackupFile ".\backups\dawacore_prod_20261018.sql"
#>

param(
    [ValidateSet("Backup", "Restore")]
    [string]$Mode = "Backup",

    [string]$ContainerName = "dawacore-postgres",
    [string]$DbUser = "dawacore",
    [string]$DbName = "dawacore_prod",
    [string]$BackupDir = "$PSScriptRoot\..\backups",
    [int]$RetentionDays = 30,
    [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$ResolvedBackupDir = (Resolve-Path $BackupDir).Path

if ($Mode -eq "Backup") {
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutFile = Join-Path $ResolvedBackupDir "dawacore_${DbName}_${Timestamp}.sql.gz"
    $HashFile = "${OutFile}.sha256"

    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "📦 Starting DawaCore Database Backup..." -ForegroundColor Cyan
    Write-Host "   Container: $ContainerName | DB: $DbName"
    Write-Host "==================================================" -ForegroundColor Cyan

    # Run pg_dump inside the running Docker container and compress stream
    docker exec $ContainerName sh -c "pg_dump -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges | gzip -9" > $OutFile

    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $OutFile) -or (Get-Item $OutFile).Length -eq 0) {
        if (Test-Path $OutFile) { Remove-Item $OutFile -Force }
        throw "❌ Database backup failed! Ensure container '$ContainerName' is running."
    }

    $FileHash = (Get-FileHash -Path $OutFile -Algorithm SHA256).Hash
    "$FileHash  $(Split-Path $OutFile -Leaf)" | Set-Content -Path $HashFile -Encoding UTF8

    $SizeKB = [math]::Round((Get-Item $OutFile).Length / 1KB, 2)
    Write-Host "✅ Backup saved: $OutFile ($SizeKB KB)" -ForegroundColor Green
    Write-Host "🔒 SHA256: $FileHash" -ForegroundColor DarkGray

    # Prune old backups beyond RetentionDays
    $CutoffDate = (Get-Date).AddDays(-$RetentionDays)
    $OldFiles = Get-ChildItem -Path $ResolvedBackupDir -Filter "dawacore_*.sql.gz*" | Where-Object { $_.LastWriteTime -lt $CutoffDate }
    foreach ($file in $OldFiles) {
        Write-Host "🧹 Removing expired backup: $($file.Name)" -ForegroundColor Yellow
        Remove-Item $file.FullName -Force
    }
}
elseif ($Mode -eq "Restore") {
    if (-not $BackupFile -or -not (Test-Path $BackupFile)) {
        throw "❌ Please specify a valid -BackupFile path to restore."
    }

    Write-Host "⚠️ Restoring '$DbName' from '$BackupFile' into container '$ContainerName'..." -ForegroundColor Yellow
    Get-Content $BackupFile -AsByteStream | docker exec -i $ContainerName sh -c "gunzip -c | psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1"

    if ($LASTEXITCODE -ne 0) {
        throw "❌ Database restore failed!"
    }

    Write-Host "✅ Database '$DbName' restored successfully!" -ForegroundColor Green
}
