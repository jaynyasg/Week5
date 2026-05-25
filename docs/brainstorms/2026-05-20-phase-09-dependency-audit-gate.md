---
title: "Phase 09 - Dependency Audit Gate"
date: 2026-05-20
status: complete
parent: docs/brainstorms/2026-05-20-phase-08-dependency-audit-zero.md
---

# Phase 09 - Dependency Audit Gate

## Goal

Make the zero-advisory dependency baseline from Phase 08 durable in CI for both GitHub and GitLab.

## Implementation

- Added `scripts/check-dependency-audit.mjs`.
- Added root script `pnpm audit:ci`.
- Added `.github/workflows/dependency-audit.yml`.
- Added `.gitlab-ci.yml`.

## Gate Behavior

The audit script runs `pnpm audit --json`, parses the vulnerability summary, prints counts for `critical`, `high`, `moderate`, `low`, and `info`, and exits nonzero if any count is above zero.

This keeps the policy simple while the baseline is clean: new dependency advisories must either be remediated immediately or intentionally handled in a future policy change.

## CI Coverage

| Platform | Triggers |
|---|---|
| GitHub Actions | Pull request, push to `main`, weekly schedule, manual dispatch |
| GitLab CI | Merge request, default-branch push, scheduled pipeline |

Both jobs install with `pnpm install --frozen-lockfile --ignore-scripts` and then run `pnpm audit:ci`.

## Verification

Local verification:

```powershell
pnpm audit:ci
```

Expected output:

```text
Dependency audit summary:
  critical: 0
  high: 0
  moderate: 0
  low: 0
  info: 0
Dependency audit gate passed.
```

