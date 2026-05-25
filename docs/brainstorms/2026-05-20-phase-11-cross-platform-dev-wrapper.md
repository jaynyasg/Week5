---
title: "Phase 11 - Cross-Platform Dev Wrapper"
date: 2026-05-20
status: complete
parent: ORIENTATION.md
---

# Phase 11 - Cross-Platform Dev Wrapper

## Goal

Resolve the Windows setup blocker from `ORIENTATION.md` finding #1: root `pnpm dev` delegated to `scripts/dev.sh`, so Windows users had to manually run API and web servers in separate terminals.

## Implementation

- Added `scripts/dev.mjs`.
- Updated root `pnpm dev` to run `node scripts/dev.mjs`.
- Kept the original bash wrapper available as `pnpm dev:sh`.

The Node wrapper preserves the behavior from `scripts/dev.sh`:

- Creates `api/.env.local` with a worktree-derived local `DATABASE_URL` when missing.
- Creates and seeds a fresh local PostgreSQL database when needed.
- Runs `pnpm build:shared` before starting dev servers.
- Finds available API and web ports for multi-worktree development.
- Writes `.ports` while servers are running.
- Starts workspace dev servers with `PORT`, `CORS_ORIGIN`, `VITE_PORT`, and `VITE_API_URL` set.
- Removes `.ports` on exit.

## Verification

```powershell
node --check scripts/dev.mjs
node scripts/dev.mjs --dry-run
pnpm type-check
```

`--dry-run` exercises the port detection path and prints the server URLs without starting long-running dev processes.

## Compatibility Note

The bash script is intentionally retained for continuity. The package default now uses Node because Node is already required by the repo and behaves consistently across Windows, macOS, and Linux.

