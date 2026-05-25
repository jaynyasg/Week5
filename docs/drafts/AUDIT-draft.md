# Ship — Audit Report (DRAFT)

> **This is a draft / template.** The final `AUDIT.md` at the repo root is the document graders should read. This file lives at `docs/drafts/AUDIT-draft.md` and exists to show the methodology, interpretation framework, and improvement approach established BEFORE running any measurements. The final version at the repo root is populated during U6 (baseline) and U22 (improvements) of the ShipShape implementation plan, with all `[BASELINE: TBD]` and `[AFTER: TBD]` markers filled in with measured values.
>
> **Draft status:** This document is pre-filled with methodology, interpretation framework, and improvement approach for each of the 7 audit categories. Sections marked `[BASELINE: TBD]` are filled in during the audit phase (plan units U2–U5, U24). Sections marked `[AFTER: TBD]` are filled in after improvements land (plan units U11–U17). All `TBD` markers are replaced before final submission per the U21 grep verification.
>
> **Target repo:** `US-Department-of-the-Treasury/ship` (forked)
> **Project:** ShipShape — Auditing and Improving a Production TypeScript Codebase
> **Auditor:** [BASELINE: TBD — your name]
> **Audit date:** [BASELINE: TBD]
>
> **Companion documents:**
> - `ORIENTATION.md` — codebase orientation notes per the PDF Appendix Checklist (24+ questions answered)
> - `ARCHITECTURE.md` — system architecture with before/after sections for every changed area
> - `THREAT_MODEL.md` — security analysis with dependency CVE baseline
> - `eval/results/` — all measurement artifacts referenced by this report

---

## How to Read This Report

This audit follows the **diagnostic-before-treatment** principle from the ShipShape PDF: every finding is measured first, classified by severity, and then addressed by a targeted improvement with reproducible before/after evidence.

Each of the 7 categories below is structured as:

1. **What this category measures** — the engineering quality dimension under test
2. **Why it matters** — what breaks (or who is harmed) when this dimension degrades
3. **How we measured it** — specific tools, commands, and artifacts produced
4. **Findings** — baseline numbers with severity classification (Critical / High / Medium / Low)
5. **Interpretation** — what the numbers mean in the context of this specific codebase
6. **Improvement plan** — the targeted fix, the predicted impact, and the success threshold
7. **After measurement** — post-improvement numbers and proof of reproducibility

The audit was conducted on the forked `US-Department-of-the-Treasury/ship` codebase. The unified document model, Yjs real-time collaboration core, and Terraform infrastructure are out of scope as architectural constants — improvements target performance, type safety, error handling, bundle size, query efficiency, test coverage, and accessibility within those constants.

---

## Audit Methodology

### Tools used

| Category | Primary tool | Output artifact |
|---|---|---|
| Type safety | `grep`, `tsc --strict --noEmit`, `type-coverage`, ESLint | `eval/results/type-safety-baseline.json`, `eval/results/eslint-baseline.json` |
| Bundle size | `rollup-plugin-visualizer`, `pnpm build`, `depcheck` | `eval/results/bundle-baseline.json`, `web/stats.html` |
| API response time | `autocannon` (Node-native HTTP load testing) | `eval/results/api-benchmark-baseline.json` |
| Database queries | PostgreSQL `EXPLAIN ANALYZE`, query logging | `eval/results/db-query-baseline.md` |
| Test coverage | `pnpm test`, `c8` / `@vitest/coverage-v8` | `eval/results/test-coverage-baseline.json` |
| Runtime errors | Browser DevTools, server logs, manual reproduction | `eval/results/error-baseline.md` |
| Accessibility | Lighthouse CLI, `axe-core` / `pa11y-ci`, manual NVDA testing | `eval/results/a11y-baseline.json` |
| Code health (supplemental) | `madge` (circular deps), `pnpm audit` (CVE scan), `pnpm outdated` | `eval/results/madge-*.{txt,svg}`, `eval/results/dependency-*.{json,md}` |

### Severity classification framework

Each finding is classified by severity to prioritize improvements:

| Severity | Definition | Example |
|---|---|---|
| **Critical** | Active or near-term user harm; data loss, security exposure, or app-wide breakage | Unsanitized HTML output enabling stored XSS; unhandled rejection crashing the server |
| **High** | Significant degradation of UX, performance, or maintainability; not yet causing harm but trending that way | P95 latency >2 seconds on a frequently-used endpoint; 100+ `any` types in critical route handlers |
| **Medium** | Quality erosion that compounds over time; not visible to users today | Missing index that will degrade at 10× load; ESLint warnings in core modules |
| **Low** | Stylistic, structural, or minor improvements | Inconsistent component naming; minor bundle bloat from a single oversized dependency |

### Reproducibility

Every measurement in this report is captured as a committed artifact in `eval/results/`. Benchmarks were run on `[BASELINE: TBD — hardware description]` with the database seeded via `[BASELINE: TBD — seed command]` producing 500+ documents, 100+ issues, 20+ users, and 10+ sprints. Any reviewer can re-run the same measurements:

