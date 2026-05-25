# Ship Audit Report

> **Project:** ShipShape — Auditing and Improving a Production TypeScript Codebase (GFA Week 4)
> **Auditor:** Jay Godfrey
> **Phase 1 Gate completed:** 2026-05-19
> **Target repo:** `US-Department-of-the-Treasury/ship` (forked to `jaynyasg/ship`)
> **Status:** Phase 2 measurement pass completed 2026-05-20. Baselines and after-measurements are in `eval/results/`; all seven original PDF category targets are closed (U11, U12, U13, U14, U15, U16/U7, U17). Category 8 Security Audit was added and completed 2026-05-21 with a runnable probe, baseline, two verified fixes, and after-proof. Phase 13 later closed the WebSocket reconnect UI stretch follow-up, Phase 15 hardened the Windows E2E runner path, and the final full Playwright gate passed on 2026-05-22 with 869/869 tests passing.

This audit follows the **diagnostic-before-treatment** principle from the ShipShape PDF: every finding was measured first, classified by severity, and then addressed by a targeted improvement with reproducible before/after evidence. During the Phase 1 baseline pass, only additive documentation and evidence artifacts were created; Phase 2 contains the source changes.

---

## How to Read This Report

Each of the 8 PDF audit categories below follows the same structure:

1. **What this category measures** — the engineering quality dimension under test
2. **How we measured it** — specific tools, commands, and artifacts produced
3. **Baseline findings** — measured numbers with interpretation
4. **Severity classification** — Critical / High / Medium / Low
5. **Planned improvement** — the U-unit from the plan that addresses it, the target, and the expected feasibility

All quantitative evidence is in `eval/results/`. Each result file is JSON or Markdown that can be diffed against the after-improvement re-run.

---

## Audit Methodology Overview

| Category | Primary tool(s) | Evidence artifacts |
|---|---|---|
| 1. Type Safety | `grep`, `tsc --strict --noEmit`, `type-coverage`, ESLint check | `eval/results/type-safety-baseline.json`, `tsc-baseline.txt`, `type-coverage-baseline.txt`, `eslint-baseline.json` |
| 2. Bundle Size | `pnpm build` + `dist/` inspection | `eval/results/bundle-baseline.json`, `bundle-build-log.txt` |
| 3. API Response Time | `autocannon` (Node-native HTTP load testing) | `eval/results/api-benchmark-baseline.json`, 15 per-endpoint per-concurrency JSON files |
| 4. Database Query Efficiency | PostgreSQL `\d` + query logging via `log_statement='all'` + code inspection | `eval/results/db-query-baseline.md`, `db-schema-documents.txt`, `db-query-log.txt`, `db-tables.txt` |
| 5. Test Coverage & Quality | `pnpm test` (Vitest), `scripts/check-empty-tests.sh`, code inspection of `e2e/` | `eval/results/test-coverage-baseline.json`, `empty-tests-baseline.json` |
| 6. Runtime Error Handling | Observation during audit + code inspection of error surfaces | `eval/results/error-baseline.md`, `error-after.md` |
| 7. Accessibility | Lighthouse + `@axe-core/playwright` on 4 pages with auth | `eval/results/a11y-baseline.json`, `lighthouse-login.json`, `axe-baseline.json` |
| 8. Security Audit | `pnpm security:audit` live probe + dependency audit + manual review collectors | `eval/results/security-audit-baseline.md`, `security-audit-after.md`, `security-audit-fixes.md` |
| Supplemental: Architectural health | `madge --circular`, code inspection | `eval/results/madge-circular-baseline.txt` (no circular deps) |
| Supplemental: Dependency security | `pnpm audit`, `pnpm outdated` | `eval/results/dependency-summary-baseline.md`, audit + outdated JSONs |
| Supplemental: Full E2E release gate | `pnpm test:e2e -- --workers=2` | `eval/results/full-e2e-gate.md` |

---

## Category 1 — Type Safety

### What this category measures
TypeScript's compile-time type safety as actually used. Specifically: explicit `any` types, type assertions (`as`), non-null assertions (`!`), `@ts-ignore` / `@ts-expect-error` directives, and implicit `any` from inference.

### How we measured it
1. `pnpm type-check` — verified `tsc --noEmit` across all 3 workspaces (shared, web, api)
2. `grep` counts for each violation pattern in `web/src/`, `api/src/`, `shared/src/`
3. `pnpm dlx type-coverage --detail` — percentage of identifiers that are NOT `any` (catches implicit-any from inference that grep misses)
4. `pnpm lint` — check for ESLint configuration

### Baseline findings

| Metric | Value |
|---|---|
| TypeScript version | ~~5.9.3~~ → **6.0.3** (upgraded — see below) |
| `tsconfig.json` strict mode | ✅ Aggressively enabled (`strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`) |
| `tsc --strict --noEmit` result | ✅ Pass across all 3 workspaces |
| Total explicit `: any` annotations | **99** (web: 24, api: 75, shared: 0) |
| Total broader `\bany\b` usages | **337** (web: 65, api: 272, shared: 0) |
| Total ` as ` type assertions | **275** (web: 210, api: 65, shared: 0) |
| Total `!.` non-null assertions | **24** (web: 17, api: 7, shared: 0) |
| Total `@ts-ignore` / `@ts-expect-error` | **1** (entire codebase!) |
| **Combined grep violations** | **399** |
| `type-coverage` percentage | **93.47%** (165,335 / 176,882 identifiers covered) |
| ESLint configured? | ❌ **No** — `pnpm lint` returns "None of the selected packages has a 'lint' script" |
| Circular dependencies | ✅ None (madge clean across 82 source files) |

