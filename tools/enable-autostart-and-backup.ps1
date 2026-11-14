$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'dist\main.js'))) {
    $root = 'C:\DawaCore'
}
Set-Location $root

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  DawaCore - Configuring Always-On Server & Backups     " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Ensure Backup Directory exists
$backupDir = 'C:\DawaCore_Backups'
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
Write-Host "[1/5] Backup folder ready at: $backupDir" -ForegroundColor Green

# 2. Create Watchdog Server Script (Auto-Restart Loop)
$watchdogPath = Join-Path $root 'dawacore-watchdog.bat'
@(
    '@echo off'
    'cd /d "%~dp0"'
    'set "PATH=C:\Program Files\nodejs;%PATH%"'
    'for /d %%d in ("C:\Program Files\PostgreSQL\*") do ('
    '    if exist "%%d\bin\psql.exe" set "PATH=%%d\bin;%PATH%"'
    ')'
    'set "NODE_ENV=production"'
    'set "HOST=0.0.0.0"'
    'set "PORT=3002"'
    ''
    ':: Take an automatic backup on server boot'
    'node tools\backup-db.cjs >nul 2>&1'
    ''
    ':SERVER_LOOP'
    'node dist\main.js'
    'timeout /t 3 /nobreak >nul'
    'goto SERVER_LOOP'
) | Set-Content -LiteralPath $watchdogPath -Encoding ASCII

# Create silent background launcher so no one accidentally closes the server window
$silentVbs = Join-Path $root 'start-silent-server.vbs'
@(
    'Set WshShell = CreateObject("WScript.Shell")'
    "WshShell.Run chr(34) & `"$watchdogPath`" & chr(34), 0, False"
    'Set WshShell = Nothing'
) | Set-Content -LiteralPath $silentVbs -Encoding ASCII
Write-Host "[2/5] Auto-restart watchdog service created." -ForegroundColor Green

# 3. Register Auto-Start in Windows Startup Folder & Task Scheduler
try {
    $wsh = New-Object -ComObject WScript.Shell
    $startupFolders = @(
        $wsh.SpecialFolders.Item("Startup"),
        $wsh.SpecialFolders.Item("AllUsersStartup")
    )
    foreach ($sf in $startupFolders) {
        if ($sf -and (Test-Path $sf)) {
            $lnk = $wsh.CreateShortcut((Join-Path $sf "DawaCore_AutoStart.lnk"))
            $lnk.TargetPath = "wscript.exe"
            $lnk.Arguments = "`"$silentVbs`""
            $lnk.WorkingDirectory = $root
            $lnk.Description = "DawaCore Always-On Central Server"
            $lnk.Save()
        }
    }
} catch {}

& schtasks.exe /Create /TN "DawaCore_AutoStart_Server" /TR "wscript.exe `"$silentVbs`"" /SC ONLOGON /RL HIGHEST /F | Out-Null
& schtasks.exe /Create /TN "DawaCore_Boot_Server" /TR "`"$watchdogPath`"" /SC ONSTART /RU SYSTEM /F | Out-Null
Write-Host "[3/5] Registered Windows Auto-Start on Boot & Login." -ForegroundColor Green

# 4. Register Automatic Daily Backup at 11:00 PM + Desktop Backup Shortcut
$backupBat = Join-Path $root 'backup-db.bat'
@(
    '@echo off'
    'cd /d "%~dp0"'
    'set "PATH=C:\Program Files\nodejs;%PATH%"'
    'for /d %%d in ("C:\Program Files\PostgreSQL\*") do ('
    '    if exist "%%d\bin\pg_dump.exe" set "PATH=%%d\bin;%PATH%"'
    ')'
    'echo Creating database backup in C:\DawaCore_Backups ...'
    'node tools\backup-db.cjs'
    'echo.'
    'echo All backups are stored in: C:\DawaCore_Backups'
    'pause'
) | Set-Content -LiteralPath $backupBat -Encoding ASCII

& schtasks.exe /Create /TN "DawaCore_Daily_Backup" /TR "cmd.exe /c `"cd /d $root && C:\Program Files\nodejs\node.exe tools\backup-db.cjs`"" /SC DAILY /ST 23:00 /RL HIGHEST /F | Out-Null

try {
    $wsh = New-Object -ComObject WScript.Shell
    $desk = $wsh.SpecialFolders.Item("Desktop")
    if ($desk -and (Test-Path $desk)) {
        $bLnk = $wsh.CreateShortcut((Join-Path $desk "DawaCore Backup.lnk"))
        $bLnk.TargetPath = $backupBat
        $bLnk.WorkingDirectory = $root
        $bLnk.Description = "Create Instant DawaCore Database Backup"
        $bLnk.IconLocation = "$env:SystemRoot\System32\shell32.dll, 165"
        $bLnk.Save()
    }
} catch {}
Write-Host "[4/5] Automatic daily backup configured -> C:\DawaCore_Backups" -ForegroundColor Green

# 5. Open Windows Firewall Port 3002 for all 4 POS Terminals
& netsh advfirewall firewall delete rule name="DawaCore POS Server" >$null 2>&1
& netsh advfirewall firewall add rule name="DawaCore POS Server" dir=in action=allow protocol=TCP localport=3002 profile=any >$null 2>&1
Write-Host "[5/5] Windows Firewall port 3002 opened for POS terminals." -ForegroundColor Green

# Start the background watchdog server right now if not already running
$portActive = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
if (-not $portActive) {
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$silentVbs`""
}

# Take an initial backup right now to verify
& node (Join-Path $root 'tools\backup-db.cjs')

# Detect local IP address for the 4 POS machines
$localIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  CENTRAL SERVER IS NOW CONFIGURED FOR 24/7 OPERATION!  " -ForegroundColor Green
Write-Host "  - Auto-Start on PC Boot   : ENABLED" -ForegroundColor Cyan
Write-Host "  - Auto-Restart on Crash   : ENABLED" -ForegroundColor Cyan
Write-Host "  - Backups Folder          : C:\DawaCore_Backups" -ForegroundColor Yellow
foreach ($ip in $localIps) {
    Write-Host "  - URL for 4 POS Computers : http://${ip}:3002" -ForegroundColor Yellow
}
Write-Host "========================================================" -ForegroundColor Green
