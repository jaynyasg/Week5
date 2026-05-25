# FleetGraph Validation Plan

Last updated: 2026-05-25

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
| Proactive detection | E2E/timed run | Planned |
| On-demand chat | UI/E2E run | Planned |
| HITL gate | API + UI test | Planned |
| Trace link 1 | LangSmith | TBD |
| Trace link 2 | LangSmith | TBD |
| Cost per run | `fleetgraph_runs` + provider metadata | Planned |
| Public deployment | Render URL | TBD |

## Implementation Validation Snapshot

Last implementation pass: 2026-05-25.

Completed locally:

- `pnpm type-check`
- `pnpm build:api`
- `pnpm build:web`
- `pnpm --filter @ship/web exec vitest run src/hooks/useFleetGraph.test.tsx src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx`
- `git diff --check`
- pre-commit empty-test check

Blocked locally:

- Focused API FleetGraph tests and DB-backed migration/service tests require local PostgreSQL. The last attempt failed during test setup with `ECONNREFUSED` on `localhost:5432`, before FleetGraph assertions ran.

Intentional placeholder:

- `e2e/fleetgraph.spec.ts` currently uses `test.fixme()` until deterministic FleetGraph seed data is added to `e2e/fixtures/isolated-env.ts`.
