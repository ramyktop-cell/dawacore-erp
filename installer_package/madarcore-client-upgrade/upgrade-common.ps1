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
    if ([string]::IsNullOrWhiteSpace($filePath) -or -not (Test-Path -LiteralPath $filePath)) { return $null }
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
    if ($env:MADARCORE_LAB_AUTH_TOKEN -and $env:MADARCORE_LAB_ROOT) {
        return $true
    }
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

    $resolvedTarget = (Resolve-Path -LiteralPath $TargetDir -ErrorAction SilentlyContinue)
    $cleanTargetDir = if ($resolvedTarget) { $resolvedTarget.Path } else { $TargetDir }

    # 1. Check Windows Services (Running or starting)
    $services = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue
    foreach ($svc in $services) {
        if ($svc.PathName -and $svc.PathName.IndexOf($cleanTargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            return [PSCustomObject]@{
                Mode            = "WindowsService"
                Name            = $svc.Name
                Executable      = $svc.PathName
                Arguments       = ""
                TargetDirectory = $cleanTargetDir
                ProcessIdentity = $svc.StartName
                Id              = $svc.ProcessId
            }
        }
    }

    # 2. Check Scheduled Tasks by inspecting Actions (Execute / Arguments)
    try {
        $tasks = Get-ScheduledTask -ErrorAction SilentlyContinue
        foreach ($task in $tasks) {
            foreach ($action in $task.Actions) {
                $actStr = "$($action.Execute) $($action.Arguments)"
                if ($actStr -and $actStr.IndexOf($cleanTargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                    $taskPrincipal = if ($task.Principal) { $task.Principal.UserId } else { "" }
                    return [PSCustomObject]@{
                        Mode            = "ScheduledTask"
                        Name            = $task.TaskName
                        Executable      = "$($action.Execute)"
                        Arguments       = "$($action.Arguments)"
                        TargetDirectory = $cleanTargetDir
                        ProcessIdentity = "$taskPrincipal"
                        Id              = 0
                    }
                }
            }
        }
    } catch {}

    # 3. Check Port Connection and Process
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            $cimProc = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
            $cmdLine = if ($cimProc) { $cimProc.CommandLine } else { "" }
            $procPath = if ($cimProc -and $cimProc.ExecutablePath) { $cimProc.ExecutablePath } else { $proc.Path }

            $isTarget = $false
            if ($procPath -and $procPath.IndexOf($cleanTargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $isTarget = $true
            }
            if ($cmdLine -and $cmdLine.IndexOf($cleanTargetDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                $isTarget = $true
            }

            if ($isTarget) {
                return [PSCustomObject]@{
                    Mode            = "ManualProcess"
                    Name            = $proc.ProcessName
                    Executable      = "$procPath"
                    Arguments       = "$cmdLine"
                    TargetDirectory = $cleanTargetDir
                    ProcessIdentity = "$($proc.StartInfo.UserName)"
                    Id              = $proc.Id
                }
            } else {
                return [PSCustomObject]@{
                    Mode            = "ForeignProcess"
                    Name            = $proc.ProcessName
                    Executable      = "$procPath"
                    Arguments       = "$cmdLine"
                    TargetDirectory = ""
                    ProcessIdentity = ""
                    Id              = $proc.Id
                }
            }
        }
    }

    return [PSCustomObject]@{
        Mode            = "None"
        Name            = ""
        Executable      = ""
        Arguments       = ""
        TargetDirectory = $cleanTargetDir
        ProcessIdentity = ""
        Id              = 0
    }
}

function Stop-ApplicationRunMode {
    param(
        [Parameter(Mandatory = $true)][PSCustomObject]$RunModeInfo,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][int]$Port
    )

    if ($RunModeInfo.Mode -eq "ForeignProcess") {
        throw "Port $Port is occupied by a foreign process: $($RunModeInfo.Name) (PID $($RunModeInfo.Id)). Cannot safely terminate."
    }

    if ($RunModeInfo.Mode -eq "WindowsService") {
        if ([string]::IsNullOrWhiteSpace($RunModeInfo.Name)) {
            throw "Cannot stop Windows Service: Service name is null or empty."
        }
        Write-InfoLog "Stopping Windows Service: $($RunModeInfo.Name)..."
        Stop-Service -Name $RunModeInfo.Name -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        return $true
    }

    if ($RunModeInfo.Mode -eq "ScheduledTask") {
        if ([string]::IsNullOrWhiteSpace($RunModeInfo.Name)) {
            throw "Cannot stop Scheduled Task: Task name is null or empty."
        }
        Write-InfoLog "Stopping Scheduled Task: $($RunModeInfo.Name)..."
        Stop-ScheduledTask -TaskName $RunModeInfo.Name -ErrorAction SilentlyContinue
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        return $true
    }

    if ($RunModeInfo.Mode -eq "ManualProcess") {
        Write-InfoLog "Stopping target application process PID $($RunModeInfo.Id)..."
        if ($RunModeInfo.Id -gt 0) {
            Stop-Process -Id $RunModeInfo.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 2
        return $true
    }

    return $false
}

function Start-ApplicationRunMode {
    param(
        [Parameter(Mandatory = $true)][PSCustomObject]$RunModeInfo,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][string]$NodeExe
    )

    if ($RunModeInfo.Mode -eq "WindowsService") {
        if ([string]::IsNullOrWhiteSpace($RunModeInfo.Name)) {
            throw "Cannot start Windows Service: Service name is null or empty."
        }
        Write-InfoLog "Starting Windows Service: $($RunModeInfo.Name)..."
        Start-Service -Name $RunModeInfo.Name
        return $true
    }

    if ($RunModeInfo.Mode -eq "ScheduledTask") {
        if ([string]::IsNullOrWhiteSpace($RunModeInfo.Name)) {
            throw "Cannot start Scheduled Task: Task name is null or empty."
        }
        Write-InfoLog "Starting Scheduled Task: $($RunModeInfo.Name)..."
        Start-ScheduledTask -TaskName $RunModeInfo.Name
        return $true
    }

    Write-InfoLog "Starting target application via Node: $NodeExe dist\main.js..."
    $appMainJs = Join-Path $TargetDir "dist\main.js"
    Start-Process -FilePath $NodeExe -ArgumentList $appMainJs -WorkingDirectory $TargetDir -WindowStyle Hidden
    return $true
}