### Top 5 violation-dense files (production code)
1. `web/src/components/UnifiedEditor.tsx` — ~50 total (25 any + 25 as)
2. `api/src/routes/projects.ts` — ~30 (17 as + 13 any)
3. `api/src/utils/yjsConverter.ts` — ~26 (14 as + 12 any)
4. `api/src/routes/weeks.ts` — ~20 (10 as + 10 any)
5. `web/src/components/sidebars/PropertiesPanel.tsx` — 13 as

### Severity classification
| Finding | Severity |
|---|---|
| 399 explicit grep violations clustered in 5 hotspot files | **Medium** — well-bounded technical debt; not user-impacting |
| ESLint not configured | **Medium** — quality enforcement relies solely on tsc; style/quality rules not enforced |
| 93.47% type coverage (rest is implicit-any from inference) | **Low-positive** — strong baseline; codebases this size often sit at 75-85% |
| Strict mode + `noUncheckedIndexedAccess` enabled and passing | **Positive** — aggressive enforcement, no silent suppressions |
| 1 `@ts-ignore` across the entire codebase | **Positive** — exceptionally clean |

### Planned improvement (U11)
**Target:** Eliminate ≥25% of grep violations (≥100 violations) AND improve type-coverage ≥3 percentage points.

**Approach:** Address top 5 violation-dense files first — fix UnifiedEditor.tsx, projects.ts, weeks.ts, yjsConverter.ts, PropertiesPanel.tsx. Replace `any` with discriminated unions for `document_type` variants, utility types (`Pick`/`Omit`) for payload shapes, and `unknown` + type guards for externally-parsed data.

**Stretch:** Add a baseline ESLint configuration with `@typescript-eslint/recommended` + `jsx-a11y/recommended` (the latter would catch some Category 7 a11y issues at lint-time).

**Feasibility:** High — fixing just 2-3 of the top files satisfies the 25% target.

### TypeScript upgrade (completed pre-Phase 2)

**Upgrade:** TypeScript 5.9.3 → 6.0.3 across all 4 workspaces (root, web, api, shared). Completed 2026-05-20.

**Breaking changes addressed:**

| Fix | File | Change |
|---|---|---|
| `baseUrl` deprecated (TS5101) | `api/tsconfig.json`, `web/tsconfig.json` | Removed `"baseUrl": "."` — paths were already relative to tsconfig location |
| Ambient `@types/*` no longer auto-included (TS 6.0 behavior change) | `web/tsconfig.json` | Added `"types": ["node", "vite/client"]` to explicitly declare required type roots |

**Result:** All 3 workspaces (`shared`, `web`, `api`) pass `pnpm type-check` clean on TypeScript 6.0.3. Zero new type errors introduced. The upgrade does not alter the Category 1 grep violation count or type-coverage percentage — those baselines remain the U11 target.

---

## Category 2 — Bundle Size

### What this category measures
Production frontend bundle size. Total `dist/` size, individual chunk sizes, code splitting effectiveness, unused dependencies.

