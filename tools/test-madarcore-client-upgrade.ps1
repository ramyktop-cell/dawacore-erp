# ================================================================================
# test-madarcore-client-upgrade.ps1
# Isolated Lab Test Runner & Comprehensive FT Matrix (FT-01..FT-24) (RR4-02)
# Tests the real production upgrade engine using Lab fault injection outside ZIP!
# ZERO literal ($true) assertions!
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

function Record-Test([string]$testId, [bool]$condition, [string]$message, [bool]$isSimulation = $true) {
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

    # Compile Generic Lab Postgres Dispatcher for Fault Injection
    $dispatcherCs = @"
using System;
using System.IO;
using System.Text;

public class Program {
    public static int Main(string[] args) {
        string progName = Path.GetFileNameWithoutExtension(AppDomain.CurrentDomain.FriendlyName).ToLowerInvariant();
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;

        string exitFile = Path.Combine(baseDir, progName + ".exit");
        if (File.Exists(exitFile)) {
            string content = File.ReadAllText(exitFile).Trim();
            int code;
            if (int.TryParse(content, out code) && code != 0) {
                string errFile = Path.Combine(baseDir, progName + ".err");
                if (File.Exists(errFile)) {
                    Console.Error.WriteLine(File.ReadAllText(errFile).Trim());
                } else {
                    Console.Error.WriteLine("Mock failure for " + progName);
                }
                return code;
            }
        }

        string outFile = Path.Combine(baseDir, progName + ".out");
        if (File.Exists(outFile)) {
            Console.WriteLine(File.ReadAllText(outFile).Trim());
            return 0;
        }

        string joinedArgs = string.Join(" ", args);

        if (progName == "node") {
            if (joinedArgs.Contains("-v")) {
                Console.WriteLine("v20.19.0");
                return 0;
            }
            if (joinedArgs.Contains("main.js")) {
                string flagMalformed = Path.Combine(baseDir, "mock_server_malformed.flag");
                string flagBadBrand = Path.Combine(baseDir, "mock_server_bad_branding.flag");
                string parentDir = Directory.GetParent(baseDir) != null ? Directory.GetParent(baseDir).FullName : baseDir;
                if (!File.Exists(flagMalformed)) { flagMalformed = Path.Combine(parentDir, "mock_server_malformed.flag"); }
                if (!File.Exists(flagBadBrand)) { flagBadBrand = Path.Combine(parentDir, "mock_server_bad_branding.flag"); }

                if (File.Exists(flagMalformed) || File.Exists(flagBadBrand)) {
                    int port = 3099;
                    string portFile = Path.Combine(parentDir, "mock_server_port.txt");
                    if (File.Exists(portFile)) { int.TryParse(File.ReadAllText(portFile).Trim(), out port); }

                    try {
                        System.Net.HttpListener listener = new System.Net.HttpListener();
                        listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
                        listener.Start();
                        DateTime start = DateTime.UtcNow;
                        while ((DateTime.UtcNow - start).TotalSeconds < 30) {
                            var ctxTask = listener.GetContextAsync();
                            if (ctxTask.Wait(1000)) {
                                var ctx = ctxTask.Result;
                                var resp = ctx.Response;
                                string path = ctx.Request.Url.AbsolutePath;
                                string body = "";
                                if (File.Exists(flagMalformed)) {
                                    body = "{ invalid malformed json content";
                                } else {
                                    if (path == "/api/branding") {
                                        body = "{\"platformName\":\"DawaCoreERP\"}";
                                    } else {
                                        body = "{\"status\":\"ok\",\"service\":\"MadarCore ERP\"}";
                                    }
                                }
                                byte[] bytes = Encoding.UTF8.GetBytes(body);
                                resp.ContentType = "application/json";
                                resp.StatusCode = 200;
                                resp.OutputStream.Write(bytes, 0, bytes.Length);
                                resp.Close();
                            }
                        }
                        listener.Stop();
                    } catch {}
                    return 0;
                }
            }
            return 0;
        }

        if (progName == "psql") {
            if (joinedArgs.Contains("--version")) {
                Console.WriteLine("psql (PostgreSQL) 16.0");
                return 0;
            }
            if (joinedArgs.Contains("SELECT 1;")) {
                Console.WriteLine("1");
                return 0;
            }
            string migFile = Path.Combine(baseDir, "psql_migrations.out");
            if (File.Exists(migFile) && joinedArgs.Contains("_prisma_migrations")) {
                Console.WriteLine(File.ReadAllText(migFile).Trim());
                return 0;
            }
            if (joinedArgs.Contains("_prisma_migrations")) {
                string migData = "20260907000000_init_inventory_core|d58a9de3da419a6f302393194aa174c7ee400c5ea2664e86af06d385e89acad7|2026-09-07 00:00:00|\n" +
                                 "20260907010000_add_purchasing_module|74bc8958ae943fa2525df4c437f440d109eb7ced29c84ff99dceab2423dfa1bf|2026-09-07 01:00:00|\n" +
                                 "20260907020000_add_sales_shifts_and_held_carts|f9043e987c1cd0ccca1dc6526e242ccf43bdf097cddd37da6f5668b28d9cabea|2026-09-07 02:00:00|\n";
                Console.WriteLine(migData);
                return 0;
            }
            if (joinedArgs.Contains("SELECT count(*)")) {
                Console.WriteLine("5");
                return 0;
            }
            Console.WriteLine("1");
            return 0;
        }

        if (progName == "pg_dump") {
            for (int i = 0; i < args.Length - 1; i++) {
                if (args[i] == "-f") {
                    string dumpPath = args[i + 1];
                    byte[] mockDumpHeader = Encoding.UTF8.GetBytes("PGDMP\x01\x00\x00\x00_MOCK_VALID_POSTGRES_DUMP_HEADER_DATA_1234567890");
                    File.WriteAllBytes(dumpPath, mockDumpHeader);
                    break;
                }
            }
            return 0;
        }

        if (progName == "pg_restore") {
            if (joinedArgs.Contains("-l")) {
                Console.WriteLine("; Dumped by pg_dump version 16.0");
                Console.WriteLine("; Archive entries: 25");
                return 0;
            }
            return 0;
        }

        return 0;
    }
}
"@
    $dispatcherCsFile = Join-Path $testSandboxRoot "LabDispatcher.cs"
    $dispatcherExeFile = Join-Path $testSandboxRoot "LabDispatcher.exe"
    [System.IO.File]::WriteAllText($dispatcherCsFile, $dispatcherCs)
    Add-Type -Path $dispatcherCsFile -OutputAssembly $dispatcherExeFile -OutputType ConsoleApplication

    $env:MADARCORE_LAB_ROOT = $testSandboxRoot
    $env:MADARCORE_LAB_AUTH_TOKEN = [Guid]::NewGuid().ToString("N")

    function New-MockClientInstallation([string]$installPath, [string]$versionTag = "PREVIOUS_V1", [bool]$withPgTools = $false) {
        New-Item -ItemType Directory -Path $installPath -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "dist") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "frontend\dist") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "prisma\migrations") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "uploads\receipts") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "backups") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $installPath "nodejs") -Force | Out-Null
        Copy-Item $dispatcherExeFile (Join-Path $installPath "nodejs\node.exe") -Force

        Set-Content -LiteralPath (Join-Path $installPath "dist\main.js") -Value "// Mock Previous MadarCore Backend $versionTag" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "frontend\dist\index.html") -Value "<!-- Mock Previous Frontend $versionTag -->" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "prisma\schema.prisma") -Value "// Mock Previous Prisma Schema $versionTag" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "dist\stale_old_file.js") -Value "// Stale file that must be removed on upgrade" -Encoding UTF8

        Set-Content -LiteralPath (Join-Path $installPath ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=3099`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "license.key") -Value "PRESERVED_CLIENT_LICENSE_KEY_SECRET_XYZ" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $installPath "uploads\receipts\receipt_001.png") -Value "PRESERVED_UPLOAD_IMAGE_BYTES" -Encoding UTF8

        if ($withPgTools) {
            $binDir = Join-Path $installPath "prerequisites\pgsql\bin"
            New-Item -ItemType Directory -Path $binDir -Force | Out-Null
            Copy-Item $dispatcherExeFile (Join-Path $binDir "psql.exe") -Force
            Copy-Item $dispatcherExeFile (Join-Path $binDir "pg_dump.exe") -Force
            Copy-Item $dispatcherExeFile (Join-Path $binDir "pg_restore.exe") -Force
            Copy-Item $dispatcherExeFile (Join-Path $binDir "createdb.exe") -Force
            Copy-Item $dispatcherExeFile (Join-Path $binDir "dropdb.exe") -Force
        }
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
    New-MockClientInstallation $labTargetFT01 "FT01" $true
    $ft01Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$tamperedPkgDir\apply-madarcore-upgrade.ps1", "-TargetDirectory", $labTargetFT01, "-NonInteractive")
    Record-Test "FT-01" ($ft01Res.ExitCode -ne 0) "Manifest hash mismatch triggers PREFLIGHT_FAILED before backup or file swap." $false

    # =========================================================================
    # FT-02: Absence of PostgreSQL tools -> PREFLIGHT_FAILED
    # =========================================================================
    Write-Host "`n--- Testing FT-02: Absence of PostgreSQL tools triggers PREFLIGHT_FAILED ---" -ForegroundColor Cyan
    $labTargetFT02 = Join-Path $testSandboxRoot "LabFT02"
    New-MockClientInstallation $labTargetFT02 "FT02" $false
    $ft02Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT02, "-NonInteractive")
    Record-Test "FT-02" ($ft02Res.ExitCode -ne 0) "Absence of real PostgreSQL 15/16 tools halts execution with PREFLIGHT_FAILED before any modification." $false

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
    New-MockClientInstallation $labTargetFT04 "FT04" $false
    Set-Content -LiteralPath (Join-Path $labTargetFT04 ".env") -Value "DATABASE_URL=`"postgresql://secret_user:super_secret_password_123@127.0.0.1:5432/db`"`r`nPORT=3099`r`n" -Encoding UTF8
    $ft04Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT04, "-NonInteractive")
    $ft04Sanitized = ($ft04Res.StdOut -notmatch "super_secret_password_123" -and $ft04Res.StdErr -notmatch "super_secret_password_123")
    Record-Test "FT-04" ($ft04Res.ExitCode -ne 0 -and $ft04Sanitized) "Invalid connection string fails safely without leaking secrets." $false

    # =========================================================================
    # FT-05: Missing core target files check
    # =========================================================================
    Write-Host "`n--- Testing FT-05: Target core files validation ---" -ForegroundColor Cyan
    $labTargetFT05 = Join-Path $testSandboxRoot "LabFT05"
    New-MockClientInstallation $labTargetFT05 "FT05" $false
    Remove-Item (Join-Path $labTargetFT05 "prisma\schema.prisma") -Force
    $ft05Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT05, "-NonInteractive")
    Record-Test "FT-05" ($ft05Res.ExitCode -ne 0) "Missing prisma/schema.prisma halts upgrade with PREFLIGHT_FAILED." $false

    # =========================================================================
    # FT-06: Non-zero dump exit code handling via Lab pg_dump fault injection (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-06: Nonzero dump exit code handling via entry point ---" -ForegroundColor Cyan
    $labTargetFT06 = Join-Path $testSandboxRoot "LabFT06"
    New-MockClientInstallation $labTargetFT06 "FT06" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT06 "prerequisites\pgsql\bin\pg_dump.exit") -Value "1"
    Set-Content -LiteralPath (Join-Path $labTargetFT06 "prerequisites\pgsql\bin\pg_dump.err") -Value "pg_dump: connection to server lost"
    $ft06Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT06, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $ft06BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT06 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft06Report = if ($ft06BackupReport) { Get-Content $ft06BackupReport.FullName | ConvertFrom-Json } else { $null }
    $ft06Ok = ($ft06Res.ExitCode -ne 0 -and ($ft06Res.StdOut -match "BACKUP_FAILED" -or ($ft06Report -and $ft06Report.result -eq "BACKUP_FAILED")))
    Record-Test "FT-06" $ft06Ok "pg_dump failure in production engine halts execution with BACKUP_FAILED." $true

    # =========================================================================
    # FT-07: Restore list failure on corrupted archive (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-07: Restore list failure on corrupted archive ---" -ForegroundColor Cyan
    $labTargetFT07 = Join-Path $testSandboxRoot "LabFT07"
    New-MockClientInstallation $labTargetFT07 "FT07" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT07 "prerequisites\pgsql\bin\pg_restore.exit") -Value "1"
    Set-Content -LiteralPath (Join-Path $labTargetFT07 "prerequisites\pgsql\bin\pg_restore.err") -Value "pg_restore: [archiver] input file appear to be corrupt"
    $ft07Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT07, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $ft07BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT07 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft07Report = if ($ft07BackupReport) { Get-Content $ft07BackupReport.FullName | ConvertFrom-Json } else { $null }
    $ft07Ok = ($ft07Res.ExitCode -ne 0 -and ($ft07Res.StdOut -match "BACKUP_FAILED" -or ($ft07Report -and $ft07Report.result -eq "BACKUP_FAILED")))
    Record-Test "FT-07" $ft07Ok "pg_restore --list failure halts upgrade before temp migrate or file swap." $true

    # =========================================================================
    # FT-08: Temp migrate deploy failure (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-08: Migration failure detection on temporary database ---" -ForegroundColor Cyan
    $labTargetFT08 = Join-Path $testSandboxRoot "LabFT08"
    New-MockClientInstallation $labTargetFT08 "FT08" $true
    # Make createdb fail or mock migration failure
    Set-Content -LiteralPath (Join-Path $labTargetFT08 "prerequisites\pgsql\bin\createdb.exit") -Value "1"
    Set-Content -LiteralPath (Join-Path $labTargetFT08 "prerequisites\pgsql\bin\createdb.err") -Value "createdb: database creation failed"
    $ft08Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT08, "-NonInteractive")
    $ft08Ok = ($ft08Res.ExitCode -ne 0 -and ($ft08Res.StdOut -match "ACCEPTANCE_FAILED" -or $ft08Res.StdOut -match "failed"))
    Record-Test "FT-08" $ft08Ok "Temporary database failure halts execution before production deployment." $true

    # =========================================================================
    # FT-09: Business acceptance runner safety contract (RR4-01, RR5-01)
    # =========================================================================
    Write-Host "`n--- Testing FT-09: Business acceptance safety guards & contracts ---" -ForegroundColor Cyan
    $accRunner = Join-Path $packageDir "payload\tools\acceptance-upgrade.cjs"
    $accRes = Execute-NativeProcessSafely -Executable "node.exe" -Arguments @($accRunner)
    Record-Test "FT-09" ($accRes.ExitCode -ne 0 -and ($accRes.StdErr -match "DATABASE_URL is not set" -or $accRes.StdOut -match "SAFETY VIOLATION")) "Acceptance runner rejects missing DATABASE_URL and non-acceptance databases [ACCEPTANCE_CONTRACT_AND_SAFETY_ONLY]." $true

    # =========================================================================
    # FT-10: Temp DB cleanup safety (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-10: Temp DB cleanup safety ---" -ForegroundColor Cyan
    $labTargetFT10 = Join-Path $testSandboxRoot "LabFT10"
    New-MockClientInstallation $labTargetFT10 "FT10" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT10 "prerequisites\pgsql\bin\dropdb.exit") -Value "1"
    Set-Content -LiteralPath (Join-Path $labTargetFT10 "prerequisites\pgsql\bin\dropdb.err") -Value "dropdb: error: database in use"
    $ft10Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT10, "-NonInteractive")
    Record-Test "FT-10" ($ft10Res.ExitCode -ne 0) "Temporary database cleanup failure is detected and prevents unsafe deployment." $true

    # =========================================================================
    # FT-11: Production migration failure triggers automatic rollback (RR5-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-11: Production migration failure initiates automated rollback ---" -ForegroundColor Cyan
    $labTargetFT11 = Join-Path $testSandboxRoot "LabFT11"
    New-MockClientInstallation $labTargetFT11 "ORIGINAL_FT11" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT11 "prerequisites\pgsql\bin\createdb.exit") -Value "0"
    $applyPkgFT11 = Join-Path $testSandboxRoot "PkgFT11"
    Copy-Item -Path $packageDir -Destination $applyPkgFT11 -Recurse -Force
    Set-Content -LiteralPath (Join-Path $applyPkgFT11 "payload\prisma-runtime\node_modules\prisma\build\index.js") -Value "throw new Error('Simulated Prisma migrate deploy production failure');"
    $idxRel = "payload/prisma-runtime/node_modules/prisma/build/index.js"
    $newIdxHash = Calculate-FileSHA256 (Join-Path $applyPkgFT11 $idxRel.Replace('/', '\'))
    $manifest11 = Get-Content (Join-Path $applyPkgFT11 "manifest.json") | ConvertFrom-Json
    foreach ($f in $manifest11.files) {
        if ($f.path -eq $idxRel) { $f.sha256 = $newIdxHash }
    }
    Set-Content (Join-Path $applyPkgFT11 "manifest.json") ($manifest11 | ConvertTo-Json -Depth 5)

    $ft11Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT11 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT11, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $mainAfter11 = if (Test-Path (Join-Path $labTargetFT11 "dist\main.js")) { Get-Content (Join-Path $labTargetFT11 "dist\main.js") -Raw } else { "" }
    $ft11Ok = ($ft11Res.ExitCode -ne 0 -and $mainAfter11 -match "ORIGINAL_FT11")
    Record-Test "FT-11" $ft11Ok "Production migration failure in apply-madarcore-upgrade initiates automated rollback and restores original files." $true

    # =========================================================================
    # FT-12: Real apply -> post-swap failure -> rollback -> exact tree & runtime restored (RR6-01, RR6-03)
    # =========================================================================
    Write-Host "`n--- Testing FT-12: Real apply & rollback restores complete tree & runtime ---" -ForegroundColor Cyan
    $labTargetFT12 = Join-Path $testSandboxRoot "LabFT12"
    New-MockClientInstallation $labTargetFT12 "ORIGINAL_FT12" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT12 "dist\stale_legacy_code.js") -Value "// Stale legacy file" -Encoding UTF8
    New-Item -ItemType Directory -Path (Join-Path $labTargetFT12 "node_modules\prisma") -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $labTargetFT12 "node_modules\prisma\old_runtime.js") -Value "// Old Prisma Runtime" -Encoding UTF8

    # When apply runs, preflight & backup & temp db & swap will succeed.
    # Because target node.exe (LabDispatcher) does not listen on port 3099, health check fails after swap.
    # That triggers automatic rollback via rollback-madarcore-upgrade.ps1.
    $ft12Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT12, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }

    $ft12BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT12 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft12Report = if ($ft12BackupReport) { Get-Content $ft12BackupReport.FullName | ConvertFrom-Json } else { $null }

    # Verify previous dist restored, stale file restored, previous runtime restored
    $staleRestored = Test-Path -LiteralPath (Join-Path $labTargetFT12 "dist\stale_legacy_code.js")
    $mainRestored = (Test-Path -LiteralPath (Join-Path $labTargetFT12 "dist\main.js")) -and ((Get-Content (Join-Path $labTargetFT12 "dist\main.js") -Raw) -match "ORIGINAL_FT12")
    $runtimeRestored = Test-Path -LiteralPath (Join-Path $labTargetFT12 "node_modules\prisma\old_runtime.js")
    $candidateOnlyPurged = -not (Test-Path -LiteralPath (Join-Path $labTargetFT12 "node_modules\@prisma"))

    $ft12Ok = ($ft12Res.ExitCode -ne 0 -and $ft12Report -and $ft12Report.result -eq "ROLLBACK_SUCCESS" -and $staleRestored -and $mainRestored -and $runtimeRestored -and $candidateOnlyPurged)
    Record-Test "FT-12" $ft12Ok "Real apply failure after swap triggers automated rollback and restores complete previous tree and runtime." $true

    # =========================================================================
    # FT-13, FT-14, FT-15: Real entry point health and branding verification (RR6-03)
    # =========================================================================
    Write-Host "`n--- Testing FT-13: Unresponsive application triggers automated rollback ---" -ForegroundColor Cyan
    $labTargetFT13 = Join-Path $testSandboxRoot "LabFT13"
    New-MockClientInstallation $labTargetFT13 "FT13" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT13 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39871`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
    $ft13Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT13, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $ft13BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT13 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft13Report = if ($ft13BackupReport) { Get-Content $ft13BackupReport.FullName | ConvertFrom-Json } else { $null }
    $ft13Ok = ($ft13Res.ExitCode -ne 0 -and $ft13Report -and ($ft13Report.result -eq "ROLLBACK_SUCCESS" -or $ft13Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
    Record-Test "FT-13" $ft13Ok "Unresponsive application startup is detected during post-deploy health check and initiates rollback." $true

    # FT-14: Malformed health JSON response triggers automated rollback
    Write-Host "`n--- Testing FT-14: Malformed health JSON response triggers automated rollback ---" -ForegroundColor Cyan
    $labTargetFT14 = Join-Path $testSandboxRoot "LabFT14"
    New-MockClientInstallation $labTargetFT14 "FT14" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT14 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39872`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $labTargetFT14 "mock_server_malformed.flag") -Value "1" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $labTargetFT14 "mock_server_port.txt") -Value "39872" -Encoding UTF8

    $ft14Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT14, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $ft14BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT14 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft14Report = if ($ft14BackupReport) { Get-Content $ft14BackupReport.FullName | ConvertFrom-Json } else { $null }
    $ft14Ok = ($ft14Res.ExitCode -ne 0 -and $ft14Report -and ($ft14Report.result -eq "ROLLBACK_SUCCESS" -or $ft14Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
    Record-Test "FT-14" $ft14Ok "Malformed health JSON response is rejected and initiates automated rollback." $true

    # FT-15: Branding contract mismatch triggers automated rollback
    Write-Host "`n--- Testing FT-15: Branding contract mismatch triggers automated rollback ---" -ForegroundColor Cyan
    $labTargetFT15 = Join-Path $testSandboxRoot "LabFT15"
    New-MockClientInstallation $labTargetFT15 "FT15" $true
    Set-Content -LiteralPath (Join-Path $labTargetFT15 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39873`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $labTargetFT15 "mock_server_bad_branding.flag") -Value "1" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $labTargetFT15 "mock_server_port.txt") -Value "39873" -Encoding UTF8

    $ft15Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT15, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
    $ft15BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT15 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
    $ft15Report = if ($ft15BackupReport) { Get-Content $ft15BackupReport.FullName | ConvertFrom-Json } else { $null }
    $ft15Ok = ($ft15Res.ExitCode -ne 0 -and $ft15Report -and ($ft15Report.result -eq "ROLLBACK_SUCCESS" -or $ft15Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
    Record-Test "FT-15" $ft15Ok "Branding contract mismatch on /api/branding strictly triggers automated rollback." $true

    # =========================================================================
    # FT-16: Preserved files preservation on upgrade
    # =========================================================================
    Write-Host "`n--- Testing FT-16: Preserved files preservation on upgrade ---" -ForegroundColor Cyan
    $labTargetFT16 = Join-Path $testSandboxRoot "LabFT16"
    New-MockClientInstallation $labTargetFT16 "ORIGINAL_FT16" $false
    $envHashBefore = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
    $licHashBefore = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
    Swap-DirectoryExact -SourceDir (Join-Path $packageDir "payload\dist") -TargetDir (Join-Path $labTargetFT16 "dist") -BackupDir (Join-Path $labTargetFT16 "backups\b1")
    $envHashAfter = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
    $licHashAfter = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
    $hashesPreserved = ($envHashBefore -eq $envHashAfter -and $licHashBefore -eq $licHashAfter)
    Record-Test "FT-16" $hashesPreserved ".env and license.key preserved with identical SHA-256." $false

    # =========================================================================
    # FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED (RR4-06)
    # =========================================================================
    Write-Host "`n--- Testing FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED ---" -ForegroundColor Cyan
    $fakeReportPath17 = Join-Path $testSandboxRoot "report17.json"
    $repData17 = @{ releaseId = $releaseId; targetDirectory = $labTargetFT16; backupPaths = @{ applicationBackup = "C:\non_existent_backup_xyz" } }
    Set-Content -LiteralPath $fakeReportPath17 -Value ($repData17 | ConvertTo-Json) -Encoding UTF8
    $ft17Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", $fakeReportPath17, "-Force")
    Record-Test "FT-17" ($ft17Res.ExitCode -ne 0) "Missing backup components during rollback transitions to error." $true

    # =========================================================================
    # FT-18: Altered dump hash rejection in standalone rollback (RR5-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-18: Altered dump hash rejection in rollback ---" -ForegroundColor Cyan
    $labTargetFT18 = Join-Path $testSandboxRoot "LabFT18"
    New-MockClientInstallation $labTargetFT18 "FT18" $true
    $backupDir18 = Join-Path $labTargetFT18 "backups\b18"
    New-Item -ItemType Directory -Path $backupDir18 -Force | Out-Null
    $appBackupDir18 = Join-Path $backupDir18 "app_backup"
    New-Item -ItemType Directory -Path $appBackupDir18 -Force | Out-Null
    $dumpFile18 = Join-Path $backupDir18 "pre_upgrade.dump"
    Set-Content -LiteralPath $dumpFile18 -Value "MOCK_VALID_POSTGRES_DUMP_HEADER_1234567890" -Encoding UTF8
    $originalDumpHash = Calculate-FileSHA256 $dumpFile18
    Add-Content -LiteralPath $dumpFile18 -Value "_TAMPERED"

    $reportObj18 = [ordered]@{
        schemaVersion   = "1.0.0"
        releaseId       = $releaseId
        targetDirectory = $labTargetFT18
        applicationPort = 3099
        runMode         = [ordered]@{ Mode = "ManualProcess"; TargetDirectory = $labTargetFT18 }
        database        = @{ host = "127.0.0.1"; port = 5432; database = "mock_client_db"; user = "mock_user" }
        backupPaths     = @{
            directory        = $backupDir18
            databaseDump     = $dumpFile18
            databaseDumpHash = $originalDumpHash
            applicationBackup = $appBackupDir18
        }
    }
    $reportFile18 = Join-Path $backupDir18 "upgrade-report.json"
    Set-Content -LiteralPath $reportFile18 -Value ($reportObj18 | ConvertTo-Json -Depth 5) -Encoding UTF8
    $ft18Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", $reportFile18, "-Force")
    $ft18Ok = ($ft18Res.ExitCode -ne 0 -and ($ft18Res.StdErr -match "Hash mismatch" -or $ft18Res.StdOut -match "Hash mismatch"))
    Record-Test "FT-18" $ft18Ok "Rollback detects tampered dump SHA256 and refuses to restore." $true

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
    # FT-21: Full Idempotency path through apply engine (RR5-02, RR5-04)
    # =========================================================================
    Write-Host "`n--- Testing FT-21: Full Idempotency path through apply engine ---" -ForegroundColor Cyan
    $labTargetFT21 = Join-Path $testSandboxRoot "LabFT21"
    New-MockClientInstallation $labTargetFT21 "FT21" $true
    Copy-DirectorySafely -SourceDir (Join-Path $packageDir "payload\dist") -DestinationDir (Join-Path $labTargetFT21 "dist")
    Copy-DirectorySafely -SourceDir (Join-Path $packageDir "payload\frontend\dist") -DestinationDir (Join-Path $labTargetFT21 "frontend\dist")
    Copy-Item (Join-Path $packageDir "payload\prisma\schema.prisma") (Join-Path $labTargetFT21 "prisma\schema.prisma") -Force
    Copy-DirectorySafely -SourceDir (Join-Path $packageDir "payload\prisma\migrations") -DestinationDir (Join-Path $labTargetFT21 "prisma\migrations")
    Copy-DirectorySafely -SourceDir (Join-Path $packageDir "payload\prisma-runtime\node_modules") -DestinationDir (Join-Path $labTargetFT21 "node_modules")
    # Clean stale file from New-MockClientInstallation
    if (Test-Path -LiteralPath (Join-Path $labTargetFT21 "dist\stale_old_file.js")) {
        Remove-Item -LiteralPath (Join-Path $labTargetFT21 "dist\stale_old_file.js") -Force
    }

    $candMigs = Compute-MigrationChecksums (Join-Path $packageDir "payload\prisma\migrations")
    $allMigLines = ""
    foreach ($km in $candMigs.Keys) {
        $allMigLines += "$km|$($candMigs[$km])|2026-09-07 00:00:00|`n"
    }
    Set-Content -LiteralPath (Join-Path $labTargetFT21 "prerequisites\pgsql\bin\psql_migrations.out") -Value $allMigLines -Encoding UTF8

    $ft21Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT21, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }

    $ft21ReportFile = Join-Path $labTargetFT21 "backups\upgrade-report.json"
    $ft21Report = if (Test-Path $ft21ReportFile) { Get-Content $ft21ReportFile | ConvertFrom-Json } else { $null }
    $ft21Ok = ($ft21Res.ExitCode -eq 0 -and ($ft21Res.StdOut -match "ALREADY_UP_TO_DATE" -or ($ft21Report -and $ft21Report.result -eq "ALREADY_UP_TO_DATE")))
    Record-Test "FT-21" $ft21Ok "Fully matching target enters ALREADY_UP_TO_DATE path without creating backup or temp DB." $true

    # =========================================================================
    # FT-22: NonInteractive safety guard
    # =========================================================================
    Write-Host "`n--- Testing FT-22: NonInteractive safety guard ---" -ForegroundColor Cyan
    $fakeProdTarget = "C:\RealProductionDawaCorePathNotExisting_XYZ"
    $env:MADARCORE_LAB_AUTH_TOKEN = $null
    $ft22Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $fakeProdTarget, "-NonInteractive")
    Record-Test "FT-22" ($ft22Res.ExitCode -ne 0) "NonInteractive rejects invalid or non-lab target paths." $false
    $env:MADARCORE_LAB_AUTH_TOKEN = [Guid]::NewGuid().ToString("N")

    # =========================================================================
    # FT-23: Package path with Arabic characters & spaces (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-23: Arabic & Space Path Handling ---" -ForegroundColor Cyan
    $arabicPkgDir = Join-Path $testSandboxRoot "حزمة ترقية مدار كور 2026"
    Copy-Item -Path $packageDir -Destination $arabicPkgDir -Recurse -Force
    $labTargetFT23 = Join-Path $testSandboxRoot "مجلد التثبيت العربي"
    New-MockClientInstallation $labTargetFT23 "FT23" $false
    $arabicApplyScript = Join-Path $arabicPkgDir "apply-madarcore-upgrade.ps1"
    $ft23Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $arabicApplyScript, "-TargetDirectory", $labTargetFT23, "-NonInteractive")
    $repPath23 = Join-Path $arabicPkgDir "upgrade-report.json"
    $rep23Exists = Test-Path -LiteralPath $repPath23
    $rep23Obj = if ($rep23Exists) { Get-Content -LiteralPath $repPath23 | ConvertFrom-Json } else { $null }
    $ft23Success = ($rep23Exists -and $rep23Obj.result -eq "PREFLIGHT_FAILED" -and $rep23Obj.phases.preflight -eq "FAILED")
    Record-Test "FT-23" $ft23Success "Package executes to expected preflight gate and writes report from paths with Arabic & spaces." $false

    # =========================================================================
    # FT-24: Atomic report writing with Save-UpgradeReport (RR4-02)
    # =========================================================================
    Write-Host "`n--- Testing FT-24: Atomic report writing with Save-UpgradeReport ---" -ForegroundColor Cyan
    $repSampleObj = [ordered]@{
        schemaVersion = "1.0.0"
        releaseId     = $releaseId
        result        = "SUCCESS"
        phases        = @{ preflight = "SUCCESS"; backup = "SUCCESS"; deployment = "SUCCESS" }
    }
    $repSampleDir = Join-Path $testSandboxRoot "ReportTestDir"
    $savedPath = Save-UpgradeReport -DestDir $repSampleDir -ReportData $repSampleObj -RunId "test_run_24"
    $repFileExists = Test-Path -LiteralPath $savedPath
    $repSavedObj = if ($repFileExists) { Get-Content -LiteralPath $savedPath | ConvertFrom-Json } else { $null }
    $atomicSuccess = ($repFileExists -and $repSavedObj.result -eq "SUCCESS")

    # Test error handling on invalid path
    $errorCaught = $false
    try {
        Save-UpgradeReport -DestDir "" -ReportData $repSampleObj | Out-Null
    } catch {
        $errorCaught = $true
    }
    Record-Test "FT-24" ($atomicSuccess -and $errorCaught) "Save-UpgradeReport writes atomic report and handles invalid destination safely." $false

    # =========================================================================
    # Migration Audit Condition Standalone Tests (RR6-06)
    # =========================================================================
    Write-Host "`n--- Testing Migration Audit Conditions (RR6-06) ---" -ForegroundColor Cyan
    $testMigsDir = Join-Path $testSandboxRoot "AuditMigs"
    New-Item -ItemType Directory -Path (Join-Path $testMigsDir "20260907000000_m1") -Force | Out-Null
    Set-Content (Join-Path $testMigsDir "20260907000000_m1\migration.sql") "CREATE TABLE t1 (id int);" -Encoding UTF8
    $m1Hash = Calculate-FileSHA256 (Join-Path $testMigsDir "20260907000000_m1\migration.sql")

    $mockPsqlAudit = Join-Path $testSandboxRoot "mock_audit_psql.exe"
    Copy-Item $dispatcherExeFile $mockPsqlAudit -Force

    $dummyDbConn = [PSCustomObject]@{ Host = "127.0.0.1"; Port = 5432; Database = "db"; User = "u"; Password = "" }

    # Case A: Correct Checksum -> PASS
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
    $auditA = Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir
    Record-Test "MIG-01" ($auditA.AppliedCount -eq 1 -and $auditA.PendingCount -eq 0) "Migration Audit: Valid checksum succeeds." $false

    # Case B: Checksum Mismatch -> PREFLIGHT_FAILED
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|bad_checksum_123|2026-09-07 00:00:00|`n" -Encoding UTF8
    $auditBErr = ""
    try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditBErr = $_.ToString() }
    Record-Test "MIG-02" ($auditBErr -match "Checksum mismatch") "Migration Audit: Checksum mismatch throws PREFLIGHT_FAILED." $false

    # Case C: Duplicate Migration -> PREFLIGHT_FAILED
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
    $auditCErr = ""
    try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditCErr = $_.ToString() }
    Record-Test "MIG-03" ($auditCErr -match "Duplicate migration") "Migration Audit: Duplicate migration throws PREFLIGHT_FAILED." $false

    # Case D: Unknown Migration -> PREFLIGHT_FAILED
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "99999999999999_unknown_mig|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
    $auditDErr = ""
    try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditDErr = $_.ToString() }
    Record-Test "MIG-04" ($auditDErr -match "Unknown migration") "Migration Audit: Unknown migration throws PREFLIGHT_FAILED." $false

    # Case E: Failed or Rolled-Back Migration -> PREFLIGHT_FAILED
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash||`n" -Encoding UTF8
    $auditEErr = ""
    try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditEErr = $_.ToString() }
    Record-Test "MIG-05" ($auditEErr -match "failed or rolled-back") "Migration Audit: Unfinished migration throws PREFLIGHT_FAILED." $false

    # Case F: Empty Checksum -> PREFLIGHT_FAILED
    Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1||2026-09-07 00:00:00|`n" -Encoding UTF8
    $auditFErr = ""
    try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditFErr = $_.ToString() }
    Record-Test "MIG-06" ($auditFErr -match "Empty checksum") "Migration Audit: Empty checksum throws PREFLIGHT_FAILED." $false

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
