# FleetGraph Design

Last reviewed: 2026-05-26

FleetGraph is Ship's project intelligence agent. It reads real Ship project state, reasons over program, project, week, issue, and accountability signals, and surfaces timely findings inside the existing Ship experience.

This document is the working design contract for the Week 5 build. It is intentionally implementation-facing: if code behavior disagrees with this file, update the file or fix the code before submission.

## Agent Responsibility

### What FleetGraph Monitors Proactively

FleetGraph monitors:

- Week plans, weekly reviews, standups, and approval state.
- Project and program timelines from Ship's existing timeline services.
- Issue state, assignees, stalled work, late work, reopened work, and scope churn.
- RACI-style ownership and accountability fields on programs, projects, and weeks.
- Existing accountability gaps already computed by Ship, with FleetGraph adding durable analysis and notification.

FleetGraph does not replace Ship's accountability system. It turns important inferred conditions into durable findings, traceable recommendations, and human-approved action proposals.

### What FleetGraph Reasons About On Demand

When invoked from the Ship UI, FleetGraph uses the current route context:

- Current path.
- Current document ID and document type.
- Current project ID when available.
- Recent conversation history in the embedded assistant panel.

The on-demand graph answers questions such as:

- "What should I look at next on this project?"
- "Why is this week at risk?"
- "What changed since this plan was approved?"
- "Which issues are blocking the project goal?"
- "Who should be notified and why?"

### What FleetGraph Can Do Autonomously

FleetGraph can autonomously:

- Read Ship state for the workspace it is evaluating.
- Run graph evaluations from queued events or scheduled sweeps.
- Create `fleetgraph_finding` documents.
- Create finding delivery/read-state rows for target users.
- Notify connected users through Ship's realtime event channel after durable rows exist.
- Record run metadata, costs, LangSmith trace URLs, and audit events.

### What Always Requires Human Approval

FleetGraph must ask a human before it:

- Edits any project, program, week, issue, or person document.
- Changes issue state, assignee, priority, dates, or scope.
- Approves, unapproves, rejects, or requests changes on plans or reviews.
- Posts user-authored comments or status updates.
- Changes RACI ownership or accountability fields.

These actions become `fleetgraph_action_proposals`. A signed-in user with the normal Ship authorization for that action must approve or reject the proposal.

### Who FleetGraph Notifies

Notification routing follows Ship ownership:

- Issue risk: assignee first, then project owner/accountable when escalation is needed.
- Week plan/review risk: week owner and accountable approver.
- Project risk: project owner, project accountable, and program accountable.
- Program-level risk: program accountable and workspace admins when configured.
- On-demand response: only the requesting user unless the user explicitly shares or acts.

Delivery state is per user, not embedded only in the finding document, so users can read, dismiss, snooze, or retain the same finding independently.

## Trigger Model

FleetGraph uses a hybrid trigger model:

- Ship mutation paths enqueue durable evaluation jobs when projects, weeks, issues, ownership, or approval state changes.
- A scheduled worker or cron drains the queue every 1-2 minutes.
- The drain command can enqueue a bounded scheduled sweep before claiming jobs, catching missed events, imports, restarts, and stale project state.
- Database locks prevent duplicate work across overlapping workers.
- Idempotency keys prevent duplicate findings for the same condition and state window.

This model is the safest MVP tradeoff: event enqueueing keeps latency low for fresh Ship changes, and the sweep gives the graph a backstop for missed webhooks, deploy restarts, seeded/demo data, and stale conditions that become risky over time. The documented latency target is less than 5 minutes from Ship event to surfaced finding.

## Architecture Decisions

### Durable Findings

FleetGraph findings are Ship documents:

- Add `fleetgraph_finding` to the `document_type` enum.
- Store finding narrative in the document body.
- Store operational metadata in `properties`.
- Use existing `program`, `project`, and `sprint` document associations for grouping.
- Store focal target metadata in properties rather than adding a new relationship enum.

Expected properties:

```json
{
  "target_document_id": "...",
  "target_document_type": "issue",
  "detection_type": "stalled_issue",
  "severity": "medium",
  "status": "open",
  "run_id": "...",
  "thread_id": "...",
  "langsmith_trace_url": "https://...",
  "idempotency_key": "...",
  "created_by_actor": "fleetgraph"
}
```

### Trigger Execution Details

FleetGraph uses a hybrid trigger model:

- Ship mutation paths enqueue durable evaluation jobs.
- A scheduled worker or cron drains the queue every 1-2 minutes.
- The drain command can enqueue a bounded scheduled sweep before claiming jobs, catching missed events, imports, restarts, and stale project state.
- Database locks prevent duplicate work across overlapping workers.
- Idempotency keys prevent duplicate findings for the same condition and state window.

The latency target is less than 5 minutes from Ship event to surfaced finding. The queue cadence leaves room for retries while staying inside the PRD target.

### Detector Catalog

FleetGraph detectors are plain functions in `api/src/services/fleetgraph/detectors.ts` that read the Ship evidence bundle and return finding candidates. The graph can add more detectors without changing the queue, persistence, or UI contracts. Each detector is registered in `fleetGraphDetectorRegistry` with metadata for detector ID, kind, default severity, notification/noise default, and history window when applicable.

Implemented detectors:

| Detector ID | Signal | Default severity | Noise default |
|---|---|---:|---|
| `missing-approved-plan` | Active week without an approved plan signal | High | Toast |
| `approved-plan-drift` | Approved weekly plan changed after approval, routed through HITL | Medium | Badge |
| `missing-ownership` | Project or program missing owner/accountable metadata | Medium | Badge |
| `stale-issue` | Active issue has not been updated for 7 days | Medium | Badge |
| `project-churn` | Multiple stale active issues in one project | High | Toast |
| `overdue-milestone` | Active project or week target/due/end date is in the past | Medium | Badge |
| `workload-imbalance` | One owner has materially higher active issue load than peers | Medium | Badge |
| `scope-churn-rate` | Scope, estimate, priority, title, content, or association history changes repeatedly inside 14 days | Medium | Badge |
| `raci-drift` | Owner/accountable/responsible/assignee history changes repeatedly inside 30 days | Medium | Badge |

### Graph Persistence

FleetGraph uses LangGraph with the Postgres checkpointer:

- LangGraph checkpoints are the source of truth for paused/resumable graph execution.
- Ship-owned tables store run summaries, action proposals, delivery state, costs, and trace URLs.
- `thread_id` ties the LangGraph checkpoint to a Ship run and, when relevant, to a finding document.

Thread ID examples:

- `fleetgraph:proactive:{workspaceId}:{runId}`
- `fleetgraph:chat:{workspaceId}:{userId}:{documentId}`
- `fleetgraph:approval:{workspaceId}:{proposalId}`

### Retention Policy

FleetGraph now has a deployable retention command, `api/src/scripts/fleetgraph-retention.ts`, and a daily Render cron job, `ship-fleetgraph-retention`.

Default retention windows:

| Data | Retention | Behavior |
|---|---:|---|
| Completed queue events | 14 days | Deleted after the queue event is terminal and old enough |
| Failed queue events | 90 days | Retained longer for debugging, then deleted |
| Terminal runs | 90 days | Deleted only when status is completed, failed, or cancelled and no pending action proposal references the run |
| Monthly cost rollups | Indefinite | Terminal run cost/token totals are upserted into `fleetgraph_monthly_cost_rollups` before run pruning |
| Resolved/dismissed findings | 180 days | Soft-deleted through `documents.deleted_at`; open, acknowledged, and pending-gate findings are retained |
| HITL proposals | At least 1 year; current implementation keeps indefinitely | Retained for audit even when old terminal run rows are pruned; `run_id` becomes null through `ON DELETE SET NULL` |
| Deliveries | Kept with finding lifecycle | Delivery rows cascade only when the finding document is hard-deleted; soft-deleted findings preserve delivery history |
| LangGraph checkpoints | 90 days | Checkpoint rows for terminal FleetGraph threads are deleted after pending HITL gates are excluded |

The windows are configurable with `SHIP_FLEETGRAPH_RETENTION_COMPLETED_EVENTS_DAYS`, `SHIP_FLEETGRAPH_RETENTION_FAILED_EVENTS_DAYS`, `SHIP_FLEETGRAPH_RETENTION_RUNS_DAYS`, `SHIP_FLEETGRAPH_RETENTION_RESOLVED_FINDINGS_DAYS`, `SHIP_FLEETGRAPH_RETENTION_CHECKPOINTS_DAYS`, and `SHIP_FLEETGRAPH_RETENTION_DRY_RUN`.

### UI Integration

FleetGraph is embedded in Ship's existing assistant surface:

- Reuse the Ask Ship drawer shell.
- Add a FleetGraph mode or tab instead of a standalone chatbot page.
- Add notification badges for unread FleetGraph findings.
- Add finding detail views that can open the durable finding document.
- Add approve, reject, snooze, and dismiss controls where authorization permits.

Backend endpoints should be separate from Ask Ship:

- `GET /api/fleetgraph/status`
- `POST /api/fleetgraph/chat`
- `GET /api/fleetgraph/findings`
- `GET /api/fleetgraph/findings/:id`
- `PATCH /api/fleetgraph/deliveries/:id`
- `GET /api/fleetgraph/runs/:id`
- `POST /api/fleetgraph/actions/:id/decision`

Delivery updates accept `read`, `dismissed`, or `snoozed` status. Snoozed deliveries require `snoozedUntil`. Action decisions accept `approved` or `rejected` status plus an optional note.

All routes must be registered with OpenAPI following Ship's route/schema pattern.

### Focused UI Design Review

Review mode: focused text-only design review plus checked-in low-fidelity mockups.

Initial design completeness: 4/10.

Post-review design completeness: 8/10.

Visual mockups added on 2026-05-29: [`docs/fleetgraph-visual-mockups.md`](docs/fleetgraph-visual-mockups.md). The mockups cover the drawer inbox, finding detail, HITL approval gate, notification preferences, and mobile drill-in states.

The plan now specifies the high-risk UI surfaces that would otherwise be left to implementation guesswork: the FleetGraph drawer hierarchy, finding states, notification behavior, action proposal gates, and mobile/accessibility constraints.

#### Design Review Completion

| Review item | Completion evidence |
|---|---|
| More detection types | Added overdue milestone, workload imbalance, scope churn rate, and RACI drift detectors; registry metadata defines IDs, default severity, noise defaults, and history windows. |
| Visual mockups | Added five mockups plus state matrices for inbox rows and approval gates in `docs/fleetgraph-visual-mockups.md`. |
| Long-term retention policy | Added daily retention command, monthly cost rollups, terminal run pruning, resolved-finding soft delete, checkpoint cleanup, and audit retention for HITL proposals. |

#### What Already Exists To Reuse

FleetGraph must reuse Ship's existing app UI vocabulary rather than inventing a new AI product surface:

- Right-side assistant drawer shell from `web/src/components/assistant/AskShipPanel.tsx`.
- Assistant transcript and composer components from `web/src/components/assistant/*`.
- Tab pattern from `web/src/components/ui/TabBar.tsx`.
- Existing realtime events provider from `web/src/hooks/useRealtimeEvents.tsx`.
- Existing toast provider from `web/src/components/ui/Toast.tsx`.
- Existing rail button pattern from `web/src/pages/App.tsx`.
- Ship's dark, dense, task-focused workspace style: muted text, thin borders, compact rows, restrained accent color.

Do not introduce a hero layout, marketing copy, decorative cards, or a separate chatbot page.

#### Drawer Information Architecture

FleetGraph lives inside the existing right-side assistant drawer. The drawer has three persistent zones:

```text
+--------------------------------------------------+
| Header                                           |
| Ask Ship | FleetGraph        status / close      |
+--------------------------------------------------+
| FleetGraph body                                  |
|                                                  |
| Findings inbox OR selected finding detail        |
|                                                  |
| - risk summary                                   |
| - evidence links                                 |
| - trace / run metadata                           |
| - action proposal gate, when present             |
|                                                  |
+--------------------------------------------------+
| Composer / contextual prompt shortcuts           |
+--------------------------------------------------+
```

Default behavior:

- If FleetGraph opens from a notification, show the selected finding detail first.
- If FleetGraph opens from a project, week, issue, or program route, show findings filtered to that current context first.
- If no finding is selected, show a compact findings inbox above the composer.
- If the user switches back to Ask Ship, preserve the FleetGraph unread count and selected finding state.

Primary hierarchy inside FleetGraph detail:

1. Severity and plain-language risk summary.
2. Target document and current Ship context.
3. Evidence, including cited Ship records and timeline signals.
4. Recommended next step.
5. Action proposal controls, if an action requires approval.
6. Trace/run metadata collapsed by default.

Only one finding detail is open at a time. Avoid nested cards inside the drawer. Use compact sections separated by borders and headings.

#### Finding Inbox Row

Each finding row should be scannable in under three seconds:

- Severity marker: critical, high, medium, low.
- Short title, maximum two lines.
- Target label: project, week, issue, or program.
- Age or detection time.
- Status: unread, read, snoozed, dismissed, action pending, action approved, action rejected.
- Optional trace/run icon only when useful for debugging.

Rows are buttons with clear focus states. Hover-only controls are allowed for secondary actions on desktop, but the same controls must be visible or reachable on keyboard and touch.

#### Notification Rules

FleetGraph notifications should build trust, not become noise:

- Rail badge shows unread FleetGraph deliveries.
- Drawer badge shows unread count next to the FleetGraph tab.
- Toasts appear only for new high or critical findings, or when an action proposal needs the current user's approval.
- Low and medium findings increment the badge but do not interrupt the user with a toast.
- Toast action opens the drawer directly to the finding detail.
- Dismissed and snoozed findings leave the shared finding document intact and update only that user's delivery row.

Realtime events should use a dedicated event type such as `fleetgraph:finding-delivered`. The event payload should be small: finding ID, delivery ID, severity, title, target label, and whether action is required.

#### Interaction States

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| FleetGraph status | Header says "Checking FleetGraph" and disables composer | Not applicable | Header says "FleetGraph unavailable" with retry | Header says "Ready" | Header says "Limited" when tracing or model config is missing |
| Findings inbox | Skeleton rows matching compact row height | "No FleetGraph findings for this context" plus a "Ask about this view" action | Inline error with retry | Sorted finding rows with unread first | Shows available rows plus "Some findings could not load" |
| Finding detail | Detail skeleton with title, evidence, and action placeholders | "Select a finding" when no row is active | Inline error with back-to-list action | Detail, evidence, metadata, and controls | Missing trace or evidence section is labeled without hiding the finding |
| Chat response | Composer disabled and transcript shows "Thinking..." | First-run prompt shortcuts tied to current route | Assistant message explains failure and preserves typed prompt | Response cites Ship records and can link to findings | Response warns when only partial context was available |
| Action proposal | Buttons disabled and show "Submitting..." | No action block appears | Error stays inside the action block with retry | Proposal status updates in place | Unauthorized users see read-only proposal and owner to contact |
| Notifications | Badge count updates after durable delivery | Badge hidden at zero | Toast says notification failed only for current user action failures | Toast opens exact finding | Badge can update before inbox refresh, then reconciles on fetch |

Empty states should be calm and useful. Do not ship "No items found." as the full state.

#### Human Approval Gate UI

Action proposals appear in the selected finding detail as a compact approval block:

- Proposed action title.
- Target document link.
- Before/after summary or mutation payload summary.
- Evidence list supporting the recommendation.
- Authorization note: who can approve this.
- LangSmith trace link, collapsed under "Run details".
- Primary action: Approve.
- Secondary action: Reject.
- Tertiary actions: Snooze and Dismiss.

Approve and reject controls must:

- Require an authenticated user.
- Disable while submitting.
- Preserve the finding detail after completion.
- Show the resulting status inline.
- Never silently execute if the user's authorization no longer permits the underlying Ship mutation.

Reject should allow an optional note. Approve may allow an optional note only if the underlying Ship workflow already supports one.

#### Mobile and Responsive Behavior

The drawer keeps Ship's desktop behavior but becomes a full-screen panel below 640px:

- Width: `max-w-[420px]` on desktop, full viewport width on mobile.
- Header remains sticky.
- Composer remains pinned at the bottom.
- Finding inbox and detail use a single-column drill-in pattern on mobile.
- Touch targets are at least 44px high for row actions and approval controls.
- Toasts should not cover the composer on mobile.

