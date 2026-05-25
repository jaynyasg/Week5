---
title: "ShipShape — Additional Improvements Beyond U11-U17"
date: 2026-05-19
status: completed
origin: brainstorm — Phase 1 audit gap analysis
parent_plan: docs/plans/2026-05-18-001-feat-shipshape-audit-enhancement-plan.md
---

# ShipShape — Additional Improvements Beyond U11-U17

**Context:** Phase 1 audit is complete. The existing plan (U11-U17) covers the 7 PDF improvement targets. This document captures 6 additional improvements surfaced by cross-referencing AUDIT.md + ORIENTATION.md findings against the committed plan.

---

## Summary

Six additions across 4 of the 7 audit categories. Three slot into existing units with no new work overhead; three require new or expanded units.

| ID | Category | What | Slots into | Effort |
|---|---|---|---|---|
| D | Cat 5 — Test Coverage | Vitest `--coverage` line/branch % baseline + after-run | U5 (baseline today) + U15 (after) | Trivial — one command |
| C | Cat 4 — DB Queries | Covering index for `ORDER BY position, created_at` on documents list | U14 (second migration) | Very low |
| E | Cat 7 — Accessibility | `<main>` landmark element — Lighthouse `landmark-one-main` failure | U17 (third fix) | Trivial — single HTML change |
| A | Cat 1 — Type Safety | ESLint config: `@typescript-eslint/recommended` + `jsx-a11y/recommended` | New U26 | Low-medium |
| B | Cat 3 — API Response Time | API-layer pagination (LIMIT/OFFSET + total_count) on `/api/documents` | Expand U13 | Medium |
| F | Cross-cutting | Best-effort Critical CVE remediation (2 CVEs from ORIENTATION finding #16) | Expand U18 | Medium-high, uncertain |

## Implementation Status

| ID | Status | Outcome |
|---|---|---|
| D | Complete | Coverage baseline and after artifacts were committed in `eval/results/test-coverage-baseline.json` and `eval/results/test-coverage-after.json`. |
| C | Complete | `idx_documents_sort` shipped in migration `038_shipshape_query_perf_indexes.sql` and appears in `eval/results/db-query-after.md`. |
| E | Complete | The login landmark gap is closed; `eval/results/axe-after.json` records 0 axe violations across audited pages. |
| A | Complete | Phase 05 added the ESLint flat config, workspace lint scripts, and baseline artifacts. |
| B | Complete | Phase 07 adds page-style `/api/documents` pagination while preserving the legacy array response for existing callers. |
| F | Complete | Phase 06 reduced critical dependency advisories from 2 to 0 and documented the residual risk in `THREAT_MODEL.md`. |

---

## Item D — Vitest Coverage Baseline and After-Run

**Goal:** Fill the "not yet measured" gap in Category 5 baseline. Give a concrete line/branch percentage before-state and an after-state delta.

**Why not in original plan:** U5 catalogued test counts and covered flows; code coverage with `vitest --coverage` was listed as "not yet measured."

**Approach:**
1. Run `pnpm --filter @ship/api exec vitest --coverage --reporter=json --outputFile=eval/results/test-coverage-lcov-baseline.json` (verify the exact flag against api/package.json)
2. Commit the output to `eval/results/`
3. After U15 improvements land, rerun and commit to `eval/results/test-coverage-lcov-after.json`
4. Record before/after % in AUDIT.md Category 5 improvements subsection

**Acceptance criteria:**
- `eval/results/test-coverage-lcov-baseline.json` committed before any U11-U17 improvement lands
- After-run committed after U15; delta (even if small) documented in AUDIT.md

---

## Item C — ORDER BY Covering Index

**Goal:** Add a second index to the U14 migration batch addressing the medium-severity sort gap identified in AUDIT.md Category 4.

**Why not in original plan:** U14 was retargeted to the sprint_number JSONB expression index; the ORDER BY gap was flagged Medium but not actioned.

**Approach:** Add to the same migration file as `idx_documents_sprint_number`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_sort
  ON documents (workspace_id, position, created_at)
  WHERE archived_at IS NULL AND deleted_at IS NULL;
```

Include companion down migration: `DROP INDEX IF EXISTS idx_documents_sort;`

**Acceptance criteria:**
- Index included in the U14 migration file alongside `idx_documents_sprint_number`
- `EXPLAIN ANALYZE` on the documents list query shows this index used (or note if not selected by planner)
- Migration runs cleanly on seeded local DB

---

## Item E — `<main>` Landmark Element

**Goal:** Fix the one Lighthouse `landmark-one-main` failure on the login page (and ensure the pattern is applied to the other 3 audited pages).

**Why not in original plan:** U17 was scoped to the 2 color-contrast axe violations only.

**Approach:** Locate the root layout component in `web/src/` (likely `web/src/App.tsx` or a layout component used by all pages). Add `<main>` wrapper around the page-content slot where it is absent. Verify: `pnpm test:a11y` passes; Lighthouse re-run on login shows `landmark-one-main` resolved.

**Acceptance criteria:**
- Lighthouse `landmark-one-main` audit passes on login page after fix
- Slots into U17 commit alongside color-contrast fixes
- No existing Playwright tests broken

---

## Item A — ESLint Configuration

**Goal:** Add the baseline ESLint config that AUDIT.md §1 listed as a stretch goal. Produces a committed `eval/results/eslint-baseline.json` artifact and an ongoing quality gate.

**Why not in original plan:** Described as "Stretch" in AUDIT.md but never committed as a deliverable.

**Files:**
- `eslint.config.js` (or `.eslintrc.json` depending on ESLint 8 vs 9 — verify against project Node version)
- `eval/results/eslint-baseline.json` — raw output committed as evidence
- `eval/results/eslint-summary-baseline.md` — human-readable: total errors/warnings, top-5 rules, top-5 files

**Rules to include:**
- `@typescript-eslint/recommended` — TypeScript-aware rules
- `jsx-a11y/recommended` — catches a11y issues at lint time (complements U17 fixes)
- `react-hooks/recommended` — hooks dependency arrays

**Approach:**
1. Verify ESLint version compatibility (ESLint 9 uses flat config; ESLint 8 uses `.eslintrc.*`)
2. Install config packages as dev dependencies: `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`
3. Add `lint` scripts to root `package.json` and individual workspace `package.json`s
4. Run baseline: `pnpm exec eslint . --format=json --output-file=eval/results/eslint-baseline.json`
5. Commit config + baseline artifact

**Scope boundary:** We are NOT fixing ESLint violations as part of this unit — only capturing the baseline. Violations that happen to overlap with U11 type-safety fixes are fine; intentional ESLint-driven fixes are out of scope.

**Acceptance criteria:**
- `eslint.config.js` or `.eslintrc.json` committed to repo root
- `pnpm lint` runs without crashing (violations are fine; errors installing or parsing are not)
- `eval/results/eslint-baseline.json` + `eval/results/eslint-summary-baseline.md` committed

---

## Item B — API-Layer Pagination on `/api/documents`

**Goal:** Add `LIMIT`/`OFFSET` + `total_count` to the `/api/documents` query. Measure P95 reduction in the benchmark against the baseline.

**Why not in original plan:** U13 planned column projection (which is still the primary fix); pagination was deferred as "at scale" concern. Adding it provides a larger P95 gain and directly addresses the 10x break point documented in AUDIT.md Architecture Assessment.

**Scope:** API layer only. No frontend pagination UI. The frontend continues to fetch page 1 — the improvement is measured by comparing the paginated response size and P95 to the baseline.

**Files:**
- `api/src/routes/documents.ts` — add `?page=N&limit=50` and `?page=N&per_page=50` query params; return `{ items: [...], pagination: { total_count, page, per_page, ... } }`
- `eval/results/api-benchmark-after.json` — re-run after both U13 projection + B pagination land

**Acceptance criteria:**
- `GET /api/documents?page=1&limit=50` returns first 50 documents with `total` and `total_count`
- `GET /api/documents` (no params) remains a legacy array response for existing frontend and command-palette callers
- P95 at c=25 measurably lower than the 283 ms baseline (target: ≥20% per PDF + additional gain from smaller payload)
- All existing Playwright tests pass (verify they don't assert on document list length or specific page behavior)

**Risk:** Existing Playwright tests may rely on all documents being returned in one request. Check `e2e/` for any test that asserts on document count or iterates over the full document list before implementing.

**Phase 07 outcome:** Completed on 2026-05-20. The route now supports page-style pagination with `page`, `limit`, and `per_page`, includes `total_count` by default for page requests, rejects ambiguous `offset` + page combinations, and preserves the no-query array response for backward compatibility.

---

## Item F — Best-Effort Critical CVE Remediation

**Goal:** Attempt to remediate the 2 Critical CVEs identified in ORIENTATION finding #16 (`eval/results/dependency-audit-baseline.json`). Document result in THREAT_MODEL.md.

**Why not in original plan:** The original U18 plan explicitly excluded CVE fixing: "No fixing at this stage — fixing CVEs and outdated dependencies is out of audit scope unless they overlap with an existing improvement target."

**This is a scope expansion of U18** — the documented rationale for exclusion was "audit scope," which has now been revisited.

**Approach:**
1. Read `eval/results/dependency-audit-baseline.json` — identify the 2 Critical CVEs: package name, CVE ID, dependency chain, recommended fix version
2. For each Critical CVE: attempt `pnpm update <package>@<fixed-version>` and run `pnpm type-check && pnpm test`
3. If update succeeds and tests pass: commit the lockfile update; document fix in THREAT_MODEL.md §6
4. If update breaks compilation or tests: document the attempt + specific blocker in THREAT_MODEL.md §7 residuals using the "Won't-fix with rationale" format from the plan

**Acceptance criteria (success path):** Critical CVE count in `pnpm audit` output drops from 2 to 0 or 1. Lockfile committed. THREAT_MODEL.md updated.

**Acceptance criteria (blocked path):** THREAT_MODEL.md §7 has a "Won't-fix with rationale" entry for each unresolved Critical CVE naming: CVE ID, affected package, dependency chain, why fix is blocked, compensating control.

**Outcome is the deliverable regardless of which path is taken.**

**Phase 06 outcome:** Completed on 2026-05-20. Critical advisories dropped from 2 to 0 using narrow `pnpm.overrides` for `fast-xml-parser`, `protobufjs`, and `@protobufjs/utf8`. Evidence is in `eval/results/dependency-audit-after.json`; rationale and residual risks are documented in `THREAT_MODEL.md`.

---

## Scope Boundaries

- **B pagination scope:** API layer only — no frontend pagination UI, no changes to React components
- **F CVE scope:** Critical CVEs only — the 30 High CVEs are out of scope for this addition
- **A ESLint scope:** Config + baseline artifact only — no fixing ESLint violations
- **Protected from all additions:** Yjs collaboration core (`api/src/collaboration/`), Terraform configs, existing passing Playwright tests

---

## Integration Notes

- **D before anything else:** Vitest `--coverage` baseline should be committed BEFORE any U11-U17 improvement starts, as it fills a current AUDIT.md gap.
- **C inside U14 migration:** The `idx_documents_sort` migration should be in the same migration file or a sequential migration committed alongside `idx_documents_sprint_number` — don't create two separate migration PRs.
- **B after U13:** Pagination should be implemented after U13's column projection change. Both affect `api/src/routes/documents.ts`; doing them together avoids a merge conflict.
- **F after U18:** CVE remediation extends U18's threat model work; implement after THREAT_MODEL.md draft exists so the documentation is in place to update.