```bash
# Performance and accessibility (require running app + seeded DB)
node eval/benchmark-api.js --baseline
bash eval/benchmark-bundle.sh
psql $DATABASE_URL -f eval/benchmark-queries.sql
pnpm test:a11y

# Static evaluation (deterministic, no environment dependencies)
pnpm dlx type-coverage --detail
pnpm exec eslint . --format=json
pnpm dlx madge --circular --extensions ts,tsx web/src api/src
pnpm audit --json
pnpm outdated --format=json
```

Diffing baseline vs. after-improvement is built into the benchmark scripts via `--compare` flags.

---

## Category 1: Type Safety

### What this category measures

The strength of TypeScript's type system as actually used in this codebase. This is not "do we use TypeScript" (yes — the entire monorepo is TypeScript) but rather "how often is the type system bypassed or weakened." Specifically: explicit `any` types, type assertions (`as`), non-null assertions (`!`), `@ts-ignore` / `@ts-expect-error` directives, untyped function parameters, and implicit `any` from missing return types.

### Why it matters

TypeScript's value proposition is catching bugs at compile time that would otherwise surface as runtime exceptions. Every `any` is a hole in that net. Every `as` is a place where the developer told the compiler "trust me" — and developers are sometimes wrong. In a codebase used by federal agencies, runtime exceptions from preventable type errors are a production reliability risk.

### How we measured it

1. **Grep counts** across `web/src/`, `api/src/`, `shared/` for each violation type
2. **`tsc --strict --noEmit`** to count errors that strict mode would surface (separate from grep — catches *implicit* `any` from inference)
3. **`type-coverage`** to compute the percentage of identifiers that are NOT `any` (continuous metric vs. raw counts)
4. **ESLint baseline** — running the codebase's existing ESLint config produces the existing quality-rule violation count
5. **Top-5 most violation-dense files** — identifies clusters where the most-impactful fixes live

Detailed methodology and exact commands are in plan unit U2.

### Findings

| Metric | Baseline |
|---|---|
| Total `: any` types | `[BASELINE: TBD]` |
| Total `as` type assertions | `[BASELINE: TBD]` |
| Total `!` non-null assertions | `[BASELINE: TBD]` |
| Total `@ts-ignore` / `@ts-expect-error` | `[BASELINE: TBD]` |
| `tsconfig.json` strict mode | `[BASELINE: TBD — Yes / No]` |
| `tsc --strict --noEmit` error count (if strict off) | `[BASELINE: TBD]` |
| `type-coverage` percentage | `[BASELINE: TBD]%` |
| ESLint total errors / warnings | `[BASELINE: TBD]` / `[BASELINE: TBD]` |
| Top 5 violation-dense files | `[BASELINE: TBD]` |

### Interpretation

Once baseline numbers are in:
- `[BASELINE: TBD — describe the cluster pattern observed, e.g., "Violations cluster in API route handlers (76% of any types), where request body typing was deferred for speed"]`
- `[BASELINE: TBD — describe what the type-coverage gap implies, e.g., "Type-coverage of 84% means ~16% of identifiers are any or untyped — primarily from missing return types on async route handlers"]`
- `[BASELINE: TBD — note any patterns particular to the unified document model, e.g., "Many violations involve casting between document_type variants where a discriminated union would be more honest"]`

### Severity classification

| Cluster | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target:** Eliminate at least 25% of type safety violations (PDF requirement), AND improve `type-coverage` percentage by at least 3 percentage points.

**Approach:**
- Focus on top-5 violation-dense files first (highest ROI per fix)
- Replace `any` with: discriminated unions for `document_type` variants, utility types (`Pick`, `Omit`, `Partial`) for API payload shapes, `unknown` + type guard functions for externally-parsed data
- Remove `as` casts where actual type is knowable; narrow with `instanceof` or discriminant checks where runtime behavior requires it
- Remove `!` non-null assertions where optional chaining (`?.`) or explicit null check suffices
- Each fix verified with `tsc --noEmit` before commit; `pnpm test` run after each file

**Strict-mode contingency:** If `tsc --strict --noEmit` produces >5× the grep violation count, enabling strict is deferred — the 25% improvement target remains achievable on grep violations alone, and strict mode is documented as future work in §13 below.

**Predicted impact:** Estimated `[BASELINE: TBD]` violations targeted across `[BASELINE: TBD]` files.

### After measurement

| Metric | Baseline | After | Delta |
|---|---|---|---|
| Total violations | `[BASELINE: TBD]` | `[AFTER: TBD]` | `[AFTER: TBD]%` ↓ |
| `type-coverage` percentage | `[BASELINE: TBD]%` | `[AFTER: TBD]%` | `[AFTER: TBD]` pts ↑ |
| Tests still pass | — | `[AFTER: TBD — pass/fail]` | — |

**Artifact:** `eval/results/type-safety-after.json`

---

## Category 2: Bundle Size

### What this category measures

The total size of the production frontend bundle (`web/dist/`) and the size of the largest individual chunks. Specifically: total output KB, number of chunks, top 3 largest dependencies, and unused dependencies.

### Why it matters

