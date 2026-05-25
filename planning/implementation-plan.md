# FleetGraph Implementation Plan

Last updated: 2026-05-25

Generated via `$gsd-docs-update` from the existing Week5 docs and the Ship reference repo.

## Purpose

This is the build-order plan for FleetGraph. It breaks the already accepted architecture into implementation phases that can be picked up one at a time without rereading the entire PRD.

Source docs:

- `../FLEETGRAPH.md`
- `../PRESEARCH.md`
- `planning/eng-review.md`
- `planning/prd-extract.md`
- `planning/ship-reference.md`

Ship reference:

- Repo: `C:\Users\jaynyasg\OneDrive\Documents\GitLab\ship`
- Commit: `0a1837f7a16cf14bcbb54164f549a4b8b219e676`

## Non-Negotiables

- FleetGraph findings are Ship documents with `document_type = 'fleetgraph_finding'`.
- Proactive execution uses a durable event queue plus a scheduled sweep.
- Graph state uses LangGraph Postgres checkpoints.
- FleetGraph run metadata, cost, trace URLs, deliveries, and action proposals live in Ship-owned tables.
- FleetGraph UI extends the existing Ask Ship drawer, not a standalone page.
- Autonomous work is limited to read, detect, persist findings, and notify.
- Project, issue, week, approval, and RACI mutations require human approval.
- LangSmith tracing is required from day one.

## Phase 0: Build Baseline

Goal: make the Week5 working branch ready to implement safely.

Tasks:

- Confirm the active implementation branch in the Ship code repo.
- Keep `Week5` docs as planning/reference unless code is intentionally moved here.
- Verify local PostgreSQL is running before backend tests.
- Run `pnpm install` in Ship only if dependencies are missing.
- Run a baseline `pnpm type-check` before FleetGraph changes.

Verified Ship commands:

- `pnpm dev`
- `pnpm build`
- `pnpm build:shared`
- `pnpm type-check`
- `pnpm test`
- `pnpm test:e2e`

Reference files:

- `package.json`
- `api/package.json`
- `web/package.json`
- `shared/package.json`

## Phase 1: Schema and Shared Types

Goal: establish durable FleetGraph data surfaces before graph/UI code depends on them.

Tasks:

- Add a numbered migration for `fleetgraph_finding` document type.
- Add numbered migrations for:
  - `fleetgraph_event_queue`
  - `fleetgraph_runs`
  - `fleetgraph_deliveries`
  - `fleetgraph_action_proposals`
- Add TypeScript types in `shared/src`.
- Add API response/request types for FleetGraph status, chat, findings, deliveries, runs, and action proposals.
- Add unit tests that verify migration-created columns and critical indexes.

Reference files:

- `api/src/db/schema.sql`
- `api/src/db/migrations/046_assistant_hybrid_rag_traces.sql`
- `api/src/db/migrations/014_api_tokens.sql`
- `shared/src/types/assistant.ts`

Exit criteria:

- Migrations run locally.
- `pnpm type-check` passes after shared type additions.
- Tests prove the core tables support idempotency, delivery lookup, run lookup, and action proposal lookup.

## Phase 2: FleetGraph Service Core

Goal: create the backend service layer without UI.

Tasks:

- Add `api/src/services/fleetgraph/` modules for:
  - config/status
  - queue enqueue/drain
  - graph runner
  - finding persistence
  - delivery state
  - action proposals
  - cost/trace metadata
- Add graph state schema and node modules.
- Wire LangGraph Postgres checkpointer with stable `thread_id` values.
- Add idempotency keys for finding creation.
- Add DB locks or `FOR UPDATE SKIP LOCKED` queue semantics.
- Add safe audit logging for FleetGraph autonomous events.

Reference files:

- `api/src/services/assistant/chat.ts`
- `api/src/services/assistant/tracing.ts`
- `api/src/services/accountability.ts`
- `api/src/services/audit.ts`

Exit criteria:

- One proactive graph run can create a finding document against real Ship data.
- One on-demand graph run can answer using route context.
- One graph interrupt can pause for human approval and resume.

## Phase 3: API and OpenAPI

Goal: expose FleetGraph through authenticated Ship API routes.

Tasks:

- Add `api/src/routes/fleetgraph.ts`.
- Mount it in `api/src/app.ts` with rate limiting and `conditionalCsrf`.
- Add OpenAPI schemas in `api/src/openapi/schemas/fleetgraph.ts`.
- Export the schema module from `api/src/openapi/schemas/index.ts`.
- Add route tests for auth, CSRF, authorization, missing records, and happy paths.

Reference files:

- `api/src/routes/assistant.ts`
- `api/src/openapi/schemas/assistant.ts`
- `api/src/openapi/registry.ts`
- `api/src/app.ts`

Exit criteria:

- OpenAPI JSON includes all `/fleetgraph/*` paths.
- Route tests prove members cannot inspect another user's delivery state unless admin rules allow it.
- Action approval routes enforce the same rules as the underlying Ship mutation.

## Phase 4: Proactive Triggering

Goal: satisfy the PRD's `<5 minutes` detection latency target.

Tasks:

- Enqueue FleetGraph jobs from selected Ship mutation paths.
- Add a queue drain command suitable for Render cron or web-service internal scheduling.
- Add a scheduled sweep for missed/stale state.
- Broadcast realtime notifications only after durable finding and delivery rows exist.
- Add timed test harness for event-to-finding latency.

Reference files:

- `api/src/collaboration/index.ts`
- `api/src/routes/documents.ts`
- `api/src/routes/issues.ts`
- `api/src/routes/projects.ts`
- `api/src/routes/weeks.ts`
- `render.yaml`

Exit criteria:

- A Ship event can be introduced and surfaced as a finding within 5 minutes.
- Duplicate queue entries do not create duplicate findings.
- Overlapping worker runs do not process the same queued job twice.

## Phase 5: Embedded UI

Goal: make FleetGraph available inside the existing Ship app experience.

Tasks:

- Extend the Ask Ship drawer to support Ask Ship and FleetGraph modes.
- Add FleetGraph status loading/unavailable states.
- Add findings inbox and finding detail components.
- Add action proposal approval block.
- Add unread badge and severity-limited toast behavior.
- Add route-context filtering from the current project/week/issue/program.
- Add mobile full-screen drawer behavior.

Reference files:

- `web/src/components/assistant/AskShipPanel.tsx`
- `web/src/components/assistant/AssistantMessages.tsx`
- `web/src/components/ui/TabBar.tsx`
- `web/src/components/ui/Toast.tsx`
- `web/src/hooks/useAssistant.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`
- `shared/src/types/assistant.ts`

Exit criteria:

- FleetGraph opens from the existing assistant rail surface.
- A delivered finding opens directly in the drawer.
- A user can approve/reject/snooze/dismiss from the finding detail.
- Keyboard-only navigation works through tabs, rows, actions, and composer.

## Phase 6: Validation and Submission

Goal: produce PRD-ready evidence.

Tasks:

- Run type checking and focused tests.
- Run focused E2E for proactive notification and on-demand chat.
- Run timed latency test.
- Produce at least two LangSmith shared trace links showing different graph paths.
- Fill final cost fields in `FLEETGRAPH.md`.
- Update deployment docs and environment variable notes.

Reference docs:

- `planning/validation-plan.md`
- `planning/cost-tracing-plan.md`
- `planning/deployment-ops-plan.md`

Exit criteria:

- `FLEETGRAPH.md` has trace links, cost analysis, test cases, trigger model, graph map, and UI evidence.
- Public deployment is accessible.
- Grader can reproduce at least one proactive detection against real Ship data.

