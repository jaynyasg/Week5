# Phase 15 Windows E2E Runner Hardening

## Goal

Exercise the compact E2E runner against the real Playwright harness and fix the next blockers that prevent Windows machines from running isolated browser tests.

## Findings

- A full `pnpm test:e2e -- --workers=2` run initialized the 869-test suite but overran the command timeout while failing early tests.
- Sampled errors shared one root cause: `spawn npx ENOENT` from `e2e/fixtures/isolated-env.ts` when starting `vite preview`.
- After fixing that spawn path, the isolated spike reached the API and frontend but failed on `subnet.networkForm is not a function`.
- That second failure came from an incompatible override pair: `express-rate-limit@8.5.2` expects `ip-address` `^10.2.0`, but the root override pinned `ip-address` to `10.1.1`.
- The runner's raw logs disappeared because Playwright clears `test-results` at startup; the runner now writes child output lazily after that cleanup.
- The progress reporter counted retry attempts as additional tests; it now tracks the latest status per Playwright test id.

## Implementation

- Changed the Windows Vite preview spawn path to use `cmd.exe /c pnpm exec vite preview`.
- Changed `scripts/run-e2e.mjs` to pipe child output and lazily append to `test-results/runner/*.log`.
- Removed the Windows shell-args deprecation warning from the runner's Playwright spawn path.
- Added Windows process-tree cleanup for Playwright, API, and Vite preview children to avoid orphaned test servers after interrupted or completed runs.
- Updated `e2e/progress-reporter.ts` to produce retry-aware totals that do not exceed 100%.
- Updated the root `ip-address` override to `10.2.0` and refreshed `pnpm-lock.yaml`.

## Verification

```powershell
pnpm test:e2e -- e2e/spike-isolated.spec.ts --workers=1
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|cmd' -and ($_.CommandLine -match 'playwright|vite preview|run-e2e|pnpm exec playwright|@playwright|pnpm.*exec.*vite.*preview') }
node --check scripts/run-e2e.mjs
pnpm type-check
pnpm audit:ci
```

The focused E2E slice passed 4/4. At the time of this phase, the full suite remained a release prerequisite, preferably with `--workers=1` or `--workers=2` on low-memory Windows machines.

Resolved 2026-05-22: the final full release gate ran with `pnpm test:e2e -- --workers=2` and completed with 869 passed, 0 failed, 0 skipped, and 0 pending tests. See `eval/results/full-e2e-gate.md`.
