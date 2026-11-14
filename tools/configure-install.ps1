param([switch]$MigrateOnly, [switch]$NoPause, [switch]$FreshDatabase)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
if (Get-Command chcp.com -ErrorAction SilentlyContinue) { & chcp.com 65001 > $null }

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stage = 'Checking prerequisites'
$logPath = Join-Path $root 'configuration-status.log'

trap {
    $failure = "Configuration failed at: $stage. Error: $($_.Exception.Message)"
    $failure | Set-Content -LiteralPath $logPath -Encoding UTF8
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host $failure -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
    if (-not $NoPause) {
        Read-Host "Press Enter to close"
    }
    exit 1
}

'Configuration started' | Set-Content -LiteralPath $logPath -Encoding UTF8

function Read-Required([string]$Prompt, [string]$Default = '') {
    $suffix = if ($Default) { " [$Default]" } else { '' }
    $value = Read-Host "$Prompt$suffix"
    if (-not $value) { $value = $Default }
    if (-not $value) { throw "$Prompt is required" }
    return $value.Trim()
}

function Create-DesktopShortcut([string]$AppDir) {
    try {
        $wsh = New-Object -ComObject WScript.Shell
        $desktops = @(
            $wsh.SpecialFolders.Item("Desktop"),
            $wsh.SpecialFolders.Item("AllUsersDesktop")
        )
        foreach ($desk in $desktops) {
            if ($desk -and (Test-Path $desk)) {
                $lnkPath = Join-Path $desk "DawaCore.lnk"
                $shortcut = $wsh.CreateShortcut($lnkPath)
                $targetBat = Join-Path $AppDir "start-dawacore-server.bat"
                if (-not (Test-Path $targetBat)) {
                    $targetBat = Join-Path $AppDir "start-dawacore.bat"
                }
                $shortcut.TargetPath = $targetBat
                $shortcut.WorkingDirectory = $AppDir
                $shortcut.Description = "DawaCore Pharmacy POS & ERP System"
                $shortcut.WindowStyle = 1
                $icoPath = Join-Path $AppDir "frontend\public\favicon.ico"
                if (Test-Path $icoPath) {
                    $shortcut.IconLocation = "$icoPath, 0"
                } else {
                    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll, 43"
                }
                $shortcut.Save()
            }
        }
        Write-Host "[OK] Desktop shortcut 'DawaCore' created successfully." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not create desktop shortcut: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Create desktop shortcut immediately so it is always available on the desktop
Create-DesktopShortcut -AppDir $root

# 1. Auto-detect Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodeCandidates = @(
        'C:\Program Files\nodejs\node.exe',
        'C:\DawaCore\Runtime\node\node.exe',
        'C:\DawaCore\Runtime\nodejs\node.exe',
        'C:\DawaCore-New\Runtime\node\node.exe',
        'C:\DawaCore-New\Runtime\nodejs\node.exe'
    )
    $nodePath = $nodeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if ($nodePath) {
        $env:PATH = "$(Split-Path -Parent $nodePath);$env:PATH"
    } else {
        throw 'Node.js is not found. Please install Node.js 20 or newer first.'
    }
}
$nodeVersionText = (& node -p "process.versions.node").Trim()
$nodeVersion = [Version]$nodeVersionText
if ($nodeVersion.Major -lt 18) {
    throw "Unsupported Node.js version $nodeVersionText. Node.js 18 or newer is required."
}
Write-Host "[OK] Node.js v$nodeVersionText detected." -ForegroundColor Green

# 2. Database configuration & prerequisites
$stage = 'Database connection and configuration'
$envFile = Join-Path $root '.env'

# Check if an existing .env can be imported from another DawaCore folder
if (-not (Test-Path $envFile) -and -not $FreshDatabase) {
    $altEnvs = @('E:\DawaCore\.env', 'C:\DawaCore\.env', 'D:\DawaCore\.env')
    foreach ($alt in $altEnvs) {
        if (Test-Path $alt) {
            $resolvedAlt = (Resolve-Path $alt).Path
            $resolvedEnv = (Join-Path $root '.env')
            if ($resolvedAlt -ne $resolvedEnv) {
                Write-Host "Importing existing configuration (.env) from $alt ..." -ForegroundColor Cyan
                Copy-Item $alt $envFile -Force
                break
            }
        }
    }
}