function Terminate-TargetProcessOnly {
    param(
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][int]$Port
    )

    $runModeInfo = Detect-ApplicationRunMode -TargetDir $TargetDir -Port $Port
    return Stop-ApplicationRunMode -RunModeInfo $runModeInfo -TargetDir $TargetDir -Port $Port
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

function Audit-TargetMigrations {
    param(
        [Parameter(Mandatory = $true)][string]$PsqlExe,
        [Parameter(Mandatory = $true)][PSCustomObject]$DbConn,
        [Parameter(Mandatory = $true)][string]$CandidateMigrationsDir
    )

    $query = "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name;"
    $res = Execute-SqlQuery -PsqlExe $PsqlExe -DbConn $DbConn -Query $query
    if ($res.ExitCode -ne 0) {
        throw "PREFLIGHT_FAILED: Failed to query _prisma_migrations table: $($res.StdErr)"
    }

    $candidateChecksums = Compute-MigrationChecksums -migrationsDir $CandidateMigrationsDir

    $applied = [ordered]@{}
    $seenMigrations = @{}
    $lines = $res.StdOut -split "`r?`n"
    foreach ($line in $lines) {
        $parts = $line -split '\|'
        if ($parts.Count -ge 4) {
            $mName = $parts[0].Trim()
            $mCheck = $parts[1].Trim()
            $finAt = $parts[2].Trim()
            $rollAt = $parts[3].Trim()

            if (-not [string]::IsNullOrWhiteSpace($mName) -and $mName -ne "migration_name" -and $mName -notmatch '^[\s-]+$') {
                if ($seenMigrations.ContainsKey($mName)) {
                    throw "PREFLIGHT_FAILED: Duplicate migration recorded in target database: $mName"
                }
                $seenMigrations[$mName] = $true

                if ([string]::IsNullOrWhiteSpace($finAt) -or (-not [string]::IsNullOrWhiteSpace($rollAt))) {
                    throw "PREFLIGHT_FAILED: Target database contains failed or rolled-back migration: $mName"
                }

                if (-not $candidateChecksums.Contains($mName)) {
                    throw "PREFLIGHT_FAILED: Unknown migration found in target database: $mName"
                }

                if ([string]::IsNullOrWhiteSpace($mCheck)) {
                    throw "PREFLIGHT_FAILED: Empty checksum for migration in target database: $mName"
                }

                $expectedChecksum = $candidateChecksums[$mName]
                if ($mCheck.ToLowerInvariant() -ne $expectedChecksum.ToLowerInvariant()) {
                    throw "PREFLIGHT_FAILED: Checksum mismatch for migration '$mName'. Recorded: '$mCheck', Expected: '$expectedChecksum'."
                }

                $applied[$mName] = $mCheck
            }
        }
    }

    $pending = $candidateChecksums.Keys.Count - $applied.Keys.Count
    if ($pending -lt 0) {
        throw "PREFLIGHT_FAILED: Inconsistent migration state: PendingCount is negative ($pending)."
    }

    return [PSCustomObject]@{
        AppliedCount   = $applied.Keys.Count
        CandidateCount = $candidateChecksums.Keys.Count
        PendingCount   = $pending
        Applied        = $applied
    }
}