Large bundles slow down initial page load, hurt performance on slow networks (mobile, rural broadband, federal facility connections), and waste bandwidth on every fresh visit or cache miss. For a government tool with a large user base, a 100 KB savings translates to real money in CDN bandwidth and real time across millions of cumulative page loads. Initial load time is also the most-cited performance metric in user satisfaction surveys.

### How we measured it

1. **`pnpm build`** — produces the production bundle in `web/dist/`
2. **`rollup-plugin-visualizer`** — generates an interactive treemap (`web/stats.html`) showing per-file bundle contribution
3. **`depcheck`** or manual grep — cross-references `package.json` dependencies against actual imports to flag unused packages
4. **Manual treemap inspection** — identifies which dependencies dominate the bundle (often editor libraries, charting, date libraries)

Detailed methodology in plan unit U3.

### Findings

| Metric | Baseline |
|---|---|
| Total production bundle size | `[BASELINE: TBD] KB` |
| Number of chunks | `[BASELINE: TBD]` |
| Largest chunk (name + size) | `[BASELINE: TBD]` |
| Top 3 largest dependencies | `[BASELINE: TBD]` |
| Unused dependencies in `package.json` | `[BASELINE: TBD]` |
| Estimated gzipped bundle | `[BASELINE: TBD] KB` |

### Interpretation

Bundles for React + TipTap + Yjs applications typically range from 800 KB to 2.5 MB (uncompressed) depending on editor extensions, chart libraries, and code splitting strategy. The most common culprits:
- TipTap and its extensions loading eagerly across all routes (even pages that never render the editor)
- Date libraries (moment, date-fns) included via tree-unaware dependencies
- Icon libraries loading the entire icon set when only 20-30 icons are used
- Polyfills for browser features that all modern target browsers natively support

`[BASELINE: TBD — interpret the actual top 3 dependencies and which pattern applies]`

### Severity classification

| Finding | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target (choose one):** 15% reduction in total production bundle size, OR 20% reduction in initial page load bundle via code splitting (PDF requirement).

**Approach (chosen based on baseline findings):**
- **Code splitting path:** convert heavy route components to `React.lazy()` + `Suspense` — likely candidates: editor route, sprint board route, settings/admin pages. Add a loading fallback UI for each
- **Unused dependency removal path:** for each flagged unused dependency, verify with manual grep that it has zero imports before removing from `package.json`

**Critical edge case — SSR compatibility:** `React.lazy()` only works in CSR contexts. Before introducing it, verify Ship is CSR-only (no `renderToString`, no SSR entry point). If SSR is in use, fall back to Vite's `manualChunks` build configuration instead. Per plan unit U12.

**Predicted impact:** Estimated `[BASELINE: TBD] KB` savings.

### After measurement

| Metric | Baseline | After | Delta |
|---|---|---|---|
| Total production bundle | `[BASELINE: TBD] KB` | `[AFTER: TBD] KB` | `[AFTER: TBD]%` ↓ |
| Initial chunk (if code split) | `[BASELINE: TBD] KB` | `[AFTER: TBD] KB` | `[AFTER: TBD]%` ↓ |
| Tests still pass | — | `[AFTER: TBD — pass/fail]` | — |

**Artifact:** `eval/results/bundle-after.json`, before/after treemap screenshots

---

## Category 3: API Response Time

### What this category measures

How fast the backend responds under realistic conditions — not against an empty database, but against the seed dataset (500+ documents, 100+ issues, 20+ users, 10+ sprints). Measured at three concurrency levels (10, 25, 50 simultaneous connections) for the 5 most-used endpoints.

### Why it matters

API latency is the single biggest user-perceptible measure of "is this app fast." A document list endpoint at 2-second P95 makes the app feel sluggish even when every other component is fast. Worse, latency variance (P99 vs. P50) directly correlates with user frustration: occasional slow requests are more painful than uniformly mediocre performance. For a real-time collaborative tool, slow API responses cascade into stale UI state and visible sync lag.

### How we measured it

1. **Seed database** to realistic volume (500+ documents, 100+ issues, 20+ users, 10+ sprints) — committed seed script if `pnpm db:seed` not available
2. **Identify top 5 endpoints** by tracing frontend network requests during common user flows (document load, list issues, sprint board, search, auth)
3. **`autocannon`** — Node-native HTTP load tester; runs each endpoint at 10/25/50 concurrent connections for 30 seconds
4. **Capture P50, P95, P99** — the median, 95th percentile, and 99th percentile response times
5. **Pre-flight check** — `eval/benchmark-api.js` verifies database is seeded before measuring (fails fast if not)

Detailed methodology in plan units U4, U8.

### Findings

P95 response time at 25 concurrent connections (representative middle-load scenario):

| # | Endpoint | P50 | P95 | P99 |
|---|---|---|---|---|
| 1 | `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]ms` |
| 2 | `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]ms` |
| 3 | `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]ms` |
| 4 | `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]ms` |
| 5 | `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]ms` |

Full results at 10, 25, 50 concurrent: `eval/results/api-benchmark-baseline.json`

### Interpretation