if (-not (Test-Path $envFile)) {
    # .env does NOT exist, so we need to set up the database
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "      DawaCore - PostgreSQL Database Configuration      " -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "Tip: Press Enter to accept the default value in [brackets]." -ForegroundColor Yellow
    Write-Host ""

    # Auto-detect PostgreSQL psql.exe across common locations
    $candidate = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $candidate) {
        $candidate = Get-Item 'C:\DawaCore\Runtime\postgres\bin\psql.exe' -ErrorAction SilentlyContinue
        if (-not $candidate) {
            $candidate = Get-Item 'C:\DawaCore-New\Runtime\postgres\bin\psql.exe' -ErrorAction SilentlyContinue
        }
    }
    if (-not $candidate) {
        $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if (-not $candidate) {
            $candidate = Get-ChildItem 'C:\Program Files (x86)\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
        }
        if (-not $candidate) {
            $candidate = Get-ChildItem 'C:\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
        }
        if (-not $candidate) {
            $candidate = Get-ChildItem 'D:\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
        }
        if (-not $candidate) {
            $candidate = Get-ChildItem 'E:\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
                Sort-Object FullName -Descending | Select-Object -First 1
        }
    }

    $psqlPath = $null
    if ($candidate) {
        $psqlPath = if ($candidate.FullName) { $candidate.FullName } else { $candidate.Source }
        $pgBin = Split-Path -Parent $psqlPath
        $env:PATH = "$pgBin;$env:PATH"
        Write-Host "[OK] PostgreSQL client detected: $psqlPath" -ForegroundColor Green
    }

    if ($psqlPath) {
        $pgHost = Read-Required 'PostgreSQL host' 'localhost'
        $pgPort = Read-Required 'PostgreSQL port' '5432'
        $pgAdmin = Read-Required 'PostgreSQL superuser' 'postgres'
        $adminPassword = Read-Required 'PostgreSQL password (your postgres password)' 'rami'
        $appDb = Read-Required 'Application database name' $(if ($FreshDatabase) { 'dawacore_clean' } else { 'dawacore' })
        $appUser = Read-Required 'Application database user' 'dawacore_app'
        $appPort = Read-Required 'Application port' $(if ($FreshDatabase) { '3003' } else { '3002' })

        if ($appDb -notmatch '^[a-zA-Z][a-zA-Z0-9_]{0,62}$' -or $appUser -notmatch '^[a-zA-Z][a-zA-Z0-9_]{0,62}$') {
            throw 'Database and user names may contain only letters, digits and underscore.'
        }

        # Generate a clean alphanumeric password for the app DB user
        $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        $rng = New-Object System.Random
        $appPassword = -join (1..24 | ForEach-Object { $chars[$rng.Next(0, $chars.Length)] })

        $previousPgPassword = $env:PGPASSWORD
        $env:PGPASSWORD = $adminPassword
        try {
            Write-Host "Testing connection to PostgreSQL at ${pgHost}:${pgPort}..." -ForegroundColor Cyan
            $testConn = & $psqlPath -X -w -A -t -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "SELECT 1" 2>&1
            if ($LASTEXITCODE -ne 0) {
                throw "PostgreSQL connection failed. Please check that PostgreSQL service is running and the password for '$pgAdmin' is correct."
            }
            Write-Host "[OK] Connected to PostgreSQL successfully." -ForegroundColor Green

            $existingRole = & $psqlPath -X -w -A -t -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "SELECT count(*) FROM pg_roles WHERE rolname = '$appUser'"
            if (($existingRole | Select-Object -Last 1).Trim() -eq '0') {
                Write-Host "Creating database user '$appUser'..." -ForegroundColor Yellow
                $roleSql = "CREATE ROLE ""$appUser"" WITH LOGIN PASSWORD '$appPassword' CREATEDB;"
                & $psqlPath -X -w -v ON_ERROR_STOP=1 -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "$roleSql"
                if ($LASTEXITCODE -ne 0) { throw 'Could not create the application database user.' }
            } else {
                Write-Host "Updating password for existing database user '$appUser'..." -ForegroundColor Yellow
                $alterSql = "ALTER ROLE ""$appUser"" WITH LOGIN PASSWORD '$appPassword' CREATEDB;"
                & $psqlPath -X -w -v ON_ERROR_STOP=1 -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "$alterSql"
            }

            $existingDb = & $psqlPath -X -w -A -t -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "SELECT count(*) FROM pg_database WHERE datname = '$appDb'"
            if (($existingDb | Select-Object -Last 1).Trim() -eq '0') {
                Write-Host "Creating database '$appDb'..." -ForegroundColor Yellow
                $dbSql = "CREATE DATABASE ""$appDb"" OWNER ""$appUser"" ENCODING 'UTF8';"
                & $psqlPath -X -w -v ON_ERROR_STOP=1 -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "$dbSql"
                if ($LASTEXITCODE -ne 0) { throw 'Could not create the application database.' }
            } else {
                Write-Host "Database '$appDb' already exists. Assigning ownership to '$appUser'..." -ForegroundColor Yellow
                $dbSql = "ALTER DATABASE ""$appDb"" OWNER TO ""$appUser"";"
                & $psqlPath -X -w -h $pgHost -p $pgPort -U $pgAdmin -d postgres -c "$dbSql"
                & $psqlPath -X -w -h $pgHost -p $pgPort -U $pgAdmin -d $appDb -c "GRANT ALL ON SCHEMA public TO ""$appUser"";"
            }
        } finally {
            $env:PGPASSWORD = $previousPgPassword
            $adminPassword = $null
        }

        $encodedPassword = [Uri]::EscapeDataString($appPassword)
        $jwtBytes = New-Object byte[] 64
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
        $jwtSecret = [Convert]::ToBase64String($jwtBytes)
        @(
            'NODE_ENV=production'
            'HOST=0.0.0.0'
            "PORT=$appPort"
            "DATABASE_URL=postgresql://${appUser}:${encodedPassword}@${pgHost}:${pgPort}/${appDb}?schema=public"
            "DB_USER=$appUser"
            "DB_NAME=$appDb"
            "DB_PORT=$pgPort"
            "JWT_SECRET=$jwtSecret"
            'JWT_EXPIRES_IN=12h'
            'ENABLE_SWAGGER=false'
        ) | Set-Content -LiteralPath $envFile -Encoding UTF8
        Write-Host '[OK] Environment configuration (.env) created.' -ForegroundColor Green
    } else {
        # psql.exe not found automatically: prompt for DATABASE_URL directly
        Write-Host "Notice: psql.exe client was not found in standard paths." -ForegroundColor Yellow
        Write-Host "Enter your PostgreSQL DATABASE_URL (press Enter for default local connection):" -ForegroundColor Cyan
        $dbUrl = Read-Required 'DATABASE_URL' 'postgresql://awad:awad@localhost:5432/dawacore?schema=public'

        $jwtBytes = New-Object byte[] 64
        [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
        $jwtSecret = [Convert]::ToBase64String($jwtBytes)

        @(
            'NODE_ENV=production'
            'HOST=0.0.0.0'
            'PORT=3002'
            "DATABASE_URL=$dbUrl"
            "JWT_SECRET=$jwtSecret"
            'JWT_EXPIRES_IN=12h'
            'ENABLE_SWAGGER=false'
        ) | Set-Content -LiteralPath $envFile -Encoding UTF8
        Write-Host '[OK] Environment configuration (.env) created.' -ForegroundColor Green
    }
} else {
    Write-Host '[OK] Existing configuration (.env) detected.' -ForegroundColor Green
}

