# IMPLEMENTATION_PLAN

Status: PLAN_READY
Task ID: 20261117-madarcore-self-contained-runtime-upgrade
Revision: 2
Owner: Codex
Implementation owner: Antigravity
Authorization: المستخدم اعتمد صراحة تحويل الترقية إلى Self-Contained Server Runtime Upgrade واحد شامل.
Baseline application/upgrade branch: `repair/madarcore-client-upgrade-v3` at reporting commit `2fc93b5`, with the current ZIP rejected and NOT_DEPLOYED.

## 1. Objective

Replace the incremental dependency patches with one deterministic offline upgrade artifact that contains the complete Windows production server runtime. The exact extracted ZIP must run candidate acceptance without reading any module from the development repository or the client's old `node_modules`. Deployment must replace the target runtime completely and rollback must restore the complete previous runtime and database exactly.

No client package is approved by this plan. Antigravity implements and proves Level A/B only, then Codex independently executes the real PostgreSQL Level C sequence through standalone rollback.

## Revision 2 binding correction (2026-11-18)

Revision 1 produced a structurally complete runtime, but its expanded 24,564-file payload made package verification and the repeated FT-12..FT-15 simulation paths unacceptably slow. FT-12 exceeded its 600-second limit before a report or rollback could be produced. The generated runtime was also built with Node v26.4.0 while the declared client compatibility permits only Node 20.19+ or Node 22. Both are release blockers.

This correction supersedes any conflicting Revision 1 wording:

1. The final payload contains `payload/server-runtime.zip` plus `payload/runtime-metadata.json`; it does not contain an expanded `payload/server-runtime/` tree.
2. `server-runtime.zip` contains the complete clean runtime tree: `dist`, `node_modules`, `package.json`, `package-lock.json`, and `prisma/schema.prisma`.
3. The outer package manifest hashes `server-runtime.zip` as one immutable file. Runtime metadata retains the deterministic internal file count, byte count, and aggregate fingerprint. The archive hash and the expanded-tree fingerprint are both mandatory; neither substitutes for the other.
4. Apply extracts the runtime exactly once into a GUID staging directory on the target volume, verifies the expanded fingerprint once, and reuses that verified tree for acceptance, Prisma, and activation. It must not copy the same candidate tree into a second staging directory or recalculate its full fingerprint again.
5. Use bounded `robocopy` for large verified tree backup/copy operations. Record phase durations in the report. Always clean abandoned staging/quarantine paths on success or controlled failure.
6. FT simulation cases use a generated compact runtime archive with the same structure and failure boundaries. Level A independently extracts and audits the full production runtime archive. Level C alone proves the full artifact with real PostgreSQL. Simulation fixtures must never be accepted as package evidence.
7. The runtime builder must run only under Node 20.19+ or Node 22 and must fail before `npm ci` on any other major version. The verifier independently rejects metadata containing a build Node version outside that range. The final runtime must be rebuilt under a supported Node version; the current Node-26 artifact is rejected.
8. Do not raise FT-12..FT-15 timeouts to conceal repeated work. Before the full Level B matrix, run a focused FT-12 smoke gate using the compact fixture. It must finish, write a report, and prove exact runtime/application rollback. Only then run the complete matrix.

The ZIP currently identified by SHA-256 `63e1fca99e5ca973c3e0c0072205400c483139c04740d981a33f61f32d56be95` is `REJECTED_NOT_DEPLOYABLE` and must not be sent to a client.

## 2. Current verified behavior and failure evidence

- ZIP `4db1b26036086fbb615b4448ebf9050b366f3111ea04c90fc0b8cc4110efc7bd` passed manifest and simulation gates but failed real Level C before deployment.
- `bcryptjs` was packaged separately, then `payload/dist/main.js` failed at `require('@nestjs/core')` because the candidate backend was not colocated with a full runtime.
- The current package contains backend `dist`, a partial Prisma runtime, and one acceptance dependency. It does not contain the complete production dependency tree.
- The deployment engine preserves most of the client's old `node_modules` and swaps only `prisma`, `@prisma`, and `.prisma`.
- The current root dependency tree contains about 319 production package paths, about 25,260 files, and about 293.79 MB uncompressed. The development `node_modules` is about 471.77 MB and must not be copied as-is.
- The rejected Level C runs did not change the target database or files; no client deployment occurred.

## 3. Binding architectural decision

### 3.1 Package layout

The generated payload must use this layout:

```text
payload/
  server-runtime/
    dist/
    node_modules/
    package.json
    package-lock.json
    runtime-metadata.json
    prisma/schema.prisma
  frontend/dist/
  prisma/schema.prisma
  prisma/migrations/**
  tools/acceptance-upgrade.cjs
```

