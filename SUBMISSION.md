# ShipShape Submission Summary

**Date:** 2026-05-24
**Repo:** `jaynyasg/ship`  
**Latest checked main before final rubric sweep:** `029a43a docs(assistant): add trace runbook`

This file is the reviewer-facing map for the ShipShape audit work. The detailed report remains `AUDIT.md`; the raw before/after evidence lives in `eval/results/`.

## What Changed

All eight audit categories have reproducible after-measurements:

| Category | Evidence | Result |
|---|---|---|
| Type safety | `eval/results/type-safety-after.json`, `type-coverage-after.txt` | Grep violations 399 -> 294 (-26.32%); type coverage 93.47% -> 93.96% |
| Bundle size | `eval/results/bundle-after.json` | Entry JS 2,073.70 KB -> 287.36 KB (-86.14%) through route-level lazy loading |
| API response time | `eval/results/api-benchmark-after.json` | Paginated documents P97.5 283 ms -> 82 ms; paginated issues P97.5 192 ms -> 116 ms |
| DB/query efficiency | `eval/results/db-query-after.md`, `api-benchmark-weeks-u14-after.json` | `GET /api/weeks` drops from 5 -> 3 DB statements for seeded super-admin flow and 6 -> 4 for normal member flow |
| Tests | `eval/results/test-coverage-after.json`, `empty-tests-after.json` | 455/455 API tests passing; empty Playwright test detector now reports 0 empty tests |
| Runtime errors | `eval/results/error-after.md` | Shared in-house error capture, Express error middleware, unhandled rejection hook, client listeners, and React top-level error boundary |
| Accessibility | `eval/results/axe-after.json` | 0 axe violations across login, docs, projects, and team pages after contrast/landmark fixes |
| Security audit | `eval/results/security-audit-baseline.md`, `security-audit-after.md`, `security-audit-fixes.md` | Runnable probe; baseline found 2 Medium findings; after report has 0 verified findings after WebSocket and verbose-error fixes |

## Phase 04 Product Upgrade

After the seven audit categories closed, Ship added a Microsoft Project-inspired planning surface while preserving the unified document model:

| Phase | Result |
|---|---|
| 04A Dependency data model | `depends_on` document associations, dependency CRUD, workspace scoping, and cycle rejection |
| 04B Timeline read model | Project/program timeline endpoint with related weeks, issues, dependency edges, blocked/overdue/at-risk flags, and measured timing evidence |
| 04C Timeline UI | Lazy-loaded Timeline tab with timeline bars, health badges, dependency summaries, keyboard-openable rows, and baseline controls |
| 04D Baseline variance | Project/program baseline snapshots and current-vs-baseline variance reporting |
| 04E Critical path | Compact critical-path computation, API/shared/OpenAPI fields, ordered row badges, and highlighted critical timeline bars |

## Phase 05 Quality Gate

Ship now has an executable ESLint baseline across `api`, `web`, and `shared`, using recommended TypeScript rules plus React Hooks and JSX accessibility checks for web code. The baseline is intentionally committed before cleanup so future work can burn it down against a measured starting point: 333 files checked, 116 files with findings, 487 errors, and 29 warnings.

## Phase 06 Security Remediation

The dependency audit critical count is now 0. Phase 06 used narrow `pnpm.overrides` to lift `fast-xml-parser`, `protobufjs`, and `@protobufjs/utf8` to patched versions, preserving the current AWS SDK and testcontainers parent APIs. The after-audit artifact is `eval/results/dependency-audit-after.json`, and the rationale is documented in `THREAT_MODEL.md`.

## Phase 07 API Pagination Contract

The remaining `/api/documents` pagination gap is closed with page-style query support: `page`, `per_page`, and `limit` now produce a paginated `{ items, pagination }` response with `total_count`. Bare `/api/documents` still returns the legacy array so existing React callers keep working until a frontend pagination UI is intentionally scoped.

## Phase 08 Dependency Audit Zero

The dependency audit now reports 0 critical, 0 high, 0 moderate, and 0 low advisories. Phase 08 used targeted `pnpm.overrides` for runtime, build, and dev-tooling transitive packages while keeping parent package API surfaces stable.

## Phase 09 Dependency Audit Gate

The clean dependency baseline is now enforceable. `pnpm audit:ci` parses `pnpm audit --json` and fails on any advisory, with matching GitHub Actions and GitLab CI jobs for pull requests, default-branch pushes, schedules, and manual runs.

