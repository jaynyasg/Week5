# Week 5 FleetGraph Engineering Review

Last reviewed: 2026-05-25

Reviewer mode: `plan-eng-review`

Active build repo:

`C:\Users\jaynyasg\OneDrive\Documents\GitLab\Week5`

Reference repo:

`C:\Users\jaynyasg\OneDrive\Documents\GitLab\ship`

Reference commit:

`0a1837f7a16cf14bcbb54164f549a4b8b219e676`

## Scope Challenge

FleetGraph touches more than eight files and more than two services:

- Backend graph runtime and queue worker.
- Database migrations.
- API routes and OpenAPI schemas.
- Existing assistant UI.
- Realtime notification channel.
- LangGraph checkpoint storage.
- LangSmith tracing.
- Deployment configuration.
- Tests and evaluation docs.

Decision: proceed with full Ship-native integration, not a reduced standalone MVP.

## Accepted Decisions

### 1. Durable Findings

Decision: FleetGraph findings are durable Ship documents plus separate delivery/read-state rows.

Rationale:

- The PRD requires proactive findings that can be surfaced without being asked.
- Existing WebSocket events are connection-bound and not durable.
- Existing accountability action items are inferred from current state, not durable finding history.

Implementation direction:

- Add `fleetgraph_finding` to `document_type`.
- Store finding body in TipTap JSON like every other document.
- Store severity, detection type, target, trace URL, run ID, and status in properties.
- Store per-user delivery/read/dismiss/snooze state in a separate table.

### 2. Proactive Trigger Model

Decision: use a hybrid event queue plus scheduled sweep.

Rationale:

- Poll-only is simple but expensive and less immediate.
- Event-only is fast but fragile across restarts, imports, missed hooks, and historical backlog.
- Hybrid supports the PRD latency target while remaining deployable on Ship's current Render model.

Implementation direction:

- Enqueue evaluation jobs from Ship mutation paths.
- Drain queue every 1-2 minutes.
- Run a sweep as a backstop.
- Use DB locks and idempotency keys.
- Notify only after finding and delivery rows exist.

### 3. Graph Persistence and HITL

Decision: use LangGraph Postgres checkpoints plus Ship-owned run metadata.

Rationale:

- HITL requires pause/resume semantics.
- LangGraph's checkpointer already supports durable state, interrupts, and fault recovery.
- Ship still needs its own run, cost, trace URL, and action proposal metadata.

Implementation direction:

- Install and configure the LangGraph Postgres checkpointer.
- Use durable `thread_id` values tied to FleetGraph runs.
- Store run summaries in `fleetgraph_runs`.
- Store action proposals separately from raw graph checkpoint state.

### 4. Embedded UI

Decision: reuse the Ask Ship drawer shell and add FleetGraph mode plus notifications.

Rationale:

- The PRD explicitly disallows standalone chatbot pages.
- Ship already passes route context into the assistant drawer.
- Reusing the assistant shell avoids a second assistant surface.

Implementation direction:

- Extend the right-side assistant drawer with FleetGraph mode.
- Add FleetGraph notification badge/read state.
- Keep backend endpoints separate under `/api/fleetgraph/*`.
- Register all routes with OpenAPI.

### 5. Actor and Approval Boundaries

Decision: use a system actor for detection and require human approval for writes.

Rationale:

- Ship's accountability model relies on human approvers.
- Delegated API tokens blur who acted.
- Read/detect/notify can be autonomous without compromising accountability.

Implementation direction:

- FleetGraph system actor can create findings and delivery rows.
- Any project/week/issue/RACI/approval mutation becomes an action proposal.
- Authenticated users approve or reject proposals through normal authorization checks.
- Audit logs include actor type, run ID, trace URL, and approving user.

### 6. Finding Relationships

Decision: use `fleetgraph_finding` document type, target metadata in properties, and existing org associations for grouping.

Rationale:

- Adding another relationship enum is extra schema and query surface.
- Properties are sufficient for the focal target.
- Existing `program`, `project`, and `sprint` associations are enough for grouping.

Implementation direction:

- `properties.target_document_id`
- `properties.target_document_type`
- `properties.detection_type`
- `properties.severity`
- `properties.run_id`
- `properties.langsmith_trace_url`
- `document_associations` for program/project/sprint context only.

## Recommended Implementation Phases

### Phase 0: Repo and Baseline

- Confirm Week5 repo remotes and branch.
- Keep Ship reference path and commit in planning docs.
- Install dependencies only after checking current package manager and workspace shape.

### Phase 1: Schema and Types

- Add FleetGraph migrations.
- Add shared FleetGraph types.
- Add OpenAPI schemas.
- Add tests for migration shape and route registration.

### Phase 2: Graph Core

- Add graph state schema, nodes, and conditional edges.
- Add Postgres checkpointer wiring.
- Add run metadata and trace URL capture.
- Add deterministic graph tests with Ship-shaped fixtures.

### Phase 3: Proactive Execution

- Add queue enqueue helpers at selected Ship mutation points.
- Add queue drain worker.
- Add scheduled sweep.
- Add idempotency and lock tests.
- Add timed latency test.

### Phase 4: UI Integration

- Add FleetGraph mode to the existing assistant drawer.
- Add findings list/detail UI.
- Add notification badge and realtime subscription.
- Add approve/reject/snooze/dismiss interactions.

### Phase 5: Validation and Submission Docs

- Run type-check, backend tests, focused E2E tests, and build.
- Produce at least two shared LangSmith trace links.
- Fill final cost projections in `FLEETGRAPH.md`.
- Update deployment docs and environment variable list.

## High-Risk Areas

- Postgres enum migrations: keep migrations ordered and avoid direct schema-only edits.
- Checkpointer setup: verify package tables and migration/bootstrap behavior before deploying.
- Duplicate findings: idempotency keys must include workspace, target, detection type, and state window.
- Authorization: approving an action proposal must not bypass Ship's existing route rules.
- Trace privacy: public LangSmith links must be checked before submission.
- UI scope creep: keep FleetGraph inside the existing assistant surface.

## Test Gates

- `pnpm type-check`
- `pnpm test`
- Focused route/service unit tests for FleetGraph.
- Focused E2E for proactive finding notification.
- Focused E2E for on-demand context-aware chat.
- Timed detection-latency run.
- Manual validation of LangSmith shared trace links.

## Reference Links

- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangSmith trace sharing: https://docs.langchain.com/langsmith/manage-trace

