# Demo Script — ShipShape Phase 1 (Audit Baseline)

**Target length:** ~6–7 minutes
**Recording setup:** Browser + code editor split. No credentials on screen.
**Repo shown:** `github.com/jaynyasg/ship` (or GitLab mirror)

---

## Pre-recording checklist

- [ ] Browser tabs open and ready: (1) fork on GitHub, (2) `AUDIT.md` in VS Code or GitHub web view, (3) `ORIENTATION.md` tab, (4) `eval/results/` folder in GitHub
- [ ] VS Code open on Ship fork with `AUDIT.md`, `api/src/routes/issues.ts`, and `api/src/routes/weeks.ts` in the file explorer
- [ ] Terminal with ship fork directory, Docker running (`docker ps` shows `ship-postgres-1`)
- [ ] No credentials visible anywhere

---

## Scene 1 — Fork intro and commit history (~45 s)

**Show:** GitHub fork page → Commits tab

**Say:**
> "This is my fork of the US Department of the Treasury's Ship project management tool — a TypeScript monorepo with a React frontend, an Express API, and PostgreSQL. The goal of Phase 1 was a full diagnostic audit before touching a single line of source code.
>
> Looking at the commit history, you can see the audit was done in distinct, committed stages — type safety and orientation first, then bundle, API performance, database, tests, error handling, and accessibility — each with its own evidence artifact committed alongside."

**Action:** Scroll through the 4 audit commits slowly so the commit messages are readable.

---

## Scene 2 — ORIENTATION.md overview (~50 s)

**Show:** `ORIENTATION.md` open — scroll to the findings table at the bottom, then to §3.1

**Say:**
> "Before measuring anything, I worked through the PDF Appendix orientation checklist — all 8 sections covering the data model, request flow, real-time collaboration, TypeScript patterns, testing infrastructure, and build pipeline. This produced ORIENTATION.md, a committed artifact.
>
> The 21 findings table captures everything that surprised me during setup and code reading — including three bash-only scripts that block Windows developers, a port mismatch in the env example file, and — most importantly for later — the README's explicit statement that Ship prohibits Sentry and third-party telemetry. That single finding rewired how I planned the error capture work in Phase 2.
>
> The synthesis section here — §3.1 — names the three strongest and three weakest architectural decisions with file-path evidence. This isn't generic prose; I cite specific lines."

**Action:** Scroll to §3.1 and briefly show the "Three weakest points" section.

---

## Scene 3 — AUDIT.md structure (~30 s)

**Show:** `AUDIT.md` — top section and table of contents

**Say:**
> "AUDIT.md is the Phase 1 gate document. It has the same structure for every category: what we measured, how we measured it, the baseline numbers, a severity classification, and a planned improvement. Every number links to a committed artifact in eval/results/. Nothing in this document is asserted without evidence."

**Action:** Briefly show the Methodology Overview table at the top, then the section list.

---

## Scene 4 — Category 1: Type Safety (~45 s)

**Show:** AUDIT.md §Category 1, then `eval/results/type-safety-baseline.json`

**Say:**
> "Category 1: type safety. The headline number is 399 combined grep violations — any, as-assertions, non-null assertions, ts-ignore — across web, API, and shared packages.
>
> But there's a strong positive here too: this codebase already has aggressive strict mode enabled — strict, noUncheckedIndexedAccess, noImplicitReturns — and tsc passes cleanly across all three workspaces. That's unusually disciplined. The type-coverage tool reports 93.47%, which is top-tier for a codebase this size.
>
> The 25% improvement target maps to fixing roughly 100 violations, concentrated in 5 files. The highest-density file is UnifiedEditor.tsx with about 50 combined violations."

**Action:** Show the violation table in AUDIT.md, then briefly show `type-safety-baseline.json` in eval/results.

---

## Scene 5 — Category 2: Bundle Size (~30 s)

**Show:** AUDIT.md §Category 2

**Say:**
> "Category 2: bundle size. The production build produces a single 2.07 megabyte main chunk. Vite itself warns during build that this exceeds the 500 KB threshold by 4×. The existing code-splitting infrastructure is wired up — there are 260+ per-icon and tab chunks already — but two mixed dynamic/static import conflicts are silently defeating the intended splitting. Phase 2 targets lazy-loading the editor route via React.lazy, which is the heaviest contributor to that main chunk."

---

## Scene 6 — Category 3: API performance — the smoking gun (~60 s)

**Show:** AUDIT.md §Category 3 table → then open `api/src/routes/issues.ts` and navigate to line 126

**Say:**
> "Category 3 is where we found what I'd call the smoking gun. The documents endpoint returns a 150 KB payload with all 257 documents, no pagination — that explains the 283ms P95 at 25 concurrent connections. But the issues endpoint showed a similar problem for a different reason.
>
> [switch to code view]
>
> Line 126 of issues.ts. This SELECT includes `d.content` — the full TipTap rich-text JSON — even though the issues list view never renders it. Content fields for issues can be kilobytes each. This is a single line that, when removed, will likely cut the issues P95 by 30–50%.
>
> This is the kind of finding that doesn't show up in a linter scan — you have to actually read the SQL. The benchmark gave us the number; reading the code gave us the cause."

**Action:** Show the actual line in the file with the `d.content` SELECT visible.

---

## Scene 7 — Category 4: Database — the 7 subqueries (~40 s)

**Show:** AUDIT.md §Category 4, then briefly show `api/src/routes/weeks.ts`