`payload/prisma-runtime` and `payload/tools/node_modules/bcryptjs` are transitional structures and must be removed from the newly generated package. All backend modules, Prisma CLI/client/engines, and `bcryptjs` come from `payload/server-runtime/node_modules`.

### 3.2 Clean deterministic runtime build

The builder must create a new GUID-named temporary runtime workspace outside the repository output and:

1. Copy the unchanged root `package.json` and `package-lock.json`.
2. Set `PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`, and `PRISMA_SKIP_POSTINSTALL_GENERATE=true` only for the child install process, restoring the parent environment in `finally`.
3. Run a clean, non-interactive `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` against that workspace. Never copy the repository development `node_modules` and never use `npm install`.
4. Copy the candidate schema into `server-runtime/prisma/schema.prisma` and explicitly run the installed candidate Prisma CLI by absolute path to generate the client inside this runtime. Do not use `npx` and do not download a different Prisma version.
5. Run `npm ls --omit=dev --all` in the runtime and fail on an invalid/missing dependency tree.
6. Copy the compiled backend into `server-runtime/dist`.
7. Remove npm cache/temp residue, source maps only if the existing release policy already excludes them, and every `*.tmp*`; do not remove runtime licenses, fonts, templates, Prisma engines, `.bin` command shims, or package metadata.
8. Always delete the temporary workspace in `finally`.

The browser binary is not bundled. Compatibility must explicitly require an installed supported Chrome or Edge executable because application code already discovers system Chrome/Edge. Puppeteer package code remains in the runtime.

### 3.3 Runtime metadata and fingerprint

Generate `runtime-metadata.json` containing no secrets and at least:

- source `package-lock.json` SHA-256;
- Node and npm versions used for the build;
- platform/architecture (`win32/x64`);
- resolved direct production dependency names and exact installed versions;
- runtime file count and total bytes;
- deterministic aggregate runtime fingerprint computed from sorted relative path, file size, and SHA-256 for every file.

The package manifest still hashes every package file. A runtime fingerprint never replaces per-file manifest verification.

### 3.4 Candidate execution

- Acceptance loads Prisma client and `bcryptjs` explicitly through `module.createRequire` anchored at `payload/server-runtime/package.json`.
- Candidate main is `payload/server-runtime/dist/main.js` and runs with working directory `payload/server-runtime`.
- Its `NODE_PATH` is set only to `payload/server-runtime/node_modules`; inherited development `NODE_PATH` is not allowed.
- Before database fixture creation, resolve all direct production dependencies plus critical modules `@nestjs/core`, `@nestjs/common`, `@nestjs/swagger`, `@prisma/client`, `bcryptjs`, `pdfmake-rtl`, and `puppeteer`. Every resolution must remain inside `payload/server-runtime/node_modules`.
- Missing/out-of-bound modules fail before fixture seeding with bounded sanitized diagnostics.
- Existing HTTP/DB business scenarios and expected amounts must not change.

### 3.5 Full runtime deployment

The whole target `node_modules` becomes a managed deployment asset. It is no longer a preserved path.

Before production changes:

1. Stop the target safely according to the detected run mode.
2. Create and verify a complete backup of the old target `node_modules`, including hidden files and `.bin` shims.
3. Save a separate backup runtime manifest and its SHA-256 in the upgrade report.
4. Stage the complete candidate runtime under a run-specific directory on the target volume and verify its fingerprint against `runtime-metadata.json` before touching the live runtime.

Deployment then applies production migrations using the packaged Prisma CLI and atomically replaces:

- `dist` from `payload/server-runtime/dist`;
- entire `node_modules` from `payload/server-runtime/node_modules`;
- `frontend/dist`;
- Prisma schema and migrations.

Implement a guarded helper for exact directory replacement using same-volume staging and a quarantine rename. On any exception between moving the old directory and activating the candidate, restore the quarantine immediately. Never merge candidate files into the old runtime.

### 3.6 Full runtime rollback

Rollback must:

1. Validate canonical target/report containment and database dump hash as currently required.
2. Validate the complete runtime backup manifest/hash before deleting the candidate runtime.
3. Stage and verify the backed-up runtime on the target volume, then restore the entire previous `node_modules` exactly; candidate-only packages and stale files must disappear.
4. Restore old `dist`, frontend, Prisma schema/migrations, and the database using the existing clean-public-schema method.
5. Compare the restored runtime fingerprint, application tree, table counts, and preserved file hashes with baseline evidence.
6. Return success only after previous health/run mode is restored. Any mismatch is `MANUAL_RECOVERY_REQUIRED` with nonzero exit.