## Phase 10 Windows E2E Build Unblock

The API build no longer depends on POSIX `cp`. `pnpm build:api`, which Playwright global setup invokes before E2E workers start, now runs through a Node script that copies DB schema and migration assets cross-platform.

## Phase 11 Cross-Platform Dev Wrapper

Root `pnpm dev` no longer depends on bash. It now runs a Node wrapper that preserves first-run database setup, `build:shared`, dynamic port selection, `.ports`, and parallel API/web startup on Windows, macOS, and Linux. The legacy shell wrapper remains available as `pnpm dev:sh`.

## Phase 12 Setup Documentation Hardening

The README and orientation notes now match the cross-platform setup path: local PostgreSQL-first host dev, `pnpm dev` first-run automation, optional full-stack Docker Compose, correct migrate/seed ordering, explicit pnpm version, and correct unit-vs-E2E test commands.

## Phase 13 WebSocket Reconnect UI

The editor now distinguishes healthy sync from cached reconnect/offline states. Collaboration failures show an accessible recovery banner, a compact retry control, and a throttled session check that reuses the existing expired-session login path when reconnect failure is authentication-related.

## Phase 14 Compact E2E Runner

Root `pnpm test:e2e` now wraps Playwright with a compact Node runner that captures raw stdout/stderr under `test-results/runner/`, polls `test-results/summary.json`, and preserves focused test files plus `--last-failed` passthrough. Raw Playwright output remains available as `pnpm test:e2e:raw` only for explicit debugging.

## Phase 15 Windows E2E Runner Hardening

The compact runner was exercised against the real Playwright harness. Phase 15 fixed the Windows preview-server spawn path, preserved runner logs after Playwright clears `test-results`, corrected retry-aware progress accounting, and bumped the `ip-address` override to the `express-rate-limit` compatible patched floor. The focused isolated E2E spike now passes 4/4 through testcontainers, API, Vite preview, proxy, CSRF, and login.

## Phase 16 Category 8 Security Audit

Ship now has a runnable Category 8 security audit probe via `pnpm security:audit`. The baseline exercised unauthenticated auth/session checks, authenticated input probes with `dev@ship.local / admin123`, WebSocket malformed/oversized payloads, parsed dependency CVEs, CORS/CSP, common secret exposure paths, rate-limit coverage, and verbose error leakage. The baseline found 2 Medium findings: collaboration WebSocket malformed binary handling and malformed JSON parser detail leakage.

Both findings are fixed with before/after proof. `eval/results/security-audit-after.md` reports 0 verified findings, and `eval/results/security-audit-fixes.md` records the vulnerability class, reproduction steps, fix summary, and before/after evidence for each fix.

## Phase 17 ESLint Quality Burn-down

The maintained-source ESLint baseline is fully burned down. `eval/results/eslint-phase05-summary.md` now records 357 files checked with 0 files containing findings, 0 errors, and 0 warnings across `api`, `web`, and `shared`.

## Phase 18 Hosted Quality Gates

GitHub Actions and GitLab CI now enforce hosted quality checks for `pnpm lint`, `pnpm type-check`, `pnpm build:api`, and `pnpm build:web` in addition to the existing `pnpm audit:ci` dependency gate. The carried-forward `uuid` and `ws` overrides stay pinned until upstream dependency ranges naturally resolve patched versions. A new `qs@6.15.2` override covers the 2026-05-22 Express 4 transitive advisory (`GHSA-q8mj-m7cp-5q26`) while preserving the zero-advisory gate. `eval/results/dependency-override-retirement.md` now includes the retest criteria for retiring the pins safely.

## Final E2E Release Gate

The full Playwright gate now passes through the compact runner on Windows. On 2026-05-22, `pnpm test:e2e -- --workers=2` completed with 869 passed, 0 failed, 0 skipped, and 0 pending tests.

## Deployment Decision

The full AWS Terraform application stack was reviewed but not applied for the submission environment. Earlier docs listed `~$80/month` and `~$113/month` AWS estimates, but those were out of date for the corrected full plan because they omitted Kinesis real-time CloudFront logs, 180-day retention, WAF Bot Control, public IPv4 charges, CloudWatch/VPC flow logs, and other always-on resources. The corrected plan would create 74 resources and was estimated at roughly `$220-$300/month` for low-traffic always-on hosting, with Kinesis real-time CloudFront logs, Aurora Serverless v2, NAT Gateway, ALB, Elastic Beanstalk EC2, WAF Bot Control, public IPv4 charges, and CloudWatch/VPC flow logs as the main cost drivers.

