# REPAIR_REQUEST

Status: CHANGES_REQUESTED_LEVEL_C_PACKAGE_CLOSURE
Task ID: 20261116-madarcore-offline-upgrade-repair
Repair cycle: 11
Owner: Codex
Source review: `REVIEW_REPORT.md`

## LC-09 / Blocker — acceptance runtime dependency missing from the real ZIP

### Reproduction

1. Extract ZIP SHA-256 `a33724825937f197cecb32da5f4046091a99266b85a28ef0ae82492b545d0052` outside `E:\DawaCore`.
2. Run the real upgrade against an isolated PostgreSQL 16.15 target.
3. Preflight, backup, restore drill and candidate migrations pass.
4. Acceptance fails with `Cannot find module 'bcryptjs'` from `payload/tools/acceptance-upgrade.cjs`.

### Required minimal repair

1. In `tools/build-madarcore-client-upgrade.ps1`, copy only the required production package `node_modules/bcryptjs` into `payload/tools/node_modules/bcryptjs` while building the package. Fail the build clearly if its `package.json` or CommonJS entry `umd/index.js` is absent.
2. Do not copy the repository's complete `node_modules` and do not rely on `NODE_PATH`, the current working directory, or a parent repository installation.
3. In `tools/verify-madarcore-client-upgrade.cjs`, require the packaged `payload/tools/node_modules/bcryptjs/package.json` and `umd/index.js` and add an isolated-extraction check. Anchor module resolution at the extracted `payload/tools/acceptance-upgrade.cjs` with `module.createRequire`; require `bcryptjs`, execute a small hash/compare smoke test, and assert the resolved path is contained in the extracted package.
4. In `tools/test-madarcore-client-upgrade.ps1`, add one explicit regression test that extracts/copies the built artifact under the independent `%TEMP%` lab root and proves anchored `require('bcryptjs')` works there without repository parent modules. The test must fail against the current ZIP.
5. Rebuild manifest and ZIP, then verify every extracted manifest hash and the external `.sha256` file.
6. Do not change acceptance business scenarios, application code, database schema, migrations, permissions, or the apply/rollback behavior for this repair.

## Allowed files

- `tools/build-madarcore-client-upgrade.ps1`
- `tools/verify-madarcore-client-upgrade.cjs`
- `tools/test-madarcore-client-upgrade.ps1`
- `IMPLEMENTATION_REPORT.md`
- `REVIEW_REPORT.md`
- `REPAIR_REQUEST.md`
- `ANTIGRAVITY_HANDOFF.md`
- generated package output under `installer_package/Output/`

## Forbidden files

- `src/**`
- `frontend/src/**`
- `prisma/**`
- `tools/acceptance-upgrade.cjs`
- `installer_package/madarcore-client-upgrade/apply-madarcore-upgrade.ps1`
- `installer_package/madarcore-client-upgrade/rollback-madarcore-upgrade.ps1`
- authentication, authorization, expense, sales, purchase, inventory and accounting logic

## Required evidence before handoff

1. Actual diff limited to the allowed files.
2. Build succeeds.
3. Static verifier passes, including the independent extracted ZIP dependency-resolution check.
4. FT matrix passes with the new package-closure regression test reported explicitly.
5. Extracted ZIP manifest is 100% valid and ZIP SHA-256 matches its `.sha256` file.
6. Show that `bcryptjs` resolves to a path inside the extracted ZIP, not `E:\DawaCore\node_modules`.
7. Update `IMPLEMENTATION_REPORT.md` to `READY_FOR_CODEX_LEVEL_C_RETEST_PACKAGE_CLOSURE` and stop. Do not run PostgreSQL Level C or declare PASS.

## Next Codex gate

Codex will create a fresh isolated target/database and rerun the exact ZIP through `preflight -> backup -> acceptance -> apply -> health -> standalone rollback`, then compare database and application baseline evidence.