Do not use a hamburger or separate mobile FleetGraph page for MVP.

#### Accessibility Requirements

FleetGraph must support:

- `role="dialog"` on the drawer, preserving the existing non-modal behavior unless the app changes it globally.
- Distinct accessible labels for Ask Ship and FleetGraph tabs.
- Keyboard navigation through tabs, finding rows, action controls, and composer.
- Visible focus rings on rows and buttons.
- `aria-live="polite"` for badge/toast changes that do not require immediate interruption.
- `aria-live="assertive"` only for critical action-required failures.
- Color contrast at WCAG AA for all text and status labels.
- Status icons paired with text, not color alone.

#### Not In Scope For MVP

- A standalone FleetGraph page.
- A new global notification center.
- Decorative AI visual branding.
- Multi-finding split panes inside the drawer.
- Bulk approve/reject flows.

### Actor Model

FleetGraph has a system actor identity for detection and notification. It does not impersonate humans.

Audit records must distinguish:

- `actorType: "fleetgraph"` for autonomous detection, finding persistence, and notification.
- `approvedByUserId` for any human-approved action proposal.
- `runId`, `threadId`, and `langsmithTraceUrl` for traceability.

The runtime runner invokes FleetGraph through a compiled LangGraph `StateGraph` with the Postgres checkpointer and stable `thread_id` values. The deterministic state runner remains for local eval coverage, and the no-database FleetGraph eval suite uses LangGraph `MemorySaver` to verify interrupt/resume behavior without requiring local PostgreSQL.

## Data Model Sketch

The exact migration names will depend on current Ship migration numbering.

```sql
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding';

CREATE TABLE fleetgraph_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_event_type TEXT NOT NULL,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, idempotency_key)
);

CREATE TABLE fleetgraph_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_id UUID,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  langsmith_trace_url TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(12, 6),
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE fleetgraph_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unread',
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  UNIQUE(finding_document_id, user_id)
);

CREATE TABLE fleetgraph_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  run_id UUID REFERENCES fleetgraph_runs(id) ON DELETE SET NULL,
  proposed_action TEXT NOT NULL,
  target_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_actor TEXT NOT NULL DEFAULT 'fleetgraph',
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Graph Diagram

```mermaid
flowchart TD
  A["Trigger: queue, sweep, or chat"] --> B["Normalize context"]
  B --> C["Load Ship route/workspace context"]
  C --> D["Fetch project, week, issue, timeline, and accountability data"]
  D --> E["Detect conditions"]
  E --> F{"Worth surfacing?"}
  F -->|"No"| G["Record run, no finding"]
  F -->|"Yes"| H["Rank severity and choose audience"]
  H --> I{"Action needed?"}
  I -->|"Finding only"| J["Persist fleetgraph_finding document"]
  I -->|"Mutation proposed"| K["Create action proposal and interrupt for HITL"]
  K --> L{"Human decision"}
  L -->|"Approve"| M["Execute authorized Ship mutation"]
  L -->|"Reject"| N["Close proposal with note"]
  J --> O["Create delivery rows"]
  M --> O
  N --> O
  O --> P["Notify connected users"]
  P --> Q["Store run metadata and trace URL"]
