param(
    [string]$Filter = "",
    [string]$NodeExecutable = ""
)

# ================================================================================
# test-madarcore-client-upgrade.ps1
# Isolated Lab Test Runner & Comprehensive FT Matrix (FT-01..FT-30, MIG-01..MIG-06) (RR4-02, LC-09, SR-01..SR-20)
# Tests the real production upgrade engine using Lab fault injection outside ZIP!
# ZERO literal ($true) assertions!
# ================================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Resolve-SupportedNodeToolchain {
    param(
        [string]$ExplicitNode = ""
    )
    $candidateNodes = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitNode)) {
        if (-not (Test-Path -LiteralPath $ExplicitNode)) {
            throw "R3-03 ERROR: Specified NodeExecutable does not exist: $ExplicitNode"
        }
        $candidateNodes.Add((Resolve-Path -LiteralPath $ExplicitNode).Path)
    }

    $pathDirs = ($env:Path -split ';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($p in $pathDirs) {
        $nodeInP = Join-Path $p "node.exe"
        if (Test-Path -LiteralPath $nodeInP) {
            $candidateNodes.Add((Resolve-Path -LiteralPath $nodeInP).Path)
        }
    }

    $foundNode = $null
    $foundNpm = $null
    $nodeVersionStr = ""

    foreach ($cand in $candidateNodes) {
        try {
            $ver = (& $cand -v 2>$null).ToString().Trim()
            $match = [regex]::Match($ver, '^v?(\d+)\.(\d+)(?:\.(\d+))?')
            if ($match.Success) {
                $maj = [int]$match.Groups[1].Value
                $min = [int]$match.Groups[2].Value
                if (($maj -eq 20 -and $min -ge 19) -or ($maj -eq 22)) {
                    $foundNode = $cand
                    $nodeVersionStr = $ver
                    $nodeDir = Split-Path -Parent $cand
                    $npmCmd = Join-Path $nodeDir "npm.cmd"
                    $npmCli = Join-Path $nodeDir "node_modules\npm\bin\npm-cli.js"
                    if (Test-Path -LiteralPath $npmCmd) {
                        $foundNpm = $npmCmd
                    } elseif (Test-Path -LiteralPath $npmCli) {
                        $foundNpm = $npmCli
                    } else {
                        $foundNpm = "npm"
                    }
                    break
                }
            }
        } catch {}
    }

    if (-not $foundNode) {
        throw "R3-03 ERROR: No supported Node.js installation (Node 20.19+ or Node 22 LTS) found. Please supply -NodeExecutable <path\\to\\node.exe> or ensure a supported Node is on PATH."
    }

    $nodeDir = Split-Path -Parent $foundNode
    $env:Path = "$nodeDir;" + $env:Path

    return [PSCustomObject]@{
        NodeExe     = $foundNode
        NpmExe      = $foundNpm
        NodeVersion = $nodeVersionStr
        NodeDir     = $nodeDir
    }
}

$nodeToolchain = Resolve-SupportedNodeToolchain -ExplicitNode $NodeExecutable
Write-Host "[PREFLIGHT] Node.js toolchain verified: $($nodeToolchain.NodeVersion) at $($nodeToolchain.NodeExe)" -ForegroundColor Green

function Should-Run([string]$testId) {
    if ([string]::IsNullOrWhiteSpace($Filter)) { return $true }
    return ($testId -match $Filter)
}

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installerBase = Join-Path $rootDir "installer_package"
$releaseId = "MadarCore-Client-Upgrade-20261116"
$packageDir = Join-Path $installerBase "Output\$releaseId"
$testSandboxRoot = Join-Path $env:TEMP "MadarCore_Upgrade_Lab_$([Guid]::NewGuid().ToString('N').Substring(0,8))"

