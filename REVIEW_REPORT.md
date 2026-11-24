# REVIEW_REPORT

Decision: FAIL_REPAIR_REQUIRED
Task ID: 20261117-madarcore-self-contained-runtime-upgrade
Plan revision reviewed: 2
Review date: 2026-11-18
Reviewer: Codex
Rejected handoff state: `READY_FOR_CODEX_LEVEL_C_RETEST_SELF_CONTAINED_RUNTIME`

## Verified positives

- Replacement ZIP SHA-256 is `b646f4731b2767bd076c8a76e69a3db9b684dc18cdc64f11ca20d81896799f72` and matches its `.sha256` file.
- Runtime metadata records supported Node `v20.20.2` and the expected runtime statistics.
- The payload is packaged as `server-runtime.zip`; the outer manifest/file-count performance problem was materially reduced.
- Focused FT-12 exits 0 and prints PASS, but that PASS is invalid for the reason below.

## Blocking findings

### R3-01 — P0 — Verified staged runtime is deleted before production deployment

`apply-madarcore-upgrade.ps1` extracts and verifies the candidate runtime during Phase 3, then its Phase-3 `finally` block unconditionally removes `$stagedRuntimeDir`. Phase 4 subsequently invokes the production Prisma CLI and `Deploy-VerifiedRuntimeGuarded` using paths under that deleted directory.

Independent reproduction preserved the FT-12 lab and read the actual report:

```text
result: ROLLBACK_SUCCESS
stateMachine: ROLLBACK_SUCCESS
acceptance: SUCCESS
deployment: IN_PROGRESS
health: NOT_STARTED
error: Staged runtime directory does not exist: ...\.staging_runtime_<guid>
deploymentMs: 0
```

Therefore the current artifact cannot deploy successfully. Level C would fail before the intended post-swap health boundary.

### R3-02 — P0 — FT-12 reports a false PASS without proving a post-swap failure

FT-12 accepts any `ROLLBACK_SUCCESS` plus restored baseline markers. It does not assert that files were swapped, the candidate became active, or the rollback trigger occurred in health/post-deployment verification. Because R3-01 causes a pre-swap failure, FT-12 still passes and its message incorrectly states that rollback occurred after swap.

### R3-03 — P1 — Build and test scripts contain a workstation-specific Node path

Both `tools/build-madarcore-client-upgrade.ps1` and `tools/test-madarcore-client-upgrade.ps1` hard-code `E:\NODS JS20.2`. This makes the tooling non-portable and can silently select a machine-specific executable. Supported Node enforcement is required, but the path must be supplied explicitly or discovered deterministically rather than committed as a local drive constant.

### R3-04 — P1 — Handoff hygiene is incomplete

- `git diff --check` fails on trailing whitespace in `IMPLEMENTATION_REPORT.md` and `tools/test-madarcore-client-upgrade.ps1`.
- No implementation/reporting commits exist for Revision 2; all implementation remains uncommitted.
- Workflow documents still show the prior active/fail state, so the report status alone cannot transition the task.

## Decision

Do not run PostgreSQL Level C and do not send the ZIP to a client. The ZIP with SHA-256 `b646f4731b2767bd076c8a76e69a3db9b684dc18cdc64f11ca20d81896799f72` is `REJECTED_NOT_DEPLOYABLE`.

Antigravity may perform only the corrections in the active `REPAIR_REQUEST.md`. Codex will first re-run the strengthened focused FT-12 and inspect its preserved report; Level A/B and Level C remain blocked until that gate is genuine.