```

### Graph Outline

| Node | Type | Reads | Writes |
|---|---|---|---|
| Trigger | Entry | FleetGraph event queue, scheduled sweep, or authenticated chat request | Initial graph state with mode, workspace, user, route, trigger, and thread IDs |
| Normalize context | Context node | Request payload, queue payload, route context | Canonical target document, trigger type, idempotency key, and graph mode |
| Load Ship context | Data node | Real Ship workspace, document, project, week, issue, timeline, accountability, association, and `document_history` rows | Evidence bundle used by downstream decision nodes |
| Detect conditions | Decision node | Evidence bundle | Candidate detections for planning gaps, stale issues, project churn, approval drift, ownership gaps, overdue milestones, workload imbalance, scope churn, RACI drift, and contextual chat |
| Rank and route | Decision node | Candidate detections and user/audience rules | Severity, notification audience, and whether mutation is proposed |
| Persist finding | Side-effect node | Approved finding candidate | `fleetgraph_finding` document, document associations, delivery rows, audit metadata |
| HITL proposal | Interrupt node | Proposed mutation and evidence | `fleetgraph_action_proposals` row and LangGraph interrupt/checkpoint |
| Human decision | Resume node | Authenticated approve/reject decision | Authorized Ship mutation on approval, closed proposal on rejection |
| Notify and record | Side-effect node | Findings, deliveries, proposal decision, trace metadata | Realtime notifications, run status, token/cost metadata, trace URL |

### Branching Conditions

| Branch | Condition | Result |
|---|---|---|
| No finding | No candidate exceeds the surfacing threshold, or idempotency key already has an open finding for the same state window | Record run as completed without delivery |
| Finding only | Candidate is useful but does not require FleetGraph to mutate Ship state | Persist finding and delivery rows, then notify target users |
| HITL proposal | Candidate recommends a project/week/issue/approval/RACI mutation | Create proposal and interrupt the graph until a human approves or rejects |
| Approved proposal | Authenticated user has permission and approves the action | Execute the Ship mutation through normal authorization paths, audit both FleetGraph and user actors |
| Rejected proposal | User rejects, lacks permission, or the action is no longer valid | Close proposal with note, retain finding/evidence, avoid mutation |
| Chat | Request originates from the UI FleetGraph panel | Return a grounded answer to the requester only; create a proposal only if the user asks for an action |

## Use Cases

| # | Role | Trigger (Ship State) | Agent Detects / Produces | Human Decides |
|---|---|---|---|---|
| 1 | PM | A week planning document exists without an approved plan signal | Planning-gap finding on the week, delivered to the week owner/approver | Only required if FleetGraph proposes creating or changing plan content |
| 2 | Director | A project has repeated stalled issue evidence across multiple sprints | Project risk finding with issue/timeline evidence and delivery rows | Required before changing project status, scope, or assignments |
| 3 | Engineer | An issue is still open and stale in a real Ship project | Stale issue finding explaining the likely blocker, owner, and next step | Required before changing issue status, assignee, or priority |
| 4 | PM | An approved plan changes after approval | HITL action proposal and interrupted graph run for review/re-approval handling | Required before any approval, unapproval, comment, or status mutation |
| 5 | Director | A project has missing owner/accountable metadata | Ownership-gap finding listing the affected project and suggesting ownership confirmation | Required before changing RACI/ownership fields |
| 6 | User | A signed-in user opens FleetGraph from a project or week route | Context-aware answer grounded in the current Ship view and recent FleetGraph evidence | Required before executing any mutation proposed from chat |
| 7 | PM | A project or week target/due/end date is past and the work is still active | Overdue-milestone finding with owner routing and date evidence | Required before changing milestone date, status, scope, or owner |
| 8 | Manager | Active issue count or estimated effort is concentrated on one assignee | Workload-imbalance finding with top assigned issues and effort evidence | Required before reassigning work or changing estimates |
| 9 | Director | Recent `document_history` shows repeated scope, estimate, priority, title, content, or association changes | Scope-churn finding explaining the change rate and citing the recent history entries | Required before changing scope, priorities, or plan content |
| 10 | Director | Recent `document_history` shows repeated owner/accountable/responsible/assignee changes | RACI-drift finding explaining responsibility instability and citing the recent history entries | Required before changing RACI/ownership fields |

## Test Cases

The MVP trace links below were generated from real Ship rows in the Week5 local database and shared from LangSmith on 2026-05-26. Proactive traces were produced by the FleetGraph drain path against queued Ship events or sweep-detected state; the chat trace was produced by the authenticated FleetGraph UI/API path. The four post-MVP detector expansion rows are covered by deterministic local detector tests and are ready for trace capture once seeded in a traced Ship environment.

| # | Ship State | Expected Output | Trace / Verification |
|---|---|---|---|
| 1 | A week planning document exists without an approved plan signal | Planning-gap finding delivered to the week owner/approver | [Trace](https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r); Ship run `f25df8ca-e643-45a7-bf6e-e4ca21bb902d` |
| 2 | Project `FleetGraph Real Project Churn 20260526134152` has repeated stalled issue evidence | Project risk finding with issue/timeline evidence and delivery rows | [Trace](https://smith.langchain.com/public/20ab9844-8802-4a2e-90ed-230a95e18841/r); Ship run `d6ee3577-6f3a-4c83-ad19-61cf7cc3b573` |
| 3 | Issue `FleetGraph Single Stale Issue 20260526134152` is still open and stale in a real Ship project | Stale issue finding explaining the likely blocker, owner, and next step | [Trace](https://smith.langchain.com/public/3c892981-1bdc-4583-b208-c5ce905a37be/r); Ship run `d462cfca-340c-4eab-9bac-f2ad1e4d55f9` |
| 4 | An approved plan changes after approval | HITL action proposal, graph interrupted awaiting human decision | [Trace](https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r); Ship run `2328e746-019a-46cd-896f-1dc3a51ea045` |
| 5 | Project `FleetGraph Real Missing Ownership 20260526134152` has missing owner/accountable metadata | Ownership-gap finding listing the affected project and suggesting ownership confirmation | [Trace](https://smith.langchain.com/public/abb91b0a-f975-4750-9f2e-3fccb5bad600/r); Ship run `6881c404-dc84-4769-b78f-271337fc91f5` |
| 6 | A signed-in user opens FleetGraph from a project or week route | Context-aware answer grounded in the current Ship view and recent FleetGraph evidence | [Trace](https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r); Ship run `8ff69405-894c-4cc4-a7bc-3a1a2dd04764` |
| 7 | Active project has `target_date`, `due_date`, `planned_end_date`, or `end_date` in the past | Overdue-milestone finding with target date evidence | Local detector coverage: `api/src/services/fleetgraph/detectors.test.ts` |
| 8 | Active issue estimates/counts are concentrated on one assignee relative to peers | Workload-imbalance finding with top issue evidence | Local detector coverage: `api/src/services/fleetgraph/detectors.test.ts` |
| 9 | Related project/week/issue/plan `document_history` has at least 5 scope-related changes in 14 days | Scope-churn finding with timeline evidence | Local detector coverage: `api/src/services/fleetgraph/detectors.test.ts` |
| 10 | Related project/program/week/issue `document_history` has at least 3 RACI-related changes in 30 days | RACI-drift finding with timeline evidence | Local detector coverage: `api/src/services/fleetgraph/detectors.test.ts` |

## Human-in-the-Loop Experience

FleetGraph uses LangGraph interrupts for approval gates. The UI shows:

- Proposed action.
- Evidence and cited Ship records.
- Expected mutation payload.
- LangSmith trace link.
- Approve, reject, snooze, and dismiss controls.

Approve and reject actions go through authenticated `POST /api/fleetgraph/actions/:id/decision`. The endpoint must enforce the same authorization rules as the underlying Ship operation before any real mutation is executed.

## Observability

LangSmith tracing is required from day one.

Every completed or failed FleetGraph run should store:

- Ship run ID.
- LangGraph thread ID.
- LangSmith trace URL.
- Trigger type and source document.
- Model name.
- Token usage and estimated cost when provider metadata is available.
- Error details safe for internal inspection.

Shared trace links must be reviewed before submission because public LangSmith trace links can expose sensitive information. Do not put secrets, full session cookies, bearer tokens, or irrelevant personal data in graph state or trace metadata.

Shared LangSmith evidence captured on 2026-05-26:

- Proactive finding-only path: [trace](https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r), Ship run `f25df8ca-e643-45a7-bf6e-e4ca21bb902d`, LangSmith trace `019e6558-35a9-747f-98fd-b1a040f42060`.
- Project churn/stalled issues path: [trace](https://smith.langchain.com/public/20ab9844-8802-4a2e-90ed-230a95e18841/r), Ship run `d6ee3577-6f3a-4c83-ad19-61cf7cc3b573`, LangSmith trace `019e6598-3a09-766e-ac68-cfb3c26951ad`.
- Stale issue path: [trace](https://smith.langchain.com/public/3c892981-1bdc-4583-b208-c5ce905a37be/r), Ship run `d462cfca-340c-4eab-9bac-f2ad1e4d55f9`, LangSmith trace `019e6598-3b4c-75bd-98b5-ee634c519a77`.
- HITL/action proposal path: [trace](https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r), Ship run `2328e746-019a-46cd-896f-1dc3a51ea045`, LangSmith trace `019e6553-20ef-779f-8273-c42d9ea4cd25`.
- Missing ownership path: [trace](https://smith.langchain.com/public/abb91b0a-f975-4750-9f2e-3fccb5bad600/r), Ship run `6881c404-dc84-4769-b78f-271337fc91f5`, LangSmith trace `019e6598-3b86-77ae-be2d-bb1122b8c49c`.
- On-demand chat path: [trace](https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r), Ship run `8ff69405-894c-4cc4-a7bc-3a1a2dd04764`, LangSmith trace `019e6552-9dd5-73a4-a7ba-7f6e65c967e6`.

## Performance and Cost

| Metric | Goal | Current evidence |
|---|---|---|
| Problem detection latency | Less than 5 minutes from Ship event to surfaced finding | DB-backed E2E introduced a real Ship sprint event, drained the FleetGraph queue, and surfaced the delivered finding inside the 5 minute target. Local drain verification also processed queued real Ship documents into findings. |
| Cost per graph run | Documented and defended | Six real OpenAI-backed shared trace runs ranged from $0.000243 to $0.000519, with $0.000349 average cost per real/model run. |
| Estimated runs per day | Documented and defended | MVP assumes 12 proactive runs per project per day from the 5 minute sweep/drain window, plus 3 on-demand chat invocations per active user per day. |

Operational targets:

- Queue drain cadence: 1-2 minutes.
- Sweep cadence: 5 minutes or faster in demo/public deployment.
- Duplicate finding rate: zero for the same workspace, target, detection type, and state window.
- Real Ship data only for submitted traces and E2E validation.

### Development and Testing Costs

FleetGraph runtime model costs are tracked in `fleetgraph_runs`. The graph runtime made 0 Claude API calls because the Week5 FleetGraph provider is OpenAI `gpt-4o-mini`; therefore FleetGraph Claude API input, output, and total runtime cost are $0.00. Codex/IDE development assistant billing is not exposed to the repository or FleetGraph runtime telemetry, so the auditable cost report below is based on persisted FleetGraph graph invocations.

Tracked development/test totals on 2026-05-26:

- Persisted graph-agent invocations included in final evidence: 9.
- Shared real/model LangSmith runs: 6 invocations, 7,293 input tokens, 1,747 output tokens, $0.002096 total.
- Additional validation rows: 3 invocations, 1,987 equivalent input tokens, 429 equivalent output tokens, $0.000555 total.
- Total tracked FleetGraph development/test spend: $0.002651.

Pricing checked on 2026-05-26:

- Model: `gpt-4o-mini` for low-cost FleetGraph demo runs.
- Price source: [OpenAI GPT-4o mini model pricing](https://platform.openai.com/docs/models/gpt-4o-mini).
- Standard text price used for estimates: $0.15 / 1M input tokens and $0.60 / 1M output tokens.

**Submission evidence — real model runs (OpenAI / gpt-4o-mini, LangSmith-traced):**

| Date | Source | Mode | Provider/model | Input tokens | Output tokens | Cost |
|---|---|---|---|---:|---:|---:|
| 2026-05-26 | Shared LangSmith proactive finding run | proactive | `openai` / `gpt-4o-mini` | 1,050 | 245 | $0.000305 |
| 2026-05-26 | Shared LangSmith HITL action proposal run | proactive | `openai` / `gpt-4o-mini` | 1,310 | 325 | $0.000392 |
| 2026-05-26 | Shared LangSmith on-demand chat run | chat | `openai` / `gpt-4o-mini` | 973 | 162 | $0.000243 |
| 2026-05-26 | Shared LangSmith project churn/stalled issues run | proactive | `openai` / `gpt-4o-mini` | 1,680 | 445 | $0.000519 |
| 2026-05-26 | Shared LangSmith stale issue run | proactive | `openai` / `gpt-4o-mini` | 1,230 | 245 | $0.000332 |
| 2026-05-26 | Shared LangSmith missing ownership run | proactive | `openai` / `gpt-4o-mini` | 1,050 | 245 | $0.000305 |

**Route and cost-math validation rows (not submission evidence — mock provider, no LLM calls):**

These rows are retained only to verify that the drain route correctly persists run metadata and that cost arithmetic is correct end-to-end. They do not represent real model invocations.

| Date | Source | Mode | Provider/model | Input tokens | Output tokens | Cost |
|---|---|---|---|---:|---:|---:|
| 2026-05-26 | E2E seed `fleetgraph_runs` row | proactive | `mock` / `mock-fleetgraph` | 1,200 | 280 | $0.000348 |
| 2026-05-26 | Isolated Docker Postgres `fleetgraph_runs` row | chat | `mock` / `mock-fleetgraph` | 787 | 149 | $0.000207 |
| 2026-05-26 | Isolated Docker Postgres `fleetgraph_runs` row | chat | `mock` / `mock-fleetgraph` | 0 | 0 | $0.000000 |

### Production Cost Projections

Assumptions:

- 1 active project per user.
- 12 proactive runs per project per day.
- 3 on-demand invocations per user per day.
- Proactive average: 5,000 input tokens and 500 output tokens.
- On-demand average: 8,000 input tokens and 800 output tokens.
- Price: $0.15 / 1M input tokens and $0.60 / 1M output tokens.

| Scale | Monthly estimate | Assumptions |
|---|---:|---|
| 100 users | $52.92 | 1 project/user, 12 proactive runs/project/day, 3 on-demand runs/user/day, 5k/500 proactive tokens, 8k/800 on-demand tokens |
| 1,000 users | $529.20 | Same starter assumptions |
| 10,000 users | $5,292.00 | Same starter assumptions |

## Deployment Evidence

The current public Render URL from the FleetGraph submission docs is `https://ship-wf2i.onrender.com`.

