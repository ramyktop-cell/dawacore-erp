# REVIEW_REPORT

Decision: CHANGES_REQUESTED_LEVEL_C_PACKAGE_CLOSURE
Task ID: 20261116-madarcore-offline-upgrade-repair
Review cycle: 11
Reviewed implementation commit: `eec68bf8be5ff713009bf6554b79c3d4ca168fb9`
Reviewed reporting commit: `50fa74378fef8eb94541cb8c1e6e992ae07ec937`
Reviewer: Codex
Review date: 2026-11-17
Client deployment: NOT_DEPLOYED

## Decision

Level C did not pass. The exact ZIP must not be sent to a client. The run reached real PostgreSQL 16.15 acceptance and failed before deployment because the extracted package cannot resolve `bcryptjs` from `payload/tools/acceptance-upgrade.cjs`.

## Exact artifact and isolated lab

- ZIP: `installer_package/Output/MadarCore-Client-Upgrade-20261116.zip`
- SHA-256: `a33724825937f197cecb32da5f4046091a99266b85a28ef0ae82492b545d0052`
- Manifest verification after independent extraction: 1377/1377 files matched, 0 failures.
- PostgreSQL: 16.15 on isolated localhost port 55432.
- Cycle 10 database clone: `madarcore_levelc_c10`.
- Target clone: `E:\MadarCore_Upgrade_Lab_C10\Target`.
- Baseline: 6 applied migrations, 7 pending migrations, 37 public tables.

## Real Level C results

1. Preflight: PASS. Node 20.20.2 and PostgreSQL tools 16.15 were discovered; migration audit reported 6 applied and 7 pending.
2. Backup: PASS. A custom-format dump was created and verified with `pg_restore --list`; dump SHA-256 was `53c1096bfe0e44cc0ad864f77d0b08ac2d98141cc2fdf59f926762ddd7818ab2` and size was 303895 bytes.
3. Restore drill: PASS. The dump restored into an isolated acceptance database and table counts matched.
4. Candidate migrations on the temporary database: PASS. All 7 pending migrations applied.
5. Acceptance: FAIL. Node reported `Cannot find module 'bcryptjs'` from the extracted `payload/tools/acceptance-upgrade.cjs`.
6. Deployment: NOT_STARTED.
7. Post-deploy health: NOT_STARTED.
8. Standalone rollback: NOT_REACHED. Therefore LC-05..LC-08 are not yet fully proven on the exact ZIP.

## Safety verification after failure

- Target application tree hash matched the baseline.
- The stale baseline marker hash matched.
- Target database remained at 6 migrations and 37 tables.
- Schema-only dumps matched after excluding PostgreSQL 16 random `\\restrict`/`\\unrestrict` tokens.
- The failed run's temporary acceptance database was cleaned. The separately pre-existing `dawacore_upgrade_accept_levelc_debug` database was not created or modified by this run.

## Root cause

`tools/build-madarcore-client-upgrade.ps1` copies the acceptance script and the Prisma runtime closure, but does not copy `bcryptjs`. Earlier runs from `E:\DawaCore\installer_package\Output\...` accidentally resolved `bcryptjs` from the repository parent `E:\DawaCore\node_modules`. Independent ZIP extraction removes that accidental parent dependency and exposes the packaging defect.

## Gate

Status is CHANGES_REQUESTED. A new ZIP requires the minimal LC-09 repair in `REPAIR_REQUEST.md`, all Level A/B gates, and a fresh Codex Level C run through successful apply, acceptance, health and exact rollback.