Render is now the preferred public deployment target for the submission because it can host the long-running Express/WebSocket API, PostgreSQL database, and static React frontend with much lower fixed cost and less operational overhead. The AWS Terraform remains as a reference architecture for future government/compliance deployment work. Details: `DEPLOYMENT_DECISION.md`.

## Public Render Deployment Evidence

The public submission deployment is live at `https://ship-wf2i.onrender.com`. The Render Blueprint created the `ship` web service, `ship-db` PostgreSQL database, and `ship-security-probe` cron job. The web service serves the React build and Express API from one origin so session cookies, `/api`, `/events`, and `/collaboration/*` WebSockets share the same public host.

On 2026-05-23, the `ship-security-probe` Render cron job was triggered from the deployed admin Operations dashboard and printed its markdown report in the Render job logs. The final authenticated run completed with these public-surface results:

- Dependency audit parsed successfully with `critical: 0` and `high: 0`.
- CORS did not allow the untrusted credentialed origin `https://ship-security-probe.invalid`.
- API and web responses included Content Security Policy headers.
- Common accidental exposure paths did not reveal secret-like values.
- Manual rate-limit review confirmed global API, login, WebSocket connection, and WebSocket message limiters.
- Malformed JSON returned `{"error":{"code":"REQUEST_ERROR","message":"Invalid JSON body"}}` without stack traces, SQL, internal paths, or secret names.
- Unauthenticated `/events` and `/collaboration/*` WebSocket upgrades were rejected with `401`.
- Authenticated `/events` opened, responded to ping with pong, and handled malformed JSON safely.
- Authenticated `/collaboration/*` opened, handled unexpected/malformed binary messages safely, rejected a `10,485,761` byte oversized payload with close code `1009`, and left `/health` returning `200`.

Manual browser verification on 2026-05-23 confirmed the deployed app uses secure WebSocket transport:

- Chrome DevTools Network `ws` filter showed `/collaboration/wiki:<document-id>` connections to `ship-wf2i.onrender.com` with status `101` and the browser lock indicator.
- Chrome DevTools Network `ws` filter showed `/events` connections to `ship-wf2i.onrender.com` with status `101` and the browser lock indicator.

This Render run also satisfies the manual review requirements for CORS/CSP configuration, environment/secret exposure, rate limiting, and error verbosity. The report ends in the Render logs with `--- End Ship Security Probe Markdown Report ---`.

## Phase 19 Ask Ship Assistant MVP

Ship now includes an in-app Ask Ship assistant in the left icon rail below Teams. The MVP adds authenticated assistant status and chat endpoints, a server-side OpenAI provider path, visibility-aware retrieval over Ship documents/projects/issues/weeks/timelines, grounded citations, assistant-specific rate limiting, and an upload-to-current-document path for indexed `.txt`, `.md`, `.csv`, `.pdf`, and `.docx` documentation.

Render configuration now declares non-secret assistant defaults and expects `OPENAI_API_KEY` on the `ship` web service. Setup and demo steps are documented in `docs/assistant.md`.

## Files To Read

