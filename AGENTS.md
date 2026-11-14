
# AI Development Workflow

## Roles
- Codex brainstorm, architecture, planning, review.
- Antigravity implementation and targeted repairs.

## General Rules
1. Read the relevant project files before any action.
2. Preserve existing working functionality.
3. Never rewrite unrelated modules.
4. Never modify production data without approval.
5. Never expose or modify credentials or secrets.
6. Do not modify database schemas without an approved migration.
7. Follow existing coding standards.
8. Record every changed file.
9. Run relevant tests and report the results.
10. Do not run concurrent edits by different agents.

## Planning
Codex creates IMPLEMENTATION_PLAN.md.
The plan must include
- Objective
- Current behavior
- Required changes
- Allowed files
- Forbidden files
- Implementation steps
- Acceptance criteria
- Test plan
- Rollback plan

## Implementation
Antigravity follows IMPLEMENTATION_PLAN.md.
Do not expand the scope.
Write results to IMPLEMENTATION_REPORT.md.

## Review
Codex reviews actual diffs and tests.
Write REVIEW_REPORT.md.

If review fails
Create REPAIR_REQUEST.md containing
- Issue ID and severity
- File and location
- Reproduction steps
- Expected versus actual behavior
- Required minimal correction
- Regression tests

## Repair
Antigravity reads REPAIR_REQUEST.md.
Fix only the listed issues.
Preserve all unrelated functionality.
Update IMPLEMENTATION_REPORT.md.

## Approval
Only declare PASS when required tests succeed
and no unresolved blocking findings remain.

## Operational documents
Read AI_DEVELOPMENT_WORKFLOW.md for state transitions, baseline capture,
review evidence, and deployment gates. Use ANTIGRAVITY_HANDOFF.md for handoffs.
IMPLEMENTATION_PLAN.md starts in DRAFT with no active application task.
Only Codex may set PLAN_READY and issue a review decision.
Antigravity must stop editing before Codex reviews the final snapshot.
PASS approves the reviewed change; client deployment is verified separately.
