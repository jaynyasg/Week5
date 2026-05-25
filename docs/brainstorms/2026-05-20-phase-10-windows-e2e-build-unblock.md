---
title: "Phase 10 - Windows E2E Build Unblock"
date: 2026-05-20
status: complete
parent: ORIENTATION.md
---

# Phase 10 - Windows E2E Build Unblock

## Goal

Resolve the Windows Playwright blocker from `ORIENTATION.md` finding #20. Playwright global setup runs `pnpm build:api`, and the API build script previously used POSIX-only `cp` commands.

## Implementation

- Added `api/scripts/build.mjs`.
- Replaced `api/package.json` build script with `node scripts/build.mjs`.
- The script runs the local TypeScript compiler and copies database assets with Node filesystem APIs:
  - `src/db/schema.sql` -> `dist/db/schema.sql`
  - `src/db/migrations/` -> `dist/db/migrations/`

## Result

`pnpm build:api` now works under PowerShell/cmd and bash-compatible shells.

## Verification

```powershell
pnpm build:api
```

The build produced:

- `api/dist/db/schema.sql`
- `api/dist/db/migrations/039_add_dependency_association_type.sql`

## Scope Note

This phase does not run the full Playwright suite directly. Repo instructions require using the E2E runner workflow for Playwright because direct execution produces extremely large output. The blocking prerequisite command that Playwright global setup invokes is now verified cross-platform.

