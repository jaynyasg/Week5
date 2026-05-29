# FleetGraph Presearch

Last reviewed: 2026-05-29

This file is the completed pre-search checklist for the Week 5 FleetGraph build. It answers each of the nine checklist items before implementation, drawing on the PRD, Ship reference code, and external documentation listed below.

## Sources Reviewed

**PRD source:** `Week 5 GFA - FleetGraph PRD.pdf` (extracted to `planning/prd-extract.md`)

**Ship reference:** branch `main`, commit `0a1837f7a16cf14bcbb54164f549a4b8b219e676` at `C:\Users\jaynyasg\OneDrive\Documents\GitLab\ship`

Ship docs read:
- `docs/unified-document-model.md`
- `docs/application-architecture.md`
- `docs/document-model-conventions.md`
- `docs/week-documentation-philosophy.md`
- `docs/accountability-philosophy.md`
- `docs/assistant.md`
- `DEPLOYMENT.md`
- `render.yaml`

Ship code read:
- `api/src/db/schema.sql`
- `api/src/routes/assistant.ts`
- `api/src/services/assistant/chat.ts`
- `api/src/services/assistant/tracing.ts`
- `api/src/services/timeline.ts`
- `api/src/services/accountability.ts`
- `api/src/routes/accountability.ts`
- `api/src/collaboration/index.ts`
- `api/src/middleware/auth.ts`
- `api/src/services/audit.ts`
- `web/src/components/assistant/AskShipPanel.tsx`
- `web/src/hooks/useAssistant.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`

External docs read:
- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts / human-in-the-loop: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangSmith trace management and sharing: https://docs.langchain.com/langsmith/manage-trace

---

## Phase 1: Define Your Agent

### 1. Agent Responsibility Scoping

**What events in Ship should the agent monitor proactively?**

Week planning documents missing an approved plan signal; weekly reviews not submitted on time; project and program timelines showing overdue milestones; issues that have gone stale (open and unmodified beyond a threshold); issues reopened after closure; approved plans modified after approval; RACI ownership gaps on projects, programs, and weeks.

**What constitutes a condition worth surfacing?**

A condition is worth surfacing when it represents a risk a human on the project is unlikely to notice without the agent — for example, a blocker sitting unresolved past the sprint boundary, a week plan that was never approved, a project with no assigned owner, or an issue that has been open and untouched for more than a configurable threshold. Routine state changes (issues moving normally, plans approved on time) are not surfaced.

**What is the agent allowed to do without human approval?**

Read Ship state for any workspace it is evaluating; run graph evaluations from queued events or scheduled sweeps; create `fleetgraph_finding` documents; create per-user delivery and read-state rows; send realtime notifications to connected users after durable rows exist; record run metadata, token costs, LangSmith trace URLs, and audit events.

**What must always require confirmation?**

Any mutation to a Ship document: editing project, program, week, issue, or person documents; changing issue status, assignee, priority, or dates; approving, unapproving, rejecting, or requesting changes on plans or reviews; posting user-authored comments or status updates; changing RACI ownership or accountability fields. These become `fleetgraph_action_proposals` that a signed-in user must explicitly approve or reject before execution.

**How does the agent know who is on a project?**

Ship documents carry owner and accountable fields at the program, project, week, and issue level. FleetGraph reads these fields from the existing document rows. Issue assignees come from the `assignee_id` on issue documents. Workspace membership and roles come from the Ship users/membership tables.

**How does the agent know who to notify?**

Notification routing follows Ship ownership hierarchy: issue risk goes to the assignee first, then to the project owner and accountable when escalation is warranted; week-level risk goes to the week owner and the accountable approver; project-level risk goes to the project owner, project accountable, and program accountable; program-level risk escalates to program accountable and workspace admins when configured. On-demand chat responses go only to the requesting user unless they explicitly share or act.

**How does the on-demand mode use context from the current view?**

The authenticated chat request includes the current route path, document ID, document type, and project ID. The graph reads the document and resolves its associated project, week, and program from Ship. The reasoning prompt is scoped to that context so answers are grounded in what the user is looking at rather than the full workspace.

---

### 2. Use Case Discovery

Ten use cases are defined in FLEETGRAPH.md covering Director, PM, Engineer, Manager, and User roles. MVP rows 1-6 include the Ship state that triggers the agent, what the agent detects or produces, what the human decides, and a shared LangSmith trace from a real run. Expansion rows 7-10 document the additional detector work with deterministic local verification plus deployed Ship runs mapped to LangSmith trace IDs on 2026-05-29; public sharing remains gated on trace-payload review.

Summary of pain points discovered before implementation:

- PMs do not know a week plan was never approved until the sprint is already in trouble.
- Directors cannot tell from the issue list alone whether a project is drifting until multiple issues slip.
- Engineers have no signal when a blocked issue has sat unresolved past the point where it will affect the sprint.
- Approved plans get quietly edited after approval with no flag that the original approval is stale.
- Projects frequently launch without an owner or accountable assigned, leaving accountability gaps that only surface in retros.
- Users have no way to ask "what should I look at next?" in context without leaving Ship to use a general AI tool.
- Overdue milestone dates can sit inside project/week properties without creating a visible delivery risk signal.
- Managers cannot quickly see workload concentration when one assignee owns materially more active work than peers.
- Scope churn is hard to spot from the current document alone because the risk is spread across recent edits, estimates, priorities, and issue associations.
- RACI drift over time can leave teams uncertain about who is responsible even when the current owner field is populated.

---

### 3. Trigger Model Decision

**When does the proactive agent run without a user present?**

Ship mutation paths (document create, update, status change) enqueue a durable job in `fleetgraph_event_queue`. A scheduled drain command processes the queue every 1–2 minutes. Before claiming jobs, the drain can enqueue a bounded sweep that scans all active projects for stale conditions not captured by mutation events.

**Poll vs. webhook vs. hybrid — what are the tradeoffs?**

Pure polling burns compute on every interval regardless of activity and misses the low-latency benefit of knowing when something changed. Pure webhook requires a public endpoint to be registered with every event source and risks missing events on deploy restarts or network failures. The hybrid approach uses internal event enqueueing (no external webhook surface, no registration overhead) for fresh mutations and polling as a backstop for missed or stale conditions. The cost of the hybrid is slightly more implementation complexity, but it is the most reliable option for an MVP on a monolith where the event queue and drain share the same database.

**How stale is too stale?**

The PRD target is less than 5 minutes from event to finding. The drain cadence of 1–2 minutes keeps worst-case latency inside that window with room for one retry. The sweep cadence of 5 minutes handles conditions that have no mutation event (long-standing stale issues, ownership gaps that existed before FleetGraph was deployed).

**What does your choice cost at 100 projects? At 1,000?**

At 12 proactive runs per project per day (one every 2 hours, matching the sweep cadence) and 3 on-demand invocations per user per day: 100 users costs $52.92/month and 1,000 users costs $529.20/month at gpt-4o-mini pricing. Full projections are in FLEETGRAPH.md.

---

## Phase 2: Graph Architecture

### 4. Node Design

**Context, fetch, reasoning, action, and output nodes:**

| Role | Node | Description |
|---|---|---|
| Context | Normalize context | Reads request payload or queue payload; produces canonical target, trigger type, idempotency key, and graph mode |
| Fetch | Load Ship context | Reads workspace, document, project, week, issue, timeline, accountability, association, and recent `document_history` rows from Ship |
| Reasoning | Detect conditions | Evaluates the evidence bundle against registered detector rules; produces candidate findings with detector ID, kind, severity, and notification/noise metadata |
| Reasoning | Rank and route | Scores severity, resolves notification audience, decides whether a mutation proposal is needed |
| Action | Persist finding | Writes `fleetgraph_finding` document, associations, and delivery rows |
| Action | HITL proposal | Creates `fleetgraph_action_proposals` row and emits LangGraph interrupt |
| Action | Human decision | Resumes the interrupted graph; executes the approved mutation or closes the rejected proposal |
| Output | Notify and record | Sends realtime notifications, writes run status, token costs, and trace URL |

**Which fetch nodes run in parallel?**

Inside Load Ship context, the project, week, issue list, timeline, accountability, and history lookups are scoped to the resolved target records. The document load for the trigger document runs first (sequential) because the project and week resolvers depend on it.

**Where are the conditional edges and what triggers each branch?**

Six branches: no-finding (idempotency key already exists or no candidate clears the threshold); finding-only (candidate is informational, no mutation needed); HITL proposal (candidate recommends a mutation, interrupt required); approved proposal (human approves, execute mutation); rejected proposal (human rejects or lacks permission, close proposal); chat (request is on-demand from the UI, return scoped answer to requester only).

---

### 5. State Management

**What state does the graph carry across a session?**

Workspace ID, user ID, route context, trigger type, trigger document, idempotency key, graph mode, evidence bundle (loaded Ship records), candidate findings, action proposal candidates, interrupt payload, and the human decision when the graph resumes.

**What state persists between proactive runs?**

