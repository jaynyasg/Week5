# FleetGraph Use Cases and Trace Plan

Last updated: 2026-05-25

Generated via `$gsd-docs-update` from `FLEETGRAPH.md`, `PRESEARCH.md`, and the PRD extract.

## Purpose

The PRD requires at least five use cases. For each use case, final submission must define the Ship state that triggers FleetGraph, what the agent detects or produces, and the LangSmith trace from a real run.

This file is the working matrix for those use cases.

## Use Case 1: Week Starts Without Approved Plan

Role: PM

Trigger:

- A week is active or starting soon.
- The week plan is missing, not approved, or changed since approval.

FleetGraph detects:

- The week is at execution risk because accountability review has not happened.
- The relevant owner and approver.
- Evidence from week document properties and weekly plan/review state.

Human decides:

- Whether to update the plan.
- Whether to request/perform approval.

Autonomous action:

- Create finding.
- Notify week owner and accountable approver.

Trace target:

- Proactive finding-only path or action-proposal path.

Trace link:

- TBD

## Use Case 2: Project Has Scope Churn or Stalled Issues

Role: Director

Trigger:

- Multiple issues are stale, reopened, or changed in a short window.
- Project timeline suggests execution drift.

FleetGraph detects:

- Project risk.
- A short explanation of the churn pattern.
- Cited issues/timeline records.

Human decides:

- Whether to change project status.
- Whether to reassign or reprioritize issues.

Autonomous action:

- Create finding.
- Notify project owner/accountable and program accountable when severity is high.

Trace target:

- Proactive finding-only path.

Trace link:

- TBD

## Use Case 3: Engineer Has a Stale or Blocked Issue

Role: Engineer

Trigger:

- Assigned issue remains in an unchanged active state beyond the chosen threshold.
- Issue appears blocked by missing context, dependency, or owner signal.

FleetGraph detects:

- The issue needs attention.
- Likely next step.
- Who should act first.

Human decides:

- Whether to update issue state, assignee, or comment.

Autonomous action:

- Create finding.
- Notify assignee first.

Trace target:

- On-demand or proactive path.

Trace link:

- TBD

## Use Case 4: Approved Plan Changes After Approval

Role: PM

Trigger:

- A weekly or project plan changes after an approved version exists.

FleetGraph detects:

- The approved plan is no longer current.
- Which document changed.
- Who approved the previous version.

Human decides:

- Whether to re-approve, request changes, or leave as-is.

Autonomous action:

- Create finding.
- Notify owner and approver.

Trace target:

- HITL action-proposal path.

Trace link:

- TBD

## Use Case 5: Missing Owner or Accountable Role

Role: Director

Trigger:

- Program/project/week lacks owner/accountable data needed for notification routing.

FleetGraph detects:

- Accountability metadata is incomplete.
- Which records are affected.
- Which likely person or role needs to fix it, if available.

Human decides:

- Whether to update RACI fields.

Autonomous action:

- Create finding.
- Notify workspace admin or nearest accountable person.

Trace target:

- Action-proposal path if FleetGraph proposes a RACI update.

Trace link:

- TBD

## Use Case 6: Context-Aware Project Chat

Role: User

Trigger:

- User opens FleetGraph from a project, week, issue, or program context and asks a question.

FleetGraph produces:

- Context-aware answer grounded in current Ship records.
- Citations to documents/issues/timeline where applicable.
- Optional finding links.
- Optional action proposal when mutation is requested.

Human decides:

- Whether to act on any proposed mutation.

Autonomous action:

- None beyond answering and optionally creating a proposal.

Trace target:

- On-demand chat path.

Trace link:

- TBD

## Trace Matrix

| Use Case | Required For MVP? | Expected Path | Trace Link | Status |
|---|---:|---|---|---|
| Week starts without approved plan | Yes | Proactive finding or HITL | TBD | Deterministic eval covers proactive `planning_gap`; LangSmith trace pending |
| Project churn/stalled issues | Yes | Proactive finding | TBD | Detector planned; trace pending |
| Stale/blocked engineer issue | Yes | Proactive or on-demand | TBD | Detector planned; trace pending |
| Approved plan changes | Yes | HITL proposal | TBD | Deterministic E2E seed and eval cover HITL `scope_drift`; LangSmith trace pending |
| Missing owner/accountable | Yes | Finding or HITL proposal | TBD | Detector planned; trace pending |
| Context-aware project chat | Yes | On-demand chat | TBD | Deterministic E2E and eval cover grounded chat; LangSmith trace pending |

Deterministic local evidence added on 2026-05-25:

- `api/src/services/fleetgraph/eval-harness.test.ts` scores proactive finding-only, HITL proposal, no-finding, and context chat paths.
- `e2e/fleetgraph.spec.ts` verifies the delivered finding UI, read-state transition, action proposal rejection, and context-aware chat response against seeded Ship data.
- Final submission still needs real LangSmith trace links from deployed or locally configured model-backed runs.

Minimum final trace set:

- One proactive finding-only trace.
- One HITL proposal trace.

Preferred final trace set:

- Proactive finding-only trace.
- HITL proposal trace.
- On-demand chat trace.
- No-finding trace.