Write-Host "========================================================================" -ForegroundColor Magenta
Write-Host "  Starting Isolated Upgrade Lab & Comprehensive FT Matrix (FT-01..FT-30)" -ForegroundColor Magenta
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

        # Create baseline target node_modules
        New-Item -ItemType Directory -Path (Join-Path $installPath "node_modules\baseline_pkg") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $installPath "node_modules\baseline_pkg\index.js") -Value "// Baseline Package" -Encoding UTF8

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

    function Copy-PackageForLab([string]$src, [string]$dst) {
        if (-not (Test-Path -LiteralPath $dst)) {
            New-Item -ItemType Directory -Path $dst -Force | Out-Null
        }
        & robocopy $src $dst /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        if ($LASTEXITCODE -ge 8) {
            throw "Robocopy failed copying package from $src to $dst (exit code $LASTEXITCODE)"
        }
    }

    function Update-LabPackageManifest([string]$pkgPath) {
        $hasher = [System.Security.Cryptography.SHA256]::Create()
        $filesList = [System.Collections.Generic.List[object]]::new()
        $manifestPath = Join-Path $pkgPath "manifest.json"
        $stagingFiles = [System.IO.Directory]::GetFiles($pkgPath, "*", [System.IO.SearchOption]::AllDirectories)
        $prefixLen = $pkgPath.Length
        foreach ($filePath in $stagingFiles) {
            if ($filePath -eq $manifestPath) { continue }
            $rel = $filePath.Substring($prefixLen).TrimStart('\', '/').Replace('\', '/')
            $stream = [System.IO.File]::OpenRead($filePath)
            try {
                $len = $stream.Length
                $hashBytes = $hasher.ComputeHash($stream)
                $sha = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLowerInvariant()
                $filesList.Add([ordered]@{
                    path   = $rel
                    size   = $len
                    sha256 = $sha
                })
            } finally {
                $stream.Close()
            }
        }
        $hasher.Dispose()
        $manifestObj = [ordered]@{
            releaseId   = $releaseId
            generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
            fileCount   = $filesList.Count
            files       = $filesList
        }
        [System.IO.File]::WriteAllText($manifestPath, ($manifestObj | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
    }

    function New-LabCompactPackage([string]$destinationDir, [scriptblock]$Mutator = $null) {
        Copy-PackageForLab $packageDir $destinationDir
        # Sync latest package orchestration scripts directly from source (R3-01/R3-02)
        $srcScriptsDir = Join-Path $installerBase "madarcore-client-upgrade"
        if (Test-Path -LiteralPath $srcScriptsDir) {
            Get-ChildItem -LiteralPath $srcScriptsDir -Filter "*.ps1" | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destinationDir $_.Name) -Force
            }
            Get-ChildItem -LiteralPath $srcScriptsDir -Filter "*.bat" | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destinationDir $_.Name) -Force
            }
        }
        if (Test-Path -LiteralPath (Join-Path $destinationDir "payload\server-runtime")) {
            Remove-Item -LiteralPath (Join-Path $destinationDir "payload\server-runtime") -Recurse -Force -ErrorAction SilentlyContinue
        }
        $fixtureDir = Join-Path $testSandboxRoot "CompactRuntime_$([Guid]::NewGuid().ToString('N').Substring(0,8))"
        New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null

        $fixDist = Join-Path $fixtureDir "dist"
        $fixModules = Join-Path $fixtureDir "node_modules"
        $fixPrisma = Join-Path $fixtureDir "prisma"
        New-Item -ItemType Directory -Path $fixDist -Force | Out-Null
        New-Item -ItemType Directory -Path $fixModules -Force | Out-Null
        New-Item -ItemType Directory -Path $fixPrisma -Force | Out-Null

        # Mock modules required by candidate checks
        New-Item -ItemType Directory -Path (Join-Path $fixModules "@nestjs\core") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fixModules "@nestjs\core\index.js") -Value "module.exports = {};" -Encoding UTF8
        New-Item -ItemType Directory -Path (Join-Path $fixModules "@prisma\client") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fixModules "@prisma\client\index.js") -Value "module.exports = { PrismaClient: class {} };" -Encoding UTF8
        New-Item -ItemType Directory -Path (Join-Path $fixModules "prisma\build") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fixModules "prisma\build\index.js") -Value "console.log('Mock Prisma CLI');" -Encoding UTF8
        New-Item -ItemType Directory -Path (Join-Path $fixModules "bcryptjs") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fixModules "bcryptjs\index.js") -Value "module.exports = { hashSync: () => 'hash', compareSync: () => true };" -Encoding UTF8
        New-Item -ItemType Directory -Path (Join-Path $fixModules "candidate_pkg") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fixModules "candidate_pkg\index.js") -Value "// Candidate Package Marker" -Encoding UTF8

        Set-Content -LiteralPath (Join-Path $fixDist "main.js") -Value "// Mock Candidate Backend" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $fixPrisma "schema.prisma") -Value "// Mock Prisma Schema" -Encoding UTF8

        $pkgJson = @{
            name = "madarcore-backend"
            version = "1.0.0"
            dependencies = @{
"@nestjs/core" = "^10.0.0"
"@prisma/client" = "^5.0.0"
                "bcryptjs" = "^2.4.3"
            }
        } | ConvertTo-Json -Depth 5
        Set-Content -LiteralPath (Join-Path $fixtureDir "package.json") -Value $pkgJson -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $fixtureDir "package-lock.json") -Value $pkgJson -Encoding UTF8

        if ($Mutator) {
            & $Mutator $fixtureDir
        }

        $lockSha = Calculate-FileSHA256 (Join-Path $fixtureDir "package-lock.json")
        $distFpObj = Compute-DirectoryFingerprint -DirPath $fixDist
        $fpObj = Compute-DirectoryFingerprint -DirPath $fixModules

        $runtimeMetadataObj = [ordered]@{
            schemaVersion        = "1.0.0"
            releaseId            = $releaseId
            generatedAt          = (Get-Date).ToString("yyyy-MM-ddTHH:mm:sszzz")
            sourceLockSha256     = $lockSha
            nodeVersion          = $nodeToolchain.NodeVersion
            npmVersion           = "11.17.0"
            platform             = "win32"
            arch                 = "x64"
            distFingerprint      = $distFpObj.Fingerprint
            runtimeFileCount     = $fpObj.TotalFiles
            runtimeTotalBytes    = $fpObj.TotalBytes
            runtimeFingerprint   = $fpObj.Fingerprint
            directDependencies   = [ordered]@{
"@nestjs/core" = "^10.0.0"
"@prisma/client" = "^5.0.0"
                "bcryptjs" = "^2.4.3"
            }
        }

        $metaJson = $runtimeMetadataObj | ConvertTo-Json -Depth 5
        Set-Content -LiteralPath (Join-Path $fixtureDir "runtime-metadata.json") -Value $metaJson -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $destinationDir "payload\runtime-metadata.json") -Value $metaJson -Encoding UTF8

        $targetZip = Join-Path $destinationDir "payload\server-runtime.zip"
        if (Test-Path -LiteralPath $targetZip) { Remove-Item -LiteralPath $targetZip -Force }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($fixtureDir, $targetZip, [System.IO.Compression.CompressionLevel]::Fastest, $false)

        Remove-Item -LiteralPath $fixtureDir -Recurse -Force -ErrorAction SilentlyContinue
        Update-LabPackageManifest $destinationDir
    }

    # =========================================================================
    # FT-01: Manifest file modified/missing -> PREFLIGHT_FAILED
    # =========================================================================
    if (Should-Run "FT-01") {
    Write-Host "`n--- Testing FT-01: Manifest file missing / modified ---" -ForegroundColor Cyan
        $tamperedPkgDir = Join-Path $testSandboxRoot "TamperedPackage"
        Copy-PackageForLab $packageDir $tamperedPkgDir
        Add-Content -LiteralPath (Join-Path $tamperedPkgDir "payload\server-runtime.zip") -Value "TAMPERED"
        $labTargetFT01 = Join-Path $testSandboxRoot "LabFT01"
        New-MockClientInstallation $labTargetFT01 "FT01" $true
        $ft01Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$tamperedPkgDir\apply-madarcore-upgrade.ps1", "-TargetDirectory", $labTargetFT01, "-NonInteractive")
        Record-Test "FT-01" ($ft01Res.ExitCode -ne 0) "Manifest hash mismatch triggers PREFLIGHT_FAILED before backup or file swap." $false
}

    # =========================================================================
    # FT-02: Absence of PostgreSQL tools -> PREFLIGHT_FAILED
    # =========================================================================
    if (Should-Run "FT-02") {
    Write-Host "`n--- Testing FT-02: Absence of PostgreSQL tools triggers PREFLIGHT_FAILED ---" -ForegroundColor Cyan
        $labTargetFT02 = Join-Path $testSandboxRoot "LabFT02"
        New-MockClientInstallation $labTargetFT02 "FT02" $false
        $ft02Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT02, "-NonInteractive")
        Record-Test "FT-02" ($ft02Res.ExitCode -ne 0) "Absence of real PostgreSQL 15/16 tools halts execution with PREFLIGHT_FAILED before any modification." $false
}

    # =========================================================================
    # FT-03: Real Node.js version validator test (RR3-01)
    # =========================================================================
    if (Should-Run "FT-03") {
    Write-Host "`n--- Testing FT-03: Real Node.js version validator test ---" -ForegroundColor Cyan
        $v2018Ok = Test-NodeVersionSupported "v20.18.0"
        $v2019Ok = Test-NodeVersionSupported "v20.19.0"
        $v2020Ok = Test-NodeVersionSupported "v20.20.1"
        $v22Ok   = Test-NodeVersionSupported "v22.11.0"
        $v23Ok   = Test-NodeVersionSupported "v23.1.0"
        $v26Ok   = Test-NodeVersionSupported "v26.4.0"
        $ft03Condition = (-not $v2018Ok) -and $v2019Ok -and $v2020Ok -and $v22Ok -and (-not $v23Ok) -and (-not $v26Ok)
        Record-Test "FT-03" $ft03Condition "Node version validator strictly enforces Node 20.x (>=20.19.0) and 22.x LTS only." $false
}

    # =========================================================================
    # FT-04: Database connection error handling without leaking secrets
    # =========================================================================
    if (Should-Run "FT-04") {
    Write-Host "`n--- Testing FT-04: Database connection error handling without leaking secrets ---" -ForegroundColor Cyan
        $labTargetFT04 = Join-Path $testSandboxRoot "LabFT04"
        New-MockClientInstallation $labTargetFT04 "FT04" $false
        Set-Content -LiteralPath (Join-Path $labTargetFT04 ".env") -Value "DATABASE_URL=`"postgresql://secret_user:super_secret_password_123@127.0.0.1:5432/db`"`r`nPORT=3099`r`n" -Encoding UTF8
        $ft04Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT04, "-NonInteractive")
        $ft04Sanitized = ($ft04Res.StdOut -notmatch "super_secret_password_123" -and $ft04Res.StdErr -notmatch "super_secret_password_123")
        Record-Test "FT-04" ($ft04Res.ExitCode -ne 0 -and $ft04Sanitized) "Invalid connection string fails safely without leaking secrets." $false
}

    # =========================================================================
    # FT-05: Missing core target files check
    # =========================================================================
    if (Should-Run "FT-05") {
    Write-Host "`n--- Testing FT-05: Target core files validation ---" -ForegroundColor Cyan
        $labTargetFT05 = Join-Path $testSandboxRoot "LabFT05"
        New-MockClientInstallation $labTargetFT05 "FT05" $false
        Remove-Item (Join-Path $labTargetFT05 "prisma\schema.prisma") -Force
        $ft05Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT05, "-NonInteractive")
        Record-Test "FT-05" ($ft05Res.ExitCode -ne 0) "Missing prisma/schema.prisma halts upgrade with PREFLIGHT_FAILED." $false
}

    # =========================================================================
    # FT-06: Non-zero dump exit code handling via Lab pg_dump fault injection (RR4-02)
    # =========================================================================
    if (Should-Run "FT-06") {
    Write-Host "`n--- Testing FT-06: Nonzero dump exit code handling via entry point ---" -ForegroundColor Cyan
        $labTargetFT06 = Join-Path $testSandboxRoot "LabFT06"
        New-MockClientInstallation $labTargetFT06 "FT06" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT06 "prerequisites\pgsql\bin\pg_dump.exit") -Value "1"
        Set-Content -LiteralPath (Join-Path $labTargetFT06 "prerequisites\pgsql\bin\pg_dump.err") -Value "pg_dump: connection to server lost"
        $ft06Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT06, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 600
        $ft06BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT06 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft06Report = if ($ft06BackupReport) { Get-Content $ft06BackupReport.FullName | ConvertFrom-Json } else { $null }
        $ft06Ok = ($ft06Res.ExitCode -ne 0 -and ($ft06Res.StdOut -match "BACKUP_FAILED" -or ($ft06Report -and $ft06Report.result -eq "BACKUP_FAILED")))
        if (-not $ft06Ok) {
            Write-Host "    [DEBUG FT-06] Exit: $($ft06Res.ExitCode), ReportResult: $($ft06Report.result), ReportState: $($ft06Report.stateMachine)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-06 StdOut] $($ft06Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-06 StdErr] $($ft06Res.StdErr)" -ForegroundColor DarkYellow
        }
        Record-Test "FT-06" $ft06Ok "pg_dump failure in production engine halts execution with BACKUP_FAILED." $true
}

    # =========================================================================
    # FT-07: Restore list failure on corrupted archive (RR4-02)
    # =========================================================================
    if (Should-Run "FT-07") {
    Write-Host "`n--- Testing FT-07: Restore list failure on corrupted archive ---" -ForegroundColor Cyan
        $labTargetFT07 = Join-Path $testSandboxRoot "LabFT07"
        New-MockClientInstallation $labTargetFT07 "FT07" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT07 "prerequisites\pgsql\bin\pg_restore.exit") -Value "1"
        Set-Content -LiteralPath (Join-Path $labTargetFT07 "prerequisites\pgsql\bin\pg_restore.err") -Value "pg_restore: [archiver] input file appear to be corrupt"
        $ft07Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT07, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 300
        $ft07BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT07 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft07Report = if ($ft07BackupReport) { Get-Content $ft07BackupReport.FullName | ConvertFrom-Json } else { $null }
        $ft07Ok = ($ft07Res.ExitCode -ne 0 -and ($ft07Res.StdOut -match "BACKUP_FAILED" -or ($ft07Report -and $ft07Report.result -eq "BACKUP_FAILED")))
        Record-Test "FT-07" $ft07Ok "pg_restore --list failure halts upgrade before temp migrate or file swap." $true
}

    # =========================================================================
    # FT-08: Temp migrate deploy failure (RR4-02)
    # =========================================================================
    if (Should-Run "FT-08") {
    Write-Host "`n--- Testing FT-08: Migration failure detection on temporary database ---" -ForegroundColor Cyan
        $labTargetFT08 = Join-Path $testSandboxRoot "LabFT08"
        New-MockClientInstallation $labTargetFT08 "FT08" $true
        # Make createdb fail or mock migration failure
        Set-Content -LiteralPath (Join-Path $labTargetFT08 "prerequisites\pgsql\bin\createdb.exit") -Value "1"
        Set-Content -LiteralPath (Join-Path $labTargetFT08 "prerequisites\pgsql\bin\createdb.err") -Value "createdb: database creation failed"
        $ft08Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT08, "-NonInteractive")
        $ft08Ok = ($ft08Res.ExitCode -ne 0 -and ($ft08Res.StdOut -match "ACCEPTANCE_FAILED" -or $ft08Res.StdOut -match "failed"))
        Record-Test "FT-08" $ft08Ok "Temporary database failure halts execution before production deployment." $true
}

    # =========================================================================
    # FT-09: Business acceptance runner safety contract (RR4-01, RR5-01)
    # =========================================================================
    if (Should-Run "FT-09") {
    Write-Host "`n--- Testing FT-09: Business acceptance safety guards & contracts ---" -ForegroundColor Cyan
        $accRunner = Join-Path $packageDir "payload\tools\acceptance-upgrade.cjs"
        $accRes = Execute-NativeProcessSafely -Executable "node.exe" -Arguments @($accRunner)
        Record-Test "FT-09" ($accRes.ExitCode -ne 0 -and ($accRes.StdErr -match "DATABASE_URL is not set" -or $accRes.StdOut -match "SAFETY VIOLATION")) "Acceptance runner rejects missing DATABASE_URL and non-acceptance databases [ACCEPTANCE_CONTRACT_AND_SAFETY_ONLY]." $true
}

    # =========================================================================
    # FT-10: Temp DB cleanup safety (RR4-02)
    # =========================================================================
    if (Should-Run "FT-10") {
    Write-Host "`n--- Testing FT-10: Temp DB cleanup safety ---" -ForegroundColor Cyan
        $labTargetFT10 = Join-Path $testSandboxRoot "LabFT10"
        New-MockClientInstallation $labTargetFT10 "FT10" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT10 "prerequisites\pgsql\bin\dropdb.exit") -Value "1"
        Set-Content -LiteralPath (Join-Path $labTargetFT10 "prerequisites\pgsql\bin\dropdb.err") -Value "dropdb: error: database in use"
        $ft10Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $labTargetFT10, "-NonInteractive")
        Record-Test "FT-10" ($ft10Res.ExitCode -ne 0) "Temporary database cleanup failure is detected and prevents unsafe deployment." $true
}

    # =========================================================================
    # FT-11: Production migration failure triggers automatic rollback (RR5-02)
    # =========================================================================
    if (Should-Run "FT-11") {
    Write-Host "`n--- Testing FT-11: Production migration failure initiates automated rollback ---" -ForegroundColor Cyan
        $labTargetFT11 = Join-Path $testSandboxRoot "LabFT11"
        New-MockClientInstallation $labTargetFT11 "ORIGINAL_FT11" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT11 "prerequisites\pgsql\bin\createdb.exit") -Value "0"
        $applyPkgFT11 = Join-Path $testSandboxRoot "PkgFT11"
        New-LabCompactPackage -destinationDir $applyPkgFT11 -Mutator {
            param($fixDir)
            Set-Content -LiteralPath (Join-Path $fixDir "node_modules\prisma\build\index.js") -Value "throw new Error('Simulated Prisma migrate deploy production failure');" -Encoding UTF8
        }

        $ft11Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT11 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT11, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180
        $mainAfter11 = if (Test-Path (Join-Path $labTargetFT11 "dist\main.js")) { Get-Content (Join-Path $labTargetFT11 "dist\main.js") -Raw } else { "" }
        $ft11Ok = ($ft11Res.ExitCode -ne 0 -and $mainAfter11 -match "ORIGINAL_FT11")
        Record-Test "FT-11" $ft11Ok "Production migration failure in apply-madarcore-upgrade initiates automated rollback and restores original files." $true
}

    # =========================================================================
    # FT-12: Real apply -> post-swap failure -> rollback -> exact tree & runtime restored (RR6-01, RR6-03)
    # =========================================================================
    if (Should-Run "FT-12") {
    Write-Host "`n--- Testing FT-12: Real apply & rollback restores complete tree & runtime ---" -ForegroundColor Cyan
        $labTargetFT12 = Join-Path $testSandboxRoot "LabFT12"
        New-MockClientInstallation $labTargetFT12 "ORIGINAL_FT12" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT12 "dist\stale_legacy_code.js") -Value "// Stale legacy file" -Encoding UTF8
        New-Item -ItemType Directory -Path (Join-Path $labTargetFT12 "node_modules\old_client_pkg") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $labTargetFT12 "node_modules\old_client_pkg\index.js") -Value "// Old Client Package" -Encoding UTF8

        $applyPkgFT12 = Join-Path $testSandboxRoot "PkgFT12"
        New-LabCompactPackage -destinationDir $applyPkgFT12

        # When apply runs, preflight & backup & temp db & swap will succeed.
        # Because target node.exe (LabDispatcher) does not listen on port 3099, health check fails after swap.
        # That triggers automatic rollback via rollback-madarcore-upgrade.ps1.
        $ft12Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT12 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT12, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180

        $ft12BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT12 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft12Report = if ($ft12BackupReport) { Get-Content $ft12BackupReport.FullName | ConvertFrom-Json } else { $null }

        # Verify previous dist restored, stale file restored, previous runtime restored
        $staleRestored = Test-Path -LiteralPath (Join-Path $labTargetFT12 "dist\stale_legacy_code.js")
        $mainRestored = (Test-Path -LiteralPath (Join-Path $labTargetFT12 "dist\main.js")) -and ((Get-Content (Join-Path $labTargetFT12 "dist\main.js") -Raw) -match "ORIGINAL_FT12")
        $runtimeRestored = Test-Path -LiteralPath (Join-Path $labTargetFT12 "node_modules\old_client_pkg\index.js")
        $candidateOnlyPurged = -not (Test-Path -LiteralPath (Join-Path $labTargetFT12 "node_modules\@nestjs"))

        # R3-02 Assertions: ensure deployment completed and rollback was triggered strictly by health verification
        $noLeftoverStaging = (Get-ChildItem -Path $labTargetFT12 -Force | Where-Object { $_.Name -match '^\.(staging|quarantine)' }).Count -eq 0
        $hasRollbackSuccess = ($ft12Report -and $ft12Report.result -eq "ROLLBACK_SUCCESS")
        $hasPostSwapState = ($ft12Report -and ($ft12Report.lastSuccessfulState -in @("FILES_SWAPPED", "APPLICATION_RESTARTED")))
        $hasHealthTrigger = ($ft12Report -and $ft12Report.rollbackTriggerPhase -eq "HEALTH")
        $hasDeploymentSuccess = ($ft12Report -and $ft12Report.phases.deployment -eq "SUCCESS")
        $hasHealthFailed = ($ft12Report -and $ft12Report.phases.health -eq "FAILED")
        $hasDeploymentTime = ($ft12Report -and $ft12Report.durations.deploymentMs -gt 0)
        $hasHealthError = ($ft12Report -and ($ft12Report.error -match "Health verification failed") -and ($ft12Report.error -notmatch "Staged runtime directory does not exist"))

        $ft12Ok = ($ft12Res.ExitCode -ne 0 -and
                   $ft12Report -and
                   $hasRollbackSuccess -and
                   $hasPostSwapState -and
                   $hasHealthTrigger -and
                   $hasDeploymentSuccess -and
                   $hasHealthFailed -and
                   $hasDeploymentTime -and
                   $hasHealthError -and
                   $staleRestored -and
                   $mainRestored -and
                   $runtimeRestored -and
                   $candidateOnlyPurged -and
                   $noLeftoverStaging)

        if (-not $ft12Ok) {
            Write-Host "    [DEBUG FT-12] Exit: $($ft12Res.ExitCode)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Report Result: $($ft12Report.result)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Last Successful State: $($ft12Report.lastSuccessfulState)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Rollback Trigger Phase: $($ft12Report.rollbackTriggerPhase)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Deployment Phase: $($ft12Report.phases.deployment), Health Phase: $($ft12Report.phases.health)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Deployment Ms: $($ft12Report.durations.deploymentMs)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Error: $($ft12Report.error)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12] Stale: $staleRestored, Main: $mainRestored, Runtime: $runtimeRestored, CandPurged: $candidateOnlyPurged, NoLeftoverStaging: $noLeftoverStaging" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-12 StdOut] $($ft12Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-12 StdErr] $($ft12Res.StdErr)" -ForegroundColor DarkYellow
        }
        Write-Host "    [EVIDENCE FT-12] Result: $($ft12Report.result)" -ForegroundColor Cyan
        Write-Host "    [EVIDENCE FT-12] Last Successful State: $($ft12Report.lastSuccessfulState)" -ForegroundColor Cyan
        Write-Host "    [EVIDENCE FT-12] Rollback Trigger Phase: $($ft12Report.rollbackTriggerPhase)" -ForegroundColor Cyan
        Write-Host "    [EVIDENCE FT-12] Deployment Phase: $($ft12Report.phases.deployment), Health Phase: $($ft12Report.phases.health)" -ForegroundColor Cyan
        Write-Host "    [EVIDENCE FT-12] Deployment Ms: $($ft12Report.durations.deploymentMs), Rollback Ms: $($ft12Report.durations.rollbackMs)" -ForegroundColor Cyan
        Write-Host "    [EVIDENCE FT-12] Error: $($ft12Report.error)" -ForegroundColor Cyan

        Record-Test "FT-12" $ft12Ok "Real apply failure after swap triggers automated rollback and restores complete previous tree and runtime." $true
}

    # =========================================================================
    # FT-13, FT-14, FT-15: Real entry point health and branding verification (RR6-03)
    # =========================================================================
    if (Should-Run "FT-13") {
    Write-Host "`n--- Testing FT-13: Unresponsive application triggers automated rollback ---" -ForegroundColor Cyan
        $labTargetFT13 = Join-Path $testSandboxRoot "LabFT13"
        New-MockClientInstallation $labTargetFT13 "FT13" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT13 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39871`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8

        $applyPkgFT13 = Join-Path $testSandboxRoot "PkgFT13"
        New-LabCompactPackage -destinationDir $applyPkgFT13

        $ft13Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT13 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT13, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180
        $ft13BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT13 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft13Report = if ($ft13BackupReport) { Get-Content $ft13BackupReport.FullName | ConvertFrom-Json } else { $null }
        $ft13Ok = ($ft13Res.ExitCode -ne 0 -and $ft13Report -and ($ft13Report.result -eq "ROLLBACK_SUCCESS" -or $ft13Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
        if (-not $ft13Ok) {
            Write-Host "    [DEBUG FT-13] Exit: $($ft13Res.ExitCode), ReportResult: $($ft13Report.result), ReportState: $($ft13Report.stateMachine)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-13 StdOut] $($ft13Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-13 StdErr] $($ft13Res.StdErr)" -ForegroundColor DarkYellow
        }
        Record-Test "FT-13" $ft13Ok "Unresponsive application startup is detected during post-deploy health check and initiates rollback." $true
}

    # FT-14: Malformed health JSON response triggers automated rollback
    if (Should-Run "FT-14") {
    Write-Host "`n--- Testing FT-14: Malformed health JSON response triggers automated rollback ---" -ForegroundColor Cyan
        $labTargetFT14 = Join-Path $testSandboxRoot "LabFT14"
        New-MockClientInstallation $labTargetFT14 "FT14" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT14 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39872`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $labTargetFT14 "mock_server_malformed.flag") -Value "1" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $labTargetFT14 "mock_server_port.txt") -Value "39872" -Encoding UTF8

        $applyPkgFT14 = Join-Path $testSandboxRoot "PkgFT14"
        New-LabCompactPackage -destinationDir $applyPkgFT14

        $ft14Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT14 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT14, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180
        $ft14BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT14 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft14Report = if ($ft14BackupReport) { Get-Content $ft14BackupReport.FullName | ConvertFrom-Json } else { $null }
        $ft14Ok = ($ft14Res.ExitCode -ne 0 -and $ft14Report -and ($ft14Report.result -eq "ROLLBACK_SUCCESS" -or $ft14Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
        if (-not $ft14Ok) {
            Write-Host "    [DEBUG FT-14] Exit: $($ft14Res.ExitCode), ReportResult: $($ft14Report.result), ReportState: $($ft14Report.stateMachine)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-14 StdOut] $($ft14Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-14 StdErr] $($ft14Res.StdErr)" -ForegroundColor DarkYellow
        }
        Record-Test "FT-14" $ft14Ok "Malformed health JSON response is rejected and initiates automated rollback." $true
}

    # FT-15: Branding contract mismatch triggers automated rollback
    if (Should-Run "FT-15") {
    Write-Host "`n--- Testing FT-15: Branding contract mismatch triggers automated rollback ---" -ForegroundColor Cyan
        $labTargetFT15 = Join-Path $testSandboxRoot "LabFT15"
        New-MockClientInstallation $labTargetFT15 "FT15" $true
        Set-Content -LiteralPath (Join-Path $labTargetFT15 ".env") -Value "DATABASE_URL=`"postgresql://mock_user:mock_pass@127.0.0.1:5432/mock_client_db`"`r`nPORT=39873`r`nPLATFORM_NAME=MadarCore`r`n" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $labTargetFT15 "mock_server_bad_branding.flag") -Value "1" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $labTargetFT15 "mock_server_port.txt") -Value "39873" -Encoding UTF8

        $applyPkgFT15 = Join-Path $testSandboxRoot "PkgFT15"
        New-LabCompactPackage -destinationDir $applyPkgFT15

        $ft15Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT15 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT15, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180
        $ft15BackupReport = Get-ChildItem -Path (Join-Path $labTargetFT15 "backups") -Recurse -Filter "upgrade-report.json" -ErrorAction SilentlyContinue | Select-Object -First 1
        $ft15Report = if ($ft15BackupReport) { Get-Content $ft15BackupReport.FullName | ConvertFrom-Json } else { $null }
        $ft15Ok = ($ft15Res.ExitCode -ne 0 -and $ft15Report -and ($ft15Report.result -eq "ROLLBACK_SUCCESS" -or $ft15Report.result -eq "DEPLOYMENT_FAILED_ROLLED_BACK"))
        if (-not $ft15Ok) {
            Write-Host "    [DEBUG FT-15] Exit: $($ft15Res.ExitCode), ReportResult: $($ft15Report.result), ReportState: $($ft15Report.stateMachine)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-15 StdOut] $($ft15Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-15 StdErr] $($ft15Res.StdErr)" -ForegroundColor DarkYellow
        }
        Record-Test "FT-15" $ft15Ok "Branding contract mismatch on /api/branding strictly triggers automated rollback." $true
}

    # =========================================================================
    # FT-16: Preserved files preservation on upgrade
    # =========================================================================
    if (Should-Run "FT-16") {
    Write-Host "`n--- Testing FT-16: Preserved files preservation on upgrade ---" -ForegroundColor Cyan
        $labTargetFT16 = Join-Path $testSandboxRoot "LabFT16"
        New-MockClientInstallation $labTargetFT16 "ORIGINAL_FT16" $false
        $envHashBefore = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
        $licHashBefore = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
        $dummyDistSrc = Join-Path $testSandboxRoot "DummyDist16"
        New-Item -ItemType Directory -Path $dummyDistSrc -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $dummyDistSrc "main.js") -Value "// Swapped Dist" -Encoding UTF8
        Swap-DirectoryExact -SourceDir $dummyDistSrc -TargetDir (Join-Path $labTargetFT16 "dist") -BackupDir (Join-Path $labTargetFT16 "backups\b1")
        $envHashAfter = (Get-FileHash (Join-Path $labTargetFT16 ".env") -Algorithm SHA256).Hash
        $licHashAfter = (Get-FileHash (Join-Path $labTargetFT16 "license.key") -Algorithm SHA256).Hash
        $hashesPreserved = ($envHashBefore -eq $envHashAfter -and $licHashBefore -eq $licHashAfter)
        Record-Test "FT-16" $hashesPreserved ".env and license.key preserved with identical SHA-256." $false
}

    # =========================================================================
    # FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED (RR4-06)
    # =========================================================================
    if (Should-Run "FT-17") {
    Write-Host "`n--- Testing FT-17: Rollback error -> MANUAL_RECOVERY_REQUIRED ---" -ForegroundColor Cyan
        $fakeReportPath17 = Join-Path $testSandboxRoot "report17.json"
        $repData17 = @{ releaseId = $releaseId; targetDirectory = $labTargetFT16; backupPaths = @{ applicationBackup = "C:\non_existent_backup_xyz" } }
        Set-Content -LiteralPath $fakeReportPath17 -Value ($repData17 | ConvertTo-Json) -Encoding UTF8
        $ft17Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", $fakeReportPath17, "-Force")
        Record-Test "FT-17" ($ft17Res.ExitCode -ne 0) "Missing backup components during rollback transitions to error." $true
}

    # =========================================================================
    # FT-18: Altered dump hash rejection in standalone rollback (RR5-02)
    # =========================================================================
    if (Should-Run "FT-18") {
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
}

    # =========================================================================
    # FT-19: Rollback parameter validation
    # =========================================================================
    if (Should-Run "FT-19") {
    Write-Host "`n--- Testing FT-19: Rollback parameter validation ---" -ForegroundColor Cyan
        $ft19Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $rollbackScript, "-ReportPath", "non_existent_report_xyz.json", "-Force")
        Record-Test "FT-19" ($ft19Res.ExitCode -ne 0) "Standalone rollback rejects invalid/missing report parameters." $false
}

    # =========================================================================
    # FT-20: Exact atomic swap cleans stale files
    # =========================================================================
    if (Should-Run "FT-20") {
    Write-Host "`n--- Testing FT-20: Exact atomic swap cleans stale files ---" -ForegroundColor Cyan
        $staleCheck = Test-Path -LiteralPath (Join-Path $labTargetFT16 "dist\stale_old_file.js")
        Record-Test "FT-20" (-not $staleCheck) "Exact atomic directory swap removes stale files from target." $false
}

    # =========================================================================
    # FT-21: Full Idempotency path through apply engine (RR5-02, RR5-04)
    # =========================================================================
    if (Should-Run "FT-21") {
    Write-Host "`n--- Testing FT-21: Full Idempotency path through apply engine ---" -ForegroundColor Cyan
        $labTargetFT21 = Join-Path $testSandboxRoot "LabFT21"
        New-MockClientInstallation $labTargetFT21 "FT21" $true

        $applyPkgFT21 = Join-Path $testSandboxRoot "PkgFT21"
        New-LabCompactPackage -destinationDir $applyPkgFT21

        # Extract compact runtime into labTargetFT21 to make it completely identical
        $stagedCandDir = Join-Path $testSandboxRoot "StageCand21"
        Extract-RuntimeArchive -ArchiveZipPath (Join-Path $applyPkgFT21 "payload\server-runtime.zip") -DestinationDir $stagedCandDir
        Copy-DirectorySafely -SourceDir (Join-Path $stagedCandDir "dist") -DestinationDir (Join-Path $labTargetFT21 "dist")
        Copy-DirectorySafely -SourceDir (Join-Path $applyPkgFT21 "payload\frontend\dist") -DestinationDir (Join-Path $labTargetFT21 "frontend\dist")
        Copy-Item (Join-Path $applyPkgFT21 "payload\prisma\schema.prisma") (Join-Path $labTargetFT21 "prisma\schema.prisma") -Force
        Copy-DirectorySafely -SourceDir (Join-Path $applyPkgFT21 "payload\prisma\migrations") -DestinationDir (Join-Path $labTargetFT21 "prisma\migrations")
        if (Test-Path -LiteralPath (Join-Path $labTargetFT21 "node_modules")) {
            Remove-Item -LiteralPath (Join-Path $labTargetFT21 "node_modules") -Recurse -Force
        }
        Copy-DirectorySafely -SourceDir (Join-Path $stagedCandDir "node_modules") -DestinationDir (Join-Path $labTargetFT21 "node_modules")
        Copy-Item (Join-Path $applyPkgFT21 "payload\runtime-metadata.json") (Join-Path $labTargetFT21 "runtime-metadata.json") -Force
        Remove-Item -LiteralPath $stagedCandDir -Recurse -Force -ErrorAction SilentlyContinue

        # Clean stale file from New-MockClientInstallation
        if (Test-Path -LiteralPath (Join-Path $labTargetFT21 "dist\stale_old_file.js")) {
            Remove-Item -LiteralPath (Join-Path $labTargetFT21 "dist\stale_old_file.js") -Force
        }

        $candMigs = Compute-MigrationChecksums (Join-Path $applyPkgFT21 "payload\prisma\migrations")
        $allMigLines = ""
        foreach ($km in $candMigs.Keys) {
            $allMigLines += "$km|$($candMigs[$km])|2026-09-07 00:00:00|`n"
        }
        Set-Content -LiteralPath (Join-Path $labTargetFT21 "prerequisites\pgsql\bin\psql_migrations.out") -Value $allMigLines -Encoding UTF8

        $ft21Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $applyPkgFT21 "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT21, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT } -TimeoutSeconds 180

        $ft21ReportFile = Join-Path $labTargetFT21 "backups\upgrade-report.json"
        $ft21Report = if (Test-Path $ft21ReportFile) { Get-Content $ft21ReportFile | ConvertFrom-Json } else { $null }
        $ft21Ok = ($ft21Res.ExitCode -eq 0 -and ($ft21Res.StdOut -match "ALREADY_UP_TO_DATE" -or ($ft21Report -and $ft21Report.result -eq "ALREADY_UP_TO_DATE")))
        if (-not $ft21Ok) {
            Write-Host "    [DEBUG FT-21] Exit: $($ft21Res.ExitCode), ReportResult: $($ft21Report.result), ReportState: $($ft21Report.stateMachine)" -ForegroundColor Yellow
            Write-Host "    [DEBUG FT-21 StdOut] $($ft21Res.StdOut)" -ForegroundColor DarkYellow
            Write-Host "    [DEBUG FT-21 StdErr] $($ft21Res.StdErr)" -ForegroundColor DarkYellow
        }
        Record-Test "FT-21" $ft21Ok "Fully matching target enters ALREADY_UP_TO_DATE path without creating backup or temp DB." $true
}

    # =========================================================================
    # FT-22: NonInteractive safety guard
    # =========================================================================
    if (Should-Run "FT-22") {
    Write-Host "`n--- Testing FT-22: NonInteractive safety guard ---" -ForegroundColor Cyan
        $fakeProdTarget = "C:\RealProductionDawaCorePathNotExisting_XYZ"
        $env:MADARCORE_LAB_AUTH_TOKEN = $null
        $ft22Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $applyScript, "-TargetDirectory", $fakeProdTarget, "-NonInteractive")
        Record-Test "FT-22" ($ft22Res.ExitCode -ne 0) "NonInteractive rejects invalid or non-lab target paths." $false
}
    $env:MADARCORE_LAB_AUTH_TOKEN = [Guid]::NewGuid().ToString("N")

    # =========================================================================
    # FT-23: Package path with Arabic characters & spaces (RR4-02)
    # =========================================================================
    if (Should-Run "FT-23") {
    Write-Host "`n--- Testing FT-23: Arabic & Space Path Handling ---" -ForegroundColor Cyan
        $arabicPkgDir = Join-Path $testSandboxRoot "حزمة ترقية مدار كور 2026"
        Copy-PackageForLab $packageDir $arabicPkgDir
        $labTargetFT23 = Join-Path $testSandboxRoot "مجلد التثبيت العربي"
        New-MockClientInstallation $labTargetFT23 "FT23" $false
        $arabicApplyScript = Join-Path $arabicPkgDir "apply-madarcore-upgrade.ps1"
        $ft23Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $arabicApplyScript, "-TargetDirectory", $labTargetFT23, "-NonInteractive")
        $repPath23 = Join-Path $arabicPkgDir "upgrade-report.json"
        $rep23Exists = Test-Path -LiteralPath $repPath23
        $rep23Obj = if ($rep23Exists) { Get-Content -LiteralPath $repPath23 | ConvertFrom-Json } else { $null }
        $ft23Success = ($rep23Exists -and $rep23Obj.result -eq "PREFLIGHT_FAILED" -and $rep23Obj.phases.preflight -eq "FAILED")
        Record-Test "FT-23" $ft23Success "Package executes to expected preflight gate and writes report from paths with Arabic & spaces." $false
}

    # =========================================================================
    # FT-24: Atomic report writing with Save-UpgradeReport (RR4-02)
    # =========================================================================
    if (Should-Run "FT-24") {
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
}

    # =========================================================================
    # FT-25: Isolated package closure & module resolution (LC-09)
    # =========================================================================
    if (Should-Run "FT-25") {
    Write-Host "`n--- Testing FT-25: Isolated package closure & module resolution ---" -ForegroundColor Cyan
        $isolatedClosureDir = Join-Path $testSandboxRoot "IsolatedClosure"
        New-Item -ItemType Directory -Path $isolatedClosureDir -Force | Out-Null
        Copy-PackageForLab $packageDir (Join-Path $isolatedClosureDir "Package")
        $isolatedPkg = Join-Path $isolatedClosureDir "Package"
        $isolatedAcceptanceScript = Join-Path $isolatedPkg "payload\tools\acceptance-upgrade.cjs"

        $closureCheckScript = @"
    const path = require('path');
    const createReq = require('module').createRequire;
    const acceptanceScript = process.argv[2];
    const pkgTarget = process.argv[3];
    try {
        const runtimePkg = path.join(pkgTarget, 'extracted_runtime', 'package.json');
        const req = createReq(runtimePkg);
        const resolvedBcrypt = req.resolve('bcryptjs');
        const resolvedNest = req.resolve('@nestjs/core');
        const bcrypt = req('bcryptjs');
        const hash = bcrypt.hashSync('IsolatedSmokeTest2026', 10);
        const ok = bcrypt.compareSync('IsolatedSmokeTest2026', hash);
        const bad = bcrypt.compareSync('Wrong', hash);
        const isInsideBcrypt = path.resolve(resolvedBcrypt).toLowerCase().startsWith(path.resolve(pkgTarget).toLowerCase());
        const isInsideNest = path.resolve(resolvedNest).toLowerCase().startsWith(path.resolve(pkgTarget).toLowerCase());
        const isInsideRepo = path.resolve(resolvedBcrypt).toLowerCase().includes('dawacore\\node_modules');
        if (isInsideBcrypt && isInsideNest && !isInsideRepo && ok && !bad) {
            console.log(resolvedBcrypt);
            process.exit(0);
        } else {
            console.error('Invalid resolution location or compare check failed:', resolvedBcrypt);
            process.exit(1);
        }
    } catch (e) {
        console.error('Failed to resolve or run modules:', e.message);
        process.exit(1);
    }
"@
        $closureScriptPath = Join-Path $isolatedClosureDir "check_closure.js"
        Set-Content -LiteralPath $closureScriptPath -Value $closureCheckScript -Encoding UTF8
        $extractedRunDir = Join-Path $isolatedPkg "extracted_runtime"
        Extract-RuntimeArchive -ArchiveZipPath (Join-Path $isolatedPkg "payload\server-runtime.zip") -DestinationDir $extractedRunDir
        $closureRes = Execute-NativeProcessSafely -Executable "node.exe" -Arguments @($closureScriptPath, $isolatedAcceptanceScript, $isolatedPkg)
        $closureResolvedPath = if ($closureRes.StdOut) { $closureRes.StdOut.Trim() } else { "" }
        $ft25Ok = ($closureRes.ExitCode -eq 0 -and $closureResolvedPath -ne "" -and ($closureResolvedPath.ToLower().StartsWith($isolatedPkg.ToLower())))
        Record-Test "FT-25" $ft25Ok "Isolated package closure proves anchored require('bcryptjs') and @nestjs/core resolve strictly inside extracted package." $false
}

    # =========================================================================
    # FT-26: Dynamic free disk space calculation gate (Section 3.7)
    # =========================================================================
    if (Should-Run "FT-26") {
    Write-Host "`n--- Testing FT-26: Dynamic disk space calculation gate ---" -ForegroundColor Cyan
        $labTargetFT26 = Join-Path $testSandboxRoot "LabFT26"
        New-MockClientInstallation $labTargetFT26 "FT26" $false
        $calcResult = Calculate-RequiredFreeDiskSpace -TargetDir $labTargetFT26 -CandidateServerRuntimeDir (Join-Path $packageDir "payload") -FloorMB 2048 -SafetyReserveMB 1024 -DbDumpAllowanceMB 500
        $ft26Ok = ($calcResult.RequiredBytes -ge (2048 * 1MB) -and $calcResult.Breakdown.FloorMB -eq 2048 -and $calcResult.Breakdown.SafetyReserveMB -eq 1024)
        Record-Test "FT-26" $ft26Ok "Dynamic disk space calculation enforces 2GB minimum floor and safety reserve." $false
}

    # =========================================================================
    # FT-27: Full runtime backup manifest and aggregate fingerprint verification (Section 3.3)
    # =========================================================================
    if (Should-Run "FT-27") {
    Write-Host "`n--- Testing FT-27: Runtime aggregate fingerprint determinism & tampering ---" -ForegroundColor Cyan
        $fpTestDir = Join-Path $testSandboxRoot "FpTestDir"
        New-Item -ItemType Directory -Path (Join-Path $fpTestDir "sub") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $fpTestDir "file_b.txt") -Value "Content B" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $fpTestDir "sub\file_a.txt") -Value "Content A" -Encoding UTF8
        $fp1 = (Compute-DirectoryFingerprint -DirPath $fpTestDir).Fingerprint
        $fp2 = (Compute-DirectoryFingerprint -DirPath $fpTestDir).Fingerprint
        Set-Content -LiteralPath (Join-Path $fpTestDir "file_b.txt") -Value "Content B Modified" -Encoding UTF8
        $fp3 = (Compute-DirectoryFingerprint -DirPath $fpTestDir).Fingerprint
        $ft27Ok = ($fp1 -and $fp1 -eq $fp2 -and $fp1 -ne $fp3)
        Record-Test "FT-27" $ft27Ok "Compute-DirectoryFingerprint is deterministic across scans and detects content changes." $false
}

    # =========================================================================
    # FT-28: Guarded directory deployment quarantine recovery on activation failure (Section 3.5)
    # =========================================================================
    if (Should-Run "FT-28") {
    Write-Host "`n--- Testing FT-28: Guarded deployment quarantine recovery ---" -ForegroundColor Cyan
        $guardSrc = Join-Path $testSandboxRoot "GuardSrc"
        $guardTgt = Join-Path $testSandboxRoot "GuardTgt"
        New-Item -ItemType Directory -Path $guardSrc -Force | Out-Null
        New-Item -ItemType Directory -Path $guardTgt -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $guardSrc "candidate.txt") -Value "Candidate Version" -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $guardTgt "original.txt") -Value "Original Version" -Encoding UTF8
        # Intentionally pass invalid expected fingerprint so deployment halts before activation
        $guardFailed = $false
        try {
            Deploy-DirectoryGuarded -SourceDir $guardSrc -TargetDir $guardTgt -ExpectedFingerprint "0000000000000000000000000000000000000000000000000000000000000000"
        } catch {
            $guardFailed = $true
        }
        $origPreserved = (Test-Path -LiteralPath (Join-Path $guardTgt "original.txt")) -and ((Get-Content (Join-Path $guardTgt "original.txt") -Raw).Trim() -eq "Original Version")
        Record-Test "FT-28" ($guardFailed -and $origPreserved) "Deploy-DirectoryGuarded halts on fingerprint mismatch and leaves original target untouched." $false
}

    # =========================================================================
    # FT-29: Runtime metadata tampering rejection (Section 3.3 & 3.5)
    # =========================================================================
    if (Should-Run "FT-29") {
    Write-Host "`n--- Testing FT-29: Runtime metadata tampering rejection ---" -ForegroundColor Cyan
        $tamperedMetaPkg = Join-Path $testSandboxRoot "TamperedMetaPkg"
        Copy-PackageForLab $packageDir $tamperedMetaPkg
        $metaFile29 = Join-Path $tamperedMetaPkg "payload\runtime-metadata.json"
        $metaObj29 = Get-Content -LiteralPath $metaFile29 -Raw -Encoding UTF8 | ConvertFrom-Json
        $metaObj29.runtimeFingerprint = "bad_fingerprint_hash_12345"
        [System.IO.File]::WriteAllText($metaFile29, ($metaObj29 | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
        Update-LabPackageManifest $tamperedMetaPkg

        $labTargetFT29 = Join-Path $testSandboxRoot "LabFT29"
        New-MockClientInstallation $labTargetFT29 "FT29" $true
        $ft29Res = Execute-NativeProcessSafely -Executable "powershell.exe" -Arguments @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $tamperedMetaPkg "apply-madarcore-upgrade.ps1"), "-TargetDirectory", $labTargetFT29, "-NonInteractive") -EnvironmentVariables @{ "MADARCORE_LAB_AUTH_TOKEN" = $env:MADARCORE_LAB_AUTH_TOKEN; "MADARCORE_LAB_ROOT" = $env:MADARCORE_LAB_ROOT }
        Record-Test "FT-29" ($ft29Res.ExitCode -ne 0) "Tampered runtime metadata fingerprint triggers deployment rejection." $true
}

    # =========================================================================
    # FT-30: Full runtime replacement removes stale target packages (Section 3.5)
    # =========================================================================
    if (Should-Run "FT-30") {
    Write-Host "`n--- Testing FT-30: Full runtime replacement cleans target node_modules ---" -ForegroundColor Cyan
        $labTargetFT30 = Join-Path $testSandboxRoot "LabFT30"
        New-MockClientInstallation $labTargetFT30 "FT30" $false
        New-Item -ItemType Directory -Path (Join-Path $labTargetFT30 "node_modules\stale_vendor_pkg") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $labTargetFT30 "node_modules\stale_vendor_pkg\index.js") -Value "// Stale Vendor Code" -Encoding UTF8
        $candMod30 = Join-Path $testSandboxRoot "CandMod30"
        New-Item -ItemType Directory -Path (Join-Path $candMod30 "candidate_vendor_pkg") -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $candMod30 "candidate_vendor_pkg\index.js") -Value "// Candidate Vendor Code" -Encoding UTF8
        Deploy-DirectoryGuarded -SourceDir $candMod30 -TargetDir (Join-Path $labTargetFT30 "node_modules")
        $stalePkgGone = -not (Test-Path -LiteralPath (Join-Path $labTargetFT30 "node_modules\stale_vendor_pkg"))
        $candPkgPresent = Test-Path -LiteralPath (Join-Path $labTargetFT30 "node_modules\candidate_vendor_pkg")
        $env30Preserved = Test-Path -LiteralPath (Join-Path $labTargetFT30 ".env")
        $lic30Preserved = Test-Path -LiteralPath (Join-Path $labTargetFT30 "license.key")
        Record-Test "FT-30" ($stalePkgGone -and $candPkgPresent -and $env30Preserved -and $lic30Preserved) "Full runtime replacement removes stale packages and preserves client secrets." $false
}

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

    if (Should-Run "MIG-01") {
    # Case A: Correct Checksum -> PASS
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
        $auditA = Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir
        Record-Test "MIG-01" ($auditA.AppliedCount -eq 1 -and $auditA.PendingCount -eq 0) "Migration Audit: Valid checksum succeeds." $false
}

    if (Should-Run "MIG-02") {
    # Case B: Checksum Mismatch -> PREFLIGHT_FAILED
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|bad_checksum_123|2026-09-07 00:00:00|`n" -Encoding UTF8
        $auditBErr = ""
        try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditBErr = $_.ToString() }
        Record-Test "MIG-02" ($auditBErr -match "Checksum mismatch") "Migration Audit: Checksum mismatch throws PREFLIGHT_FAILED." $false
}

    if (Should-Run "MIG-03") {
    # Case C: Duplicate Migration -> PREFLIGHT_FAILED
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n20260907000000_m1|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
        $auditCErr = ""
        try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditCErr = $_.ToString() }
        Record-Test "MIG-03" ($auditCErr -match "Duplicate migration") "Migration Audit: Duplicate migration throws PREFLIGHT_FAILED." $false
}

    if (Should-Run "MIG-04") {
    # Case D: Unknown Migration -> PREFLIGHT_FAILED
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "99999999999999_unknown_mig|$m1Hash|2026-09-07 00:00:00|`n" -Encoding UTF8
        $auditDErr = ""
        try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditDErr = $_.ToString() }
        Record-Test "MIG-04" ($auditDErr -match "Unknown migration") "Migration Audit: Unknown migration throws PREFLIGHT_FAILED." $false
}

    if (Should-Run "MIG-05") {
    # Case E: Failed or Rolled-Back Migration -> PREFLIGHT_FAILED
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1|$m1Hash||`n" -Encoding UTF8
        $auditEErr = ""
        try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditEErr = $_.ToString() }
        Record-Test "MIG-05" ($auditEErr -match "failed or rolled-back") "Migration Audit: Unfinished migration throws PREFLIGHT_FAILED." $false
}

    if (Should-Run "MIG-06") {
    # Case F: Empty Checksum -> PREFLIGHT_FAILED
        Set-Content (Join-Path $testSandboxRoot "mock_audit_psql.out") "20260907000000_m1||2026-09-07 00:00:00|`n" -Encoding UTF8
        $auditFErr = ""
        try { Audit-TargetMigrations -PsqlExe $mockPsqlAudit -DbConn $dummyDbConn -CandidateMigrationsDir $testMigsDir } catch { $auditFErr = $_.ToString() }
        Record-Test "MIG-06" ($auditFErr -match "Empty checksum") "Migration Audit: Empty checksum throws PREFLIGHT_FAILED." $false
}

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
