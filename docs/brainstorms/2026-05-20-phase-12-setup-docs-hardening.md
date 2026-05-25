---
title: "Phase 12 - Setup Documentation Hardening"
date: 2026-05-20
status: complete
parent: ORIENTATION.md
---

# Phase 12 - Setup Documentation Hardening

## Goal

Close the remaining setup-documentation gaps after the Windows build and dev-script fixes. The implementation was already cross-platform; the reviewer-facing docs still described the baseline blockers as active.

## Implementation

- Updated `README.md` to document `pnpm@10.27.0`.
- Changed the primary setup path to local PostgreSQL plus root `pnpm dev`.
- Documented what `pnpm dev` does on first run: creates `api/.env.local`, creates the local database when needed, migrates, seeds, builds shared types, chooses ports, and starts API/web.
- Kept Docker Compose as an optional full-stack path via `pnpm docker:up`.
- Corrected command descriptions for unit tests versus Playwright E2E tests.
- Updated `ORIENTATION.md` so the Windows setup findings show their Phase 10-12 resolution status.
- Updated `SUBMISSION.md` so reviewers can find this documentation hardening pass.

## Verification

```powershell
node --check scripts/dev.mjs
node scripts/dev.mjs --dry-run
pnpm type-check
git diff --check
```

## Outcome

The setup story now matches the project behavior:

- Host-side dev works without bash.
- `pnpm dev` is the happy path for Windows, macOS, and Linux.
- Docker is no longer implied as the only database path.
- Manual commands now list `db:migrate` before `db:seed`.
- `pnpm test` is correctly documented as API Vitest, with Playwright under `pnpm test:e2e`.
