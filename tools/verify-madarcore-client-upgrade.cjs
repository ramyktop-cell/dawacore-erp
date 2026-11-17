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

// 3. Verify Payload Structure (including candidate Prisma runtime closure RR3-02 and tools closure LC-09)
const payloadDir = path.join(stagingDir, 'payload');
const requiredPayloadItems = [
  'dist/main.js',
  'frontend/dist/index.html',
  'prisma/schema.prisma',
  'tools/acceptance-upgrade.cjs',
  'tools/node_modules/bcryptjs/package.json',
  'tools/node_modules/bcryptjs/umd/index.js',
  'prisma-runtime/node_modules/prisma/build/index.js'
];
for (const pi of requiredPayloadItems) {
  const fp = path.join(payloadDir, pi);
  if (!fs.existsSync(fp)) {
    fail(`Required payload component missing: ${pi}`);
  }
}
if (failures === 0) pass('Candidate payload (dist, frontend/dist, prisma, acceptance runner, tools dependencies, prisma-runtime) is complete.');

// 3.5 Verify Package Closure: module resolution for acceptance runner dependencies (LC-09)
const acceptanceScriptPath = path.join(payloadDir, 'tools', 'acceptance-upgrade.cjs');
if (fs.existsSync(acceptanceScriptPath)) {
  try {
    const createReq = require('module').createRequire;
    const acceptanceRequire = createReq(acceptanceScriptPath);
    const resolvedBcryptPath = acceptanceRequire.resolve('bcryptjs');
    const normalizedResolved = path.resolve(resolvedBcryptPath).toLowerCase();
    const normalizedStaging = path.resolve(stagingDir).toLowerCase();

    if (!normalizedResolved.startsWith(normalizedStaging)) {
      fail(`CRITICAL: bcryptjs resolved outside package boundary! Resolved to: ${resolvedBcryptPath}`);
    } else {
      const bcrypt = acceptanceRequire('bcryptjs');
      const testPassword = 'TestClosurePassword!2026';
      const testHash = bcrypt.hashSync(testPassword, 10);
      const isMatch = bcrypt.compareSync(testPassword, testHash);
      const isBadMatch = bcrypt.compareSync('WrongPassword', testHash);
      if (isMatch && !isBadMatch) {
        pass(`Package closure verified: bcryptjs resolves inside package (${resolvedBcryptPath}) and passes hash/compare smoke test.`);
      } else {
        fail('Package closure smoke test failed: bcryptjs hash/compare returned unexpected results.');
      }
    }
  } catch (err) {
    fail(`Package closure verification failed to resolve/execute bcryptjs from acceptance-upgrade.cjs: ${err.message}`);
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
checkNoTmpFiles(path.join(payloadDir, 'prisma-runtime'));
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
    if (!fs.existsSync(extractedAcceptanceScript)) {
      fail(`Isolated ZIP extraction check failed: acceptance-upgrade.cjs missing at ${extractedAcceptanceScript}`);
    } else {
      const createReq = require('module').createRequire;
      const extractedRequire = createReq(extractedAcceptanceScript);
      const resolvedFromZip = extractedRequire.resolve('bcryptjs');
      const normalizedZipResolved = path.resolve(resolvedFromZip).toLowerCase();
      const normalizedZipTarget = path.resolve(extractedTarget).toLowerCase();
      const normalizedRoot = path.resolve(ROOT).toLowerCase();

      if (normalizedZipResolved.startsWith(normalizedRoot)) {
        fail(`CRITICAL: bcryptjs resolved to parent repository node_modules instead of inside extracted ZIP! Path: ${resolvedFromZip}`);
      } else if (!normalizedZipResolved.startsWith(normalizedZipTarget)) {
        fail(`CRITICAL: bcryptjs resolved outside extracted ZIP target! Path: ${resolvedFromZip}`);
      } else {
        const bcrypt = extractedRequire('bcryptjs');
        const smokeHash = bcrypt.hashSync('ZipSmoke123', 10);
        const smokeMatch = bcrypt.compareSync('ZipSmoke123', smokeHash);
        const smokeBad = bcrypt.compareSync('BadPass', smokeHash);
        if (smokeMatch && !smokeBad) {
          pass(`Isolated ZIP extraction check: bcryptjs resolves strictly inside extracted package (${resolvedFromZip}) and passes hash/compare smoke test.`);
        } else {
          fail('Isolated ZIP extraction smoke test failed: hash/compare returned invalid boolean.');
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
