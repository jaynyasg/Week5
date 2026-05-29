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
4. LangSmith proactive finding trace — open this exact URL and leave it in a tab named mentally as **129c549c**:
   `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`
5. LangSmith HITL/action proposal trace — open this exact URL and leave it in a tab named mentally as **fdca7b9c**:
   `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`
6. LangSmith on-demand chat trace — open this exact URL and leave it in a tab named mentally as **6a0f01b2**:
   `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`
7. Ask Ship drawer ready with this question: `What's at risk on this project?`

Do not show local login files, session cookies, bearer tokens, or Render environment variables.

When the script says "switch to trace `129c549c`", it means switch to the already-open browser tab whose LangSmith URL starts with that public trace ID. If the tab is missing, paste the full URL from this list; do not search LangSmith live during the recording.

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

Switch to the proactive finding trace tab:

1. Use the browser tab with URL `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`.
2. If it is not open, paste that full URL into a new tab.
3. In the LangSmith trace view, show the run tree/timeline on the left or center of the page.

Point at:
- The trigger node receiving the `document.created` event
- The Detect conditions node producing a `planning_gap` candidate
- The Persist finding node writing the `fleetgraph_finding` document

**Row 4 — HITL action proposal:**

> An approved plan changes after approval. FleetGraph detects the drift and interrupts the graph, waiting for a human to approve or reject before any mutation happens. Here is the trace.

Switch to the HITL trace tab:

1. Use the browser tab with URL `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`.
2. If it is not open, paste that full URL into a new tab.
3. In the LangSmith trace view, show the branch where the graph stops at the human approval/action proposal step.

Point at:
- The graph reaching the HITL proposal node
- The LangGraph interrupt visible in the trace
- The action proposal row created, waiting for human decision

**Row 6 — On-demand chat:**

> A signed-in user opens FleetGraph from a project route and asks a question. The graph loads the current route context, reads the live Ship state for that project, and returns a grounded answer scoped to what the user is looking at. Here is the trace.

Switch to the chat trace tab:

1. Use the browser tab with URL `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`.
2. If it is not open, paste that full URL into a new tab.
3. In the LangSmith trace view, show the context-loading and response-generation steps.

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

## 3:10–3:45 — UI, Ask Ship Retrieval, Notification Rules, and HITL Gate

Show the deployed app FleetGraph drawer, or the UI Integration section in `FLEETGRAPH.md`.

Say:

> FleetGraph is embedded in Ship's existing assistant drawer — not a standalone chatbot page. The drawer has a findings inbox, finding detail views, notification badges, and a human approval gate with approve, reject, snooze, and dismiss controls. Notifications are now user-configurable: each signed-in user can choose the toast severity threshold, whether action-required findings always toast, and whether unread badge counts appear. The old hardcoded critical/high toast rule is now just the default preference, not the only team policy. FleetGraph cannot mutate a Ship document without a signed-in user explicitly approving the action.

Point at:
- FleetGraph notification controls: toast threshold, action-required toast toggle, unread badge toggle
- The unread badge in the assistant tab
- The human approval controls in a finding detail

Then open Ask Ship and ask:

```text
What's at risk on this project?
```

Say:

> I also closed a product gap between the two assistant surfaces. FleetGraph findings are no longer siloed in the FleetGraph drawer: new and updated `fleetgraph_finding` documents are indexed into the same Ask Ship retrieval table, and existing findings are backfilled when the assistant schema initializes. That means Ask Ship can reuse FleetGraph's previous analysis and cite a finding when a PM asks what is at risk, instead of rediscovering the same risk from scratch.

Point at:
- Ask Ship returning a cited answer from FleetGraph evidence, if deployed
- Or the implementation note: `fleetgraph_finding` documents are indexed into `assistant_search_chunks`

---

## 3:45–4:05 — Close

Return to the top of `FLEETGRAPH.md`.

Say:

> Early Submission delivers test case evidence for all six use cases with shared trace links, and a documented architecture decisions section covering framework, node design, state management, and deployment. The MVP foundation — deployed graph, real Ship data, proactive detection, HITL gate, embedded chat, FleetGraph findings available to Ask Ship retrieval, and public latency pass — is unchanged and verified.

---

## If Something Is Slow During The Demo

- If the deployed app is cold, show the Deployment Evidence table in `FLEETGRAPH.md`.
- If LangSmith is slow, show the trace IDs and run IDs listed in `FLEETGRAPH.md` → `Observability`.
- If the FleetGraph drawer has no visible findings, show the delivered finding ID `31c7618c` and the test evidence in `Current Implementation Validation`.
- If Ask Ship does not cite a FleetGraph finding because the latest deploy has not rolled out, show the implementation summary and continue; do not wait live.
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
| Ask Ship reuses FleetGraph findings | Ask Ship drawer; indexed `fleetgraph_finding` documents in `assistant_search_chunks` |
| User-configurable FleetGraph notification rules | FleetGraph drawer notification controls; `/api/fleetgraph/preferences` |
| Deployed and publicly accessible | `https://ship-wf2i.onrender.com` |
| Detection latency under 5 minutes | Public timed run: 15.3 seconds |
| Real Ship data | All six traces generated from real Ship rows |
| Presearch checklist | `PRESEARCH.md` |

Before recording, confirm the three LangSmith trace links still open in an incognito browser and that no local credentials are visible in the recording.
