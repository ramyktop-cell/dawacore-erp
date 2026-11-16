# ================================================================================
# upgrade-common.ps1
# دوال المساعدة، الاستكشاف، فحص الحزم، والتنفيذ الآمن للأوامر
# ================================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-InfoLog([string]$msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Write-SuccessLog([string]$msg) {
    Write-Host "[SUCCESS] $msg" -ForegroundColor Green
}

function Write-WarnLog([string]$msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Write-FailureLog([string]$msg) {
    Write-Host "[ERROR] $msg" -ForegroundColor Red
}

function Sanitize-LogText([string]$text) {
    if ([string]::IsNullOrEmpty($text)) { return "" }
    # Redact passwords in connection strings: postgresql://user:pass@host -> postgresql://user:***@host
    $sanitized = $text -replace '(?i)(postgresql:\/\/)([^:]+):([^@]+)@', '$1$2:***@'
    # Redact raw password parameters or assignments
    $sanitized = $sanitized -replace '(?i)(password\s*=\s*["'']?)([^"'';\s]+)', '$1***'
    $sanitized = $sanitized -replace '(?i)(PGPASSWORD=)([^\s]+)', '$1***'
    $sanitized = $sanitized -replace '(?i)(JWT_SECRET\s*=\s*["'']?)([^"'';\s]+)', '$1***'
    return $sanitized
}

function Calculate-FileSHA256([string]$filePath) {
    if (-not (Test-Path -LiteralPath $filePath)) { return $null }
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($filePath)
    try {
        $hashBytes = $hasher.ComputeHash($stream)
        return (-join ($hashBytes | ForEach-Object { $_.ToString("x2") }))
    } finally {
        $stream.Close()
        $hasher.Dispose()
    }
}

function Test-AdminPrivileges {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]$identity
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-NodeVersionSupported([string]$versionString) {
    if ([string]::IsNullOrWhiteSpace($versionString)) { return $false }
    # Matches v20.19.0, 20.19, v22.11.0, etc.
    if ($versionString -match 'v?(\d+)\.(\d+)(?:\.(\d+))?') {
        $major = [int]$matches[1]
        $minor = [int]$matches[2]
        if ($major -eq 20 -and $minor -ge 19) { return $true }
        if ($major -eq 22) { return $true }
    }
    return $false
}

function Parse-DatabaseConnectionString([string]$connString) {
    if ([string]::IsNullOrWhiteSpace($connString)) {
        throw "DATABASE_URL is empty or undefined"
    }

    # Format: postgresql://[user[:password]@][netloc][:port][/dbname][?param1=value1&...]
    $pattern = '^postgresql:\/\/(?:([^:]+)(?::([^@]+))?@)?([^:\/]+)(?::(\d+))?\/(.+)$'
    if ($connString -notmatch $pattern) {
        throw "DATABASE_URL connection string format is invalid or unsupported"
    }

    $rawUser = if ($matches[1]) { [System.Uri]::UnescapeDataString($matches[1]) } else { "postgres" }
    $rawPass = if ($matches[2]) { [System.Uri]::UnescapeDataString($matches[2]) } else { "" }
    $hostName = if ($matches[3]) { $matches[3] } else { "localhost" }
    $portNum = if ($matches[4]) { [int]$matches[4] } else { 5432 }
    $dbNameAndQuery = $matches[5]
    $dbName = ($dbNameAndQuery.Split('?'))[0]

    return [PSCustomObject]@{
        User     = $rawUser
        Password = $rawPass
        Host     = $hostName
        Port     = $portNum
        Database = $dbName
    }
}

function Discover-NodeExecutable([string]$targetDir) {
    # 1. Target directory runtime
    $targetNode = Join-Path $targetDir "nodejs\node.exe"
    if (Test-Path -LiteralPath $targetNode) { return $targetNode }

    $targetPrereqNode = Join-Path $targetDir "prerequisites\nodejs\node.exe"
    if (Test-Path -LiteralPath $targetPrereqNode) { return $targetPrereqNode }

    # 2. System PATH
    $cmd = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) { return $cmd.Source }
    if ($cmd -and $cmd.Path -and (Test-Path -LiteralPath $cmd.Path)) { return $cmd.Path }

    # 3. Standard Program Files
    $programFilesNode = "C:\Program Files\nodejs\node.exe"
    if (Test-Path -LiteralPath $programFilesNode) { return $programFilesNode }

    return $null
}

