# Discovery Write-up

This write-up pulls three lessons from the orientation findings in `ORIENTATION.md`. These are not category-by-category improvement notes; they are the codebase comprehension discoveries that most changed how the audit should be approached.

## 1. Setup reliability is part of product quality

**Orientation findings:** #1 through #5, #19, and #20.

The first surprise was that setup problems were not just documentation polish. On Windows, several baseline paths were blocked by platform assumptions: the original `pnpm dev` path depended on bash, the frontend build used POSIX inline environment-variable syntax, and the API build relied on `cp`. The README also blurred local PostgreSQL and Docker port expectations, and it described `pnpm test` as though it ran Playwright when it actually ran API Vitest.

**Codebase references:**

- `README.md:90-124` now documents local PostgreSQL-first setup, `pnpm dev`, Docker as optional, and the demo login path.
- `scripts/dev.mjs:1-214` is the cross-platform root development wrapper that replaces the bash-only local start path.
- `api/scripts/build.mjs:1-59` copies schema and migration files without POSIX shell commands.
- `web/scripts/build.mjs:1-34` builds the frontend without POSIX environment-variable syntax.
- `eval/results/setup-docs-hardening.md`, `eval/results/cross-platform-dev-wrapper.md`, and `eval/results/e2e-windows-build-unblock.md` record the verification.

**What it does and why it matters:** The dev wrapper creates the local environment, runs migrations/seeding when needed, builds shared types, finds available ports, and starts API plus web consistently across Windows, macOS, and Linux. This matters because every audit measurement depends on a reproducible local app.

**How I would apply this in a future project:** Treat first-run setup as a testable product path. I would make `npm/pnpm dev` own environment bootstrap, database readiness checks, port selection, and clear output instead of scattering those assumptions across shell snippets.

## 2. Strong TypeScript does not replace linting

**Orientation findings:** #12, #14, and #15.

The codebase already had a surprisingly strong TypeScript floor: strict mode passed, `noUncheckedIndexedAccess` was enabled, and type coverage was already high. That invalidated the simple assumption that Category 1 would be about "turning strict on." The real gap was different: there was no ESLint configuration, so rules for unused variables, React Hooks correctness, JSX accessibility, and other maintainability checks were not enforced.

**Codebase references:**

- `tsconfig.json:13-16` shows `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, and `noFallthroughCasesInSwitch`.
- `eval/results/type-safety-baseline.json` and `eval/results/type-coverage-baseline.txt` capture the baseline type-safety measurements.
- `eslint.config.mjs:1-58` now adds TypeScript, React Hooks, and JSX accessibility checks.
- `eval/results/eslint-phase05-summary.md` records the ESLint burn-down to 0 findings.

**What it does and why it matters:** The TypeScript config forces missing-return, switch-fallthrough, and indexed-access checks that catch common runtime edge cases at compile time. ESLint then covers separate quality dimensions such as React Hooks correctness, accessibility rules, and unused code.

**How I would apply this in a future project:** Start with strict TypeScript plus targeted ESLint from day one. I would avoid using type coverage as the only quality signal because a project can type-check cleanly while still missing hook, accessibility, or maintainability guardrails.

## 3. Test counts can hide false confidence

**Orientation finding:** #18.

The repository had a large test suite, but the orientation pass found six Playwright tests that silently passed despite containing only placeholder bodies. Ship already had a pre-commit hook intended to detect empty tests, which made the finding even more important: the control existed, but the codebase still carried historical false confidence.

**Codebase references:**

- `scripts/check-empty-tests.sh:24-56` uses stateful `awk` parsing to detect Playwright tests with no `expect()` or `page.` calls.
- `.husky/pre-commit:1-4` invokes the empty-test check before every commit.
- `eval/results/empty-tests-baseline.json` records the baseline empty-test findings.
- `eval/results/empty-tests-after.json` records the after-state with 0 empty tests.
- `eval/results/full-e2e-gate.md` records the final compact E2E run with 869 passed, 0 failed, 0 skipped, and 0 pending.

**What it does and why it matters:** Playwright accepts empty test bodies, so a suite can look green while proving nothing. The hook turns that false confidence into a failing pre-commit signal unless a test is intentionally marked with `test.fixme`, `test.skip`, or `test.todo`.

**How I would apply this in a future project:** Add lightweight test-quality checks alongside coverage thresholds. For any framework where placeholder tests can pass, I would make intentional stubs explicit and fail accidental empty tests before they enter the main branch.
