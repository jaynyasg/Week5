# FleetGraph Validation Plan

Last updated: 2026-05-26

Generated via `$gsd-docs-update` from the PRD, `FLEETGRAPH.md`, and Ship test patterns.

## Purpose

This plan defines how FleetGraph will prove it satisfies the PRD using real Ship data, tests, timed runs, and LangSmith traces.

## Required PRD Evidence

From `planning/prd-extract.md`, final evidence must show:

- At least one proactive detection wired end to end.
- LangSmith tracing enabled with at least two shared trace links.
- Different trace paths under different conditions.
- At least five use cases.
- At least one human-in-the-loop gate.
- Real Ship data, no mocked responses for final demo evidence.
- Agent chat and notifications accessible in the UI.
- Public deployment.
- Trigger model documented and defended.
- Detection latency under 5 minutes.
- Cost per run and estimated runs per day documented.

## Test Layers

### 1. Migration Tests

Purpose: catch schema drift before services depend on the new tables.

Cover:

- `fleetgraph_finding` enum value exists.
- Queue table has unique idempotency key.
- Runs table indexes workspace/time lookup.
- Deliveries enforce one delivery row per user/finding.
- Action proposals preserve decision metadata.

### 2. Service Unit Tests

Purpose: verify graph-adjacent business rules without the UI.

Cover:

- Queue enqueue idempotency.
- Queue drain lock behavior.
- Finding idempotency.
- Audience selection from ownership/accountability.
- Delivery state transitions.
- Action proposal creation.
- Unauthorized action proposal decision fails safely.
- Retryable graph failure stores safe error state.

### 3. Graph Tests

Purpose: prove FleetGraph is a graph, not a one-path pipeline.

Cover paths:

- No finding path.
- Finding-only path.
- Action proposal interrupt path.
- Approval resume path.
- Failure/degraded context path.

Required checks:

- Stable `thread_id` is used.
- Checkpointer persists state.
- Interrupt can resume.
- Run metadata links back to FleetGraph run row.

### 4. API Tests

Purpose: prove routes follow Ship auth and OpenAPI patterns.

Cover:

- `GET /api/fleetgraph/status`
- `POST /api/fleetgraph/chat`
- `GET /api/fleetgraph/findings`
- `GET /api/fleetgraph/findings/:id`
- `PATCH /api/fleetgraph/deliveries/:id`
- `GET /api/fleetgraph/runs/:id`
- `POST /api/fleetgraph/actions/:id/decision`

Assertions:

- unauthenticated requests fail
- CSRF applies to state-changing session requests
- API token behavior is intentional and tested if supported
- user cannot access another user's delivery state
- workspace admin behavior is explicit
- OpenAPI JSON includes FleetGraph paths

### 5. UI Tests

Purpose: protect the high-risk design decisions.

Cover:

- FleetGraph tab appears in assistant drawer.
- Empty findings inbox.
- Loading/error findings inbox.
- Deep link from notification to finding detail.
- Approval block states.
- Unauthorized read-only proposal.
- Snooze and dismiss controls.
- Mobile drawer behavior.
- Keyboard path through tabs, rows, buttons, composer.

### 6. E2E Tests

Purpose: show real user workflows.

Scenarios:

- Proactive detection creates a finding and notification.
- User opens FleetGraph from a current project/week context and asks an on-demand question.
- User approves or rejects a proposed action.
- Timed event-to-finding run stays under 5 minutes.

Use `pnpm test:e2e`, not raw Playwright, unless debugging raw output.

## Timed Detection Run

Procedure:

1. Start with a known project/week/issue state.
2. Record start timestamp.
3. Introduce the event in Ship.
4. Wait for FleetGraph queue/worker.
5. Confirm finding document exists.
6. Confirm delivery row exists.
7. Confirm UI notification or badge appears.
8. Record end timestamp.
9. Store result in `FLEETGRAPH.md`.

Pass:

- finding visible in UI in less than 5 minutes
- no duplicate finding for same state window
- LangSmith trace URL captured

## Trace Validation

At least two shared LangSmith links are required.

Trace 1:

- Proactive finding-only path.
- Expected branch: trigger -> fetch -> detect -> persist finding -> deliver -> notify.

Trace 2:

- HITL action proposal path.
- Expected branch: trigger/chat -> fetch -> detect -> propose action -> interrupt -> human decision -> resume.

Optional Trace 3:

- No finding path.
- Expected branch: trigger -> fetch -> detect -> no finding -> run recorded.

Trace review before submission:

- No bearer tokens.
- No session cookies.
- No secrets.
- No irrelevant personal data.
- No full private document dumps beyond what is necessary to demonstrate the graph.

## Commands

Verified in Ship `package.json`:

- `pnpm type-check`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm assistant:eval`

Suggested final sequence:

```bash
pnpm type-check
pnpm test
pnpm test:e2e
pnpm build
```

## Evidence Table

| Evidence | Source | Status |
|---|---|---|
| Proactive detection | E2E/timed run | Timed local E2E event-to-finding passed on 2026-05-26; deployed/model-backed run pending |
| On-demand chat | UI/E2E run | Deterministic E2E passed |
| HITL gate | API + UI test | Deterministic E2E reject flow passed; DB-backed API authorization and audit tests passed on 2026-05-26 |
| Trace link 1 | LangSmith | Blocked locally: no `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, or `LANGSMITH_PROJECT` |
| Trace link 2 | LangSmith | Blocked locally: no `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, or `LANGSMITH_PROJECT` |
| Cost per run | `fleetgraph_runs` + provider metadata | Mock-provider run rows captured and priced with current `gpt-4o-mini`; billable model-backed rows pending |
| Public deployment | Render URL | Blocked locally: no `RENDER_API_KEY` or known FleetGraph deployment URL |

## Implementation Validation Snapshot

Last implementation pass: 2026-05-26.

Completed locally:

- `pnpm type-check`
- `pnpm build:api`
- `pnpm build:web`
- `pnpm --filter @ship/web exec vitest run src/hooks/useFleetGraph.test.tsx src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx`
- `pnpm --filter @ship/web exec vitest run src/components/assistant/AskShipPanel.test.tsx src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx src/components/ui/Toast.test.tsx`
- `pnpm --filter @ship/api test:fleetgraph-eval`
- `pnpm --filter @ship/api test:fleetgraph-api`
- `pnpm --filter @ship/api exec vitest run src/openapi/fleetgraph.test.ts src/routes/fleetgraph.test.ts`
- `pnpm test:e2e -- e2e/fleetgraph.spec.ts --workers=1`
- `git diff --check`
- pre-commit empty-test check

New deterministic coverage:

- `e2e/fixtures/isolated-env.ts` owns FleetGraph setup data for a completed proactive run, delivered finding, unread delivery, and pending action proposal.
- `e2e/fleetgraph.spec.ts` now exercises the FleetGraph drawer, delivered finding detail, delivery read-state transition, action proposal rejection, and context-aware chat response.
- `e2e/fleetgraph.spec.ts` creates a real sprint document event, drains FleetGraph against the isolated test database, and asserts delivery, drawer visibility, and nonzero run token metadata under the 5 minute latency target.
- `api/src/routes/fleetgraph.test.ts` now covers FleetGraph auth, CSRF, per-user delivery visibility, document/project route-context finding filters, invalid filter rejection, admin access, action-decision authorization, and action-decision audit logging with run/trace metadata.
- `web/src/hooks/useFleetGraph.test.tsx` now verifies current route context is passed into FleetGraph findings fetches as well as chat requests.
- `api/src/services/fleetgraph/graph.test.ts` is included in the no-database FleetGraph eval config and verifies a compiled LangGraph workflow can checkpoint an approval interrupt with `MemorySaver` and resume with a human decision.
- `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx` covers FleetGraph drawer loading, empty, error, unavailable, missing evidence, snooze/dismiss, rejected decision, action-error, and trace-present/missing states.
- `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx` also covers component-level accessibility semantics for status regions, alert regions, and finding row accessible labels.
- `web/src/components/assistant/AskShipPanel.test.tsx`, `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx`, and `web/src/components/ui/Toast.test.tsx` cover the mobile drawer width contract, 44px FleetGraph mobile action targets, and mobile toast offset above the pinned composer.
- `api/src/scripts/fleetgraph-drain.test.ts` covers the scheduled drain command defaults and Render sweep env parsing for missed/stale proactive coverage.
- `pnpm --filter @ship/api test:fleetgraph-eval` now runs the focused no-database FleetGraph suite for costs, deterministic eval paths, LangGraph MemorySaver interrupt/resume coverage, and run usage estimation.
- `pnpm --filter @ship/api test:fleetgraph-api` passed 22 DB-backed tests against isolated Docker Postgres on 2026-05-26.
- `pnpm --filter @ship/api exec vitest run src/openapi/fleetgraph.test.ts src/routes/fleetgraph.test.ts` passed 17 focused OpenAPI/route tests against isolated Docker Postgres on 2026-05-26.
- `pnpm test:e2e -- e2e/fleetgraph.spec.ts --workers=1` passed 2/2 on 2026-05-26, including the timed event-to-finding flow.

External blockers:

- Model-backed LangSmith traces cannot be generated in this environment until `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT` are provided.
- Public Render verification cannot be completed in this environment until `RENDER_API_KEY` or a known deployed FleetGraph URL is provided.
- Billable cost rows should be regenerated from deployed or locally configured model-backed `fleetgraph_runs` rows after provider credentials are present.