# 3. Locate Prisma CLI and apply schema
$stage = 'Applying database schema'
$prismaCli = Join-Path $root 'node_modules\prisma\build\index.js'
if (-not (Test-Path $prismaCli)) {
    # Check if node_modules exists in sibling/candidate directories
    $altPrismas = @(
        'E:\DawaCore\node_modules\prisma\build\index.js',
        'C:\DawaCore\node_modules\prisma\build\index.js',
        'D:\DawaCore\node_modules\prisma\build\index.js'
    )
    foreach ($ap in $altPrismas) {
        if (Test-Path $ap) {
            $prismaCli = $ap
            break
        }
    }
}

if (-not (Test-Path $prismaCli)) {
    throw "node_modules is missing in '$root'. Please run this update in your existing DawaCore installation folder (e.g. E:\DawaCore)."
}

Write-Host 'Applying database schema (Prisma db push)...' -ForegroundColor Cyan
& node $prismaCli db push --skip-generate --accept-data-loss
if ($LASTEXITCODE -ne 0) {
    throw 'Database schema push failed. Please verify that PostgreSQL is running and credentials in .env are correct.'
}
Write-Host '[OK] Database tables and schema are up to date.' -ForegroundColor Green

# 4. Seed initial admin, accounts, fiscal year, and medicines if needed
$stage = 'Initializing administrator and system data'
if (-not $MigrateOnly) {
    $hasAdmin = & node -e "require('dotenv').config();const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.user.count({where:{role:'SUPER_ADMIN'}}).then(n=>console.log(n)).catch(()=>console.log('0')).finally(()=>p.`$disconnect())"
    if (($hasAdmin | Select-Object -Last 1).Trim() -eq '0') {
        Write-Host ""
        Write-Host "========================================================" -ForegroundColor Cyan
        Write-Host "      DawaCore - Pharmacy & Administrator Setup         " -ForegroundColor Cyan
        Write-Host "========================================================" -ForegroundColor Cyan
        $env:BOOTSTRAP_COMPANY_NAME = Read-Required 'Pharmacy / Company Name' 'DawaCore Pharmacy'
        $env:BOOTSTRAP_BRANCH_NAME = Read-Required 'Main Branch Name' 'Main Branch'
        $env:BOOTSTRAP_USERNAME = Read-Required 'Admin Username' 'admin'
        $firstPassword = Read-Required 'Admin Password (min 6 chars)' '123456'
        if ($firstPassword.Length -lt 6) { throw 'Password must be at least 6 characters.' }
        $env:BOOTSTRAP_PASSWORD = $firstPassword
        try {
            & node (Join-Path $root 'tools\bootstrap-admin.cjs')
            if ($LASTEXITCODE -ne 0) { throw 'Administrator and initial data bootstrap failed.' }
        } finally {
            Remove-Item Env:BOOTSTRAP_COMPANY_NAME,Env:BOOTSTRAP_BRANCH_NAME,Env:BOOTSTRAP_USERNAME,Env:BOOTSTRAP_PASSWORD -ErrorAction SilentlyContinue
            $firstPassword = $null
        }
    } else {
        Write-Host '[OK] Administrator and initial system data already exist.' -ForegroundColor Green
    }
}

# 5. Final readiness check
$stage = 'Final readiness check'
if (Test-Path (Join-Path $root 'tools\preflight-offline.cjs')) {
    & node (Join-Path $root 'tools\preflight-offline.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Final readiness check failed.' }
}

Create-DesktopShortcut -AppDir $root

$autoStartScript = Join-Path $root 'tools\enable-autostart-and-backup.ps1'
if (Test-Path $autoStartScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $autoStartScript
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  DawaCore Installation & Configuration Completed!      " -ForegroundColor Green
Write-Host "  Application folder : $root" -ForegroundColor Cyan
Write-Host "  System URL         : http://localhost:3002" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
'Configuration completed successfully' | Set-Content -LiteralPath $logPath -Encoding UTF8
if (-not $NoPause) { Read-Host 'Press Enter to continue and launch DawaCore' }
exit 0
