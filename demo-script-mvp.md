# Final Demo Script

Purpose: 3-5 minute reviewer demo for the FleetGraph MVP submission. Target 4:30. Do not run a fresh public latency test during the recording unless the deployed app is already warm and logged in; show the completed public evidence when possible.

This script explicitly covers the MVP rubric:

- Show the deployed Ship app with FleetGraph chat and notifications.
- Show proactive detection wired end-to-end against real Ship data.
- Show LangSmith traces for different graph paths.
- Explain the graph, trigger model, human approval gate, and cost model.
- Stay within 3-5 minutes.

## Before Recording

Open these tabs before starting:

1. Deployed app: `https://ship-wf2i.onrender.com`
2. Deployed FleetGraph status or app UI with a signed-in session
3. `FLEETGRAPH.md`
4. `PRESEARCH.md`
5. LangSmith proactive finding trace: `https://smith.langchain.com/public/129c549c-b082-4377-ac3c-0cf78a2b687e/r`
6. LangSmith HITL/action proposal trace: `https://smith.langchain.com/public/fdca7b9c-92be-45a0-95a0-3a725bf6d344/r`
7. LangSmith on-demand chat trace: `https://smith.langchain.com/public/6a0f01b2-5255-4d04-9161-0da6e93d52b9/r`
8. A deployed FleetGraph finding detail or the `Deployment Evidence` section in `FLEETGRAPH.md`

Do not show local login files, session cookies, bearer tokens, or Render environment variables. If the deployed app is slow, use the recorded evidence in `FLEETGRAPH.md` instead of waiting live.

## 0:00-0:25 - Opening

Show `FLEETGRAPH.md`.

Say:

> This is my Week 5 FleetGraph MVP. FleetGraph is a Ship-native project intelligence agent: it reads real Ship project, week, issue, timeline, and ownership data; proactively detects risks; records durable findings; and exposes chat, notifications, trace links, and human approval gates inside the existing Ship UI.

Point at:

- `Agent Responsibility`
- The deployed URL: `https://ship-wf2i.onrender.com`
- The `Deployment Evidence` section

## 0:25-1:10 - Proactive Detection End To End

Show the deployed app or the `Deployment Evidence` table.

Say:

> The required proactive path is deployed and verified. A real Ship sprint document was created in the public Render app, FleetGraph received the `document.created` event, ran the graph, persisted a planning-gap finding, created delivery state for the user, and made it available through the FleetGraph findings API and UI.

Call out the public timed run:

- Real sprint document: `146712c1-ac7b-4569-81cf-b459b1fbbdc0`
- Created at: `2026-05-27T03:47:01.2066111Z`
- Delivered finding: `31c7618c-47e6-4c4e-8395-862ffe4ad3f6`
- First surfaced on poll: `15.3 seconds`
- Deployed run: `2fadd444-48ff-4515-8e0d-47d56c9788ff`

Say:

> The target was under five minutes from Ship event to surfaced finding. The public test passed at about fifteen seconds.

## 1:10-1:55 - Graph And Trigger Model

Show `Graph Diagram`, `Graph Outline`, and `Trigger Model` in `FLEETGRAPH.md`.

Say:

> FleetGraph uses a hybrid trigger model. Ship mutation paths enqueue durable jobs for low latency, and a scheduled drain plus sweep catches missed events, restarts, imports, and stale state. The graph normalizes context, loads real Ship rows, detects conditions, ranks severity, chooses an audience, persists a finding or creates an action proposal, then records metadata and notifies connected users.

Show:

- Trigger, context, load Ship data, detect, rank, persist, HITL, notify nodes
- Branches for no finding, finding-only, HITL proposal, approved proposal, rejected proposal, and chat
- Runtime marker evidence: `targeted-event-v1` and `self-healing-v1`

Say:

> I chose this over a pure cron-only model because event enqueueing keeps fresh changes fast, while the sweep is a backstop that makes the system reliable during deploys or missed events.

## 1:55-2:40 - LangSmith Traces And Use Cases

Show the `Use Cases` and `Observability` sections, then switch between the LangSmith tabs.

Say:

> The rubric required at least two shared LangSmith traces showing different execution paths. I submitted six, all generated from real Ship rows. They cover proactive finding-only detection, project churn, stale issue detection, missing ownership, human-in-the-loop action proposal, and on-demand chat.

Show these three traces during the video:

- Proactive finding-only path: `129c549c-b082-4377-ac3c-0cf78a2b687e`
- HITL/action proposal path: `fdca7b9c-92be-45a0-95a0-3a725bf6d344`
- On-demand chat path: `6a0f01b2-5255-4d04-9161-0da6e93d52b9`

Say:

> Each use case documents the Ship state that triggers the agent, what the graph should produce, whether human approval is required, and the trace or run evidence from that state.

## 2:40-3:20 - UI, Notifications, And Human Approval

Show the deployed app FleetGraph drawer if available; otherwise show the UI Integration and Human-in-the-Loop sections in `FLEETGRAPH.md`.

Say:

> FleetGraph is not a separate chatbot page. It reuses Ship's existing assistant drawer with a FleetGraph mode, a findings inbox, finding detail views, notification badges, severity-aware toasts, and contextual chat. Findings are durable Ship documents, and delivery/read state is per user.

Show:

- FleetGraph drawer or documented drawer hierarchy
- Findings inbox/detail behavior
- Human approval gate description
- `POST /api/fleetgraph/actions/:id/decision`

Say:

> FleetGraph can create findings and proposals autonomously, but it cannot mutate projects, weeks, issues, approvals, comments, or RACI ownership without a signed-in human approving the action through Ship's normal authorization path.

## 3:20-4:05 - Real Data, Costs, And Performance

Show `Performance and Cost`.

Say:

> The submitted evidence uses real Ship rows and OpenAI-backed graph runs for the trace paths. Mock rows are retained only as validation evidence for test cost math, not as the submission proof.

Call out the measured costs:

- Six shared real/model LangSmith runs
- `7,293` input tokens
- `1,747` output tokens
- `$0.002096` for the six shared runs
- `$0.000349` average per real/model run
- Public deployed run cost: `$0.000305`

Say:

> The production estimate assumes one active project per user, twelve proactive runs per project per day, and three on-demand invocations per active user per day. That gives monthly estimates of `$52.92` for 100 users, `$529.20` for 1,000 users, and `$5,292.00` for 10,000 users.

## 4:05-4:30 - Close

Show `PRESEARCH.md`, then return to the top of `FLEETGRAPH.md`.

Say:

> The two root deliverables are `PRESEARCH.md` and `FLEETGRAPH.md`. Presearch records the PRD, Ship architecture, LangGraph/LangSmith docs, and accepted engineering decisions. FleetGraph records the responsibility, trigger model, graph diagram, use cases, traces, latency proof, cost analysis, test evidence, deployment evidence, and human approval model.

End with:

> The MVP requirement was not just to design an agent, but to make it work inside Ship. This submission has a deployed graph, real Ship events, shared traces, UI access, notifications, human approval gates, cost tracking, and a public latency pass under the five-minute target.

## If Something Is Slow During The Demo

- If the deployed app is cold, show the completed `Deployment Evidence` table instead of waiting live.
- If login has expired, show the authenticated status and findings evidence already recorded in `FLEETGRAPH.md`.
- If LangSmith is slow, show the trace links and run IDs in `FLEETGRAPH.md`.
- If the FleetGraph drawer has no visible unread findings, show the delivered public finding ID and the UI test evidence in `Current Implementation Validation`.
- If a fresh public event is attempted, stop the clock only when the Ship event exists, then show the finding once it appears.

## Deliverable Coverage

| Requirement | Where to show it |
|---|---|
| Presearch checklist | `PRESEARCH.md` |
| Agent responsibility | `FLEETGRAPH.md` -> `Agent Responsibility` |
| Graph diagram and outline | `FLEETGRAPH.md` -> `Graph Diagram` and `Graph Outline` |
| Trigger model | `FLEETGRAPH.md` -> `Trigger Model` |
| At least five use cases | `FLEETGRAPH.md` -> `Use Cases` |
| LangSmith traces | `FLEETGRAPH.md` -> `Observability`; LangSmith public tabs |
| Proactive detection | `FLEETGRAPH.md` -> `Deployment Evidence` |
| Human-in-the-loop gate | `FLEETGRAPH.md` -> `Human-in-the-Loop Experience` |
| Real Ship data | `FLEETGRAPH.md` -> `Use Cases`, `Performance and Cost`, and `Deployment Evidence` |
| Chat and notifications in UI | Deployed app FleetGraph drawer; `FLEETGRAPH.md` -> `UI Integration` |
| Public deployment | `https://ship-wf2i.onrender.com`; `FLEETGRAPH.md` -> `Deployment Evidence` |
| Detection latency | Public timed run in `FLEETGRAPH.md` -> `Deployment Evidence` |
| Cost analysis | `FLEETGRAPH.md` -> `Performance and Cost` |
| Test cases | `FLEETGRAPH.md` -> `Use Cases` and `Current Implementation Validation` |
| Demo video guide | `demo-script-final.md` |

Before final submission, confirm the shared LangSmith links still open in an incognito browser and that no local credentials are visible in the recording.