function Compare-DeployedPayloadExact {
    param(
        [Parameter(Mandatory = $true)][string]$PayloadDir,
        [Parameter(Mandatory = $true)][string]$TargetDir
    )

    $differences = [System.Collections.Generic.List[string]]::new()

    # Define explicit deployment mappings: source subpath -> target subpath
    # 1. dist -> dist (Whole directory sync)
    # 2. frontend/dist -> frontend/dist (Whole directory sync)
    # 3. prisma/schema.prisma -> prisma/schema.prisma (File)
    # 4. prisma/migrations -> prisma/migrations (Whole directory sync)
    # 5. prisma-runtime -> node_modules/.prisma & node_modules/@prisma (or payload location)

    $directoryMappings = @(
        @{ Source = (Join-Path $PayloadDir "dist"); Target = (Join-Path $TargetDir "dist"); Name = "dist" },
        @{ Source = (Join-Path $PayloadDir "frontend\dist"); Target = (Join-Path $TargetDir "frontend\dist"); Name = "frontend/dist" },
        @{ Source = (Join-Path $PayloadDir "prisma\migrations"); Target = (Join-Path $TargetDir "prisma\migrations"); Name = "prisma/migrations" }
    )

    foreach ($map in $directoryMappings) {
        $sDir = $map.Source
        $tDir = $map.Target
        if (-not (Test-Path -LiteralPath $sDir)) { continue }
        if (-not (Test-Path -LiteralPath $tDir)) {
            $differences.Add("Target directory missing: $($map.Name)")
            continue
        }

        # Check all source files exist in target with identical SHA256
        $sFiles = Get-ChildItem -LiteralPath $sDir -Recurse -File
        $sRelativeMap = @{}
        foreach ($sf in $sFiles) {
            $rel = $sf.FullName.Substring($sDir.Length).TrimStart('\', '/')
            $sRelativeMap[$rel] = $sf.FullName
            $tfPath = Join-Path $tDir $rel
            if (-not (Test-Path -LiteralPath $tfPath)) {
                $differences.Add("Missing target file in $($map.Name): $rel")
            } else {
                $sHash = Calculate-FileSHA256 $sf.FullName
                $tHash = Calculate-FileSHA256 $tfPath
                if ($sHash -ne $tHash) {
                    $differences.Add("Hash mismatch in $($map.Name): $rel (Source=$sHash, Target=$tHash)")
                }
            }
        }

        # Check for stale files in target that do not exist in source
        $tFiles = Get-ChildItem -LiteralPath $tDir -Recurse -File
        foreach ($tf in $tFiles) {
            $rel = $tf.FullName.Substring($tDir.Length).TrimStart('\', '/')
            if (-not $sRelativeMap.ContainsKey($rel)) {
                $differences.Add("Stale file detected in target $($map.Name): $rel")
            }
        }
    }

    # Check schema.prisma
    $sSchema = Join-Path $PayloadDir "prisma\schema.prisma"
    $tSchema = Join-Path $TargetDir "prisma\schema.prisma"
    if (Test-Path -LiteralPath $sSchema) {
        if (-not (Test-Path -LiteralPath $tSchema)) {
            $differences.Add("Missing target prisma/schema.prisma")
        } else {
            $sHash = Calculate-FileSHA256 $sSchema
            $tHash = Calculate-FileSHA256 $tSchema
            if ($sHash -ne $tHash) {
                $differences.Add("Hash mismatch for prisma/schema.prisma")
            }
        }
    }

    # Check candidate Prisma runtime CLI
    $sRuntimeCli = Join-Path $PayloadDir "prisma-runtime\node_modules\prisma\build\index.js"
    if (Test-Path -LiteralPath $sRuntimeCli) {
        $sRuntimeHash = Calculate-FileSHA256 $sRuntimeCli
        # Check if runtime deployed in target node_modules or runtime path
        $tRuntimes = @(
            (Join-Path $TargetDir "node_modules\prisma\build\index.js"),
            (Join-Path $TargetDir "prisma-runtime\node_modules\prisma\build\index.js")
        )
        $matchedRuntime = $false
        foreach ($tr in $tRuntimes) {
            if (Test-Path -LiteralPath $tr) {
                if ((Calculate-FileSHA256 $tr) -eq $sRuntimeHash) {
                    $matchedRuntime = $true
                    break
                }
            }
        }
        if (-not $matchedRuntime) {
            $differences.Add("Candidate Prisma runtime CLI not deployed or modified in target.")
        }
    }

    return [PSCustomObject]@{
        IsIdentical = ($differences.Count -eq 0)
        Differences = $differences
    }
}

function Save-UpgradeReport {
    param(
        [Parameter(Mandatory = $true)][string]$DestDir,
        [Parameter(Mandatory = $true)][PSCustomObject]$ReportData,
        [string]$RunId = ""
    )

    if ([string]::IsNullOrWhiteSpace($DestDir)) {
        throw "Cannot save report: destination directory is null or empty."
    }
    if (-not (Test-Path -LiteralPath $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
    }

    $outPath = Join-Path $DestDir "upgrade-report.json"
    $tmpName = if ($RunId) { "upgrade-report_$RunId.tmp" } else { "upgrade-report_$([Guid]::NewGuid().ToString('N')).tmp" }
    $tmpOutPath = Join-Path $DestDir $tmpName

    try {
        $jsonStr = $ReportData | ConvertTo-Json -Depth 6
        [System.IO.File]::WriteAllText($tmpOutPath, $jsonStr, [System.Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $tmpOutPath -Destination $outPath -Force
        Write-InfoLog "Saved atomic report to: $outPath"
        return $outPath
    } catch {
        if (Test-Path -LiteralPath $tmpOutPath) {
            Remove-Item -LiteralPath $tmpOutPath -Force -ErrorAction SilentlyContinue
        }
        throw "Failed to write upgrade report atomically to $outPath : $_"
    }
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
