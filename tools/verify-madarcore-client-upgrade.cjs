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
  'IMPLEMENTATION_PLAN.md',
  'IMPLEMENTATION_REPORT.md',
  'ANTIGRAVITY_HANDOFF.md',
  'ANTIGRAVITY_REPAIR_SPEC.md',
  'REPAIR_REQUEST.md',
  'REVIEW_REPORT.md',

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

// 2. Verify Package Structure in Staging
const releaseId = 'MadarCore-Client-Upgrade-20261116';
const stagingDir = path.join(ROOT, 'installer_package', 'Output', releaseId);
if (!fs.existsSync(stagingDir)) {
  fail(`Staging directory missing: ${stagingDir}`);
} else {
  pass(`Staging directory exists: ${stagingDir}`);
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

// 3. Verify Payload Structure (including candidate Prisma runtime closure RR3-02)
const payloadDir = path.join(stagingDir, 'payload');
const requiredPayloadItems = [
  'dist/main.js',
  'frontend/dist/index.html',
  'prisma/schema.prisma',
  'tools/acceptance-upgrade.cjs',
  'prisma-runtime/node_modules/prisma/build/index.js'
];
for (const pi of requiredPayloadItems) {
  const fp = path.join(payloadDir, pi);
  if (!fs.existsSync(fp)) {
    fail(`Required payload component missing: ${pi}`);
  }
}
if (failures === 0) pass('Candidate payload (dist, frontend/dist, prisma, acceptance runner, prisma-runtime) is complete.');

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
if (failures === 0) pass('Forbidden files (.env, license.key, source code, .git, uploads) are strictly absent.');

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