Public checks run on 2026-05-27 after the Render deployment of the current FleetGraph build:

| Check | Result |
|---|---|
| `GET /health` | `200`, body `{"status":"ok"}` |
| `GET /api/fleetgraph/status` | `200`; `enabled: true`, `available: true`, provider `openai`, model `gpt-4o-mini`, proactive enabled, LangSmith tracing enabled, runtime marker `targeted-event-v1` / `self-healing-v1` |
| `GET /api/fleetgraph/findings` | `200`; delivered findings returned for the authenticated user |
| Public timed latency run | Real Ship sprint document `146712c1-ac7b-4569-81cf-b459b1fbbdc0` was created at `2026-05-27T03:47:01.2066111Z`; FleetGraph surfaced finding `31c7618c-47e6-4c4e-8395-862ffe4ad3f6` on the first poll at 15.3 seconds |
| Deployed run metadata | Run `2fadd444-48ff-4515-8e0d-47d56c9788ff` completed as proactive `document.created`, provider `openai`, model `gpt-4o-mini`, 1,050 input tokens, 245 output tokens, estimated cost `$0.000305` |

Render configuration includes the FleetGraph web env vars and the `ship-fleetgraph-drain` cron job. Public health, authenticated FleetGraph status, findings retrieval, proactive event-to-finding delivery, and deployed run cost metadata are verified on the Render URL.

