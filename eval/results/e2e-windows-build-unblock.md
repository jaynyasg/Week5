# Windows E2E Build Unblock

Date: 2026-05-20

## Baseline Blocker

`ORIENTATION.md` finding #20 recorded that `pnpm test:e2e` could fail before browser execution on Windows because Playwright global setup calls `pnpm build:api`, and the API build script used POSIX-only `cp` commands.

Old command:

```json
"build": "tsc && cp src/db/schema.sql dist/db/schema.sql && cp -r src/db/migrations dist/db/migrations"
```

## Fix

`api/package.json` now runs:

```json
"build": "node scripts/build.mjs"
```

The Node build script invokes TypeScript and copies the required DB assets using `fs.cpSync`.

## Verification

Command:

```powershell
pnpm build:api
```

Result: passed.

Copied asset checks:

- `api/dist/db/schema.sql`
- `api/dist/db/migrations/039_add_dependency_association_type.sql`

## Remaining E2E Note

The full Playwright suite was not run directly in this phase because repository instructions require using the E2E runner workflow to avoid output explosion. This phase verifies the Windows-specific build prerequisite that previously blocked Playwright startup.

