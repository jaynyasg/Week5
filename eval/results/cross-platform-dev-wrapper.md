# Cross-Platform Dev Wrapper

Date: 2026-05-20

## Baseline Blocker

`ORIENTATION.md` finding #1 recorded that `pnpm dev` was bash-only on Windows because it executed `./scripts/dev.sh`.

## Fix

Root `package.json` now runs:

```json
"dev": "node scripts/dev.mjs"
```

The previous bash wrapper is still available:

```json
"dev:sh": "./scripts/dev.sh"
```

## Verification

Commands:

```powershell
node --check scripts/dev.mjs
node scripts/dev.mjs --dry-run
pnpm type-check
```

Dry-run output confirmed available port detection and the generated API/web URLs without starting long-running dev servers.

## Behavior Preserved

- Worktree-derived `api/.env.local` creation.
- Local database creation and first-run seed.
- `pnpm build:shared` before server startup.
- Dynamic API/web port selection.
- `.ports` lifecycle.
- Parallel workspace dev server startup with API/web environment variables.

