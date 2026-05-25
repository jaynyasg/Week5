# Setup Documentation Hardening

Date: 2026-05-20

## Baseline Gap

After the cross-platform build/dev fixes landed, the README and orientation notes still described several baseline Windows setup blockers as unresolved:

- README recommended a Docker-first setup path even though local PostgreSQL is the host-side dev path in this environment.
- README listed `pnpm db:seed` before `pnpm db:migrate`.
- README implied `pnpm test` ran Playwright, while it actually runs API Vitest.
- ORIENTATION still described the web build env-var syntax and setup instructions as active Windows blockers.

## Fix

- README now documents local PostgreSQL plus root `pnpm dev` as the main setup path.
- README explains first-run `pnpm dev` automation and dynamic port selection.
- Docker Compose remains documented as the optional full-stack path.
- Manual commands now show `db:migrate` before `db:seed`.
- Testing commands now separate `pnpm test`, `pnpm type-check`, `pnpm test:e2e`, and `pnpm test:e2e:ui`.
- ORIENTATION setup findings now show the relevant Phase 10-12 resolutions.

## Verification

Commands:

```powershell
node --check scripts/dev.mjs
node scripts/dev.mjs --dry-run
pnpm type-check
git diff --check
```

Expected result:

- Dev wrapper syntax remains valid.
- Dry-run still exercises port detection without starting long-running servers.
- Type checks are unaffected by the docs-only changes.
- Diff has no whitespace errors.