Common root causes of slow Express + PostgreSQL endpoints:
- **Unbatched ORM calls** — list endpoints fetching one related row per item instead of using `IN (...)` or JOIN
- **No SELECT field projection** — `SELECT *` on a table with large JSONB columns (like Ship's `content` and `yjs_state`) when only a few fields are needed
- **Missing indexes** — sequential scans on filtered columns at scale
- **Synchronous operations blocking the event loop** — JSON parsing of large payloads, sync crypto operations
- **No response caching** — for static reference data that rarely changes

`[BASELINE: TBD — interpret which root cause(s) match the slow endpoints observed]`

### Severity classification

| Endpoint | P95 | Severity | Reasoning |
|---|---|---|---|
| `[BASELINE: TBD]` | `[TBD]ms` | `[TBD]` | `[BASELINE: TBD — e.g., "P95 of 1.8s on the main page load endpoint = Critical; users perceive this as a broken app"]` |

### Improvement plan

**Target:** 20% reduction in P95 response time on at least 2 endpoints (PDF requirement), measured under identical conditions (same seed data, same concurrency, same hardware).

**Approach:**
- Identify the 2 slowest endpoints from baseline
- Diagnose root cause via EXPLAIN ANALYZE (Category 4) and request profiling
- Apply the targeted fix matching the root cause (batching, projection, index, caching — choose based on evidence)
- Re-run `eval/benchmark-api.js --compare eval/results/api-benchmark-baseline.json` after each fix; iterate until 20% target met
- Document root cause and chosen fix per endpoint — this feeds ARCHITECTURE.md §9.3

**Predicted impact:** `[BASELINE: TBD]`

### After measurement

| Endpoint | P95 Before | P95 After | Delta |
|---|---|---|---|
| `[AFTER: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]%` ↓ |
| `[AFTER: TBD]` | `[TBD]ms` | `[TBD]ms` | `[TBD]%` ↓ |

No P95 regressions on the other 3 endpoints (within 5% tolerance).

**Artifact:** `eval/results/api-benchmark-after.json`

---

## Category 4: Database Query Efficiency

### What this category measures

How efficiently the application queries PostgreSQL. The unified document model (everything in one `documents` table with a `document_type` discriminator) creates specific query patterns worth examining: every list query MUST filter by `document_type`, which makes index coverage and N+1 patterns load-bearing at scale. Specifically: total query count per user flow, slowest query timing, presence of N+1 patterns, and missing indexes.

### Why it matters

Database queries are usually the long pole in API response time. A route that runs 1 ms of application logic but 200 ms of database queries is 99% database-bound — optimizing the application code further is wasted effort. Worse, N+1 query patterns degrade non-linearly: 100 items × 5 ms per query = 500 ms today; 10,000 items × 5 ms = 50 seconds at scale. The unified document model amplifies this risk: every list view touches the same table, so a missing index or N+1 pattern affects every content type at once.

### How we measured it

1. **Enable PostgreSQL query logging** via Docker env: `POSTGRES_LOG_STATEMENT=all`
2. **Execute 5 user flows**: load main page, view a document, list issues, load sprint board, search content
3. **Count total queries per flow** — straightforward query count, no opinions, just count
4. **`EXPLAIN ANALYZE`** on the slowest query per flow — reveals seq-scan vs. index-scan, row estimates vs. actuals, sort costs
5. **Index audit** — `\d documents` in psql lists current indexes; cross-reference against `WHERE` clauses in queries
6. **N+1 detection** — list-view flows showing "one query per item" patterns instead of single-query batch

Detailed methodology in plan unit U4.

### Findings

| User Flow | Total Queries | Slowest Query | N+1 Detected? |
|---|---|---|---|
| Load main page | `[BASELINE: TBD]` | `[TBD]ms` | `[BASELINE: TBD]` |
| View a document | `[BASELINE: TBD]` | `[TBD]ms` | `[BASELINE: TBD]` |
| List issues | `[BASELINE: TBD]` | `[TBD]ms` | `[BASELINE: TBD]` |
| Load sprint board | `[BASELINE: TBD]` | `[TBD]ms` | `[BASELINE: TBD]` |
| Search content | `[BASELINE: TBD]` | `[TBD]ms` | `[BASELINE: TBD]` |

Existing indexes on `documents` table: `[BASELINE: TBD — from \d documents]`

### Interpretation

Critical question for the unified document model: **does any index cover the `(document_type, workspace_id)` filter pattern?** Almost every list view filters on both. If no composite index exists, every list view does a sequential scan filtered by `workspace_id` and then evaluates `document_type` per row — wasteful and degrading with table size.

`[BASELINE: TBD — describe whether the composite filter is index-covered or not]`

N+1 patterns are most likely in: list views that show assignee names (requires JOIN or per-row user lookup), sprint board views that show issue counts per sprint, document trees that show child documents per parent.

`[BASELINE: TBD — describe which N+1 patterns were observed, with query count evidence]`

### Severity classification

| Finding | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target (choose one):** 20% query count reduction on at least one user flow, OR 50% improvement on the slowest single query (PDF requirement).

**Approach (chosen based on baseline):**
- **Index addition path:** add a composite index on `(document_type, workspace_id)` via a new migration. Lower-risk (purely additive — no application code changes). Migration uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for safe live deployment and includes a down migration (`DROP INDEX IF EXISTS`) per U14 edge case handling
- **N+1 batching path:** find the worst N+1 query in a list view; refactor to a single `IN (...)` or JOIN query. Higher-impact but requires care that `document_type` filtering still applies after batching

**Critical edge case — migration failure:** `CREATE INDEX CONCURRENTLY` can fail mid-flight (lock timeout, duplicate, disk space). U14 includes the down migration, `IF NOT EXISTS` retry safety, and `indisvalid` verification before claiming success.

**Predicted impact:** `[BASELINE: TBD]`

### After measurement

| Flow / Query | Baseline | After | Delta |
|---|---|---|---|
| `[AFTER: TBD]` | `[BASELINE: TBD]` queries / `[TBD]ms` | `[AFTER: TBD]` queries / `[TBD]ms` | `[AFTER: TBD]%` ↓ |

EXPLAIN ANALYZE confirms index used (or N+1 batched):
```
[AFTER: TBD — paste the post-fix EXPLAIN ANALYZE output]
```

**Artifact:** `eval/results/db-query-after.md`

---

## Category 5: Test Coverage and Quality

### What this category measures

What the existing test suite covers, what it misses, and how reliable it is. Ship ships with 73+ Playwright E2E tests. The audit determines: total test count, pass/fail/flaky status across 3 consecutive runs, runtime, line and branch coverage per package, and critical flows that have ZERO coverage.

### Why it matters

A test suite that runs but doesn't catch real regressions is worse than no test suite — it provides false confidence. Flaky tests train developers to "just rerun" without investigating, which masks real regressions inside the flake noise. Critical flows with zero coverage are the silent ticking time bombs: a future change can break them with no automated signal.

### How we measured it

1. **`pnpm test`** — run the full Playwright suite; record pass/fail counts and total runtime
2. **Run suite 3 times** — flag any tests that fail on some runs and pass on others (flaky tests)
3. **Capture flake signature** — record file path, test name, failure pattern. This signature becomes the **attribution boundary**: any *new* flake observed after improvements is attributable to our changes, any flake in this signature is pre-existing
4. **Read all test files** — catalog covered user flows; mark critical flows with no coverage
5. **`c8` / `@vitest/coverage-v8`** — configure coverage if not present; record line and branch coverage per package

Detailed methodology in plan unit U5.

### Findings

| Metric | Baseline |
|---|---|
| Total tests | `[BASELINE: TBD]` |
| Pass count | `[BASELINE: TBD]` |
| Fail count (consistent) | `[BASELINE: TBD]` |
| Flaky count (pass/fail varies across 3 runs) | `[BASELINE: TBD]` |
| Suite runtime | `[BASELINE: TBD]s` |
| Code coverage — `web/` | `[BASELINE: TBD]%` line / `[TBD]%` branch |
| Code coverage — `api/` | `[BASELINE: TBD]%` line / `[TBD]%` branch |
| Code coverage — `shared/` | `[BASELINE: TBD]%` line / `[TBD]%` branch |
| Critical flows with zero coverage | `[BASELINE: TBD]` (list) |

Flake signature (pre-existing flakes):
```
[BASELINE: TBD — list each flaky test with file path, name, and failure pattern]
```

### Interpretation

What "critical flow with zero coverage" means depends on what's important. For a project management tool, critical flows are:
- Document creation, deletion, and editing (data loss risk)
- Real-time collaboration sync (correctness risk)
- Authentication and session management (security risk)
- Sprint state transitions (state-correctness risk)

`[BASELINE: TBD — identify which critical flows are uncovered or thinly covered]`

### Severity classification

| Finding | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target:** Add 3 meaningful new tests for previously untested critical paths, OR fix 3 flaky tests with documented root cause analysis (PDF requirement).

**Approach — new tests (preferred if uncovered critical flows exist):**

Three new Playwright tests, each preventing a specific regression:
1. **Document deletion** — verify deleted document no longer appears in list AND direct URL returns 404. Prevents soft-delete leakage.
2. **Real-time sync** — open the same document in two browser contexts; edit in one; assert the other receives the update within 2 seconds. Prevents silent Yjs sync drops.
3. **Sprint board state persistence** — drag an issue from "In Progress" to "Done"; assert status persists after page reload. Prevents drag-drop state loss.

Each test includes a comment on the first line naming the regression it prevents — per Week 3 testing discipline.

**Approach — flaky test fixes (alternative or supplementary):**

For each flaky test fixed: document root cause (timing assumption, missing `await`, race condition, network dependency), implement deterministic replacement, verify pass on 3 consecutive runs.

### After measurement

| Metric | Baseline | After |
|---|---|---|
| Total tests | `[BASELINE: TBD]` | `[AFTER: TBD]` |
| Pass / Fail / Flaky | `[BASELINE: TBD]` | `[AFTER: TBD]` |
| Suite runtime | `[BASELINE: TBD]s` | `[AFTER: TBD]s` |
| New flows covered | — | document deletion, real-time sync, sprint board persistence |

**Artifact:** `eval/results/test-coverage-after.json`

---

## Category 6: Runtime Error and Edge Case Handling

### What this category measures

How the application behaves when things go wrong. Covers React error boundaries, unhandled promise rejections (backend), network failure recovery during real-time collaboration, malformed input handling, and user-facing error states.

### Why it matters

Production apps fail. Networks drop. Users submit weird input. Race conditions happen. The difference between a polished application and a broken one is not whether errors occur — it's whether errors are caught, surfaced clearly, and recoverable. For a real-time collaborative tool, silent data loss during a network blip is worse than a loud failure: users keep typing thinking their work is saved.

### How we measured it

1. **DevTools console monitoring** during normal usage — count errors and warnings
2. **Network failure simulation** — DevTools network throttle / disconnect during a collaborative edit, then reconnect. Does data survive? Does the UI recover?
3. **Malformed input testing** — empty forms, 10,000-character strings, special characters, HTML/script injection attempts
4. **Concurrent edit testing** — two users editing the same document field simultaneously
5. **3G throttle testing** — every spinner that hangs, every silent failure, every missing loading state
6. **Server log inspection** for unhandled promise rejections during all of the above

Detailed methodology in plan unit U5.

### Findings

| Metric | Baseline |
|---|---|
| Console errors during normal usage | `[BASELINE: TBD]` |
| Console warnings during normal usage | `[BASELINE: TBD]` |
| Unhandled promise rejections (server) | `[BASELINE: TBD]` |
| Network disconnect recovery | `[BASELINE: TBD — Pass / Partial / Fail]` |
| Missing error boundaries | `[BASELINE: TBD — list locations]` |
| Silent failures identified | `[BASELINE: TBD — list with reproduction steps]` |
| Malformed input handling | `[BASELINE: TBD]` |

### Interpretation

Three categories of error handling defects, ranked by user impact:

1. **Data loss** (most severe) — user types content; network blips; reconnect happens; user's content is gone. Real-time collab tools are especially vulnerable here because Yjs operations are not durable until acknowledged
2. **App-wide breakage** — a render error in one component crashes the entire React tree because no error boundary catches it
3. **Silent failures** — operation appears to succeed but didn't (e.g., save button click that doesn't actually save). Worst category from a trust perspective

