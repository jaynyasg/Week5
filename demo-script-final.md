# Final Submission Demo Script

Purpose: 4-5 minute reviewer demo for the FleetGraph Final Submission. Target 4:30. This version should mainly answer: **what changed after the Early Submission?** It includes a short FleetGraph recap, then focuses on final-submission additions: cost analysis, detector expansion, design/retention work, Ask Ship integration, notification preferences, ops dashboard, detector tuning, and replayable evaluation scenarios.

Early Submission already covered:
- MVP graph behavior, real Ship data, public deployment, HITL gate, UI drawer, notifications, test cases, and architecture decisions.
- Six MVP LangSmith traces showing proactive finding-only, HITL interrupt, and on-demand chat paths.

Final Submission adds:
- Cost Analysis: actual development spend, token breakdown, and production projections at 100 / 1,000 / 10,000 users.
- Expanded detector work: overdue milestones, workload imbalance, scope churn rate, and RACI drift.
- Design-review follow-through: mockup/state documentation, drawer state hierarchy, approval gate states, notification preferences, and retention policy.
- Production-trust surfaces: FleetGraph ops dashboard, detector tuning controls, and replayable evaluation scenarios.
- Cross-surface intelligence: FleetGraph findings indexed into Ask Ship retrieval.

## Before Recording

Open these tabs before starting:

1. Deployed app: `https://ship-wf2i.onrender.com`
2. `FLEETGRAPH.md` -> top of the file
3. `FLEETGRAPH.md` -> `Performance and Cost`
4. `FLEETGRAPH.md` -> `Operations, Tuning, And Replay Harness`
5. `FLEETGRAPH.md` -> `Design Review Completion`
6. Deployed FleetGraph drawer open to: Findings, Ops, Tuning, Replay
7. Ask Ship drawer ready with: `What's at risk on this project?`
8. Optional LangSmith tabs if asked to show prior evidence:
   - Proactive finding trace: `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`
   - HITL/action proposal trace: `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`
   - On-demand chat trace: `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`

Do not show local login files, session cookies, bearer tokens, or Render environment variables. Do not spend time re-walking every MVP trace unless the reviewer asks; the final demo should emphasize the delta after Early Submission.

---

## 0:00-0:25 — Brief Project Recap

Show the top of `FLEETGRAPH.md`.

Say:

> FleetGraph is a Ship-native project intelligence agent. It reads real Ship project, issue, week, timeline, ownership, approval, and document-history data; proactively detects delivery risks; records durable findings; and exposes those findings inside Ship's existing assistant drawer.

Then say:

> The Early Submission already proved the core graph: deployed app, real Ship data, proactive detection under five minutes, LangSmith traces, human-in-the-loop approval, and architecture decisions. This final demo focuses on what changed after that checkpoint.

Point briefly at:
- `Agent Responsibility`
- `Graph Diagram`
- `Trigger Model`

Say:

> Those baseline sections are still here for rubric completeness, but I am not going to spend most of the final demo re-presenting the Early Submission.

---

## 0:25-1:15 — Final Deliverable: Cost Analysis

Scroll to `Performance and Cost`.

Say:

> The biggest new Final Submission requirement is the cost analysis. I added actual tracked development and testing spend, token breakdown, average cost per graph run, and production projections at three scales.

Call out:
- Model: `gpt-4o-mini`
- Six shared real/model LangSmith runs: `7,293` input tokens, `1,747` output tokens, `$0.002096`
- Average per real/model run: `$0.000349`
- Public deployed run: `$0.000305`
- Total tracked development/test spend: `$0.002651`
- Claude API runtime cost: `$0.00`, because FleetGraph runtime uses OpenAI

Say:

> For production, the assumptions are explicit: one active project per user, twelve proactive runs per project per day, three on-demand invocations per user per day, and gpt-4o-mini pricing. That gives monthly estimates of $52.92 for 100 users, $529.20 for 1,000 users, and $5,292.00 for 10,000 users.