## Test Plan

Required implementation tests:

- Migration tests for new enum value, queue table, runs, deliveries, and action proposals.
- Unit tests for trigger idempotency and queue locking.
- Unit tests for each detection node using real Ship-shaped fixtures.
- API tests for FleetGraph routes, auth, authorization, OpenAPI registration, and CSRF behavior.
- Graph tests for interrupt/resume behavior with the Postgres checkpointer.
- E2E test showing a Ship event becomes a UI notification and finding within 5 minutes.
- E2E test showing an on-demand FleetGraph chat uses the current project/week context.
- E2E or integration test for approve/reject action proposal flow.
- UI tests for empty, loading, error, unavailable, missing evidence, snoozed, dismissed, rejected action, action-error, and trace-present/missing states.
- Accessibility checks for keyboard navigation, focus order, live regions, and contrast in the FleetGraph drawer; component-level live-region and row-label coverage is in place.
- Mobile checks for full-screen drawer behavior, touch targets, and composer/toast overlap; component-level responsive contract coverage is in place.
- Trace validation with six shared LangSmith links before submission.

### Current Implementation Validation

Last checked: 2026-05-29.

Passing local checks:

- `pnpm type-check`
- `pnpm build:api`
- `pnpm build:web`
- `pnpm --filter @ship/api test:fleetgraph-api`
- `pnpm --filter @ship/api exec vitest run src/openapi/fleetgraph.test.ts src/routes/fleetgraph.test.ts`
- `pnpm --filter @ship/api test:fleetgraph-eval`
- `pnpm test:e2e -- e2e/fleetgraph.spec.ts --workers=1`
- focused FleetGraph web hook, drawer, responsive panel, toast, and route-context tests
- `git diff --check`
- pre-commit empty-test check

Current deterministic evidence:

- `e2e/fixtures/isolated-env.ts` seeds a completed proactive FleetGraph run, a delivered unread finding, and a pending human action proposal.
- `e2e/fleetgraph.spec.ts` opens FleetGraph from a Ship document, marks the delivered finding read, rejects the action proposal with a note, and verifies contextual chat response grounding.
- `e2e/fleetgraph.spec.ts` also creates a real sprint document event, drains the FleetGraph queue against the isolated test database, verifies a delivered planning-gap finding appears in the drawer within the 5 minute latency target, and confirms the linked `fleetgraph_runs` row records token/cost metadata.
- `api/src/routes/fleetgraph.test.ts` covers authentication, CSRF, per-user delivery visibility, route-context finding filters, admin run/finding access, action-decision authorization, and audit logging with run/trace metadata.
- `web/src/hooks/useFleetGraph.test.tsx` verifies the current Ship route context is used for both findings fetches and on-demand chat requests.
- `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx` covers delivered findings, loading/empty/error/unavailable states, missing evidence, snooze/dismiss actions, rejected action decisions, action errors, and trace-present/missing run metadata.
- `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx` also verifies announced status/alert regions and accessible finding row labels for unread severity state.
- `web/src/components/assistant/AskShipPanel.test.tsx`, `web/src/components/assistant/fleetgraph/FleetGraphPanel.test.tsx`, and `web/src/components/ui/Toast.test.tsx` verify the FleetGraph drawer's mobile full-width class contract, 44px mobile action targets, and mobile toast offset above the pinned composer.
- `api/src/services/fleetgraph/graph.test.ts`, included in `pnpm --filter @ship/api test:fleetgraph-eval`, verifies the compiled LangGraph workflow can checkpoint an approval interrupt with `MemorySaver` and resume with a human decision.
- `api/src/scripts/fleetgraph-drain.test.ts`, included in `pnpm --filter @ship/api test:fleetgraph-eval`, verifies the scheduled drain command keeps local drain-only defaults and parses Render sweep settings for proactive backstop coverage.
- `api/src/services/fleetgraph/detectors.test.ts` verifies the detector registry metadata plus all nine detector paths, including overdue milestones, workload imbalance, scope churn rate, and RACI drift.
- `api/src/services/fleetgraph/retention.test.ts` verifies configurable retention windows, dry-run reporting, monthly cost rollups before run pruning, terminal history pruning, resolved-finding soft delete, retained historical HITL proposals, and preservation of active work/HITL gates.
- `api/src/services/fleetgraph/eval-harness.test.ts` scores the six PRD use cases plus the no-finding branch; the expanded detector tests cover the four added post-MVP detector paths.
- DB-backed validation completed against isolated Docker Postgres on 2026-05-26: `pnpm --filter @ship/api test:fleetgraph-api` passed 22 tests, and the focused FleetGraph OpenAPI/route run passed 17 tests.
- FleetGraph E2E completed on 2026-05-26 with `pnpm test:e2e -- e2e/fleetgraph.spec.ts --workers=1`: 2 passed, including the timed event-to-finding path under the 5 minute requirement.
- Public Render latency verification completed on 2026-05-27: real Ship sprint `146712c1-ac7b-4569-81cf-b459b1fbbdc0` produced delivered planning-gap finding `31c7618c-47e6-4c4e-8395-862ffe4ad3f6` in 15.3 seconds, with deployed run `2fadd444-48ff-4515-8e0d-47d56c9788ff` recording proactive mode, trigger `document.created`, token counts, and estimated cost.

Public deployment status:

- Local and LangSmith evidence is complete for the MVP graph paths.
- Public deployment is live at `https://ship-wf2i.onrender.com` with FleetGraph routes present and authenticated.
- Public event-to-finding latency is verified under the 5 minute requirement.
- Deployed billable cost metadata is recorded in `fleetgraph_runs` for the public proactive run.

## Completed Implementation Tasks

Synthesized from the focused design review. Each task derives from a specific finding above.

- [x] **T1 (P1)** - FleetGraph drawer - Implement the three-zone drawer hierarchy.
  - Surfaced by: Focused UI Design Review - the original plan named a drawer but did not define what users see first, second, or third.
  - Files: `web/src/components/assistant/AskShipPanel.tsx`, new FleetGraph drawer components.
  - Verify: Open from global rail, current project/week context, and notification deep link.
- [x] **T2 (P1)** - Findings UI - Build inbox rows and finding detail states.
  - Surfaced by: Interaction state coverage - finding loading, empty, error, success, and partial states were previously unspecified.
  - Files: new FleetGraph findings components and tests.
  - Verify: Component tests or Storybook-style fixtures for every state in the interaction table.
- [x] **T3 (P1)** - Action proposals - Build the human approval gate UI.
  - Surfaced by: HITL design - approve/reject/snooze/dismiss controls needed concrete user-visible rules.
  - Files: FleetGraph action proposal component, API hooks, route tests.
  - Verify: Approve, reject, unauthorized, submitting, and failed-submit flows.
- [x] **T4 (P2)** - Notifications - Add badge and toast rules for delivered findings.
  - Surfaced by: Notification rules - interrupt behavior needed severity-based limits to avoid noisy AI alerts.
  - Files: realtime event type, rail button, toast integration.
  - Verify: Critical findings open a toast; medium/low findings update badge only.
- [x] **T5 (P2)** - Responsive and accessibility - Add mobile and keyboard/screen reader checks.
  - Surfaced by: Mobile and accessibility requirements - drawer behavior and live regions were not defined.
  - Files: FleetGraph drawer/components, focused UI tests or E2E checks.
  - Verify: 375px viewport, keyboard-only path, focus order, and live-region behavior.

## Ship Reference Points



Reference commit:

`0a1837f7a16cf14bcbb54164f549a4b8b219e676`

Important files:

- `docs/unified-document-model.md`
- `docs/application-architecture.md`
- `docs/document-model-conventions.md`
- `docs/week-documentation-philosophy.md`
- `api/src/db/schema.sql`
- `api/src/routes/assistant.ts`
- `api/src/services/assistant/*`
- `api/src/collaboration/index.ts`
- `web/src/components/assistant/AskShipPanel.tsx`
- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`


- **VERDICT:** ENG CLEARED + DESIGN FOCUSED PASS IMPLEMENTED. Local MVP evidence, shared LangSmith traces, public deployment, and public timed latency verification are complete.