Partial Prisma subtree backup/restore logic must be removed from the new flow; it must not run in addition to full runtime replacement.

### 3.7 Disk and safety gates

Preflight must calculate required free space on the target volume from:

- complete old runtime backup size;
- staged candidate runtime size;
- application backups and database-dump allowance;
- a safety reserve of at least 1 GB.

Use `requiredPreflightFreeDiskMB` only as a floor. Report calculated required and available bytes. Reject insufficient space before backup or database changes.

Preserve exactly: `.env`, `license.key`, `uploads`, `backups`, `prerequisites`, and `nodejs`/the detected Node executable. Remove `node_modules` from `compatibility.json.preservedFiles` and document that it is now fully managed.

## 4. Allowed files

Antigravity may modify only:

1. `tools/build-madarcore-client-upgrade.ps1`
2. `tools/verify-madarcore-client-upgrade.cjs`
3. `tools/test-madarcore-client-upgrade.ps1`
4. `tools/acceptance-upgrade.cjs`
5. `installer_package/madarcore-client-upgrade/APPLY-MADARCORE-UPGRADE.bat`
6. `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`
7. `installer_package/madarcore-client-upgrade/upgrade-common.ps1`
8. `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1`
9. `installer_package/madarcore-client-upgrade/README-AR.txt`
10. `installer_package/madarcore-client-upgrade/compatibility.json`
11. `IMPLEMENTATION_REPORT.md`

Generated output under `installer_package/Output/` is allowed and must never be hand-edited. Active workflow documents are managed by Codex, not implementation code.

## 5. Forbidden files and operations

- No changes to `src/**`, `frontend/src/**`, `prisma/schema.prisma`, or `prisma/migrations/**`.
- No changes to root or frontend `package.json`/`package-lock.json`, `.npmrc`, Render/Vercel files, `.env`, licenses, activation, or client data.
- No copying of the repository development `node_modules` into the package.
- No module-by-module manual allowlist as the runtime construction mechanism.
- No fallback to `E:\DawaCore\node_modules`, target old `node_modules`, global npm modules, or inherited `NODE_PATH` during candidate acceptance.
- No mock/simulation flag in the production package and no weakening health, branding, authentication, tenant, permission, inventory, accounting, or rollback checks.
- No client delivery and no PostgreSQL Level C execution by Antigravity.

If a required change falls outside this list, stop with `SCOPE_REVISION_REQUIRED`; do not guess.

## 6. Implementation sequence

1. Capture hashes and diffs of every allowed source file before editing. Record Node/npm/PowerShell versions.
2. Implement reusable directory inventory/fingerprint, verified copy, disk calculation, target-volume staging, guarded replacement, and exact restoration helpers in `upgrade-common.ps1` with no target-specific constants.
3. Implement clean server runtime construction in the builder and new payload layout. Ensure any failure deletes the candidate ZIP/`.sha256` so an old artifact cannot be mistaken for the new release.
4. Update acceptance to use only packaged server runtime and preserve all business scenarios unchanged.
5. Update preflight, migration CLI path, backup report schema, full runtime staging/replacement, post-deploy comparison, idempotency, and automatic rollback.
6. Update standalone rollback for exact complete runtime restoration and fingerprint enforcement.
7. Update compatibility and Arabic README with package size expectations, free-space calculation, system Chrome/Edge prerequisite, full runtime backup, and rollback behavior.
8. Update static verifier and FT matrix before building the final ZIP.
9. Run every required gate. Fix only defects within this plan; do not narrow the runtime back to individual packages.
10. Update `IMPLEMENTATION_REPORT.md` with exact diffs, commands, exit codes, runtime statistics, package/manifest hashes, and test matrix. Set `READY_FOR_CODEX_LEVEL_C_RETEST_SELF_CONTAINED_RUNTIME` and stop.

No intermediate `READY_FOR_REVIEW` handoff is allowed. Complete all Level A/B work in this plan before stopping.

## 7. Required Level A static/package gates

The verifier must operate on both staging and an independently extracted ZIP outside the repository and prove:

1. Package root and manifest integrity; every file hash matches.
2. `server-runtime` contains dist, package files, metadata, Prisma-generated client/engine, `.bin` shims, and all direct production dependencies.
3. The packaged lock hash equals the source lock hash recorded in metadata.
4. `npm ls --omit=dev --all` succeeds inside extracted runtime without install or network.
5. Every direct production dependency resolves inside extracted `server-runtime/node_modules`; no resolution path contains repository or external parent `node_modules`.
6. Critical modules can be required and Prisma client can be constructed/disconnected against a safe invalid URL without package-resolution failure.
7. Runtime metadata file count/bytes/fingerprint match the extracted tree.
8. `prisma-runtime` and `tools/node_modules/bcryptjs` do not exist in the new ZIP.
9. Forbidden files/secrets/simulation tokens are absent.
10. ZIP SHA-256 matches the external `.sha256` file.

