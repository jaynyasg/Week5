# Final Submission Demo Script

Purpose: 4–5 minute reviewer demo for the FleetGraph Final Submission. Target 4:30. This script covers all PRD rubric items across all four checkpoints, with emphasis on the Cost Analysis section newly due at Final Submission.

Final Submission adds to Early Submission:
- Cost Analysis: development spend with token breakdown, production cost projections at 3 scales with full assumptions.
- Design-review expansion documentation: four additional detectors, visual mockups/state matrices, and retention/cost rollup policy.

## Before Recording

Open these tabs before starting:

1. Deployed app: `https://ship-wf2i.onrender.com`
2. `FLEETGRAPH.md` — open to the top
3. `PRESEARCH.md`
4. LangSmith proactive finding trace: `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`
5. LangSmith HITL/action proposal trace: `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`
6. LangSmith on-demand chat trace: `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`

Do not show local login files, session cookies, bearer tokens, or Render environment variables. If the deployed app is slow, use the Deployment Evidence table in `FLEETGRAPH.md`.

---

## 0:00–0:20 — Opening

Show the top of `FLEETGRAPH.md`.

Say:

> This is my FleetGraph Final Submission. FleetGraph is a Ship-native project intelligence agent: it reads real project, week, issue, timeline, ownership, and document-history data; proactively detects risks without being asked; records durable findings; and gives engineers, PMs, and directors a context-aware assistant inside the existing Ship UI. This submission covers all rubric items: agent responsibility, graph, use cases, trigger model, test cases, architecture decisions, and cost analysis, plus the design-review expansion work.

---

## 0:20–1:00 — Agent Responsibility, Graph, and Trigger Model

Show `Agent Responsibility`, `Graph Diagram`, and `Trigger Model` in `FLEETGRAPH.md`.

Say:

> FleetGraph monitors week plans, project timelines, issue state, RACI ownership, and approval signals. It can create findings, deliver notifications, and record run metadata autonomously. It cannot mutate any Ship document without a signed-in human approving the action. Notification routing follows Ship ownership: issue risk goes to the assignee; project risk escalates to the project owner, accountable, and program accountable.

Point at the Mermaid graph diagram and say:

> The graph normalizes context, loads real Ship rows, detects conditions, ranks severity, chooses an audience, and either persists a finding or interrupts for human approval. Both the proactive and on-demand modes run through the same graph — the trigger is different, not the graph.

Point at the Trigger Model section and say:

> I chose a hybrid trigger model. Ship mutation paths enqueue durable jobs for low latency on fresh events. A scheduled drain plus sweep catches missed events, restarts, and stale state. Worst-case latency is the drain cadence — verified at 15.3 seconds on the public deployment.

---

## 1:00–1:50 — Test Cases and LangSmith Traces

Scroll to the **Test Cases** section in `FLEETGRAPH.md`.

Say:

> The test table now has six MVP trace-backed use cases plus four design-review expansion detector cases. The MVP evidence has six shared LangSmith traces generated from real Ship rows, covering three distinct execution paths. The expansion rows document overdue milestones, workload imbalance, scope churn, and RACI drift with deterministic detector tests plus deployed Ship runs mapped to LangSmith trace IDs. Those expansion trace IDs are not public links until the trace payloads are reviewed for private project data.

Show the three key traces:

**Proactive finding-only path** — trace `129c549c`:

> Ship week document with no approved plan. FleetGraph detects the planning gap, persists a finding, creates delivery state, and notifies the week owner — no human required.

**HITL interrupt path** — trace `fdca7b9c`:

> An approved plan changes after approval. FleetGraph detects the drift and interrupts the graph. The trace shows the LangGraph checkpoint paused at the approval gate. Nothing mutates until a signed-in human approves or rejects.

**On-demand chat path** — trace `6a0f01b2`:

> User opens FleetGraph from a project route. The context node reads the route path and document ID. The graph loads live Ship data for that project and returns a grounded answer citing real records.

Say:

> A graph that looks identical across every run is a pipeline, not a graph. These three traces show distinct branching: finding-only, HITL interrupt, and context-scoped chat.

---

## 1:50–2:40 — Architecture Decisions

Scroll to the **Architecture Decisions** section in `FLEETGRAPH.md`.

Say:

> Four key decisions shaped this architecture.

Walk through each quickly:

**LangGraph with Postgres checkpointer** — for resumable HITL interrupts and stable thread IDs that tie LangGraph checkpoints to Ship run rows.

**Parallel fetch in Load Ship context** — project, week, issue, timeline, and accountability queries run concurrently. The longest query dominates; queries do not sum.

**Idempotency keys over caching** — state persists between runs in finding documents and the event queue. No in-memory cache, no TTL edge cases. The same condition produces at most one open finding per state window.

**Render cron drain inside the existing Ship process** — no separate worker, no second service to monitor. The drain command shares the web server's process and database connection pool. Right-sized for MVP scale.

---

## 2:40–3:20 — Cost Analysis

Scroll to the **Performance and Cost** section in `FLEETGRAPH.md`.

Say:

> The cost analysis covers actual development spend and production projections.

Call out development spend:

- Model: `gpt-4o-mini` — chosen for low cost per token on short reasoning tasks
- Six shared real/model LangSmith runs: `7,293` input tokens, `1,747` output tokens, `$0.002096`
- Average per real/model run: `$0.000349`
- Public deployed run: `$0.000305`
- Total tracked development/test spend: `$0.002651`

Say:

> The graph runtime made zero Claude API calls — the provider is OpenAI gpt-4o-mini, so FleetGraph Claude API cost is $0.00. Development assistant billing is separate from graph runtime and not exposed to the repository.

Show the production projections table and say:

> At one active project per user, twelve proactive runs per project per day, and three on-demand invocations per user per day — using gpt-4o-mini pricing at $0.15 per million input tokens and $0.60 per million output tokens — the monthly estimate is $52.92 for 100 users, $529.20 for 1,000 users, and $5,292.00 for 10,000 users. The main cost cliff is projects with many open issues, which inflate the evidence bundle size and push individual runs toward the upper end of the per-run range.

---

## 3:20–3:55 — Deployed System and UI

Show the deployed app or Deployment Evidence in `FLEETGRAPH.md`.

Say:

> The system is deployed and publicly accessible at `https://ship-wf2i.onrender.com`. FleetGraph status returns enabled with proactive mode on, LangSmith tracing on, OpenAI provider, gpt-4o-mini model. The public timed latency run passed at 15.3 seconds — well inside the five-minute target.

Show the FleetGraph drawer in the deployed app (or the UI Integration section):

> FleetGraph is not a standalone chatbot page. It is a mode inside Ship's existing assistant drawer. The findings inbox shows delivered findings with severity markers, status, and age. Finding detail shows evidence, trace metadata, and action proposal controls. Notification badges and severity-aware toasts keep interruptions proportional — critical and high findings trigger a toast; medium and low increment the badge only. Human approval is required before any mutation to a Ship document, and the approval controls enforce Ship's existing authorization rules.

---

## 3:55–4:20 — PRESEARCH and Close

Show `PRESEARCH.md`.

Say:

> The two root deliverables are PRESEARCH.md and FLEETGRAPH.md. Presearch answers all nine checklist questions across agent responsibility, graph architecture, and deployment — sources reviewed, engineering decisions made before any code was written.

Return to the top of `FLEETGRAPH.md` and say:

> The full submission: a deployed graph running against real Ship data, proactive detection under five minutes, six LangSmith traces showing three distinct execution paths, a human-in-the-loop gate using LangGraph interrupts, an embedded context-aware chat interface, per-user notification delivery, documented architecture decisions, expanded detector documentation, and a cost model with measured development spend and defended production projections.

---

## If Something Is Slow During The Demo

- If the deployed app is cold, show the Deployment Evidence table in `FLEETGRAPH.md` instead of waiting live.
- If login has expired, show the authenticated FleetGraph status and findings evidence already in `FLEETGRAPH.md`.
- If LangSmith is slow, show the trace IDs and run IDs listed under `Observability`.
- If the FleetGraph drawer shows no unread findings, show the delivered finding `31c7618c` and the implementation validation table.
- If time is running tight, cut the Architecture Decisions walkthrough (Section 4) to one sentence each and recover 30 seconds.

---

## Deliverable Coverage

| Requirement | Where to show it |
|---|---|
| Presearch checklist | `PRESEARCH.md` |
| Agent responsibility | `FLEETGRAPH.md` → `Agent Responsibility` |
| Graph diagram and outline | `FLEETGRAPH.md` → `Graph Diagram` and `Graph Outline` |
| Trigger model | `FLEETGRAPH.md` → `Trigger Model` |
| Use cases (≥5) | `FLEETGRAPH.md` → `Use Cases` |
| MVP test cases with trace links | `FLEETGRAPH.md` → `Test Cases`; LangSmith tabs |
| Expansion detector verification | `FLEETGRAPH.md` → `Expanded Detector Verification Details` and `Expansion External Evidence`; `api/src/services/fleetgraph/detectors.test.ts` |
| Architecture decisions | `FLEETGRAPH.md` → `Architecture Decisions` |
| **Cost analysis — development spend** | `FLEETGRAPH.md` → `Performance and Cost` → `Development and Testing Costs` |
| **Cost analysis — production projections** | `FLEETGRAPH.md` → `Performance and Cost` → `Production Cost Projections` |
| Different execution paths | Traces `129c549c`, `fdca7b9c`, `6a0f01b2` |
| Human-in-the-loop gate | HITL trace `fdca7b9c`; `Human-in-the-Loop Experience` section |
| Real Ship data | All six MVP traces from real Ship rows; expansion rows have deterministic tests plus deployed Ship/LangSmith trace IDs |
| Proactive detection end-to-end | Deployment Evidence; proactive trace `129c549c` |
| Deployed and publicly accessible | `https://ship-wf2i.onrender.com` |
| Detection latency under 5 minutes | Public timed run: 15.3 seconds |
| Chat and notifications in UI | Deployed FleetGraph drawer; `UI Integration` section |

Before recording, confirm all three LangSmith trace links open in an incognito browser and that no local credentials are visible in the recording.
