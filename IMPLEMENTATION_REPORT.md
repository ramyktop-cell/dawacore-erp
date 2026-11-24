# IMPLEMENTATION REPORT

**Task ID:** 20261117-madarcore-self-contained-runtime-upgrade
**Plan Revision:** 2
**Repair Set:** R3-01..R3-04
**Implementation Owner:** Antigravity
**Execution Date:** 2026-11-18
**Status:** `READY_FOR_CODEX_LEVEL_C_RETEST_SELF_CONTAINED_RUNTIME`

---

## 1. Executive Summary & Defect Remediation (R3-01..R3-04)

This report documents the targeted remediation of defects **R3-01**, **R3-02**, **R3-03**, and **R3-04** identified during Codex review ([REVIEW_REPORT.md](file:///E:/DawaCore/REVIEW_REPORT.md)), strictly following [IMPLEMENTATION_PLAN.md](file:///E:/DawaCore/IMPLEMENTATION_PLAN.md) (Revision 2), [REPAIR_REQUEST.md](file:///E:/DawaCore/REPAIR_REQUEST.md), and [ANTIGRAVITY_HANDOFF.md](file:///E:/DawaCore/ANTIGRAVITY_HANDOFF.md).

All previously rejected packages (`63e1fca99e5ca973c3e0c0072205400c483139c04740d981a33f61f32d56be95` and `b646f4731b2767bd076c8a76e69a3db9b684dc18cdc64f11ca20d81896799f72`) have been **completely rejected and replaced**. A clean, self-contained upgrade package has been built with an explicit supported Node toolchain, statically verified under Level A, and passed all 36 tests in Level B with zero failures.

### Remediated Issues:

- **R3-01 (Preserve Verified Staging Lifetime Through Deployment):**
  - **Root Cause:** In `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`, the Phase 3 (acceptance drill) `finally` block prematurely deleted `$stagedRuntimeDir` upon acceptance success. When Phase 4 subsequently ran `Deploy-VerifiedRuntimeGuarded`, it failed with `"Staged runtime directory does not exist"`, triggering rollback *before* files were swapped.
  - **Fix:** Removed the premature `finally` block in Phase 3. The verified staging directory now persists through:
    1. Phase 4: Production migrations
    2. Phase 5: Guarded atomic directory swap (`Deploy-VerifiedRuntimeGuarded`)
    3. Package metadata copy (`runtime-metadata.json`, `package.json`, `package-lock.json`)
    4. Phase 6: Post-deployment health check and branding verification
    5. Automatic rollback execution (if triggered)
  - Staging directory cleanup is strictly restricted to: operator cancellation, candidate acceptance failure, and the final script-level `finally` block.
  - Added pre-deployment assertions before stopping production or running production migrations, strictly verifying the presence and integrity of: `$stagedRuntimeDir`, candidate Prisma CLI (`node_modules/prisma/build/index.js`), `dist`, `node_modules`, `package.json`, and `package-lock.json`.
  - Added preserved state tracking fields to `$reportData`: `lastSuccessfulState` and `rollbackTriggerPhase`, ensuring post-swap evidence is never overwritten when the terminal result becomes `ROLLBACK_SUCCESS`.

- **R3-02 (FT-12 Truthful Health-Boundary & Rollback Assertion):**
  - **Fix:** Updated FT-12 in `tools/test-madarcore-client-upgrade.ps1` with strict assertions proving genuine post-swap execution and rollback:
    1. Production migration succeeded (`lastSuccessfulState -in @("FILES_SWAPPED", "APPLICATION_RESTARTED")`).
    2. Rollback trigger phase is strictly post-deployment health (`rollbackTriggerPhase -eq "HEALTH"`), not missing staging or missing Prisma CLI.
    3. `phases.deployment -eq "SUCCESS"` and `phases.health -eq "FAILED"`.
    4. `durations.deploymentMs -gt 0`.
    5. Recorded error matches deliberate health check failure (`error -match "Health verification failed"`) and strictly does NOT contain `"Staged runtime directory does not exist"`.
    6. Rollback restored baseline `dist/main.js` (`ORIGINAL_FT12`), the stale legacy file (`dist/stale_legacy_code.js`), baseline runtime (`node_modules/old_client_pkg`), purged candidate-only packages (`node_modules/@nestjs`), and left zero `.staging*` or `.quarantine*` paths in target.

- **R3-03 (Remove Hardcoded Node Path & Enforce Supported Toolchain):**
  - **Fix:** Removed all committed references to `E:\NODS JS20.2` in `tools/build-madarcore-client-upgrade.ps1` and `tools/test-madarcore-client-upgrade.ps1`.
  - Added optional `-NodeExecutable` parameter and deterministic `Resolve-SupportedNodeToolchain` helper function in both scripts.
  - Validates that the selected executable is Node 20.19+ or Node 22 LTS (strictly rejecting Node 26 and unsupported releases).
  - Prepends the selected toolchain directory to `$env:Path`, ensuring `npm`, `npx`, and child `node` processes execute strictly within the approved toolchain.
  - Fails with a clear, actionable error if no supported Node toolchain is provided or found.

- **R3-04 (Handoff Hygiene & Deliverables):**
  - Cleaned all trailing whitespace across all modified repository files. `git diff --check` exits with Code 0.
  - Documented genuine FT-12 execution evidence and timings.
  - Executed Level A static verifier and full Level B test matrix (36/36 passed).
  - Maintained strict file boundaries (zero edits outside authorized files list).

---

## 2. Replacement Package Artifacts & Fingerprints

- **Release ID:** `MadarCore-Client-Upgrade-20261116`
- **Standalone ZIP Path:** `E:\DawaCore\installer_package\Output\MadarCore-Client-Upgrade-20261116.zip`
- **ZIP File Size:** `93.58 MB`
- **ZIP SHA-256:** `b66df528c417a9651bc47138c6e55ee9a9e639a6b0c45ebfdf04b714b1b6b209`
- **ZIP .sha256 File:** `E:\DawaCore\installer_package\Output\MadarCore-Client-Upgrade-20261116.zip.sha256`
- **Payload Runtime Archive:** `payload/server-runtime.zip` (`96.89 MB`)
- **Uncompressed Runtime Files:** `24,564 files` (`317,416,905 bytes`)
- **Runtime node_modules Fingerprint:** `6352a634f5e947def0218ac11ed4693bef3548a9edae06651e945b34e596d2fe`
- **Runtime dist Fingerprint:** `012a60f5001eaa7373219bdc04f853c8b5556d3022eea86cf399959312ead882`
- **Package Manifest File Count:** `30 files`
- **Build Node Executable Used:** `E:\NODS JS20.2\node.exe` (Supplied via `-NodeExecutable`)
- **Build Node Version:** `v20.20.2` (Supported LTS)
- **Build npm Version:** `11.17.0`
- **Platform / Arch:** `win32` / `x64`

---

## 3. Strict Execution Sequence & Gate Evidence

### Step 3.1: Syntax & Tokenization Gates
- **Node Scripts:**
  - `node -c tools/verify-madarcore-client-upgrade.cjs` -> **Exit 0**
  - `node -c tools/acceptance-upgrade.cjs` -> **Exit 0**
- **PowerShell AST Parser:**
  - `tools/build-madarcore-client-upgrade.ps1` -> **Exit 0**
  - `tools/test-madarcore-client-upgrade.ps1` -> **Exit 0**
  - `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1` -> **Exit 0**
  - `installer_package/madarcore-client-upgrade/upgrade-common.ps1` -> **Exit 0**
  - `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1` -> **Exit 0**

### Step 3.2: Focused FT-12 Pre-Matrix Gate (Genuine Post-Swap Evidence)
- **Command:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-madarcore-client-upgrade.ps1 -Filter "^FT-12$" -NodeExecutable "E:\NODS JS20.2\node.exe"`
- **Exit Code:** `0`
- **Actual Preserved Report Evidence:**
  ```text
  [EVIDENCE FT-12] Result: ROLLBACK_SUCCESS
  [EVIDENCE FT-12] Last Successful State: APPLICATION_RESTARTED
  [EVIDENCE FT-12] Rollback Trigger Phase: HEALTH
  [EVIDENCE FT-12] Deployment Phase: SUCCESS, Health Phase: FAILED
  [EVIDENCE FT-12] Deployment Ms: 123, Rollback Ms: 6318
  [EVIDENCE FT-12] Error: Health verification failed: Service did not respond with valid health contract on port 3099
  ✅ PASS: [FT-12] [SIMULATION_ONLY_NOT_PRODUCTION_EVIDENCE] Real apply failure after swap triggers automated rollback and restores complete previous tree and runtime.
  ```
- **Boundary Verification:**
  - `lastSuccessfulState`: `APPLICATION_RESTARTED` (Proves files were swapped and candidate app restarted)
  - `rollbackTriggerPhase`: `HEALTH` (Triggered strictly by health verification failure on port 3099)
  - `phases.deployment`: `SUCCESS`
  - `phases.health`: `FAILED`
  - `durations.deploymentMs`: `123 ms` (Non-zero, proving file swap completed)
  - `durations.rollbackMs`: `6318 ms`
  - Restored baseline files: `dist/main.js` matches `ORIGINAL_FT12`, stale file `dist/stale_legacy_code.js` restored, baseline package `node_modules/old_client_pkg` restored.
  - Purged candidate files: `node_modules/@nestjs` completely removed.
  - Zero leftover `.staging*` or `.quarantine*` directories.

### Step 3.3: Clean Replacement Package Build
- **Command:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/build-madarcore-client-upgrade.ps1 -NodeExecutable "E:\NODS JS20.2\node.exe" -PackageOnly`
- **Exit Code:** `0`
- **Preflight:** Toolchain verified `v20.20.2` via `Resolve-SupportedNodeToolchain`.
- **Prisma & Compilations:** Prisma client generated (456ms), NestJS backend compiled, React frontend compiled (1,835 modules), backend unit tests passed (17/17 passed in 5.04s).
- **Runtime Workspace:** Clean `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` in isolated GUID workspace; candidate Prisma CLI generated client; `npm ls --omit=dev --all` passed with 0 errors.
- **Archive Generation:** Created `payload/server-runtime.zip` (96.89 MB) and `manifest.json` (30 files).
- **Package Archive:** Created `MadarCore-Client-Upgrade-20261116.zip` (93.58 MB) with SHA-256 `b66df528c417a9651bc47138c6e55ee9a9e639a6b0c45ebfdf04b714b1b6b209`.

### Step 3.4: Level A Static Verifier
- **Command:** `node tools/verify-madarcore-client-upgrade.cjs`
- **Exit Code:** `0`
- **Verifications:**
  - Git status check: all files within allowed list.
  - All 7 root orchestrator files present.
  - Node version policy enforced and validated (`v20.20.2`).
  - Payload structure complete (`server-runtime.zip`, `runtime-metadata.json`, etc.).
  - Expanded `server-runtime` absent from payload.
  - Source lock SHA-256 match.
  - `npm ls --omit=dev --all` verified in extracted runtime.
  - All 29 direct production and critical modules resolve strictly inside package runtime.
  - `bcryptjs` and `@prisma/client` smoke tests passed.
  - Runtime fingerprint verified against metadata (`6352a634f5e947def0218ac11ed4693bef3548a9edae06651e945b34e596d2fe`).
  - Zero simulation tokens in package.
  - Manifest integrity: all 30 files match SHA-256 hashes.
  - Isolated outer ZIP extraction verified.

### Step 3.5: Level B Full Test Matrix (Executed Once)
- **Command:** `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-madarcore-client-upgrade.ps1 -NodeExecutable "E:\NODS JS20.2\node.exe"`
- **Exit Code:** `0`
- **Summary:** **36 Passed, 0 Failed, 0 Skipped**
  - `FT-01`: Manifest tamper rejection -> PASS
  - `FT-02`: Missing PostgreSQL tools rejection -> PASS
  - `FT-03`: Node version validator enforcement -> PASS
  - `FT-04`: Safe DB connection error without leaking secrets -> PASS
  - `FT-05`: Missing schema rejection -> PASS
  - `FT-06`: pg_dump failure handling -> PASS
  - `FT-07`: pg_restore --list failure handling -> PASS
  - `FT-08`: Temporary DB failure handling -> PASS
  - `FT-09`: Business acceptance safety contracts -> PASS
  - `FT-10`: Temp DB cleanup safety -> PASS
  - `FT-11`: Production migration failure automated rollback -> PASS
  - `FT-12`: Real apply failure after swap triggers automated rollback and exact tree restoration -> PASS (`lastSuccessfulState: APPLICATION_RESTARTED`, `rollbackTriggerPhase: HEALTH`, `deploymentMs: 515`, `rollbackMs: 9439`)
  - `FT-13`: Unresponsive application health failure rollback -> PASS
  - `FT-14`: Malformed health JSON rejection rollback -> PASS
  - `FT-15`: Branding mismatch rollback -> PASS
  - `FT-16`: Preserved files (.env, license.key) SHA-256 unchanged -> PASS
  - `FT-17`: Rollback error handling -> PASS
  - `FT-18`: Tampered DB dump hash rejection in standalone rollback -> PASS
  - `FT-19`: Rollback parameter validation -> PASS
  - `FT-20`: Atomic swap stale file purge -> PASS
  - `FT-21`: Full idempotency path (ALREADY_UP_TO_DATE) -> PASS
  - `FT-22`: NonInteractive safety guard -> PASS
  - `FT-23`: Arabic & spaces in path execution -> PASS
  - `FT-24`: Atomic upgrade report writing -> PASS
  - `FT-25`: Isolated package closure & module resolution -> PASS
  - `FT-26`: Dynamic disk space calculation (2GB floor + 1GB safety reserve) -> PASS
  - `FT-27`: Aggregate fingerprint determinism -> PASS
  - `FT-28`: Guarded deployment quarantine recovery on mismatch -> PASS
  - `FT-29`: Tampered runtime metadata rejection -> PASS
  - `FT-30`: Full runtime replacement cleans target node_modules -> PASS
  - `MIG-01`..`MIG-06`: Migration audit condition standalone tests -> PASS (6/6)

### Step 3.6: Whitespace Hygiene Check
- **Command:** `git diff --check`
- **Exit Code:** `0` (Zero whitespace or trailing newline errors)

---

## 4. Modified Files List (Section 4 Compliance)

Only authorized files from Section 4 of `IMPLEMENTATION_PLAN.md` were modified:
1. `tools/build-madarcore-client-upgrade.ps1`
2. `tools/verify-madarcore-client-upgrade.cjs`
3. `tools/test-madarcore-client-upgrade.ps1`
4. `tools/acceptance-upgrade.cjs`
5. `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`
6. `installer_package/madarcore-client-upgrade/upgrade-common.ps1`
7. `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1`
8. `installer_package/madarcore-client-upgrade/compatibility.json`
9. `installer_package/madarcore-client-upgrade/README-AR.txt`
10. `IMPLEMENTATION_REPORT.md`

**Forbidden Files Check:** Zero modifications to `src/**`, `frontend/src/**`, `prisma/schema.prisma`, `prisma/migrations/**`, root `package.json`, root `package-lock.json`, `.env`, or client credentials.

---

## 5. Handoff Decision

All implementation, verification, and hygiene criteria defined in Revision 2 and `REPAIR_REQUEST.md` (R3-01..R3-04) are fully satisfied:
- Verified runtime staging persists through deployment and cleans safely.
- FT-12 proves genuine post-swap health boundary failure and exact baseline rollback.
- Hardcoded workstation Node path eliminated; toolchain resolution enforced deterministically.
- `git diff --check` exits with Code 0.
- Level A passed; Level B 36/36 passed.
- Replacement package ZIP generated and verified.

Antigravity has stopped editing and has not run PostgreSQL Level C or modified production client data.

**Next Action:** Awaiting Codex review and Level C testing.
**State Transition Target:** `READY_FOR_CODEX_LEVEL_C_RETEST_SELF_CONTAINED_RUNTIME`

---

# Tenant isolation repair — 2026-11-22

**Plan:** `work/TENANT_ISOLATION_IMPLEMENTATION_PLAN.md` (Codex)

## Implemented scope

1. Medicine identifiers are company-local: `barcode`, `code`, and `scalePlu` use compound company constraints; create/update checks and generated codes are company-scoped.
2. Medicine catalogue operations now receive authenticated company context and scope list, categories, detail, create, update, delete, search, scan, POS lookup, top-selling/backfill, and bulk import.
3. The invalid empty-period `SaleItem.groupBy({ by: ['medicineId'] })` fallback was removed. Empty daily-sales periods return the normal zero report.
4. The already-authorized stock-count medicine-create call now supplies `stockCount.companyId`, solely to close compilation after `Medicine.companyId` became mandatory.
5. The migration infers legacy ownership from a medicine's batch branches, permits the single-company unambiguous fallback, and aborts instead of silently assigning unresolved multi-company rows.

## Verification evidence

- `npx prisma validate`: **PASS**.
- `npx tsc -p tsconfig.json --noEmit`: **PASS**.
- `npx jest --runInBand src/medicines/medicines.service.spec.ts`: **21 passed, 0 failed**.
- Direct isolated daily-sales test: **PASS**; zero summary and empty `topProducts`, with `groupBy` guarded to fail if called.
- Fresh local PostgreSQL acceptance on `127.0.0.1:55432`: **PASS** for the same barcode in two companies, duplicate rejection inside one company, Company A catalogue excluding Company B, foreign detail returning not-found, and empty daily-sales report.
- The temporary acceptance database `madarcore_tenant_repair_20261122` was removed after the successful run. No client or production database was touched.
- The repository's daily-sales Jest suite remains affected by its pre-existing Nest ESM test-loader error (`@nestjs/testing`); the repaired service behavior was therefore verified directly and through real PostgreSQL acceptance.

## Packaging note

`prisma/migrations/20261122000000_isolate_medicines_per_company/migration.sql` is ignored by the repository's broad `*.sql` rule. It must be included explicitly (for example with `git add -f` during the reviewed commit); no `.gitignore` change was made.

**Implementation state:** `READY_FOR_CODEX_REVIEW_TENANT_ISOLATION`