Point at the projection table and say:

> The main risk in the cost model is not user count by itself; it is large projects with many open issues, because bigger evidence bundles increase tokens per run.

---

## 1:15-2:05 — Detector Expansion After Early Submission

Scroll to the detector catalog, use cases, or `Expanded Detector Verification Details`.

Say:

> After Early Submission, I expanded FleetGraph from the MVP detector set into a more scalable detector architecture. Detectors are registry-backed functions with metadata for ID, kind, default severity, notification/noise defaults, and history windows.

Call out the new detector types:
- Overdue milestones: uses project timeline fields like `target_date`, `due_date`, `planned_end_date`, and `end_date`
- Workload imbalance: compares active issue counts and estimates by assignee
- Scope churn rate: uses `document_history` to detect repeated scope-related changes
- RACI drift: uses ownership/accountability history to detect repeated role changes

Say:

> The key design point is that adding a detector does not require a new graph. Each detector takes the same Ship evidence bundle and returns candidates. The graph ranking, persistence, notification, tracing, and UI paths stay shared.

Point at test/evidence rows and say:

> These expansion cases are documented in `FLEETGRAPH.md`, backed by deterministic detector tests, and also exercised through deployed Ship runs with audited public LangSmith trace links.

---

## 2:05-2:45 — Design Review Follow-Through

Scroll to `Design Review Completion`.

Say:

> The design review found three gaps after the MVP: more detector types, visual mockups, and long-term retention. I closed those as documentation and implementation work instead of just leaving them as notes.

Walk through quickly:

**More detection types:**

> Added the four expansion detectors plus registry metadata, severity defaults, noise defaults, and detector tests.

**Visual mockups:**

> Documented the drawer hierarchy and key states: unread, read, snoozed, dismissed, evidence detail, trace detail, action proposal states, notification preferences, and mobile drawer behavior.

**Retention policy:**

> Added retention guidance for queue events, runs, findings, deliveries, HITL proposals, checkpoints, and monthly cost rollups so the system has a path beyond demo-scale data growth.

---

## 2:45-3:45 — Production-Trust UI Additions

Open the deployed app and show the FleetGraph drawer tabs.

Say:

> The other major change after Early Submission is operational trust. I added the surfaces I would want before giving this to a real team: Ops, Tuning, and Replay.

**Findings:**

> Findings remain the core risk inbox: severity, status, age, evidence, rationale, trace metadata, and human approval actions.

Open Ask Ship and ask:

```text
What's at risk on this project?
```

Say:

> I also connected FleetGraph to Ask Ship retrieval. New and existing `fleetgraph_finding` documents are indexed into Ask Ship's vector retrieval pipeline, so the chat surface can reuse FleetGraph's prior analysis instead of rediscovering the same risks from scratch.

**Ops:**

> The Ops tab shows queue depth, recent runs, detector volume, pending approval gates, average latency, token cost, and last successful sweep. This makes FleetGraph operable and debuggable, not just demoable.

**Tuning:**

> The Tuning tab lets workspace admins enable or disable detectors, override severity, and adjust thresholds like stale-days and churn windows. This matters because different teams have different alert tolerance.

**Replay:**

> The Replay tab saves a route context plus expected checks, reruns FleetGraph manually, and stores an evaluation report. That makes demos, regression checks, and LangSmith trace refreshes repeatable when Ship state changes.

Also point out notification controls if visible:

> Notification rules are user-configurable now: toast threshold, action-required behavior, and unread badge behavior are preferences instead of hardcoded critical/high logic.

---

## 3:45-4:15 — Baseline Evidence Still Stands

Show `Deployment Evidence`, `Test Cases`, or the LangSmith tabs only briefly.

Say:

> The Early Submission evidence still stands underneath these additions: the public app is deployed at `https://ship-wf2i.onrender.com`, FleetGraph status reports proactive mode and LangSmith tracing enabled, and the timed public latency run surfaced a real finding in 15.3 seconds.