## 8. Required Level B functional matrix

Keep all currently valid tests and add production-grade cases for:

- clean runtime build uses `npm ci --omit=dev` and rejects source lock mismatch;
- missing/corrupt direct or transitive runtime dependency;
- missing/corrupt Prisma engine/client;
- runtime metadata or manifest tampering;
- no repository/target/global module fallback from extracted ZIP;
- insufficient calculated disk space before mutation;
- exact complete runtime backup with hidden files and `.bin` shims;
- candidate staging fingerprint mismatch leaves live runtime untouched;
- failure between quarantine rename and candidate activation restores the old runtime;
- successful full runtime replacement removes stale and dev-only target packages;
- automatic rollback after post-swap failure restores exact old runtime fingerprint;
- standalone rollback rejects missing/tampered runtime backup;
- `.env`, license, uploads, backups, prerequisites, and nodejs preservation;
- idempotent second apply recognizes the exact runtime and does not create a new backup;
- Arabic/space paths and Windows path delimiters;
- report states and nonzero exit codes for every failure.

All tests must use real conditions, not literal success booleans. Simulation cases remain labeled simulation and never count as PostgreSQL evidence.

## 9. Acceptance criteria

| ID | Required result |
|---|---|
| SR-01 | Runtime is built cleanly from unchanged lockfile; no development-tree copy. |
| SR-02 | All direct production dependencies resolve from extracted ZIP runtime only. |
| SR-03 | Runtime fingerprint, file count, bytes, and lock hash match metadata. |
| SR-04 | Candidate Prisma CLI/client/engine work from packaged runtime. |
| SR-05 | Candidate backend starts from independently extracted ZIP with repository and target module fallback unavailable. |
| SR-06 | Existing full HTTP/DB acceptance matrix passes unchanged. |
| SR-07 | Complete old `node_modules` backup is verified before production changes. |
| SR-08 | Dynamic disk gate rejects insufficient space without mutation. |
| SR-09 | Full deployment removes stale/old runtime files and matches candidate fingerprint exactly. |
| SR-10 | `.env`, license, uploads, backups, prerequisites, and nodejs remain byte-identical/preserved. |
| SR-11 | Production migrations use packaged Prisma CLI and expected schema only. |
| SR-12 | Strict health and branding pass after cold start. |
| SR-13 | Second apply returns `ALREADY_UP_TO_DATE` using complete payload/runtime comparison. |
| SR-14 | Any deployment failure yields correct nonzero status and exact automatic rollback. |
| SR-15 | Standalone rollback restores baseline database, entire runtime, files, run mode, and health. |
| SR-16 | Tampered dump/runtime backup/package is rejected before destructive restoration. |
| SR-17 | Runtime replacement and restoration remain recoverable at every guarded rename boundary. |
| SR-18 | Paths with Arabic characters/spaces work. |
| SR-19 | Reports/logs contain no passwords, JWT secrets, license contents, or full environment dumps. |
| SR-20 | Final ZIP/manifest/SHA refer to the exact artifact tested. |

## 10. Codex Level C gate after handoff

Antigravity does not run this gate. Codex will use a fresh PostgreSQL 16.15 database clone and fresh target clone, record full database/application/runtime baseline, extract the exact ZIP outside the repository, and execute:

```text
preflight -> backup/restore drill -> full acceptance -> production apply
-> health/branding -> idempotent second apply -> standalone rollback
-> exact database/application/runtime comparison
```

PASS requires 6 baseline migrations and baseline tables/data/runtime to return exactly after rollback, with candidate-only database objects and runtime packages absent. Any failure produces one evidence-backed review; the ZIP remains NOT_DEPLOYED.

## 11. Implementation rollback and delivery

- Source rollback: revert only the implementation commits for this task; preserve unrelated Vercel and application work.
- Generated artifact rollback: delete the rejected generated output only after a replacement is successfully built; never overwrite client files.
- No schema/data migration is added by this task.
- Final handoff must include separate implementation and reporting commits, exact ZIP SHA-256, runtime fingerprint/statistics, Level A output, complete Level B totals, and status `READY_FOR_CODEX_LEVEL_C_RETEST_SELF_CONTAINED_RUNTIME`.