- `AUDIT.md` - full audit narrative with baseline, severity, and after status.
- `SUBMISSION_RUBRIC.md` - final rubric pass matrix and external deliverable callouts.
- `ORIENTATION.md` - codebase orientation and architecture synthesis.
- `DISCOVERY.md` - standalone discovery write-up with three lessons pulled from orientation findings.
- `AI_COST_ANALYSIS.md` - AI spend template and reflection on AI effectiveness for codebase comprehension.
- `DEPLOYMENT_DECISION.md` - AWS cost finding and rationale for choosing Render as the submission deployment target.
- `DEPLOYMENT.md` - Render deployment, security probe trigger, and public verification evidence.
- `DEPLOYMENT_CHECKLIST.md` - Render submission checklist with captured public security-probe evidence.
- `docs/assistant.md` - Ask Ship assistant setup, supported upload formats, storage notes, and demo flow.
- `demo-script-final.md` - 5-minute demo script with step-by-step show-and-tell guidance.
- `THREAT_MODEL.md` - dependency security status, Phase 06 remediation, and residual risk.
- `eval/results/phase2-implementation-notes.md` - concise implementation and measurement log.
- `docs/brainstorms/2026-05-20-phase-04-ms-project-inspired-improvements.md` - Phase 04 implementation evidence for Microsoft Project-inspired timeline/dependency improvements.
- `docs/brainstorms/2026-05-20-phase-05-eslint-quality-gate.md` - Phase 05 lint gate scope and baseline evidence.
- `docs/brainstorms/2026-05-20-phase-06-critical-cve-remediation.md` - Phase 06 critical CVE remediation evidence.
- `docs/brainstorms/2026-05-20-phase-07-documents-pagination-contract.md` - Phase 07 documents pagination contract and compatibility decision.
- `docs/brainstorms/2026-05-20-phase-08-dependency-audit-zero.md` - Phase 08 dependency remediation evidence.
- `docs/brainstorms/2026-05-20-phase-09-dependency-audit-gate.md` - Phase 09 CI audit gate evidence.
- `docs/brainstorms/2026-05-20-phase-10-windows-e2e-build-unblock.md` - Phase 10 Windows E2E build unblock evidence.
- `docs/brainstorms/2026-05-20-phase-11-cross-platform-dev-wrapper.md` - Phase 11 cross-platform `pnpm dev` evidence.
- `docs/brainstorms/2026-05-20-phase-12-setup-docs-hardening.md` - Phase 12 setup documentation hardening evidence.
- `docs/brainstorms/2026-05-20-phase-13-websocket-reconnect-ui.md` - Phase 13 collaboration reconnect UI evidence.
- `docs/brainstorms/2026-05-20-phase-14-compact-e2e-runner.md` - Phase 14 compact E2E runner evidence.
- `docs/brainstorms/2026-05-20-phase-15-windows-e2e-runner-hardening.md` - Phase 15 Windows E2E runner hardening evidence.
- `docs/brainstorms/2026-05-21-phase-16-category-8-security-audit.md` - Category 8 security audit requirements and acceptance examples.
- `eval/results/documents-pagination-contract.md` - concise API contract evidence for page-style `/api/documents` pagination.
- `eval/results/e2e-windows-build-unblock.md` - verification note for the cross-platform API build.
- `eval/results/cross-platform-dev-wrapper.md` - verification note for the Node dev wrapper.
- `eval/results/setup-docs-hardening.md` - verification note for README/orientation setup doc alignment.
- `eval/results/websocket-reconnect-ui.md` - verification note for collaboration reconnect UI.
- `eval/results/compact-e2e-runner.md` - verification note for compact E2E runner wiring.
- `eval/results/e2e-windows-runner-hardening.md` - verification note for focused isolated E2E execution on Windows.
- `eval/results/full-e2e-gate.md` - final full Playwright release-gate result.
- `eval/results/security-audit-baseline.md` - Category 8 baseline with exact audit deliverable matrix.
- `eval/results/security-audit-after.md` - Category 8 after-remediation report with zero verified findings.
- `eval/results/security-audit-fixes.md` - Category 8 two-fix before/after proof.

## Verification Commands

These were the core checks used during the final Phase 2 pass:

```powershell
pnpm type-check
pnpm --filter @ship/api test
git diff --check
```

Local PostgreSQL must be running for API tests and migrations. Docker was not available in this Windows environment, so the project used the user's local PostgreSQL installation.

These were the core checks used during the Phase 04 completion pass:

```powershell
pnpm type-check
pnpm --filter @ship/api test -- src/routes/timeline.test.ts src/routes/dependencies.test.ts
pnpm --filter @ship/web test -- src/lib/document-tabs.test.ts
pnpm build:web
pnpm --filter @ship/api test
git diff --check
```

These were the core checks used during the Category 8 security audit pass:

```powershell
pnpm type-check
pnpm --filter @ship/api test:security-probe
pnpm build:api
pnpm security:audit -- --mode local --non-interactive --report-name security-audit-after
```

This was the final full E2E release gate:

```powershell
pnpm test:e2e -- --workers=2
```

Result: 869 passed, 0 failed, 0 skipped, 0 pending.

## Known Follow-Ups

- Dependency override maintenance is nearly eliminated: the 2026-05-22 passes retired 25 overrides, kept the carried-forward `uuid` and `ws` pins because trial removal reintroduced stale resolver paths, and added a narrow `qs@6.15.2` pin for the same-day Express transitive advisory. Evidence: `eval/results/dependency-override-retirement.md`.
