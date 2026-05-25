# Windows E2E Runner Hardening Verification

## Initial Full-Suite Attempt

`pnpm test:e2e -- --workers=2` initialized the real Playwright suite with 869 tests, but the command overran the execution timeout. The compact summary reached 252 failures and 617 pending tests before cleanup. Sampled failure logs all pointed to the same infrastructure issue: `spawn npx ENOENT` from the isolated E2E fixture.

## Final Full-Suite Gate

After the runner hardening and focused fixes, the full suite was rerun on 2026-05-22:

```powershell
pnpm test:e2e -- --workers=2
```

Result: 869 passed, 0 failed, 0 skipped, 0 pending. See `eval/results/full-e2e-gate.md`.

## Fixes Verified

- Windows preview server spawn now routes through `cmd.exe /c pnpm exec vite preview`.
- Runner stdout/stderr logs persist under `test-results/runner/` after Playwright clears `test-results`.
- Progress summary is retry-aware and no longer exceeds 100%.
- Windows process-tree cleanup leaves no Playwright or Vite preview child processes after the focused run exits.
- `ip-address` override is `10.2.0`, matching `express-rate-limit@8.5.2`'s patched key-generator dependency surface.

## Passing Command

```powershell
pnpm test:e2e -- e2e/spike-isolated.spec.ts --workers=1
```

Result: 4 passed, 0 failed.

This focused slice covers testcontainers PostgreSQL startup, schema/seed setup, API startup, Vite preview startup, proxy routing, CSRF token handling, and seeded login.

## Additional Checks

```powershell
node --check scripts/run-e2e.mjs
pnpm type-check
pnpm audit:ci
git diff --check
```

All passed. `pnpm audit:ci` reports 0 advisories, and a post-run process check found no leftover Playwright or Vite preview processes.
