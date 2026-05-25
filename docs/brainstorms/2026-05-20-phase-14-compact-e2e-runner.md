# Phase 14 Compact E2E Runner

## Goal

Close the remaining E2E workflow risk by making the safe, compact Playwright execution path the default repo command. The previous guidance depended on an external `/e2e-test-runner` skill; this phase keeps that preferred workflow, but gives the repository itself the same output-dampening behavior through `pnpm test:e2e`.

## Implementation

- Added `scripts/run-e2e.mjs`, a Node wrapper around `pnpm exec playwright test`.
- Captures Playwright stdout and stderr to `test-results/runner/playwright.stdout.log` and `test-results/runner/playwright.stderr.log`.
- Polls `test-results/summary.json`, written by `e2e/progress-reporter.ts`, and prints compact progress lines.
- Preserves Playwright argument passthrough for focused files, `--workers`, and `--last-failed`.
- Keeps raw Playwright available as `pnpm test:e2e:raw` for explicit debugging.
- Updated README, AGENTS, Claude reference docs, and submission notes so all guidance points to the compact runner.

## Verification

```powershell
node --check scripts/run-e2e.mjs
node scripts/run-e2e.mjs --help
node scripts/run-e2e.mjs --dry-run -- --last-failed
pnpm test:e2e -- --help
pnpm test:e2e -- --dry-run -- --last-failed
pnpm type-check
git diff --check
```

Full Playwright execution was intentionally not run in this phase because the change is the execution wrapper itself and the repo still requires a running local PostgreSQL environment for the E2E suite. The wrapper's dry-run and help paths verify command parsing without triggering the large test stream this phase is designed to avoid.

Resolved 2026-05-22: the final full release gate ran through the compact runner with `pnpm test:e2e -- --workers=2` and completed with 869 passed, 0 failed, 0 skipped, and 0 pending tests. See `eval/results/full-e2e-gate.md`.