function Discover-PostgresTools([string]$targetDir) {
    $tools = @{
        psql       = $null
        pg_dump    = $null
        pg_restore = $null
        createdb   = $null
        dropdb     = $null
        version    = $null
        major      = 0
    }

    $toolNames = @("psql.exe", "pg_dump.exe", "pg_restore.exe", "createdb.exe", "dropdb.exe")
    $searchRoots = @(
        (Join-Path $targetDir "prerequisites\pgsql\bin"),
        (Join-Path $targetDir "postgresql\bin"),
        "C:\Program Files\PostgreSQL\16\bin",
        "C:\Program Files\PostgreSQL\15\bin",
        "C:\Program Files (x86)\PostgreSQL\16\bin",
        "C:\Program Files (x86)\PostgreSQL\15\bin"
    )

    foreach ($name in $toolNames) {
        $baseName = $name.Replace(".exe", "")
        # Check explicit directories first
        foreach ($root in $searchRoots) {
            $candidate = Join-Path $root $name
            if (Test-Path -LiteralPath $candidate) {
                $tools[$baseName] = $candidate
                break
            }
        }

        # Check PATH if not found
        if (-not $tools[$baseName]) {
            $cmd = Get-Command $name -ErrorAction SilentlyContinue
            if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
                $tools[$baseName] = $cmd.Source
            } elseif ($cmd -and $cmd.Path -and (Test-Path -LiteralPath $cmd.Path)) {
                $tools[$baseName] = $cmd.Path
            }
        }
    }

    # Verify tool versions if psql is present
    if ($tools.psql -and (Test-Path -LiteralPath $tools.psql)) {
        try {
            $vOutput = & $tools.psql --version 2>&1
            if ($vOutput -match '(\d+)(?:\.\d+)?') {
                $majorVer = [int]$matches[1]
                $tools.version = $vOutput.ToString().Trim()
                $tools.major = $majorVer
            }
        } catch {}
    }

    return $tools
}

function Execute-NativeProcessSafely {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $false)][hashtable]$EnvironmentVariables = @{},
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 120,
        [Parameter(Mandatory = $false)][string]$WorkingDirectory = ""
    )

    $startUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Executable
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory) -and (Test-Path -LiteralPath $WorkingDirectory)) {
        $psi.WorkingDirectory = $WorkingDirectory
    }

    if ($psi.PSObject.Properties['ArgumentList'] -and $psi.ArgumentList -ne $null) {
        foreach ($arg in $Arguments) {
            $psi.ArgumentList.Add($arg)
        }
    } else {
        $escapedArgs = @()
        foreach ($arg in $Arguments) {
            if ($arg -match '[\s"]') {
                $escaped = $arg -replace '(\\*)(")', '$1$1\"'
                $escaped = $escaped -replace '(\\+)$', '$1$1'
                $escapedArgs += ('"' + $escaped + '"')
            } else {
                $escapedArgs += $arg
            }
        }
        $psi.Arguments = [string]::Join(" ", $escapedArgs)
    }

    foreach ($k in $EnvironmentVariables.Keys) {
        if ($psi.EnvironmentVariables.ContainsKey($k)) {
            $psi.EnvironmentVariables[$k] = [string]$EnvironmentVariables[$k]
        } else {
            $psi.EnvironmentVariables.Add($k, [string]$EnvironmentVariables[$k])
        }
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    $timedOut = $false
    $stdoutText = ""
    $stderrText = ""

    try {
        $proc.Start() | Out-Null
        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()

        if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
            $timedOut = $true
            try { $proc.Kill() } catch {}
        } else {
            [System.Threading.Tasks.Task]::WaitAll(@($stdoutTask, $stderrTask), 5000)
            $stdoutText = $stdoutTask.Result
            $stderrText = $stderrTask.Result
        }
    } finally {
        $exitCode = if ($timedOut) { -1 } else { $proc.ExitCode }
        $proc.Dispose()
    }

    $endUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

    $sanitizedArgs = ($Arguments | ForEach-Object { Sanitize-LogText $_ }) -join ' '
    return [PSCustomObject]@{
        ExitCode         = $exitCode
        StdOut           = if ($stdoutText) { $stdoutText.Trim() } else { "" }
        StdErr           = if ($stderrText) { $stderrText.Trim() } else { "" }
        TimedOut         = $timedOut
        StartedAtUtc     = $startUtc
        EndedAtUtc       = $endUtc
        SanitizedCommand = "$(Sanitize-LogText $Executable) $sanitizedArgs"
    }
}

function Execute-PostgresCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $false)][string]$Password = "",
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 120
    )

    $envVars = @{}
    if (-not [string]::IsNullOrWhiteSpace($Password)) {
        $envVars["PGPASSWORD"] = $Password
    }

    try {
        return Execute-NativeProcessSafely -Executable $Executable -Arguments $Arguments -EnvironmentVariables $envVars -TimeoutSeconds $TimeoutSeconds
    } finally {
        if ($envVars.ContainsKey("PGPASSWORD")) {
            $envVars["PGPASSWORD"] = $null
        }
    }
}

