# FleetGraph Data and API Plan

Last updated: 2026-05-25

Generated via `$gsd-docs-update` and verified against the Ship reference repo.

## Purpose

This plan defines the FleetGraph data model, API shape, queue behavior, and OpenAPI work. It should be used before touching migrations or route code.

## Existing Ship Patterns

Verified reference files:

- `api/src/db/schema.sql`
- `api/src/db/migrations/046_assistant_hybrid_rag_traces.sql`
- `api/src/routes/assistant.ts`
- `api/src/openapi/schemas/assistant.ts`
- `api/src/openapi/registry.ts`
- `api/src/app.ts`
- `api/src/collaboration/index.ts`
- `api/src/services/audit.ts`
- `shared/src/types/assistant.ts`

Existing facts:

- Ship stores user-facing content in the `documents` table.
- `document_type` is a Postgres enum.
- `document_associations` stores organization relationships like `program`, `project`, and `sprint`.
- Ask Ship routes are mounted at `/api/assistant` with `assistantLimiter` and `conditionalCsrf`.
- Ask Ship OpenAPI schemas are registered via `registry.registerPath`.
- Realtime events are broadcast with `broadcastToUser(userId, eventType, data)`.
- Current realtime frontend event types are `accountability:updated`, `connected`, and `pong`.

## Migration Plan

Add a new numbered migration in `api/src/db/migrations/`.

Required schema changes:

1. Add `fleetgraph_finding` to `document_type`.
2. Add `fleetgraph_event_queue`.
3. Add `fleetgraph_runs`.
4. Add `fleetgraph_deliveries`.
5. Add `fleetgraph_action_proposals`.

Do not edit existing table definitions in `schema.sql` as the source of truth for existing deployments. Add migrations first, then update `schema.sql` only if the repo convention requires schema snapshots to include the new final state.

## Finding Document Shape

FleetGraph findings are rows in `documents`:

- `document_type`: `fleetgraph_finding`
- `title`: short user-visible finding title
- `content`: TipTap JSON narrative and evidence summary
- `properties`: operational finding metadata
- `visibility`: `workspace` unless a stricter rule is intentionally added

Expected `properties` keys:

- `target_document_id`
- `target_document_type`
- `detection_type`
- `severity`
- `status`
- `run_id`
- `thread_id`
- `langsmith_trace_url`
- `idempotency_key`
- `created_by_actor`

Organization grouping:

- Use `document_associations.relationship_type = 'program'` for program grouping.
- Use `document_associations.relationship_type = 'project'` for project grouping.
- Use `document_associations.relationship_type = 'sprint'` for week grouping.
- Do not add a new `relationship_type` for the focal target in MVP.

## Queue Plan

`fleetgraph_event_queue` exists to make proactive detection durable.

Required behavior:

- Enqueue from selected Ship mutation paths.
- Use an idempotency key to prevent duplicate queued events.
- Drain jobs with row locks so overlapping workers do not duplicate work.
- Store attempt count, last error, lock owner, lock time, and availability time.
- Requeue retryable failures with backoff.
- Mark permanent failures without blocking later events.

Recommended idempotency key components:

```text
workspace_id + source_event_type + source_document_id + detection_window_or_revision
```

## Runs and Checkpoints

FleetGraph runs are app metadata. LangGraph checkpoints are execution state.

`fleetgraph_runs` stores:

- workspace
- optional invoking user
- proactive or chat mode
- trigger type and trigger ID
- LangGraph `thread_id`
- status
- LangSmith trace URL
- model
- token usage
- estimated cost
- safe error metadata

Do not store raw prompts, bearer tokens, session cookies, or full private document payloads in run metadata.

## Deliveries

`fleetgraph_deliveries` stores per-user state:

- delivered
- unread
- read
- dismissed
- snoozed

The same shared finding document can have different delivery states for different users. Snooze and dismiss update delivery rows, not the finding document.

## Action Proposals

`fleetgraph_action_proposals` stores human approval gates.

Required statuses:

- `pending`
- `approved`
- `rejected`
- `expired`
- `failed`

Approval routes must:

- Require authenticated user context.
- Re-check authorization against the underlying Ship action.
- Record `decided_by_user_id` and `decided_at`.
- Write audit events with FleetGraph run and trace metadata.
- Leave a failed proposal visible with a recoverable error state.

## API Plan

Add a route module:

- `api/src/routes/fleetgraph.ts`

Mount:

- `app.use('/api/fleetgraph', assistantLimiter or a FleetGraph-specific limiter, conditionalCsrf, fleetgraphRoutes)`

Initial endpoints:

- `GET /api/fleetgraph/status`
- `POST /api/fleetgraph/chat`
- `GET /api/fleetgraph/findings`
- `GET /api/fleetgraph/findings/:id`
- `POST /api/fleetgraph/findings/:id/read`
- `POST /api/fleetgraph/findings/:id/snooze`
- `POST /api/fleetgraph/findings/:id/dismiss`
- `GET /api/fleetgraph/runs/:id`
- `POST /api/fleetgraph/actions/:id/approve`
- `POST /api/fleetgraph/actions/:id/reject`

## Shared Types Plan

Add `shared/src/types/fleetgraph.ts` and export it from shared index files.

Type groups:

- FleetGraph status response
- FleetGraph route context extension
- FleetGraph finding summary
- FleetGraph finding detail
- FleetGraph delivery state
- FleetGraph action proposal
- FleetGraph chat request/response
- FleetGraph run summary
- FleetGraph error codes

Reuse `AssistantRouteContext` fields where possible:

- `path`
- `documentId`
- `documentType`
- `projectId`

Add only FleetGraph-specific context fields when the UI actually provides them.

## OpenAPI Plan

Add:

- `api/src/openapi/schemas/fleetgraph.ts`
- export from `api/src/openapi/schemas/index.ts`

Every FleetGraph route must have:

- request schema
- response schema
- error response schema
- auth expectations in description
- path registration via `registry.registerPath`

Verification:

- API test confirms OpenAPI JSON includes `/fleetgraph/status`, `/fleetgraph/chat`, `/fleetgraph/findings`, and action proposal paths.

## Realtime Plan

Backend:

- Add a FleetGraph event type such as `fleetgraph:finding-delivered`.
- Broadcast only after finding and delivery rows are committed.
- Payload should be small and non-sensitive.

Frontend:

- Extend `RealtimeEventType` in `web/src/hooks/useRealtimeEvents.tsx`.
- Subscribe from FleetGraph UI or app shell.
- Badge updates can happen from event payload, then reconcile on findings fetch.

Payload shape:

```json
{
  "findingId": "...",
  "deliveryId": "...",
  "severity": "high",
  "title": "Week plan changed after approval",
  "targetLabel": "Week 5 / FleetGraph",
  "actionRequired": true
}
```

## Verification Checklist

- Migrations run against local Postgres.
- `pnpm type-check` passes.
- FleetGraph OpenAPI paths are present.
- Queue idempotency is covered by tests.
- Delivery visibility is user-scoped.
- Action approval does not bypass existing Ship auth rules.
- Realtime event payloads do not include full finding body or trace internals.