### How we measured it
1. `pnpm build:web` (with Windows-compatible env-var workaround — see ORIENTATION finding #19)
2. Inspect `web/dist/` directory totals and per-chunk file sizes
3. Read Vite's build summary (per-file size + gzipped size + warning thresholds)

### Baseline findings

| Metric | Value |
|---|---|
| Total `dist/` size | 3,848 KB (~3.76 MB) |
| **Initial page load JS bundle** | **2,073.70 KB uncompressed / 589.49 KB gzipped** ⚠️ |
| Largest chunk (single file) | `index-C2vAyoQ1.js` at 2,073.70 KB |
| Vite warning threshold (500 KB) | ❌ **Exceeded by 4×** — Vite itself warned during build |
| Total JS chunks | 261 (1 main + ~260 lazy chunks for icons + Tab components) |
| Existing code splitting | ✅ Per-icon USWDS chunks + ~13 Tab components already split |
| Mixed dynamic/static import conflicts | **2 warnings** defeating intended code splitting (upload.ts, FileAttachment.tsx) |

### Severity classification
| Finding | Severity |
|---|---|
| 2.07 MB single-chunk main bundle on initial page load | **High** — directly affects first-paint performance on slow networks |
| 2 mixed dynamic/static import warnings (Vite output) | **Medium** — silently breaking existing code-splitting intent |
| Existing per-icon + per-Tab code splitting | **Positive** — code splitting infrastructure IS wired up |

### Planned improvement (U12)
**Target:** ≥20% reduction in initial page load bundle via code splitting (PDF alternative target: 15% total reduction).

**Approach:** Lazy-load the document editor route via `React.lazy()` + `Suspense`. The editor (TipTap + Yjs + extensions) is likely the largest single contributor to the main chunk. Also: fix the 2 mixed dynamic/static imports (free wins).

**Edge case (already documented in plan):** Verify Ship is CSR-only before introducing `React.lazy()` — confirmed via `docs/application-architecture.md` and code inspection.

**Feasibility:** High — TipTap + Yjs editor only loads on document-edit pages; lazy-loading is mechanical.

---

## Category 3 — API Response Time

### What this category measures
Backend response time under concurrent load. P50/P95/P99 latency at 10, 25, 50 simultaneous connections.

### How we measured it
1. Seeded local Postgres via `pnpm db:seed` — produced 257 documents (PDF target is 500+; this is a noted gap, but baseline still valid for relative comparison)
2. Login via API to capture session cookie
3. `pnpm dlx autocannon --json -c {10,25,50} -d 10` per endpoint, 5 endpoints × 3 concurrency levels = 15 runs
4. Rate limit interfered with measurement; mitigated by setting `E2E_TEST=1` env var (raises limit from 1,000 to 10,000 req/min)

### Baseline findings — clean data for documents and issues

| Endpoint | c=10 P50 | c=10 P95 | c=25 P50 | c=25 P95 | c=50 P50 | c=50 P95 |
|---|---|---|---|---|---|---|
| **GET /api/documents** (150 KB/response) | 75 ms | 115 ms | 175 ms | 283 ms | 387 ms | 479 ms |
| **GET /api/issues** | 52 ms | 80 ms | 101 ms | 192 ms | 192 ms | 314 ms |
| GET /api/programs (small payload) | 15 ms | 26 ms | rate-limited | — | rate-limited | — |
| GET /api/weeks | rate-limited | — | rate-limited | — | 97 ms | 131 ms |
| GET /api/dashboard | rate-limited | — | rate-limited | — | rate-limited | — |

### Root cause analysis
- **Documents endpoint returns ~150 KB per response** (all 257 documents, including `properties` JSONB) — no pagination
- **Issues endpoint INCLUDES `d.content` in the SELECT** (`api/src/routes/issues.ts` line 126) — the "smoking gun" finding: full TipTap content returned even though most issues don't have rich-text content
- The degradation curve under concurrency (~2-3× P95 per concurrency doubling) is classic single-heavy-query bottleneck

### Severity classification
| Finding | Severity |
|---|---|
| `/api/issues` returns full `content` field unnecessarily | **High** — smoking gun, single-line fix yields large gains |
| `/api/documents` returns all 257 documents with full `properties` (no pagination) | **High** — response size is the dominant latency cost |
| `/api/weeks` query has 7 correlated subqueries per row (visible in Postgres logs) | **High** — biggest query in the codebase, candidate for query rewrite |
| Strong rate limiting (defense in depth) | **Positive** — prevents flooding; security strength |
| Slowloris/DDoS server timeouts configured | **Positive** — `api/src/index.ts` lines 31-33 |

### Planned improvement (U13)
**Target:** ≥20% P95 reduction on at least 2 endpoints (PDF requirement).

**Selected targets:**
- **Documents at c=25**: 283 ms → 226 ms (-20%)
- **Issues at c=25**: 192 ms → 154 ms (-20%)

**Approach:** Column projection plus bounded list reads — list-view queries return only the needed columns (id, document_type, title, properties, timestamps, ticket_number, parent_id, workspace_id), explicitly EXCLUDE `content` (JSONB) and `yjs_state` (BYTEA), and support opt-in pagination for high-cardinality document lists.

**Feasibility:** Very high — response-size reduction will likely yield 30-50%+ improvement, well past the 20% target.

---

## Category 4 — Database Query Efficiency

### What this category measures
Query patterns, index coverage, N+1 detection. The unified document model (single `documents` table with `document_type` discriminator) creates specific query patterns worth examining.

### How we measured it
1. `\d documents` to inventory schema + indexes
2. Enabled `log_statement = 'all'` on Postgres; triggered one request per endpoint; captured actual SQL via `docker logs`
3. Code inspection of route handlers in `api/src/routes/` to map query shapes
4. Counted rows via direct psql

### Baseline findings

**Table state:**
| Table | Row count |
|---|---|
| `documents` | 257 |
| `document_associations` | 401 |
| `users` | 11 |
| `workspace_memberships` | 11 |
| `audit_logs` | **3** (unexpectedly small — investigate) |

**Indexes on `documents` (13 total):**
- ✅ `idx_documents_active` — partial composite `(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL` — **the index we'd have planned to add already exists**
- ✅ GIN index on `properties` JSONB
- ✅ Multiple specialized partial indexes (archived, deleted, converted, visibility, person)
- ⚠️ No covering index for `ORDER BY position, created_at` (documents list query)
- ⚠️ No expression index for `(properties->>'sprint_number')::int` cast used in weeks query

**Worst query observed (weeks endpoint):**
- **7 correlated subqueries per row** (issue_count, completed_count, started_count, has_plan, has_retro, retro_outcome, retro_id)
- Each subquery joins `documents` with `document_associations`
- Sort by `(d.properties->>'sprint_number')::int` requires per-row JSONB cast

**Issues query INCLUDES `d.content`** — same finding as Category 3, confirmed by reading source

### Severity classification
| Finding | Severity |
|---|---|
| Weeks query has 7 correlated subqueries per row + per-row JSONB cast in ORDER BY | **High** — biggest single-query optimization opportunity |
| Issues query includes `d.content` (full TipTap JSON) | **High** — overlaps with Category 3 |
| `idx_documents_active` partial composite already exists | **Positive** — invalidates the originally-planned "add missing index" improvement |
| `ORDER BY position, created_at` not index-covered on documents endpoint | **Medium** — Postgres sorts in-memory after filter |

### Planned improvement (U14 — revised target)
The original U14 plan ("add missing composite index") is **invalidated** because the index already exists. New target options:

**Option (selected):** Add a JSONB expression index for the weeks query:
```sql
CREATE INDEX idx_documents_sprint_number ON documents (((properties->>'sprint_number')::int)) WHERE document_type = 'sprint' AND archived_at IS NULL;
```

**Combined with U13:** Rewrite the weeks endpoint's 7 correlated subqueries as LEFT JOIN + GROUP BY with conditional COUNT/MAX aggregations. Combined, should yield 5-10× speedup on the weeks query.

**PDF target:** 50% improvement on the slowest query (weeks). Likely far exceeded.

**Feasibility:** High — index addition is purely additive (a U14 migration); query rewrite is a U13 candidate.

---

## Category 5 — Test Coverage and Quality

### What this category measures
Existing test suite size, pass/fail/flaky status, runtime, coverage gaps in critical user flows, and test quality (tests that actually verify behavior).

### How we measured it
1. `pnpm test` — full Vitest unit suite (api/ workspace)
2. Counted Playwright E2E test files via Glob
3. Ship's own `scripts/check-empty-tests.sh` detected silently-passing tests
4. Code inspection mapped covered/uncovered critical flows

### Baseline findings

| Metric | Value |
|---|---|
| Vitest unit tests | **451 tests in 28 files, all pass, 42.87s runtime** |
| Playwright E2E tests (per docs) | 73+ |
| Combined test count | ~524+ |
| Test framework | Vitest 4.0.17 + Playwright 1.57.0 (Chromium only) |
| Code coverage measured | Not yet (would need `vitest --coverage`) |
| Empty Playwright tests (silently passing) | **6 across 3 files** — `autosave-race-conditions.spec.ts` (2), `critical-blockers.spec.ts` (2), `session-timeout.spec.ts` (2) |
| Pre-commit hook for empty-test detection | ✅ `scripts/check-empty-tests.sh` (caught the 6 above) |
| Flaky tests | Unknown — full suite not run during audit (Windows build issue, see ORIENTATION #20) |

### Severity classification
| Finding | Severity |
|---|---|
| 6 silently-passing Playwright tests (test() bodies with no expect/page calls) | **High** — false confidence in test coverage |
| 451 unit tests passing, ~524+ combined tests | **Positive** — substantial test discipline |
| Pre-commit hook detects this anti-pattern automatically | **Positive — strong architectural signal** |

### Planned improvement (U15)
**Target:** Add 3 meaningful tests for previously untested critical paths, OR fix 3 flaky/empty tests with documented RCA.

**Combined approach:**
1. Convert the 6 empty tests to `test.fixme()` so they show as deliberate placeholders, OR implement their logic
2. Add Playwright tests for under-covered flows: document deletion 404-after-delete, real-time sync between two browser contexts, sprint board drag persistence

**Feasibility:** High — multiple paths to satisfy the PDF requirement.

---

## Category 6 — Runtime Error and Edge Case Handling

### What this category measures
How the application handles failures: console errors, unhandled rejections, error boundaries, network disconnect recovery, malformed input.

### How we measured it
Combination of observation during U1–U4 audit work (login, benchmarks, navigation) + code inspection of error-handling surfaces in `api/src/` and `web/src/`.

### Baseline findings — strong security boundary, gaps at application layer

**Server-side strengths (observed):**
- ✅ Helmet + CSP + HSTS (1-year maxAge, preload, includeSubDomains)
- ✅ CSRF protection (csrf-sync) — Bearer tokens correctly bypass
- ✅ Rate limiting (1000 req/min dev, 10000 in test) — survived 17,000+ rate-limited requests cleanly during U4
- ✅ Slowloris/DDoS server timeouts (60s/65s/66s)
- ✅ Session timeout (15 min idle, government standard)

**Application-layer gaps (identified via code inspection):**
- ❌ **No top-level React ErrorBoundary** observed in `web/src/main.tsx` — render errors crash the entire app
- ❌ **No global Express error handler** observed in `api/src/app.ts` — unhandled rejections in routes fall through to Node default handler
- ❌ **No `process.on('unhandledRejection')` handler** in `api/src/index.ts`
- ❌ **No `window.addEventListener('error' / 'unhandledrejection')`** in `web/src/` — client-side errors from non-React code silently fail

### Severity classification
| Finding | Severity |
|---|---|
| No top-level React ErrorBoundary | **High** — single bad render crashes entire app |
| Yjs reconnect with expired session may silently fail | **High** — potential silent data loss |
| Strong security boundary | **Positive** |

### Planned improvement (U16 + U7)
**Target:** Fix 3 error handling gaps; at least 1 must involve user-facing data loss or confusion.

**Three selected gaps:**
1. **WebSocket reconnect recovery** (data-loss priority) — reconnect indicator UI + verify Yjs state preserved + detect 401/403 expired-session and route to re-login
2. **Top-level React ErrorBoundary** (user confusion priority) — wrap React tree; capture caught errors via the new U7 in-house error capture system
3. **Express async error middleware + `process.on('unhandledRejection')`** — convert escaped rejections to structured 500 responses

**U7 dependency:** The custom error-capture system (Ship has no Sentry per its own README; ORIENTATION finding #9) provides the destination for the captured errors.

**Feasibility:** High — all three are well-bounded, ~3-5 hours total.

### Phase 2 result
**Target met.** Ship now has an in-house error-capture utility, a top-level React `ErrorBoundary`, client `window.error` / `unhandledrejection` listeners, Express `errorHandler`, and `process.on('unhandledRejection')` capture. The implemented fixes address the white-screen crash scenario plus uncaptured server/client errors. Phase 13 also added the deferred WebSocket reconnect UI with cached-edit recovery messaging, retry controls, and session-expiration checks. Evidence is in `eval/results/error-after.md` and `eval/results/websocket-reconnect-ui.md`.

---

## Category 7 — Accessibility Compliance

### What this category measures
Section 508 / WCAG 2.1 AA conformance, the standards Ship's README explicitly claims.

### How we measured it
1. Lighthouse accessibility audit on `/login` (public)
2. `@axe-core/playwright` scans on 4 pages with WCAG 2.0 + 2.1 AA + best-practice rules (`/login`, `/docs`, `/projects`, `/team`)

### Baseline findings

**Lighthouse (login page):**
| Metric | Value |
|---|---|
| Accessibility score | **98 / 100** |
| Audits passed | 22 |
| Audits failed | **1** (`landmark-one-main` — missing `<main>` element) |
| Not applicable | 43 |
| Manual | 10 |

**Axe scans (4 pages):**

| Page | Critical | Serious | Moderate | Minor |
|---|---|---|---|---|
| `/login` | 0 | 0 | 0 | 0 |
| `/docs` | 0 | 0 | 0 | 0 |
| `/projects` | 0 | **1** | 0 | 0 |
| `/team/allocation` | 0 | **1** | 0 | 0 |
| **TOTAL** | **0** | **2** | **0** | **0** |

**Both Serious violations are the same issue: `color-contrast`** — Tailwind utility class combinations failing WCAG AA 4.5:1 ratio:
- `/projects`: 12 affected nodes — filter chip count badges (`bg-muted/30` + `text-muted`)
- `/team`: 1 affected node — "Week N" label (`text-accent` at `text-xs`)

### Severity classification
| Finding | Severity |
|---|---|
| 0 Critical violations across 4 pages | **Positive — excellent baseline** |
| 2 Serious violations (both color-contrast) | **Medium** — well-bounded, single CSS fix |
| 98/100 Lighthouse on login page | **Positive** — top 10% of React apps |
| Section 508 / WCAG 2.1 AA claim is genuine (not aspirational) | **Strong positive** |

### Planned improvement (U17)
**Target:** Fix all Critical/Serious violations on top 3 pages (alternative PDF target: +10 Lighthouse on lowest-scoring page).

**Approach:**
1. Fix color-contrast on filter chip badges (`/projects`, 12 nodes) — update Tailwind utility class combination
2. Fix color-contrast on "Week N" labels (`/team`, 1 node) — update text color or font size

**Feasibility:** Very high — CSS-only single-file changes.

---

## Category 8 — Security Audit

### What this category measures
Live security posture across Ship's running application surface: authentication/session handling, WebSocket validation, input sanitization, high/critical dependency CVEs, CORS/CSP, secret exposure, rate limiting, and verbose error leakage.

### How we measured it
1. Added a runnable security probe CLI exposed as `pnpm security:audit`
2. Ran the probe against local API + web targets with seeded `dev@ship.local / admin123`
3. Exercised unauthenticated auth/session checks, authenticated write/input probes, collaboration WebSocket malformed/oversized payload probes, dependency audit parsing, CORS/CSP header checks, common secret-path checks, rate-limit coverage review, and malformed-error checks
4. Wrote JSON and Markdown reports to `eval/results/security-audit-baseline.*` and `eval/results/security-audit-after.*`
5. Captured fix-specific proof in `eval/results/security-audit-fixes.md`

**Primary command:**
```powershell
pnpm security:audit -- --mode local --non-interactive
```

**Remote/production-capable command shape:**
```powershell
pnpm security:audit -- --mode remote --web-url <WEB_URL> --api-url <API_URL> --non-interactive
```

The probe first tries `dev@ship.local / admin123`. If those credentials do not work for a remote target, explicit `--email` / `--password` or `SHIP_SECURITY_EMAIL` / `SHIP_SECURITY_PASSWORD` can be provided; otherwise authenticated checks are marked credentials-required rather than silently skipped.

### Baseline findings

| Metric | Baseline |
|---|---|
| Security probe tool | ✅ Runnable — `pnpm security:audit` wrote JSON + Markdown reports |
| Auth/session vulnerabilities found | ✅ No verified vulnerabilities found; unauthenticated protected routes returned 401/403; malformed session and bearer token rejected |
| WebSocket validation failures | **MEDIUM** — collaboration WebSocket malformed binary handling closed unsafely (`closeCode: 1006`) after a 1-byte malformed frame |
| Input sanitization failures | ✅ No verified vulnerabilities found across login payloads, public feedback malformed ID, document title XSS marker, comment event-handler marker, overlong title rejection, and SQLi-like issue title |
| High/Critical CVEs in dependencies | ✅ No high or critical CVEs found by parsed `pnpm audit --json` |
| CORS/CSP misconfiguration | ✅ No verified vulnerabilities found for the local baseline; untrusted CORS origin was not allowed and CSP checks were classified cleanly |
| Secrets exposure risk | ✅ No secret-like values found on common accidental exposure paths (`/.env`, `/api/.env`, `/config.json`) |
| Rate limiting absent on endpoints | ✅ No absent endpoints identified by review; API, login, WebSocket connection, and WebSocket message limits are wired |
| Verbose error leakage | **MEDIUM** — malformed JSON responses leaked parser details (`JSON at position`, `line`, `column`) |
| Secondary privilege probe | Not run — secondary credentials were not provided; recorded as `not_run_secondary_credentials_required` |

**Baseline report summary:** `eval/results/security-audit-baseline.md` recorded **2 verified findings**, both Medium severity, with 32 pass results, 0 inconclusive/error/target-unavailable results, and 1 secondary-credentials-required result.

### Severity classification
| Finding | Severity |
|---|---|
| Collaboration WebSocket malformed binary frame closed with `1006` and previously risked API instability under active probes | **Medium** — malformed authenticated WebSocket input should be rejected with a controlled policy/validation close, not crash-only behavior |
| Malformed JSON parser details exposed in API response | **Medium** — discloses implementation/parser internals and gives attackers unnecessary request-shaping feedback |
| Auth/session unauthenticated access checks | **Positive** — protected API and WebSocket routes rejected unauthenticated access |
| Dependency CVE count | **Positive** — parsed audit found 0 high/critical CVEs |
| Input sanitization probes | **Positive** — active write probes treated adversarial payloads as data or rejected them |

### Planned improvement (Phase 16)
**Target:** Fix at least 2 verified security findings with vulnerability class, reproduction steps, applied fix, and before/after proof. Fixes must not break existing type-check/build/test gates.

**Selected fixes:**
1. **Collaboration WebSocket malformed-frame handling** — catch malformed Yjs protocol frames, close with controlled code `1008`, add WebSocket error handlers, and add a post-probe health check so crash-only failures are detected.
2. **Malformed JSON verbose error leakage** — map Express/body-parser `entity.parse.failed` errors to a generic `Invalid JSON body` client response while logging internal details server-side.

**Feasibility:** High — both fixes are narrow and directly covered by the probe and focused regression tests.

### Phase 16 result
**Target met.** `eval/results/security-audit-after.md` recorded **0 verified findings** after remediation: 35 pass results, 0 findings, 0 inconclusive/error/target-unavailable results, and 1 secondary-credentials-required result.

Before/after proof:
- WebSocket malformed binary: baseline `Status: finding`, `closeCode: 1006` → after `Status: pass`, `closeCode: 1008`, plus `ws-post-probe-health` returned `/health` status 200 after malformed and oversized WebSocket probes
- Verbose JSON leakage: baseline response exposed parser position/line/column → after response body is `{"error":{"code":"REQUEST_ERROR","message":"Invalid JSON body"}}` with `leaks: []`

Verification:
- `pnpm type-check` passed
- `pnpm --filter @ship/api test:security-probe` passed (39 focused security/regression tests)
- `pnpm build:api` passed
- `pnpm security:audit -- --mode local --non-interactive --report-name security-audit-after` passed with 0 verified findings

---

## Discovery — Three Things Learned (per PDF Discovery Requirement)

### Discovery 1: The unified document model with `document_type` discriminator
- **Where found:** Documented in `docs/unified-document-model.md` and demonstrated in `api/src/db/schema.sql` and all route handlers
- **What it does and why it matters:** Instead of separate tables for issues, wiki pages, projects, sprints, etc., Ship uses ONE `documents` table with a `document_type` enum. Properties live in JSONB. This means adding a new content type (like "RFC documents" or "incident reports") is essentially free — no migrations needed once you accept the JSONB-properties pattern.
- **How I would apply this in a future project:** For internal tools where the schema evolves rapidly and new content types are common, this pattern eliminates the migration treadmill. The trade-off is that list queries always need explicit type filtering and JSONB key indexes for hot fields. Worth the trade in fast-iteration contexts.

### Discovery 2: Aggressive TypeScript strict mode with `noUncheckedIndexedAccess`
- **Where found:** `tsconfig.json` lines 13-21
- **What it does and why it matters:** Most "strict TypeScript" projects enable `strict: true` and call it a day. Ship adds `noUncheckedIndexedAccess`, which makes EVERY array/object index access return `T | undefined`. This forces you to handle the "what if it's not there" case explicitly. Combined with `noImplicitReturns` and `noFallthroughCasesInSwitch`, it's about as paranoid as TypeScript gets — and the codebase passes cleanly (`tsc --noEmit` returns 0 errors).
- **How I would apply this in a future project:** Adopt this exact tsconfig as a baseline for greenfield TypeScript. It's surprisingly cheap to enforce from day one but expensive to retrofit. The codebase here proves it's livable at scale.

### Discovery 3: Pre-commit hook for detecting empty Playwright tests
- **Where found:** `scripts/check-empty-tests.sh` + invoked from `.husky/pre-commit`
- **What it does and why it matters:** Uses awk to parse test files and flag any `test()` bodies that have no `expect()` or `page.` calls (but exempting `test.fixme/skip/todo`). Catches the specific anti-pattern of "I'll fill this in later" test stubs that silently pass forever. The detection runs as a pre-commit hook so the problem is caught before merge.
- **How I would apply this in a future project:** Steal this pattern. The awk script is 30 lines. Configure it as a pre-commit hook on day one of any project using Playwright or any framework where empty test bodies pass silently. **Note from this audit:** Ship has 6 empty tests anyway — they predate the hook OR were merged via `--no-verify`. The hook works; discipline still required.

---

## Architecture Assessment (PDF Appendix Phase 3 Synthesis)

This section answers the 4 synthesis questions from the PDF Appendix Codebase Orientation Checklist Phase 3.

### Three strongest architectural decisions

1. **Unified document model with `document_type` discriminator** (`documents` table, JSONB properties)
   - **Evidence:** `api/src/db/schema.sql`, route handlers, `docs/unified-document-model.md`
   - **Why strong:** Cheap content-type extensibility, unified APIs, simplified migrations. The trade-off (need composite indexes + JSONB key indexes for hot paths) is well-understood and the existing indexes are largely correct.

2. **Aggressively strict TypeScript config**
   - **Evidence:** `tsconfig.json` lines 13-21 with `strict + noUncheckedIndexedAccess + noImplicitReturns + noFallthroughCasesInSwitch`
   - **Why strong:** `tsc --noEmit` passes cleanly across all 3 workspaces. Strict mode is enforced, not just declared. No `@ts-ignore` escape hatch abuse (only 1 in the entire codebase).

3. **"Boring technology" stack with explicit rationale in docs**
   - **Evidence:** `docs/application-architecture.md` lines 14-32 with per-decision rationale, plus extensive Decision Log
   - **Why strong:** Every tech choice (Express > Fastify, raw pg > ORM, React Router v6 > TanStack Router) has documented rationale. Lowers onboarding bar; failures are well-understood; no novelty-debt.

**Honorable mention — clean module structure:** `madge --circular` found ZERO circular dependencies across 82 source files. Discipline signal.

### Three weakest points

1. **Historical naming throughout the schema** — `sprint_*` columns/tables actually refer to weeks (`sprint_iterations`, `sprint_number`, `sprint_start_date`).
   - **Evidence:** `docs/document-model-conventions.md` documents this as known tech debt; code uses `sprint_*` while UI/docs use "Week"
   - **Cost:** New contributors burn hours understanding the misnomer. Bug-prone surface during refactors.
   - **Where to focus improvement:** Phased rename via aliases (out of audit scope).

2. **README setup steps assume macOS/Linux** — Three bash-only scripts (`dev.sh`, `web/build` env-var prefix, `api/build` `cp` command) block Windows developers entirely.
   - **Evidence:** ORIENTATION findings #1, #19, #20 — all blocked U1 setup until workarounds applied
   - **Cost:** Bounce rate for Windows contributors. Mac developers never see these.
   - **Where to focus improvement:** Adopt `cross-env` + `shx` packages for cross-platform scripts.

3. **No top-level React ErrorBoundary + no application-layer error handling**
   - **Evidence:** Code inspection of `web/src/main.tsx` and `api/src/app.ts` shows strong security boundary defenses (helmet, CSP, rate limit, CSRF) but no broad error capture
   - **Cost:** A single render error or unhandled rejection crashes the user experience
   - **Where to focus improvement:** U16 plan addresses this directly with a top-level ErrorBoundary + async error middleware + `process.on('unhandledRejection')`.

### Onboarding advice for a new engineer

Three things to read first:
1. **`docs/application-architecture.md` then `docs/unified-document-model.md`** — establishes the mental model. The unified document table is non-obvious until you see it.
2. **`docs/document-model-conventions.md`** — warns about the `sprint_*` historical naming before you accidentally treat them as sprints.
3. **`api/src/app.ts`** — the Express middleware chain reveals the whole architecture (auth, CSRF, rate limit, route mounts).

After that: pick one route handler (`api/src/routes/documents.ts`) and trace a real request from React component → API → database → response → React state update. Two hours invested here saves twenty later.

### 10x scaling break point

If Ship grew 10× (more workspaces, more documents, more concurrent WebSocket connections), what breaks first?

**First to break: the `documents` list endpoint at higher concurrency** — we already measured P95 of 479 ms at c=50 with 257 documents. At 2,570 documents AND 500 concurrent users, that becomes seconds-per-request territory. Response payload is the bottleneck (no pagination, no projection).

**Second: WebSocket server memory** — Server-side Yjs Y.Doc instances accumulate per open document. Long-lived documents grow operation history without compaction. At 10× usage, OOM risk on the single EB instance.

**Third: the weeks query** — 7 correlated subqueries per row × per-row JSONB cast in ORDER BY. Works at 257 documents; degrades non-linearly.

**Magnitude of fixes:**
- Documents pagination + projection: 1–2 days
- Yjs state compaction: 2–3 days (requires Yjs internals knowledge)
- Weeks query rewrite: 1 day (covered by U13)

---

## Summary — Per-PDF-Category Target Achievement (Phase 1 baseline)

| Category | Baseline | PDF target | Improvement target met? |
|---|---|---|---|
| 1. Type Safety | 399 grep violations; 93.47% type-coverage | ≥25% violation reduction | **Met** — conservative violations reduced to 294 (-26.32%) and type-coverage improved to 93.96% (`type-safety-after.json`, `type-coverage-after.txt`) |
| 2. Bundle Size | 2,073 KB main chunk | ≥15% total OR ≥20% initial via splitting | **Met** — route-level lazy loading reduced the entry script to 287 KB (-86.14%) with heavy app/editor/page code deferred (`bundle-after.json`) |
| 3. API Response Time | documents P97.5 c=25 = 283 ms; issues P97.5 c=25 = 192 ms | ≥20% P95/P97.5 on ≥2 endpoints | **Met** — documents paginated improved 71.02% to 82 ms; issues paginated improved 39.58% to 116 ms (`api-benchmark-after.json`, `api-benchmark-documents-limit50-c25.json`, `api-benchmark-issues-limit50-c25.json`) |
| 4. DB Query Efficiency | weeks query has 7 correlated subqueries | ≥20% query count OR ≥50% slowest query | **Met** — migration `038` verified; weeks SQL EXPLAIN captured; request-level DB statements reduced 5 -> 3 for seeded super-admin flow (-40%) and 6 -> 4 for normal member flow (-33.33%); c=50 rerun is flat vs baseline at 130 ms P97.5 with 0 non-2xx (`db-query-after.md`, `api-benchmark-weeks-u14-after.json`) |
| 5. Test Coverage | 451 unit + 73+ E2E; 6 empty/silent-pass tests | 3 new tests OR 3 flaky fixes | **Met** — 455/455 API tests pass, 41.27% line coverage, empty-test detector reports 0 (`test-coverage-after.json`, `empty-tests-after.json`) |
| 6. Runtime Error Handling | No top-level ErrorBoundary; no global error handlers | Fix 3 gaps, ≥1 data-loss scenario | **Met** — in-house capture + top ErrorBoundary + client global listeners + Express handler + `unhandledRejection`; Phase 13 adds WebSocket reconnect/retry UI (`error-after.md`, `websocket-reconnect-ui.md`) |
| 7. Accessibility | 0 Critical, 2 Serious axe violations | +10 Lighthouse OR 0 Critical/Serious on top 3 | **Met** — 0 axe violations across login/docs/projects/team (`axe-after.json`) |
| 8. Security Audit | Runnable probe; 2 Medium verified findings (WebSocket malformed binary, verbose JSON leakage) | Fix at least 2 verified vulnerabilities/findings with before/after proof | **Met** — after probe reports 0 verified findings; fixes documented in `security-audit-fixes.md` with baseline/after evidence |

---

## Phase 1 Gate

This document began as the Phase 1 audit gate of the ShipShape project. At Phase 1 submission, only the **baseline** sections were filled in and no improvements had been made yet. Phase 2 populated the after-measurements for each category and linked them to before/after evidence artifacts.

The PDF explicitly requires this separation: *"Diagnosis comes before treatment."* The Phase 1 baseline preserved that separation; the Phase 2 commits contain the treatment and measurement updates.

**Phase 1 audit submission date:** 2026-05-19

---

## References and Companion Documents

- `ORIENTATION.md` — PDF Appendix Codebase Orientation Checklist responses (21 findings + 8 numbered sections)
- `docs/drafts/ARCHITECTURE-draft.md` — architecture document template (to be finalized in U21 with before/after sections)
- `docs/drafts/AUDIT-draft.md` — audit report template
- `eval/results/` — all baseline and after-measurement artifacts referenced above
- `eval/results/security-audit-baseline.md` — Category 8 baseline with exact audit deliverable matrix
- `eval/results/security-audit-after.md` — Category 8 after-remediation report with zero verified findings
- `eval/results/security-audit-fixes.md` — Category 8 two-fix before/after proof
- `eval/results/full-e2e-gate.md` — final full Playwright release-gate pass on Windows
- `docs/brainstorms/2026-05-21-phase-16-category-8-security-audit.md` — Category 8 requirements and acceptance examples
- Implementation plan: `docs/plans/2026-05-18-001-feat-shipshape-audit-enhancement-plan.md` (in Week4 planning repo)