function Execute-SqlQuery {
    param(
        [Parameter(Mandatory = $true)][string]$PsqlExe,
        [Parameter(Mandatory = $true)][PSCustomObject]$DbConn,
        [Parameter(Mandatory = $true)][string]$Query,
        [string]$TargetDatabase = "",
        [int]$TimeoutSeconds = 60
    )

    $dbToUse = if ([string]::IsNullOrWhiteSpace($TargetDatabase)) { $DbConn.Database } else { $TargetDatabase }
    $argsList = @(
        "-h", $DbConn.Host,
        "-p", $DbConn.Port.ToString(),
        "-U", $DbConn.User,
        "-d", $dbToUse,
        "-t", "-A",
        "-v", "ON_ERROR_STOP=1",
        "-c", $Query
    )

    return Execute-PostgresCommand -Executable $PsqlExe -Arguments $argsList -Password $DbConn.Password -TimeoutSeconds $TimeoutSeconds
}

function Copy-DirectorySafely {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$DestinationDir
    )
    if (-not (Test-Path -LiteralPath $DestinationDir)) {
        New-Item -ItemType Directory -Path $DestinationDir -Force | Out-Null
    }
    Get-ChildItem -LiteralPath $SourceDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $DestinationDir -Recurse -Force
    }
}

function Swap-DirectoryExact {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][string]$BackupDir
    )

    if (Test-Path -LiteralPath $TargetDir) {
        if (-not (Test-Path -LiteralPath $BackupDir)) {
            New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
        }
        Copy-DirectorySafely -SourceDir $TargetDir -DestinationDir $BackupDir
        Remove-Item -LiteralPath $TargetDir -Recurse -Force
    }

    Copy-DirectorySafely -SourceDir $SourceDir -DestinationDir $TargetDir
}

function Detect-ApplicationRunMode {
    param(
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][int]$Port
    )

    # 1. Check Windows Services
    $services = Get-CimInstance Win32_Service -Filter "State = 'Running'" -ErrorAction SilentlyContinue
    foreach ($svc in $services) {
        if ($svc.PathName -and $svc.PathName.IndexOf($TargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return [PSCustomObject]@{
                Mode = "WindowsService"
                Name = $svc.Name
                Id   = $svc.ProcessId
            }
        }
    }

    # 2. Check Port Connection and Process
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
            if (($proc.Path -and $proc.Path.StartsWith($TargetDir, [System.StringComparison]::OrdinalIgnoreCase)) -or
                ($cmdLine -and $cmdLine.IndexOf($TargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
                return [PSCustomObject]@{
                    Mode = "ManualProcess"
                    Name = $proc.ProcessName
                    Id   = $proc.Id
                }
            } else {
                return [PSCustomObject]@{
                    Mode = "ForeignProcess"
                    Name = $proc.ProcessName
                    Id   = $proc.Id
                }
            }
        }
    }

    return [PSCustomObject]@{
        Mode = "None"
        Name = ""
        Id   = 0
    }
}

function Terminate-TargetProcessOnly {
    param(
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $runModeInfo = Detect-ApplicationRunMode -TargetDir $TargetDir -Port $Port
    if ($runModeInfo.Mode -eq "ForeignProcess") {
        throw "Port $Port is occupied by a foreign process: $($runModeInfo.Name) (PID $($runModeInfo.Id)). Cannot safely terminate."
    }

    if ($runModeInfo.Mode -eq "WindowsService") {
        Write-InfoLog "Stopping Windows Service: $($runModeInfo.Name)..."
        Stop-Service -Name $runModeInfo.Name -Force
        Start-Sleep -Seconds 2
        return $true
    }

    if ($runModeInfo.Mode -eq "ManualProcess") {
        Write-InfoLog "Stopping target application process PID $($runModeInfo.Id)..."
        Stop-Process -Id $runModeInfo.Id -Force
        Start-Sleep -Seconds 2
        return $true
    }

    return $false
}

function Compute-MigrationChecksums([string]$migrationsDir) {
    $checksums = [ordered]@{}
    if (-not (Test-Path -LiteralPath $migrationsDir)) { return $checksums }

    Get-ChildItem -LiteralPath $migrationsDir -Directory | Sort-Object Name | ForEach-Object {
        $sqlPath = Join-Path $_.FullName "migration.sql"
        if (Test-Path -LiteralPath $sqlPath) {
            $checksums[$_.Name] = Calculate-FileSHA256 $sqlPath
        }
    }
    return $checksums
}

function Get-DatabaseTableCounts {
    param(
        [Parameter(Mandatory = $true)][string]$PsqlExe,
        [Parameter(Mandatory = $true)][PSCustomObject]$DbConn,
        [string]$TargetDatabase = ""
    )

    $tables = @("Company", "Branch", "User", "Account", "Medicine", "Batch", "Shift", "SaleInvoice")
    $counts = [ordered]@{}
    foreach ($tbl in $tables) {
        $query = "SELECT count(*) FROM `"$tbl`";"
        $res = Execute-SqlQuery -PsqlExe $PsqlExe -DbConn $DbConn -Query $query -TargetDatabase $TargetDatabase
        if ($res.ExitCode -eq 0 -and $res.StdOut -match '^\d+$') {
            $counts[$tbl] = [int]$res.StdOut.Trim()
        } else {
            $counts[$tbl] = -1
        }
    }
    return $counts
}
