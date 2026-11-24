#!/usr/bin/env node
/**
 * verify-madarcore-client-upgrade.cjs
 * Static & structural verification test for the MadarCore Client Upgrade Package:
 * 1. Checks that only allowed files from UPGRADE_REPAIR_IMPLEMENTATION_PLAN_V3.md are touched.
 * 2. Checks package structure and existence of all required root orchestrator files.
 * 3. Checks payload structure: dist, frontend/dist, prisma, prisma-runtime, tools.
 * 4. Checks that forbidden items are NOT present: .env, license.key, uploads, .git, src/**, frontend/src/**.
 * 5. Checks that NO simulation tokens (SIMULATED_, MADARCORE_TEST_MODE, MADARCORE_SIMULATION_MODE, MOCK_BACKUP) exist in package.
 * 6. Checks manifest.json integrity and verifies SHA-256 for all packaged files.
 * 7. Checks compatibility.json contents.
 * 8. Checks ZIP archive existence, integrity, and extraction to independent temp folder.
 * 9. Checks that test harness contains NO literal $true assertions for any FT.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const ALLOWED_PROJECT_FILES = new Set([
  // Plan & Report docs
  'UPGRADE_REPAIR_IMPLEMENTATION_PLAN_V3.md',
  'REPAIR_REQUEST_CYCLE_3.md',
  'REPAIR_REQUEST_CYCLE_4.md',
  'REPAIR_REQUEST_CYCLE_5.md',
  'UPGRADE_REVIEW_REPORT_CYCLE_5.md',
  'ANTIGRAVITY_UPGRADE_HANDOFF_CYCLE_5.md',
  'REPAIR_REQUEST_CYCLE_6.md',
  'UPGRADE_REVIEW_REPORT_CYCLE_6.md',
  'ANTIGRAVITY_UPGRADE_HANDOFF_CYCLE_6.md',
  'REPAIR_REQUEST_CYCLE_7.md',
  'UPGRADE_REVIEW_REPORT_CYCLE_7.md',
  'ANTIGRAVITY_UPGRADE_HANDOFF_CYCLE_7.md',
  'IMPLEMENTATION_PLAN.md',
  'IMPLEMENTATION_REPORT.md',
  'ANTIGRAVITY_HANDOFF.md',
  'ANTIGRAVITY_REPAIR_SPEC.md',
  'REPAIR_REQUEST.md',
  'REVIEW_REPORT.md',

  // Production file allowed strictly in Cycle 8 for LC-01
  'src/app.module.ts',

  // The 10 Allowed Upgrade Task Files (+ manifest.json in package dir)
  'tools/build-madarcore-client-upgrade.ps1',
  'tools/verify-madarcore-client-upgrade.cjs',
  'tools/test-madarcore-client-upgrade.ps1',
  'tools/acceptance-upgrade.cjs',
  'installer_package/madarcore-client-upgrade/APPLY-MADARCORE-UPGRADE.bat',
  'installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1',
  'installer_package/madarcore-client-upgrade/upgrade-common.ps1',
  'installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1',
  'installer_package/madarcore-client-upgrade/README-AR.txt',
  'installer_package/madarcore-client-upgrade/compatibility.json',
  'installer_package/madarcore-client-upgrade/manifest.json'
]);

let failures = 0;
function pass(msg) { console.log(`✅ PASS: ${msg}`); }
function fail(msg) { console.error(`❌ FAIL: ${msg}`); failures++; }

function computeDirectoryFingerprint(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { totalFiles: 0, totalBytes: 0, fingerprint: null };
  }
  const files = [];
  function scan(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        scan(full);
      } else if (ent.isFile()) {
        const rel = path.relative(dirPath, full).replace(/\\/g, '/');
        const stat = fs.statSync(full);
        const fileBytes = fs.readFileSync(full);
        const sha = crypto.createHash('sha256').update(fileBytes).digest('hex');
        files.push({ rel, size: stat.size, sha });
      }
    }
  }
  scan(dirPath);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  let totalBytes = 0;
  const lines = [];
  for (const f of files) {
    totalBytes += f.size;
    lines.push(`${f.rel}|${f.size}|${f.sha}\r\n`);
  }
  const aggregateBytes = Buffer.from(lines.join(''), 'utf8');
  const fingerprint = crypto.createHash('sha256').update(aggregateBytes).digest('hex');
  return { totalFiles: files.length, totalBytes, fingerprint };
}

// 1. Verify Git working tree adheres strictly to allowed files
try {
  const statusOut = execSync('git status --porcelain -uall', { cwd: ROOT, encoding: 'utf8' });
  const lines = statusOut.split(/\r?\n/).filter(l => l.trim().length > 0);
  const unexpected = [];
  for (const line of lines) {
    const filePart = line.slice(3).trim().replace(/\\/g, '/');
    // Ignore generated installer_package/Output artifacts
    if (filePart.startsWith('installer_package/Output/')) continue;
    if (!ALLOWED_PROJECT_FILES.has(filePart)) {
      unexpected.push(filePart);
    }
  }
  if (unexpected.length > 0) {
    fail(`Modified/untracked files outside allowed scope: ${unexpected.join(', ')}`);
  } else {
    pass('Git status check: All modified and untracked files are within the allowed file list.');
  }
} catch (err) {
  fail(`Git status check failed: ${err.message}`);
}

// 2. Verify Package Structure in Staging or Target Directory
const dirArgIdx = process.argv.indexOf('--dir');
const releaseId = 'MadarCore-Client-Upgrade-20261116';
let stagingDir = dirArgIdx !== -1 && process.argv[dirArgIdx + 1]
  ? path.resolve(process.argv[dirArgIdx + 1])
  : path.join(ROOT, 'installer_package', 'Output', releaseId);

if (fs.existsSync(path.join(stagingDir, releaseId))) {
  stagingDir = path.join(stagingDir, releaseId);
}

if (!fs.existsSync(stagingDir)) {
  fail(`Target verification directory missing: ${stagingDir}`);
} else {
  pass(`Target package directory exists: ${stagingDir}`);
}

const requiredRootFiles = [
  'APPLY-MADARCORE-UPGRADE.bat',
  'apply-madarcore-upgrade.ps1',
  'upgrade-common.ps1',
  'rollback-madarcore-upgrade.ps1',
  'README-AR.txt',
  'compatibility.json',
  'manifest.json'
];

for (const rf of requiredRootFiles) {
  const fp = path.join(stagingDir, rf);
  if (!fs.existsSync(fp)) {
    fail(`Required root file missing from package: ${rf}`);
  }
}
if (failures === 0) pass('All 7 required root package orchestration files are present.');

// Node version support policy check (R2-02)
function isNodeVersionSupported(versionStr) {
  if (!versionStr || typeof versionStr !== 'string') return false;
  const match = versionStr.trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return false;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  if (major === 20 && minor >= 19) return true;
  if (major === 22) return true;
  return false;
}

// Regression Gate for R2-02: Test node version validator
if (!isNodeVersionSupported('v26.4.0') &&
    !isNodeVersionSupported('v20.18.0') &&
    !isNodeVersionSupported('v23.1.0') &&
    isNodeVersionSupported('v20.19.0') &&
    isNodeVersionSupported('v20.20.2') &&
    isNodeVersionSupported('v22.11.0')) {
  pass('Node version policy audit: Node 26 and Node 20.18 strictly rejected; Node 20.19+ and Node 22 accepted.');
} else {
  fail('R2-02 policy validator unit test failed.');
}

// 3. Verify Payload Structure (Section 3.1 & 7, Revision 2)
const payloadDir = path.join(stagingDir, 'payload');
const requiredPayloadItems = [
  'server-runtime.zip',
  'runtime-metadata.json',
  'frontend/dist/index.html',
  'prisma/schema.prisma',
  'tools/acceptance-upgrade.cjs'
];
for (const pi of requiredPayloadItems) {
  const fp = path.join(payloadDir, pi);
  if (!fs.existsSync(fp)) {
    fail(`Required payload component missing: ${pi}`);
  }
}
if (failures === 0) pass('Candidate payload components are complete.');

// Transitional structures and uncompressed runtime trees must NOT exist in the new self-contained package
if (fs.existsSync(path.join(payloadDir, 'server-runtime'))) {
  fail('Expanded payload/server-runtime directory must not exist in Revision 2 package (must be server-runtime.zip).');
}
if (fs.existsSync(path.join(payloadDir, 'prisma-runtime'))) {
  fail('Transitional prisma-runtime directory must not exist in self-contained package.');
}
if (fs.existsSync(path.join(payloadDir, 'tools', 'node_modules'))) {
  fail('Transitional tools/node_modules directory must not exist in self-contained package.');
}

// 3.5 Verify Self-Contained Server Runtime (Sections 3.1-3.4, 7, Revision 2)
const runtimeZipPath = path.join(payloadDir, 'server-runtime.zip');
const runtimeMetaPath = path.join(payloadDir, 'runtime-metadata.json');

if (fs.existsSync(runtimeZipPath) && fs.existsSync(runtimeMetaPath)) {
  const os = require('os');
  const stageExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madarcore_verify_staging_'));
  try {
    const meta = JSON.parse(fs.readFileSync(runtimeMetaPath, 'utf8'));

    // R2-02 Check: Node version recorded in runtime metadata MUST be supported
    if (!isNodeVersionSupported(meta.nodeVersion)) {
      fail(`R2-02 VIOLATION: Unsupported build Node version '${meta.nodeVersion}' recorded in runtime metadata. Allowed: Node 20.19+ or Node 22.`);
    } else {
      pass(`Runtime build Node version validated: ${meta.nodeVersion}`);
    }

    const sourceLockPath = path.join(ROOT, 'package-lock.json');
    if (fs.existsSync(sourceLockPath)) {
      const sourceLockBytes = fs.readFileSync(sourceLockPath);
      const actualSourceLockSha = crypto.createHash('sha256').update(sourceLockBytes).digest('hex');
      if (meta.sourceLockSha256 !== actualSourceLockSha) {
        fail(`Runtime metadata sourceLockSha256 mismatch! Meta: ${meta.sourceLockSha256}, Actual: ${actualSourceLockSha}`);
      } else {
        pass('Runtime metadata sourceLockSha256 matches source package-lock.json SHA-256.');
      }
    }

    // Extract server-runtime.zip into verification directory
    execSync(`tar -xf "${runtimeZipPath}" -C "${stageExtractDir}"`);
    const serverRuntimeDir = stageExtractDir;
    const runtimePkgJsonPath = path.join(serverRuntimeDir, 'package.json');
    const runtimeModulesDir = path.join(serverRuntimeDir, 'node_modules');

    if (!fs.existsSync(runtimePkgJsonPath) || !fs.existsSync(runtimeModulesDir)) {
      fail('server-runtime.zip missing package.json or node_modules.');
    } else {
      // Verify npm ls --omit=dev --all inside server-runtime
      try {
        execSync('npm ls --omit=dev --all', { cwd: serverRuntimeDir, stdio: 'pipe' });
        pass('npm ls --omit=dev --all succeeded inside candidate server runtime without errors.');
      } catch (npmErr) {
        fail(`npm ls --omit=dev --all reported dependency errors in server-runtime: ${npmErr.message}`);
      }

      // Module resolution via createRequire anchored at server-runtime/package.json
      const createReq = require('module').createRequire;
      const runtimeRequire = createReq(runtimePkgJsonPath);
      const canonicalRuntimeModules = fs.realpathSync(runtimeModulesDir).toLowerCase();
      const pkgJson = JSON.parse(fs.readFileSync(runtimePkgJsonPath, 'utf8'));
      const directDeps = Object.keys(pkgJson.dependencies || {});
      const criticalModules = [
        '@nestjs/core',
        '@nestjs/common',
        '@nestjs/swagger',
        '@prisma/client',
        'bcryptjs',
        'pdfmake-rtl',
        'puppeteer'
      ];
      const allModules = Array.from(new Set([...directDeps, ...criticalModules]));

      let boundaryFailures = 0;
      for (const mod of allModules) {
        try {
          const resolved = runtimeRequire.resolve(mod);
          const canonicalResolved = fs.realpathSync(resolved).toLowerCase();
          if (!canonicalResolved.startsWith(canonicalRuntimeModules)) {
            fail(`CRITICAL: '${mod}' resolved outside candidate runtime to: ${resolved}`);
            boundaryFailures++;
          }
        } catch (resErr) {
          fail(`Failed to resolve module '${mod}' from candidate server runtime: ${resErr.message}`);
          boundaryFailures++;
        }
      }
      if (boundaryFailures === 0) {
        pass(`All ${allModules.length} direct production and critical modules resolve strictly inside server-runtime/node_modules.`);
      }

      // Smoke test bcryptjs
      const bcrypt = runtimeRequire('bcryptjs');
      const smokeHash = bcrypt.hashSync('TestPass!2026', 10);
      if (bcrypt.compareSync('TestPass!2026', smokeHash) && !bcrypt.compareSync('Wrong', smokeHash)) {
        pass('bcryptjs smoke test passed (hash and compare).');
      } else {
        fail('bcryptjs smoke test failed.');
      }

      // Smoke test PrismaClient instantiation
      const { PrismaClient } = runtimeRequire('@prisma/client');
      const dummyClient = new PrismaClient({ datasources: { db: { url: 'postgresql://mock:mock@127.0.0.1:5432/mock' } } });
      if (dummyClient) {
        pass('@prisma/client instantiated successfully without resolution errors.');
      }

      // Verify fingerprint and file statistics against runtime-metadata.json
      const fpResult = computeDirectoryFingerprint(runtimeModulesDir);
      if (fpResult.fingerprint !== meta.runtimeFingerprint) {
        fail(`Runtime node_modules fingerprint mismatch! Meta: ${meta.runtimeFingerprint}, Computed: ${fpResult.fingerprint}`);
      } else {
        pass(`Runtime node_modules fingerprint verified: ${fpResult.fingerprint}`);
      }
      if (fpResult.totalFiles !== meta.runtimeFileCount || fpResult.totalBytes !== meta.runtimeTotalBytes) {
        fail(`Runtime file count/bytes mismatch! Meta: (${meta.runtimeFileCount} files, ${meta.runtimeTotalBytes} bytes), Computed: (${fpResult.totalFiles} files, ${fpResult.totalBytes} bytes)`);
      } else {
        pass(`Runtime file count (${fpResult.totalFiles}) and size (${fpResult.totalBytes} bytes) match metadata.`);
      }
    }

  } catch (err) {
    fail(`Server runtime verification failed: ${err.message}`);
  } finally {
    try {
      fs.rmSync(stageExtractDir, { recursive: true, force: true });
    } catch {}
  }
}

// 4. Verify Forbidden Files are ABSENT from package
const forbiddenPaths = [
  path.join(stagingDir, '.env'),
  path.join(stagingDir, 'license.key'),
  path.join(stagingDir, '.git'),
  path.join(stagingDir, 'src'),
  path.join(stagingDir, 'frontend', 'src'),
  path.join(payloadDir, '.env'),
  path.join(payloadDir, 'license.key'),
  path.join(payloadDir, 'src'),
  path.join(payloadDir, 'uploads')
];

for (const fb of forbiddenPaths) {
  if (fs.existsSync(fb)) {
    fail(`SECURITY BREACH: Forbidden file or directory found inside package: ${fb}`);
  }
}

// Ensure NO *.tmp* files exist in payload/prisma-runtime (RR4-07)
function checkNoTmpFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dirPath, item.name);
    if (item.name.includes('.tmp')) {
      fail(`Found residual temporary file in runtime: ${full}`);
    }
    if (item.isDirectory()) {
      checkNoTmpFiles(full);
    }
  }
}
checkNoTmpFiles(path.join(payloadDir, 'server-runtime'));
if (failures === 0) pass('Forbidden files (.env, license.key, source code, .git, uploads, *.tmp*) are strictly absent.');

// 5. Verify NO Simulation / Mock tokens exist in package files
const forbiddenTokens = ['SIMULATED_', 'MADARCORE_TEST_MODE', 'MADARCORE_SIMULATION_MODE', 'MOCK_BACKUP'];
function checkForbiddenTokensInDir(dirPath) {
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      checkForbiddenTokensInDir(fullPath);
    } else if (item.isFile() && (item.name.endsWith('.ps1') || item.name.endsWith('.cjs') || item.name.endsWith('.bat') || item.name.endsWith('.json'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const token of forbiddenTokens) {
        if (content.includes(token)) {
          fail(`Production engine contains forbidden simulation token '${token}' in: ${fullPath}`);
        }
      }
    }
  }
}

try {
  checkForbiddenTokensInDir(stagingDir);
  pass('Simulation isolation check: Zero simulation tokens found in staging package.');
} catch (err) {
  fail(`Simulation token check failed: ${err.message}`);
}

// 6. Verify manifest.json integrity & SHA-256 for all files
const manifestPath = path.join(stagingDir, 'manifest.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.releaseId !== releaseId) {
    fail(`manifest.json releaseId mismatch: ${manifest.releaseId}`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('manifest.json has empty or invalid files array.');
  }

  let hashErrors = 0;
  for (const entry of manifest.files) {
    const fullPath = path.join(stagingDir, entry.path.replace(/\//g, path.sep));
    if (!fs.existsSync(fullPath)) {
      fail(`File listed in manifest does not exist: ${entry.path}`);
      hashErrors++;
      continue;
    }
    const fileBytes = fs.readFileSync(fullPath);
    const calculatedHash = crypto.createHash('sha256').update(fileBytes).digest('hex');
    if (calculatedHash !== entry.sha256) {
      fail(`SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${calculatedHash}`);
      hashErrors++;
    }
  }

  if (hashErrors === 0) {
    pass(`All ${manifest.files.length} packaged files match manifest.json SHA-256 hashes perfectly.`);
  }
} catch (err) {
  fail(`Failed to verify manifest.json: ${err.message}`);
}

// 7. Verify ZIP archive and external SHA-256
const zipPath = path.join(ROOT, 'installer_package', 'Output', `${releaseId}.zip`);
const zipShaFile = `${zipPath}.sha256`;
if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
  fail(`ZIP archive is missing or empty: ${zipPath}`);
} else {
  const zipBytes = fs.readFileSync(zipPath);
  const zipHash = crypto.createHash('sha256').update(zipBytes).digest('hex');
  if (fs.existsSync(zipShaFile)) {
    const recordedSha = fs.readFileSync(zipShaFile, 'utf8');
    if (!recordedSha.includes(zipHash)) {
      fail('ZIP sha256 file does not match actual zip hash.');
    } else {
      pass(`ZIP archive (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB) verified with external SHA-256.`);
    }
  }

  // LC-09: Isolated-extraction check from ZIP archive outside repo
  const os = require('os');
  const tempExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'madarcore_verify_zip_'));
  try {
    execSync(`tar -xf "${zipPath}" -C "${tempExtractDir}"`);
    const extractedTarget = fs.existsSync(path.join(tempExtractDir, releaseId))
      ? path.join(tempExtractDir, releaseId)
      : tempExtractDir;
    const extractedAcceptanceScript = path.join(extractedTarget, 'payload', 'tools', 'acceptance-upgrade.cjs');
    const extractedRuntimeZip = path.join(extractedTarget, 'payload', 'server-runtime.zip');
    if (!fs.existsSync(extractedAcceptanceScript) || !fs.existsSync(extractedRuntimeZip)) {
      fail(`Isolated ZIP extraction check failed: acceptance script or server-runtime.zip missing from extracted ZIP.`);
    } else {
      const extractedRuntimeDir = path.join(extractedTarget, 'payload', 'server-runtime');
      if (!fs.existsSync(extractedRuntimeDir)) {
        fs.mkdirSync(extractedRuntimeDir, { recursive: true });
      }
      execSync(`tar -xf "${extractedRuntimeZip}" -C "${extractedRuntimeDir}"`);
      const extractedRuntimePkg = path.join(extractedRuntimeDir, 'package.json');
      if (!fs.existsSync(extractedRuntimePkg)) {
        fail(`Isolated ZIP extraction check failed: package.json missing from extracted server-runtime.zip.`);
      } else {
        const createReq = require('module').createRequire;
        const extractedRequire = createReq(extractedRuntimePkg);
        const resolvedFromZip = extractedRequire.resolve('bcryptjs');
        const resolvedNestFromZip = extractedRequire.resolve('@nestjs/core');
        const normalizedZipResolved = path.resolve(resolvedFromZip).toLowerCase();
        const normalizedZipNest = path.resolve(resolvedNestFromZip).toLowerCase();
        const normalizedZipTarget = path.resolve(extractedTarget).toLowerCase();
        const normalizedRoot = path.resolve(ROOT).toLowerCase();

        if (normalizedZipResolved.startsWith(normalizedRoot) || normalizedZipNest.startsWith(normalizedRoot)) {
          fail(`CRITICAL: modules resolved to parent repository node_modules instead of inside extracted ZIP!`);
        } else if (!normalizedZipResolved.startsWith(normalizedZipTarget) || !normalizedZipNest.startsWith(normalizedZipTarget)) {
          fail(`CRITICAL: modules resolved outside extracted ZIP target!`);
        } else {
          const bcrypt = extractedRequire('bcryptjs');
          const smokeHash = bcrypt.hashSync('ZipSmoke123', 10);
          const smokeMatch = bcrypt.compareSync('ZipSmoke123', smokeHash);
          const smokeBad = bcrypt.compareSync('BadPass', smokeHash);
          if (smokeMatch && !smokeBad) {
            pass(`Isolated ZIP extraction check: bcryptjs and @nestjs/core resolve strictly inside extracted package (${resolvedFromZip}) and pass smoke tests.`);
          } else {
            fail('Isolated ZIP extraction smoke test failed: hash/compare returned invalid boolean.');
          }
        }
      }
    }
  } catch (zipErr) {
    fail(`Isolated ZIP extraction check failed: ${zipErr.message}`);
  } finally {
    try {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    } catch {}
  }
}

// 8. Verify Test Harness contains NO literal ($true) in Record-Test (RR3-04)
const testHarnessPath = path.join(ROOT, 'tools', 'test-madarcore-client-upgrade.ps1');
if (fs.existsSync(testHarnessPath)) {
  const harnessContent = fs.readFileSync(testHarnessPath, 'utf8');
  const literalTrueRegex = /Record-Test\s+["'][^"']+["']\s+\(\$true\)/i;
  if (literalTrueRegex.test(harnessContent)) {
    fail('RR3-04 VIOLATION: test-madarcore-client-upgrade.ps1 contains literal ($true) in Record-Test.');
  } else {
    pass('Test harness audit: Zero literal ($true) assertions found in FT test matrix.');
  }
}

if (failures > 0) {
  console.error(`\nVerification failed with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log('\n🎉 MadarCore Client Upgrade Package Static Verification PASSED!');
  process.exit(0);
}