`[BASELINE: TBD — categorize the observed defects]`

### Severity classification

| Finding | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target:** Fix 3 error handling gaps; at least one must address a real user-facing data loss or confusion scenario (PDF requirement).

**Approach — three fixes, each routed through Sentry for telemetry:**

1. **Data loss priority — WebSocket reconnect recovery**
   - Add a reconnection status indicator ("Reconnecting..." / "Connected") in the editor UI
   - Verify Yjs state is preserved through 10-second disconnect (no edits lost)
   - Capture reconnect failures via `Sentry.captureMessage("yjs_reconnect_failed", { extra: { documentId, attempts } })`
   - **Edge case handled:** expired session on long reconnect — detect 401/403, display "Session expired, please refresh" UI, do NOT silently retry with dead token. Per U16

2. **User confusion priority — React Error Boundary**
   - Wrap the document editor with a custom `ErrorBoundary` composing `Sentry.ErrorBoundary`
   - Render app-specific recovery UI (not Sentry's generic fallback) with a "Reload document" button
   - Sentry captures the original error with breadcrumbs and source-mapped stack trace

3. **Server-side priority — Async error middleware + unhandled rejection handler**
   - Express async error middleware converts unhandled promise rejections to structured 500 responses
   - `process.on('unhandledRejection')` handler captures to Sentry for rejections outside request scope
   - Verified: a route handler that throws an unawaited promise no longer crashes the server

**Sentry no-op safety:** All three fixes work end-to-end without a Sentry DSN — the structured UI recovery, the JSON error response, and the recovery banner all function as if Sentry weren't there.

### After measurement

| Metric | Baseline | After |
|---|---|---|
| Console errors during normal usage | `[BASELINE: TBD]` | `[AFTER: TBD]` |
| Network disconnect recovery | `[BASELINE: TBD]` | Pass |
| Error boundary coverage | Missing | Editor, app-root, plus existing per-route |

**Artifact:** `eval/results/error-after.md` with reproduction steps and before/after screenshots for each fix

---

## Category 7: Accessibility Compliance

### What this category measures

Whether Ship's claim of Section 508 compliance and WCAG 2.1 AA conformance is actually true. Measured via automated accessibility scanning, keyboard navigation testing, screen reader testing, and color contrast verification across the application's major pages.

### Why it matters

For a US Department of the Treasury project, Section 508 compliance is a legal requirement, not a nice-to-have. WCAG 2.1 AA conformance is the federal accessibility standard. Beyond compliance: 1 in 4 adults in the US has a disability. Accessibility failures lock out a substantial fraction of potential users. Specific high-impact failures include: keyboard-trapped focus (entirely blocks keyboard-only users), missing form labels (blocks screen reader users), and poor color contrast (blocks low-vision users).

### How we measured it

1. **Lighthouse accessibility audit** on every major page — composite score per page
2. **`axe-core` / `pa11y-ci`** automated scanner — categorizes violations by severity (Critical / Serious / Moderate / Minor)
3. **Keyboard navigation testing** — Tab, Shift+Tab, Enter, Escape, arrow keys; verify every interactive element is reachable and operable
4. **Screen reader testing** — NVDA (Windows) or VoiceOver (macOS); verify the page structure announces correctly and controls are interactive
5. **Color contrast check** — text, buttons, interactive elements against WCAG 2.1 AA 4.5:1 minimum ratio

Detailed methodology in plan units U5, U10, U17.

### Findings

| Page | Lighthouse Score | Critical Violations | Serious Violations |
|---|---|---|---|
| Dashboard | `[BASELINE: TBD]` | `[TBD]` | `[TBD]` |
| Document editor | `[BASELINE: TBD]` | `[TBD]` | `[TBD]` |
| Issue list | `[BASELINE: TBD]` | `[TBD]` | `[TBD]` |
| Sprint board | `[BASELINE: TBD]` | `[TBD]` | `[TBD]` |
| Settings | `[BASELINE: TBD]` | `[TBD]` | `[TBD]` |

| Metric | Baseline |
|---|---|
| Keyboard navigation completeness | `[BASELINE: TBD — Full / Partial / Broken]` |
| Color contrast failures | `[BASELINE: TBD]` |
| Missing ARIA labels / roles | `[BASELINE: TBD — list locations]` |
| Form inputs without associated labels | `[BASELINE: TBD]` |

### Interpretation

Common accessibility defects in React + Tailwind applications:
- Icon-only buttons (close, add, delete, filter) without `aria-label` — invisible to screen readers
- Toast notifications without `role="status"` and `aria-live="polite"` — silent to screen readers
- Custom focus styles removed (`outline: none`) without a visible replacement — keyboard users cannot see where focus is
- Color contrast on secondary text (gray-on-white) failing WCAG AA 4.5:1
- Form inputs styled with placeholder-as-label — fails when input has content

`[BASELINE: TBD — categorize the observed violations against these common patterns]`

### Severity classification

The axe-core scanner pre-classifies violations by severity. Critical and Serious must be fixed; Moderate and Minor are improvements but not blocking.

| Finding | Severity | Reasoning |
|---|---|---|
| `[BASELINE: TBD]` | `[BASELINE: TBD]` | `[BASELINE: TBD]` |

### Improvement plan

**Target (choose one):** +10 Lighthouse accessibility points on the lowest-scoring page, OR fix all Critical/Serious violations on the 3 most important pages (PDF requirement).

**Approach:**
- Address violations in priority order: Critical → Serious → Moderate → Minor
- Common fixes:
  - Add `aria-label` to all icon-only buttons
  - Add `role="status"` and `aria-live="polite"` to toast/notification regions
  - Fix color contrast by updating Tailwind color tokens (verify against WCAG AA)
  - Add visible focus indicators (`outline` + `ring` styles) to interactive elements
  - Ensure all form inputs have associated `<label>` elements or `aria-labelledby`
- **Out of scope:** TipTap editor internals — TipTap manages its own accessibility model with its own release cadence. Fixes target the surrounding application chrome
- After fixes: re-run Lighthouse 3 times and take the median (accessibility scores vary ±2-3 points run-over-run); run `pnpm test:a11y` to confirm zero Critical/Serious violations remain

**Critical edge case — Lighthouse variance:** Single-run "+10 point improvement" can be partly noise. Median of 3 before vs. median of 3 after is the defensible metric per U17.

**Regression prevention:** The new `pnpm test:a11y` suite (axe-playwright tests in `e2e/accessibility/`) runs on every PR; future regressions in Critical/Serious violations fail the build.

### After measurement

| Page | Lighthouse Score Before (median of 3) | Lighthouse Score After (median of 3) | Delta |
|---|---|---|---|
| Dashboard | `[BASELINE: TBD]` | `[AFTER: TBD]` | `[TBD]` pts |
| Document editor | `[BASELINE: TBD]` | `[AFTER: TBD]` | `[TBD]` pts |
| Issue list | `[BASELINE: TBD]` | `[AFTER: TBD]` | `[TBD]` pts |

| Metric | Baseline | After |
|---|---|---|
| Critical violations (top 3 pages) | `[BASELINE: TBD]` | 0 |
| Serious violations (top 3 pages) | `[BASELINE: TBD]` | 0 |
| `pnpm test:a11y` passes | — | Pass |

**Artifact:** `eval/results/a11y-after.json` plus 6 Lighthouse HTML exports per target page (3 before, 3 after)

---

## Discovery — Three Things Learned

Per the PDF Discovery Requirement: three specific things learned during orientation and audit that were not previously known to the auditor. Each cites a codebase location, explains the significance, and describes future application.

### Discovery 1: `[BASELINE: TBD — name of the pattern, feature, or practice]`

- **Where found:** `[BASELINE: TBD — file path + line range]`
- **What it does and why it matters:** `[BASELINE: TBD]`
- **How I would apply this in a future project:** `[BASELINE: TBD]`

### Discovery 2: `[BASELINE: TBD]`

- **Where found:** `[BASELINE: TBD]`
- **What it does and why it matters:** `[BASELINE: TBD]`
- **How I would apply this in a future project:** `[BASELINE: TBD]`

### Discovery 3: `[BASELINE: TBD]`

- **Where found:** `[BASELINE: TBD]`
- **What it does and why it matters:** `[BASELINE: TBD]`
- **How I would apply this in a future project:** `[BASELINE: TBD]`

---

## Architecture Assessment (PDF Appendix Phase 3 Synthesis)

This section answers the four synthesis questions from the PDF Appendix Codebase Orientation Checklist Phase 3. Each is grounded in specific evidence — file paths, observed behavior, or measured numbers — not generic prose.

### Three strongest architectural decisions

1. **`[BASELINE: TBD — decision name]`** — Evidence: `[BASELINE: TBD — file path]`. Why strong: `[BASELINE: TBD — concrete benefit observed]`
2. **`[BASELINE: TBD]`** — Evidence: `[BASELINE: TBD]`. Why strong: `[BASELINE: TBD]`
3. **`[BASELINE: TBD]`** — Evidence: `[BASELINE: TBD]`. Why strong: `[BASELINE: TBD]`

### Three weakest points

1. **`[BASELINE: TBD — weakness name]`** — Evidence: `[BASELINE: TBD — file path or measured number]`. Cost: `[BASELINE: TBD — what breaks or who is harmed]`. Where improvement should focus: `[BASELINE: TBD]`
2. **`[BASELINE: TBD]`** — Evidence: `[BASELINE: TBD]`. Cost: `[BASELINE: TBD]`. Where: `[BASELINE: TBD]`
3. **`[BASELINE: TBD]`** — Evidence: `[BASELINE: TBD]`. Cost: `[BASELINE: TBD]`. Where: `[BASELINE: TBD]`

### Onboarding advice for a new engineer

If onboarding a new engineer to this codebase today, the most important things to tell them first:

`[BASELINE: TBD — write a substantive paragraph; specifically address (a) the concept that must be understood before reading code, (b) the patterns that will surprise them, (c) the part of the codebase to read first]`

### 10x scaling break point

If Ship had 10x more workspaces, documents, and concurrent WebSocket connections, what would break first and how much work would it be to fix?

**First to break:** `[BASELINE: TBD — specific subsystem or query pattern]`

**Why:** `[BASELINE: TBD — evidence from baseline measurements]`

**Magnitude of fix:** `[BASELINE: TBD — rough engineering effort estimate]`

---

## Summary of Findings and Improvements

### Overall audit posture

`[BASELINE: TBD — 2-3 paragraph summary of the codebase's current state: strengths, weaknesses, and the overall trajectory]`

### Per-category target achievement

| Category | Target | Achievement | Status |
|---|---|---|---|
| 1. Type Safety | ≥25% violation reduction | `[AFTER: TBD]%` | `[AFTER: TBD — Met / Not met]` |
| 2. Bundle Size | ≥15% total OR ≥20% initial | `[AFTER: TBD]%` | `[AFTER: TBD]` |
| 3. API Response Time | ≥20% P95 on 2 endpoints | `[AFTER: TBD]` | `[AFTER: TBD]` |
| 4. DB Query Efficiency | ≥20% queries OR ≥50% slowest | `[AFTER: TBD]` | `[AFTER: TBD]` |
| 5. Test Coverage | 3 new tests OR 3 flaky fixes | `[AFTER: TBD]` | `[AFTER: TBD]` |
| 6. Runtime Errors | 3 gaps fixed, ≥1 data loss | `[AFTER: TBD]` | `[AFTER: TBD]` |
| 7. Accessibility | +10 Lighthouse OR 0 Critical/Serious top 3 | `[AFTER: TBD]` | `[AFTER: TBD]` |

### Future work (out of scope for this audit)

Improvements identified during the audit but explicitly deferred:

- `[BASELINE: TBD — list each, with rationale for deferral]`

---

## Phase 1 Gate

This document constituted the Phase 1 audit gate of the ShipShape project. At Phase 1 submission, only the **baseline** sections were filled in — no improvements had been made yet. Phase 2 (the implementation phase) populates the **After** sections with measured improvements and links to evidence artifacts in `eval/results/`.

The PDF explicitly requires this separation: *"Diagnosis comes before treatment."*

`[BASELINE: TBD — date of Phase 1 audit submission]`
`[AFTER: TBD — date of Phase 2 implementation completion]`

---

## References

- ShipShape assignment PDF: `GFA Week 4 - ShipShape.pdf` (Week4 planning repo) — defines the 7 categories and improvement targets
- Companion documents in this fork:
  - `ORIENTATION.md` — PDF Appendix Codebase Orientation Checklist responses (24+ questions)
  - `ARCHITECTURE.md` — system architecture with before/after sections per changed area
  - `THREAT_MODEL.md` — security analysis with dependency CVE baseline
- All evidence artifacts: `eval/results/`
- Implementation plan: `docs/plans/2026-05-18-001-feat-shipshape-audit-enhancement-plan.md` (Week4 planning repo)
- Week 3 style reference: `Week3/AUDIT.md`, `Week3/AUDIT_V2.md`
