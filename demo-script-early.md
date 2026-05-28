# Early Submission Demo Script

Purpose: 3–5 minute reviewer demo for the FleetGraph Early Submission checkpoint. Target 4:00. This script covers the two sections newly due at Early Submission — Test Cases and Architecture Decisions — while grounding the reviewer in the deployed, working system.

Early Submission adds to MVP:
- Test Cases: for each use case, Ship state + expected output + LangSmith trace link.
- Architecture Decisions: framework choice, node design rationale, state management, deployment model.

## Before Recording

Open these tabs before starting:

1. Deployed app: `https://ship-wf2i.onrender.com`
2. `FLEETGRAPH.md` — scroll to **Test Cases** section
3. `FLEETGRAPH.md` — scroll to **Architecture Decisions** section
4. LangSmith proactive finding trace: `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`
5. LangSmith HITL/action proposal trace: `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`
6. LangSmith on-demand chat trace: `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`

Do not show local login files, session cookies, bearer tokens, or Render environment variables.

---

## 0:00–0:20 — Opening

Show the top of `FLEETGRAPH.md`.

Say:

> This is my FleetGraph Early Submission. The MVP delivered a deployed, proactive graph with real Ship data, LangSmith traces, HITL gates, and UI notifications. This submission adds the two Early Submission deliverables: a full Test Cases section with trace evidence for each use case, and an Architecture Decisions section documenting the key choices and tradeoffs.

---

## 0:20–1:30 — Test Cases

Scroll to the **Test Cases** section in `FLEETGRAPH.md`.

Say:

> The Test Cases section maps each use case to the exact Ship state that triggers it, the expected output, and a shared LangSmith trace from a real run against that state. These are not hypothetical — every trace was generated from real Ship rows.

Walk through three of the six rows, pausing on each:

**Row 1 — Planning gap:**

> A week document exists without an approved plan signal. FleetGraph detects the gap and delivers a planning-gap finding to the week owner. Here is the trace.

Switch to the proactive finding trace tab: `129c549c`.

Point at:
- The trigger node receiving the `document.created` event
- The Detect conditions node producing a `planning_gap` candidate
- The Persist finding node writing the `fleetgraph_finding` document

**Row 4 — HITL action proposal:**

> An approved plan changes after approval. FleetGraph detects the drift and interrupts the graph, waiting for a human to approve or reject before any mutation happens. Here is the trace.

Switch to the HITL trace tab: `fdca7b9c`.

Point at:
- The graph reaching the HITL proposal node
- The LangGraph interrupt visible in the trace
- The action proposal row created, waiting for human decision

**Row 6 — On-demand chat:**

> A signed-in user opens FleetGraph from a project route and asks a question. The graph loads the current route context, reads the live Ship state for that project, and returns a grounded answer scoped to what the user is looking at. Here is the trace.

Switch to the chat trace tab: `6a0f01b2`.

Point at:
- The context node reading the route path and document ID
- The Load Ship context node fetching the project and issue data
- The response citing real Ship records

Say:

> Six traces total, covering five detection types and three distinct execution paths: proactive finding-only, HITL interrupt, and on-demand chat.

---

## 1:30–2:30 — Architecture Decisions

Scroll to the **Architecture Decisions** section in `FLEETGRAPH.md`.

Say:

> The Architecture Decisions section documents four choices and the tradeoffs that drove each one.

Walk through each decision briefly:

**Framework — LangGraph with Postgres checkpointer:**

> I chose LangGraph because it gives me resumable graph execution through the Postgres checkpointer and a first-class interrupt mechanism for HITL gates. The alternative was a hand-rolled state machine, which would have required reimplementing checkpointing and interrupt handling from scratch. LangGraph's thread ID model also ties cleanly to Ship's run ID and finding document, making traceability straightforward.

**Node design — parallel fetch, single reasoning pass:**

> The Load Ship context node runs project, week, issue, timeline, and accountability queries concurrently. Parallelizing here keeps proactive run latency low — the single longest query dominates rather than all queries summing. The detect and rank nodes are sequential because ranking depends on all candidates being available.

**State management — idempotency keys over caching:**