`fleetgraph_finding` documents and their document associations record what was found and when. `fleetgraph_runs` rows record each run until retention prunes terminal history. `fleetgraph_monthly_cost_rollups` preserves long-lived token/cost totals before old runs are deleted. `fleetgraph_action_proposals` keeps HITL audit decisions even when the source run is later pruned. Idempotency keys on queue entries and finding properties prevent the same condition from producing a duplicate finding within the same state window. `fleetgraph_deliveries` rows track per-user read state independently of the shared finding document.

**How do you avoid redundant API calls?**

Idempotency keys on the event queue prevent the same mutation event from being enqueued twice. The finding persistence step checks for an existing open finding with the same idempotency key before writing a new one. Database-level row locks in the drain command prevent two concurrent workers from claiming the same job.

---

### 6. Human-in-the-Loop Design

**Which actions require confirmation?**

Any mutation to a Ship document: editing project, program, week, issue, or person fields; changing issue status, assignee, priority, or dates; any approval state transition; any RACI ownership or accountability field change.

**What does the confirmation experience look like in Ship?**

The action proposal appears in the FleetGraph drawer finding detail as a compact approval block showing: the proposed action title, the target document link, a before/after or payload summary, the supporting evidence, an authorization note (who can approve this action), a collapsed LangSmith trace link, and Approve / Reject / Snooze / Dismiss controls. The controls are disabled during submission. Status updates inline after decision.

**What happens if the human dismisses or snoozes?**

Dismissal and snooze update the user's `fleetgraph_deliveries` row only — the shared finding document and action proposal remain intact so other team members with permission can still see and act on them. Snoozed deliveries store a `snoozed_until` timestamp; the drawer omits them from the unread count until that time passes. Dismissed deliveries are hidden from the inbox but accessible if the user views all findings.

---

### 7. Error and Failure Handling

**What does the agent do when Ship API is down?**

Queue jobs remain in `queued` status with `locked_at` null. When the drain restarts, it picks up any previously claimed jobs whose lock has expired (lock timeout). The `attempt_count` and `last_error` columns track retries. Failed runs record the error in `fleetgraph_runs.error` but do not crash the drain loop.

**How does it degrade gracefully?**

The `GET /api/fleetgraph/status` endpoint returns a structured response reflecting current availability. The UI maps this to three visible states: Ready, Limited (tracing or model config missing), and Unavailable (config error or service unreachable). Findings already delivered remain accessible even when the agent cannot run new evaluations.

**What gets cached and for how long?**

Nothing is cached in MVP — the evidence bundle is loaded fresh on each run. Idempotency keys and finding deduplication serve the same purpose for proactive runs (avoiding redundant work without requiring a cache layer). Long-term, frequently-read workspace membership and project metadata are candidates for short-lived in-process caching.

---

## Phase 3: Stack and Deployment

### 8. Deployment Model

**Where does the proactive agent run when no user is present?**

On Render, as a scheduled cron job (`ship-fleetgraph-drain`) that calls the drain command on the existing Ship Express server. The web service handles authenticated on-demand chat requests.

**How is it kept alive?**

The Render web service stays live as a normal always-on service. The cron job is invoked by Render on the configured schedule (every minute in production). There is no separate long-running worker process for MVP.

**How does it authenticate with Ship without a user session?**

FleetGraph runs as a system actor. The drain command authenticates internally — it runs inside the Ship API process and has direct database access. On-demand chat requests are authenticated with the requesting user's session. No user session is impersonated by the proactive path.

---

### 9. Performance

**How does your trigger model achieve the < 5 minute detection latency goal?**

Mutation events are enqueued synchronously inside the Ship API request handler before the HTTP response returns, so a new event is in the queue within milliseconds of the Ship state change. The drain runs every 1–2 minutes on Render, giving a worst-case latency of approximately 2 minutes for a freshly queued event. Verified on the public deployment: a real Sprint document created at `2026-05-27T03:47:01Z` produced a delivered finding in **15.3 seconds**.

**What is your token budget per invocation?**

Proactive runs: 5,000 input tokens and 500 output tokens per run. On-demand chat: 8,000 input tokens and 800 output tokens per run. These are upper bounds based on measured gpt-4o-mini runs ($0.000243–$0.000519 per real run). Context growth is bounded by the evidence bundle size, which is capped by the number of issues and documents in the target project.

**Where are the cost cliffs in your architecture?**

The main cliff is projects with many open issues — each issue adds tokens to the evidence bundle. History-based detectors add a bounded 60-day `document_history` lookup for relevant project/week/issue/plan records, so churn and RACI analysis must keep evidence excerpts capped. The sweep running across many projects simultaneously multiplies the drain cost. On-demand chat invocations scale linearly with active users. Mitigation: the evidence bundle is pre-filtered to the most relevant signals before the LLM call; the sweep is bounded to a configurable number of projects per run, and old terminal runs are rolled up before pruning.
