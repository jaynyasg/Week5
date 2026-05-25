# Final Demo Script

Purpose: 3-5 minute reviewer demo for the ShipShape final submission. Target 4:45. Do not run long live jobs during the recording unless they are already queued and fast; show completed evidence when possible.

This script explicitly covers the video rubric:

- Walk through audit findings and improvements.
- Show before/after measurements on screen.
- Explain why the fixes were chosen.
- Demonstrate the deployed app, security probe, and Ask Ship.
- Stay within 3-5 minutes.

## Before Recording

Open these tabs before starting:

1. Deployed app: `https://ship-wf2i.onrender.com`
2. Ship admin page: `https://ship-wf2i.onrender.com/admin?tab=operations`
3. Render `ship-security-probe` cron job logs with the completed markdown report visible
4. `SUBMISSION.md`
5. `AUDIT.md`
6. `eval/results/security-audit-fixes.md`
7. A seeded project or document with the Timeline tab visible
8. A Docs page containing `Shipshape - Security Audit.pdf`, with Ask Ship ready to open

Do not trigger a fresh security probe during the recording unless the cron service is idle. If a completed Render log is already available, show the completed log instead of waiting live.

## 0:00-0:25 - Opening

Show `SUBMISSION.md`.

Say:

> This is my ShipShape final submission. I audited a production TypeScript monorepo across the original seven quality categories, added the required Category 8 security audit, deployed the improved fork publicly to Render, and preserved before/after evidence in `eval/results`.

Point at:

- `https://ship-wf2i.onrender.com`
- The `What Changed` table in `SUBMISSION.md`
- The `Public Render Deployment Evidence` section

## 0:25-1:20 - Security Probe Tool

Show the deployed Admin Dashboard Operations tab.

Say:

> The biggest hard-gate deliverable is Category 8: a runnable security probe. It can run locally with one command, and it can also be triggered from the deployed app by a super-admin. The browser button calls Ship's backend, and the backend calls Render's cron-run API, so the Render API key never reaches the client bundle.

Show:

- **Admin Dashboard -> Operations -> Security Probe**
- `Configured` status
- **Trigger Run** button
- Render cron log with `--- End Ship Security Probe Markdown Report ---`

Say:

> The probe covers the required matrix: auth/session behavior, WebSocket validation, input sanitization, high and critical dependency CVEs, CORS and CSP, secret exposure risk, rate limiting, and verbose error leakage.

Show the completed report and call out:

- Dependency audit: `0` high and `0` critical CVEs
- CORS: untrusted credentialed origin rejected
- CSP: API and web CSP headers present
- Secrets: common accidental exposure paths did not reveal secret-like values
- Rate limiting: API, login, WebSocket connection, and message limiters confirmed
- Verbose errors: malformed JSON returns `Invalid JSON body` without parser internals
- WebSockets: unauthenticated upgrades rejected; authenticated sockets pass malformed and oversized payload checks

Show `eval/results/security-audit-fixes.md`.

Say:

> The two verified security fixes were malformed collaboration WebSocket handling and verbose JSON parser error leakage. I chose these because the probe could reproduce them, the fixes were narrow, and the same probe could prove the after state.

## 1:20-2:15 - Audit Findings And Before/After Measurements

Show the `What Changed` table in `SUBMISSION.md` or the final summary table in `AUDIT.md`.

Say:

> The audit findings drove the implementation choices. I did not start with cosmetic cleanup; each change maps to a measured weakness and an after artifact.

Call out the numbers on screen:

- Type safety: conservative violation count reduced from `399` to `294`
- Bundle size: entry JavaScript reduced from `2,073.70 KB` to `287.36 KB`
- API response time: paginated documents P97.5 improved from `283 ms` to `82 ms`
- Query efficiency: `GET /api/weeks` dropped from `5 -> 3` statements for seeded super-admin flow and `6 -> 4` for normal member flow
- Tests: `455/455` API tests passed, empty Playwright tests reduced to `0`
- Runtime errors: top-level React error boundary, client listeners, Express error middleware, and unhandled rejection capture
- Accessibility: `0` axe violations across login, docs, projects, and team pages

Say:

> The reasoning was to fix bottlenecks at their cause: lazy-load the heavy editor for bundle size, remove oversized list payloads for API response time, rewrite the weeks aggregation for query count, convert empty tests into real evidence, and fix contrast issues detected by axe.

Mention:

> The final recorded full E2E gate passed through the compact runner: `869 passed, 0 failed, 0 skipped, 0 pending`.

## 2:15-2:55 - Microsoft Project-Inspired Timeline

Show the deployed app and open a project Timeline tab.

Say:

> I added a Microsoft Project-inspired planning surface without breaking Ship's core architecture. Everything remains a document. The timeline is a read model over projects, programs, weeks, issues, dependencies, baseline snapshots, and critical-path data.

Show:

- Timeline tab
- Week/date scale
- Rows and health badges
- Dependency count or dependency edges
- Baseline button or baseline status
- Any blocked, overdue, at-risk, or critical-path indicators if present

Say:

> I chose this approach because it gives reviewers a real planning workflow while reusing document associations instead of inventing a separate project-management schema.

If the timeline is sparse, click **Admin Dashboard -> Operations -> Timeline Demo -> Seed Timeline Demo**, then return to the current workspace and refresh the Timeline tab.

## 2:55-3:40 - Ask Ship Assistant

Show the deployed app, open Docs, and open `Shipshape - Security Audit.pdf` or the uploaded security-audit document. Click the Ask Ship rail button below Teams.

Ask:

```text
According to Shipshape - Security Audit.pdf, what four attack surfaces must the security probe actively test?
```

Show:

- The assistant answer
- The citation pointing back to `Shipshape - Security Audit.pdf`
- The answer terms: authentication/session, WebSocket validation, input sanitization, dependency vulnerabilities
- If visible or available from DevTools, the returned `traceId`

Say:

> Ask Ship demonstrates the Week2 parity work: uploaded PDF extraction, hybrid retrieval, reranking, citations, and traceable runs. The important product behavior is not just that the model answers; it answers from workspace evidence and cites the source.

If the answer is slow, show `docs/assistant.md` and `SUBMISSION.md` Phase 19 instead, then mention that the same question is covered by the deterministic `pnpm assistant:eval` fixture.

## 3:40-4:25 - Deployment And Architecture Decisions

Show `DEPLOYMENT_DECISION.md` or the deployment section of `SUBMISSION.md`.

Say:

> A major decision was not to deploy the full AWS Terraform stack for the public submission. The corrected AWS estimate was roughly `$220-$300/month`, mainly because of Kinesis real-time CloudFront logs, WAF Bot Control, NAT Gateway, ALB, Aurora Serverless v2, public IPv4, and CloudWatch or VPC flow logs.

Show:

- Render URL: `https://ship-wf2i.onrender.com`
- Render evidence in `SUBMISSION.md`
- Browser DevTools `ws` evidence if already open

Say:

> Render was the better submission target because it supports the actual app shape: one long-running Express service, persistent WebSockets, static React assets served from the same origin, and managed PostgreSQL. Same-origin deployment keeps sessions, REST calls, `/events`, and `/collaboration/*` WebSockets together.

Mention:

- Browser Network `ws` filter confirmed `/events` with status `101`
- Browser Network `ws` filter confirmed `/collaboration/wiki:<document-id>` with status `101`
- Both were on `ship-wf2i.onrender.com` with the browser lock indicator, confirming secure `wss` transport

## 4:25-5:00 - Close

Show the Files To Read section in `SUBMISSION.md`.

Say:

> The final submission packet is organized around `SUBMISSION.md`. The audit narrative is in `AUDIT.md`, raw measurements are in `eval/results`, the three-discovery write-up is in `DISCOVERY.md`, deployment evidence is in `DEPLOYMENT.md`, the explicit rubric check is in `SUBMISSION_RUBRIC.md`, and AI cost reflection is in `AI_COST_ANALYSIS.md`.

End with:

> The main tradeoff throughout the project was to make targeted, measurable improvements without changing Ship's core philosophy. I kept the unified document model, used boring technology, proved each category with measurements, deployed the improved fork publicly, and added Ask Ship as a grounded assistant over the same workspace evidence.

## If Something Is Slow During The Demo

- If Render security probe is slow, show the completed cron log instead of rerunning it.
- If Timeline data is sparse, use **Admin Dashboard -> Operations -> Timeline Demo -> Seed Timeline Demo**.
- If Ask Ship is slow, show the completed answer or `pnpm assistant:eval` output.
- If DevTools does not show `/events` immediately, refresh after login with the Network `ws` filter open.
- If `/collaboration/*` does not show immediately, open a document editor.

## Deliverable Coverage

| Requirement | Where to show it |
|---|---|
| GitHub fork and setup guide | GitHub repo and `README.md` |
| Audit report | `AUDIT.md` |
| Raw before/after evidence | `eval/results/` |
| Improvement documentation | `SUBMISSION.md`, `AUDIT.md`, and per-result files in `eval/results/` |
| Category 8 security matrix | `eval/results/security-audit-baseline.md`, `eval/results/security-audit-after.md`, `AUDIT.md` |
| Two verified security fixes | `eval/results/security-audit-fixes.md` |
| Ask Ship assistant demo | Deployed app Ask Ship panel, `docs/assistant.md`, and `pnpm assistant:eval` evidence |
| Discovery write-up | `DISCOVERY.md` |
| Demo video guide | `demo-script-final.md` |
| AI cost analysis | `AI_COST_ANALYSIS.md` |

Before final submission, confirm the AI spend number in `AI_COST_ANALYSIS.md`. The rubric accepts rough breakdowns, so the current projected estimate is acceptable if exact billing data is unavailable.