> Between proactive runs, state persists in the `fleetgraph_finding` documents and the event queue, not in memory. Idempotency keys on queue entries and finding properties prevent duplicate work without requiring a cache layer. This is simpler to reason about for an MVP and has no TTL edge cases.

**Deployment — Render cron drain, same Express process:**

> The proactive agent runs as a Render cron job that calls the drain command inside the existing Ship API process. No separate long-running worker, no additional service to monitor. The tradeoff is that the drain shares resources with the web server, but at MVP scale this is a non-issue and keeps operational complexity minimal.

---

## 2:30–3:10 — Deployed System Checkpoint

Show the deployed app or the Deployment Evidence table in `FLEETGRAPH.md`.

Say:

> The deployed system is unchanged from MVP. Public URL is `https://ship-wf2i.onrender.com`. FleetGraph status returns enabled with OpenAI, gpt-4o-mini, proactive enabled, LangSmith tracing enabled. The public latency verification still stands: real Sprint document to delivered finding in 15.3 seconds.

Call out:
- Run `2fadd444-48ff-4515-8e0d-47d56c9788ff` — proactive, document.created, 1,050 input tokens, $0.000305

---

## 3:10–3:45 — UI, Notifications, and HITL Gate

Show the deployed app FleetGraph drawer, or the UI Integration section in `FLEETGRAPH.md`.

Say:

> FleetGraph is embedded in Ship's existing assistant drawer — not a standalone chatbot page. The drawer has a findings inbox, finding detail views, severity-aware toasts for critical and high findings, notification badges, and a human approval gate with approve, reject, snooze, and dismiss controls. All of these work through authenticated API routes. FleetGraph cannot mutate a Ship document without a signed-in user explicitly approving the action.

---

## 3:45–4:00 — Close

Return to the top of `FLEETGRAPH.md`.

Say:

> Early Submission delivers test case evidence for all six use cases with shared trace links, and a documented architecture decisions section covering framework, node design, state management, and deployment. The MVP foundation — deployed graph, real Ship data, proactive detection, HITL gate, embedded chat, and public latency pass — is unchanged and verified.

---

## If Something Is Slow During The Demo

- If the deployed app is cold, show the Deployment Evidence table in `FLEETGRAPH.md`.
- If LangSmith is slow, show the trace IDs and run IDs listed in `FLEETGRAPH.md` → `Observability`.
- If the FleetGraph drawer has no visible findings, show the delivered finding ID `31c7618c` and the test evidence in `Current Implementation Validation`.
- If time is running short, cut Section 4 (UI/HITL) — it was shown at MVP. Prioritize Test Cases and Architecture Decisions since those are the new rubric items.

---

## Deliverable Coverage

| Requirement | Where to show it |
|---|---|
| Test Cases — Ship state per use case | `FLEETGRAPH.md` → `Test Cases` |
| Test Cases — expected output per use case | `FLEETGRAPH.md` → `Test Cases` |
| Test Cases — trace link per use case | `FLEETGRAPH.md` → `Test Cases`; LangSmith tabs |
| Architecture Decisions — framework choice | `FLEETGRAPH.md` → `Architecture Decisions` |
| Architecture Decisions — node design rationale | `FLEETGRAPH.md` → `Architecture Decisions` |
| Architecture Decisions — state management | `FLEETGRAPH.md` → `Architecture Decisions` |
| Architecture Decisions — deployment model | `FLEETGRAPH.md` → `Architecture Decisions` |
| Proactive detection end-to-end | Deployment Evidence; proactive trace `129c549c` |
| Different execution paths | Three traces: finding-only, HITL interrupt, on-demand chat |
| Human-in-the-loop gate | HITL trace `fdca7b9c`; `FLEETGRAPH.md` → `Human-in-the-Loop Experience` |
| Deployed and publicly accessible | `https://ship-wf2i.onrender.com` |
| Detection latency under 5 minutes | Public timed run: 15.3 seconds |
| Real Ship data | All six traces generated from real Ship rows |
| Presearch checklist | `PRESEARCH.md` |

Before recording, confirm the three LangSmith trace links still open in an incognito browser and that no local credentials are visible in the recording.