If showing traces, keep it short:

> The three trace paths are still available: proactive finding-only, HITL interrupt, and on-demand chat. I am only showing them briefly here because they were the focus of the Early Submission; the final delta is cost, expansion, operations, tuning, and replay.

---

## 4:15-4:35 — Close

Return to the top of `FLEETGRAPH.md`.

Say:

> In short: Early Submission proved the graph works. Final Submission makes it more complete and more production-trustworthy: cost model, expanded detectors, documented design and retention, Ask Ship retrieval reuse, configurable notifications, an ops dashboard, detector tuning, and replayable evaluations.

Then say:

> The two root deliverables remain `PRESEARCH.md` and `FLEETGRAPH.md`; `FLEETGRAPH.md` now contains both the original MVP/Early evidence and the final-submission additions.

---

## If Something Is Slow During The Demo

- If the deployed app is cold, show `FLEETGRAPH.md` -> `Deployment Evidence`.
- If the Ops, Tuning, or Replay tabs are not visible in the deployed UI yet, show `FLEETGRAPH.md` -> `Operations, Tuning, And Replay Harness` and mention the committed files.
- If Ask Ship does not cite a FleetGraph finding live, show the implementation note that `fleetgraph_finding` documents are indexed into `assistant_search_chunks`.
- If LangSmith is slow, show the trace IDs and run IDs listed under `Observability`.
- If time is tight, skip the baseline LangSmith trace walkthrough. That was Early Submission evidence.

---

## Final Delta Coverage

| Final-change area | Where to show it |
|---|---|
| Brief project recap | `FLEETGRAPH.md` -> top, `Agent Responsibility`, `Graph Diagram` |
| Cost analysis - development spend | `FLEETGRAPH.md` -> `Performance and Cost` -> `Development and Testing Costs` |
| Cost analysis - production projections | `FLEETGRAPH.md` -> `Performance and Cost` -> `Production Cost Projections` |
| Expanded detector registry | `FLEETGRAPH.md` -> detector catalog; `api/src/services/fleetgraph/detectors.ts` |
| Overdue milestone detector | `FLEETGRAPH.md` -> expansion detector cases |
| Workload imbalance detector | `FLEETGRAPH.md` -> expansion detector cases |
| Scope churn detector | `FLEETGRAPH.md` -> expansion detector cases |
| RACI drift detector | `FLEETGRAPH.md` -> expansion detector cases |
| Visual mockups/state documentation | `FLEETGRAPH.md` -> `Design Review Completion` |
| Long-term retention policy | `FLEETGRAPH.md` -> retention/cost rollup policy |
| Ask Ship reuses FleetGraph findings | Ask Ship drawer; indexed `fleetgraph_finding` documents |
| User-configurable notification rules | FleetGraph drawer notification controls; `/api/fleetgraph/preferences` |
| FleetGraph ops dashboard | FleetGraph drawer -> `Ops`; `/api/fleetgraph/ops` |
| Detector tuning controls | FleetGraph drawer -> `Tuning`; `/api/fleetgraph/detectors` |
| Replayable evaluation harness | FleetGraph drawer -> `Replay`; `/api/fleetgraph/replay/scenarios` |

## Baseline Coverage To Mention Briefly

| Early/MVP area | Where to show it if asked |
|---|---|
| Proactive detection end-to-end | Deployment Evidence; trace `129c549c` |
| HITL gate | Trace `fdca7b9c`; `Human-in-the-Loop Experience` |
| On-demand chat path | Trace `6a0f01b2` |
| Real Ship data | `FLEETGRAPH.md` -> `Test Cases` |
| Deployment | `https://ship-wf2i.onrender.com` |
| Detection latency under 5 minutes | Public timed run: 15.3 seconds |

Before recording, confirm the deployed app and the three optional LangSmith trace links open in an incognito browser and that no local credentials are visible in the recording.
