# REPAIR_REQUEST

Status: ACTIVE
Task ID: 20261117-madarcore-self-contained-runtime-upgrade
Plan revision: 2
Repair set: R3-01..R3-04

## R3-01 — P0 — Preserve verified staging through deployment

### Files

- `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`

### Required minimal correction

1. Do not delete the verified `$stagedRuntimeDir` after successful temporary-database acceptance.
2. Keep it alive through production migration, guarded activation, package metadata copy, post-deploy health/branding, and any automatic rollback invocation.
3. Clean it on acceptance failure/cancellation and in one final deployment-scope cleanup path after success or controlled failure.
4. Never delete a quarantine/backup required for manual recovery.
5. Before stopping production or running production migrations, assert that the staged Prisma CLI, `dist`, `node_modules`, `package.json`, and `package-lock.json` still exist.
6. Record the rollback trigger phase and the last successful pre-rollback state in the report without overwriting that evidence when the terminal result becomes `ROLLBACK_SUCCESS`.

## R3-02 — P0 — Make FT-12 prove the intended post-swap boundary

### Files

- `tools/test-madarcore-client-upgrade.ps1`

### Required minimal correction

FT-12 must fail unless all of the following are true:

1. Production migration succeeded.
2. Runtime/application activation occurred (`FILES_SWAPPED` or an equivalent preserved last-successful-state field).
3. The rollback trigger phase is post-deployment health/branding, not missing staging, missing Prisma, or another pre-swap failure.
4. The recorded error matches the deliberate health failure and does not contain `Staged runtime directory does not exist`.
5. Automatic rollback restored baseline `dist`, the stale marker, the exact old runtime fingerprint/marker, and removed candidate-only packages.
6. No `.staging_runtime_*` or `.quarantine_*` path remains.

Add a preserved report field such as `rollbackTriggerPhase` and `lastSuccessfulState`; do not infer post-swap execution only from the final `ROLLBACK_SUCCESS` value.

Run focused FT-12 first. Preserve its lab/report during the implementation check and include the relevant report fields in `IMPLEMENTATION_REPORT.md`. If it fails, stop without running Level A/B.

## R3-03 — P1 — Remove workstation-specific Node path

### Files

- `tools/build-madarcore-client-upgrade.ps1`
- `tools/test-madarcore-client-upgrade.ps1`

### Required minimal correction

1. Remove committed references to `E:\NODS JS20.2` or any developer-specific absolute path.
2. Add an optional explicit `-NodeExecutable` parameter and/or deterministic PATH discovery.
3. Validate that the selected executable is Node 20.19+ or Node 22 before work begins.
4. Ensure npm is executed using the same selected Node installation, not an unrelated global npm.
5. Fail with a clear actionable message when no supported Node toolchain is supplied/found.
6. The report may record the actual local path used for the build; source code may not hard-code it.

## R3-04 — P1 — Restore handoff hygiene

### Files

- `IMPLEMENTATION_REPORT.md`
- whitespace-only cleanup in already allowed modified files

### Required minimal correction

1. Make `git diff --check` exit 0.
2. Update the report with the genuine focused FT-12 report evidence and exact timings.
3. After all required gates pass, create the required implementation commit followed by the reporting commit.
4. Do not add old untracked Cycle documents to either commit.

## Allowed scope

Only the four files named above, generated output, and the already-authorized reporting file may change. No changes to application source, frontend source, schema/migrations, package files, activation/licensing, cloud configuration, or client data.

## Mandatory order

1. Implement R3-01 and R3-02.
2. Run syntax checks.
3. Run focused FT-12 and inspect its report fields. Stop on failure.
4. Implement/verify R3-03 and whitespace cleanup.
5. Rebuild the ZIP with an explicitly supplied supported Node executable.
6. Run Level A once and full Level B once.
7. Update the implementation report and create two commits.
8. Stop for Codex review. Do not run Level C and do not send the package.