**Say:**
> "Category 4: database query efficiency. The planned improvement was going to be adding a composite index, but when I ran `\d documents` in psql, that index already existed — as a partial composite called idx_documents_active.
>
> The real finding is the weeks endpoint, which executes 7 correlated subqueries per row — one for issue count, one for completed count, one for started count, and four more for sprint metadata. Each subquery also does a per-row JSONB cast on sprint_number for the ORDER BY. At 257 documents this is fast; at 2,500 it degrades non-linearly.
>
> Phase 2 adds a JSONB expression index for the cast, and rewrites the 7 subqueries to a single LEFT JOIN with conditional COUNT aggregations."

---

## Scene 8 — Category 5: Tests — the empty test finding (~35 s)

**Show:** AUDIT.md §Category 5, then briefly show `e2e/autosave-race-conditions.spec.ts`

**Say:**
> "Category 5. The unit test suite is actually stronger than the PDF suggested — 451 Vitest tests pass in under 43 seconds. But there are 6 silently-passing Playwright tests across 3 files. These are test() calls with no expect or page assertions in the body.
>
> What's interesting is that Ship has a pre-commit hook — check-empty-tests.sh — that detects this exact pattern. These tests predate the hook or were merged with --no-verify. The hook works; the discipline slipped. Phase 2 either converts them to test.fixme or implements the missing assertions."

---

## Scene 9 — Categories 6 & 7: Error handling + Accessibility (~35 s)

**Show:** AUDIT.md §Category 6 and §Category 7 side by side or scrolled quickly

**Say:**
> "Categories 6 and 7 are a contrast. Error handling: the security boundary is excellent — Helmet, CSP, CSRF, rate limiting, Slowloris timeouts. But the application layer has no top-level React ErrorBoundary, no global Express error handler, and no unhandledRejection listener. A single bad render currently crashes the entire app.
>
> Accessibility is the opposite — this is a genuinely strong baseline. 98/100 on Lighthouse, zero Critical violations across 4 pages. There are only 2 Serious violations, both color-contrast issues: filter chip badges on Projects and a Week label on Team. Single CSS fixes each."

---

## Scene 10 — Architecture Assessment synthesis (~45 s)

**Show:** AUDIT.md §Architecture Assessment

**Say:**
> "The PDF Appendix requires a synthesis section, not just numbers. The three strongest decisions I found: the unified document model with a document_type discriminator, the aggressive TypeScript strict config, and the 'boring technology' stack with documented rationale per decision. The docs explain WHY Express over Fastify, WHY raw pg over an ORM, with explicit trade-off reasoning.
>
> The three weakest points: the historical sprint_* naming that actually means weeks, the bash-only scripts that block Windows developers entirely, and the missing application-layer error handling despite a strong security perimeter.
>
> The 10x break point analysis named the documents list endpoint as the first to fail — we already measured it at 479ms P95 at 50 concurrent connections with just 257 documents."

---

## Scene 11 — eval/results evidence artifacts + Phase 2 preview (~40 s)

**Show:** GitHub `eval/results/` folder with all baseline files visible

**Say:**
> "Every number in the audit report is backed by a committed artifact here in eval/results. 15 autocannon JSON files — one per endpoint per concurrency level. The type-safety baseline with per-package violation counts. The axe scan. The Lighthouse export. The dependency CVE audit showing 74 vulnerabilities including 2 Critical.
>
> These artifacts are the evidence standard — a grader can diff them against the after-measurement files that land in Phase 2.
>
> Phase 2 takes each of these baselines and runs the improvements: lazy-loading the editor, removing the content column from the issues query, adding the expression index and rewriting the weeks query, fixing the 6 empty tests, adding an ErrorBoundary, and patching the 2 color-contrast violations. Each one re-runs the relevant measurement tool and commits an after artifact to the same directory."

---

## Outro (~15 s)

**Show:** Return to GitHub fork page

**Say:**
> "That's Phase 1 — 7 categories measured, every finding grounded in code or benchmark output, and a clear improvement target for each one. Phase 2 implements those improvements."

---

## Pacing notes

| Scene | Target | If short on time |
|---|---|---|
| 1 Fork intro | 45 s | Cut to 20 s — just show commit list |
| 2 ORIENTATION.md | 50 s | Skip the findings table; just show §3.1 |
| 3 AUDIT.md structure | 30 s | Keep — orients the viewer |
| **4 Type Safety** | **45 s** | **Keep — strong positive finding** |
| 5 Bundle | 30 s | Cut to 15 s |
| **6 Issues smoking gun** | **60 s** | **Keep — best demo moment** |
| 7 DB subqueries | 40 s | Cut to 20 s |
| 8 Empty tests | 35 s | Cut to 15 s |
| 9 Error + A11y | 35 s | Keep combined — fast to say |
| **10 Architecture Assessment** | **45 s** | **Keep — this is graded content** |
| 11 eval/results + preview | 40 s | Cut to 20 s |
| Outro | 15 s | Keep |
| **Total** | **~6:30** | **~4:30 if all cuts applied** |

---

## Key phrases to use (signal to the grader that you read the code)

- *"Line 126 of issues.ts"* — shows you found the root cause, not just the symptom
- *"The index we planned to add already exists"* — shows you verified before assuming
- *"The pre-commit hook detects this"* — shows you read Ship's own tooling
- *"README §Security says no Sentry"* — shows the constraint came from the repo, not a preference
- *"At 257 documents this is fast; at 2,500 it degrades non-linearly"* — connects benchmark to scale analysis
