# FleetGraph Visual Mockups

Last updated: 2026-05-29

These mockups capture the implemented FleetGraph drawer hierarchy, finding states, notification preferences, and human approval gate. They are intentionally low-fidelity so the repo can keep the UI contract close to the implementation without adding a separate design-tool dependency.

Approved direction:

- Keep FleetGraph inside the existing Ask Ship drawer.
- Use compact operational rows, not a marketing-style AI surface.
- Keep all mutation paths behind the approval gate.
- Treat notification preferences as a small settings surface inside FleetGraph, not a separate notification center.

## Drawer: Findings Inbox

```text
+--------------------------------------------------+
| Ask Ship     FleetGraph  3                       |
| Ready                                      X      |
+--------------------------------------------------+
| Context: Launch Project                          |
|                                                  |
| [High] Week plan needs approval              12m |
|        Week 5                                   > |
|        Unread                                   |
|                                                  |
| [Med]  Workload imbalance: owner-1           34m |
|        Launch Project                           > |
|        Read                                     |
|                                                  |
| [Med]  Ownership incomplete                   1h |
|        Program Alpha                            > |
|        Snoozed until tomorrow                   |
+--------------------------------------------------+
| What's at risk on this project?             Send |
+--------------------------------------------------+
```

Behavior:

- Inbox rows stay compact and scannable.
- The unread badge is driven by per-user delivery rows.
- Current route context filters the first view before global findings.
- Empty/error/loading states use the same row heights to avoid drawer jump.

State coverage:

| State | Row treatment | Primary action |
|---|---|---|
| Unread | Stronger severity marker, unread label, contributes to badge | Open detail |
| Read | Normal text weight, no unread label | Open detail |
| Snoozed | Snooze-until text replaces age when active | Unsnooze or open detail |
| Dismissed | Hidden from default inbox; visible in filtered audit view | Reopen when allowed |
| Action pending | Action label visible beside status | Open approval gate |

## Drawer: Finding Detail

```text
+--------------------------------------------------+
| < Findings        FleetGraph                     |
+--------------------------------------------------+
| High                                                 |
| Week plan needs approval: Week 5                    |
|                                                      |
| Summary                                              |
| The active week does not have an approved plan.      |
|                                                      |
| Evidence                                             |
| - Week 5: active week without approved weekly plan   |
| - Weekly Plan: approval status is missing            |
|                                                      |
| Target                                               |
| Week 5                          Open document        |
|                                                      |
| Run details                         collapsed        |
| Trace, run id, model, token cost                     |
+--------------------------------------------------+
| Ask a follow-up about this finding              Send |
+--------------------------------------------------+
```

Behavior:

- The severity, target, evidence, and next step are visible before run metadata.
- Run details are present for graders and debugging but collapsed by default.
- The detail remains open after read, snooze, dismiss, approve, or reject actions.

## Human Approval Gate

```text
+--------------------------------------------------+
| Action Proposal                                   |
| Request plan re-review                            |
|                                                    |
| Target: Week Plan                                 |
| Reason: approved plan changed after approval      |
| Payload: request_update                           |
|                                                    |
| Authorization                                     |
| Requires a signed-in user with edit permission.   |
|                                                    |
| [Approve]  [Reject]             Snooze  Dismiss   |
+--------------------------------------------------+
```

Behavior:

- FleetGraph never mutates Ship state directly from detection.
- Approve/reject submit through authenticated action-decision routes.
- Unauthorized users see the proposal and evidence, but controls stay read-only.
- Submission errors stay inside the proposal block.

Approval states:

| State | UI treatment |
|---|---|
| Pending | Approve and Reject enabled for authorized users |
| Approved | Decision note, approver, and timestamp replace action buttons |
| Rejected | Rejection note remains visible with evidence |
| Failed | Error message stays inside the approval block with retry when safe |

## Notification Preferences

```text
+--------------------------------------------------+
| Notification rules                                |
|                                                    |
| Toast threshold       [ Off | Low | Med | High ]  |
| Action-required toast [x]                         |
| Unread badge          [x]                         |
+--------------------------------------------------+
```

Behavior:

- The old hardcoded high/critical toast rule is now the default user preference.
- Teams with lower noise tolerance can turn off toasts without losing inbox state.
- Action-required toasts can remain enabled even when general toasts are quiet.

## Mobile Drill-In

```text
+------------------------------+
| FleetGraph  3             X  |
+------------------------------+
| [High] Week plan needs       |
|        approval              |
|        Week 5             >  |
|                              |
| [Med] Workload imbalance  >  |
|                              |
+------------------------------+
| What's at risk?         Send |
+------------------------------+

+------------------------------+
| < Findings                   |
+------------------------------+
| High                         |
| Week plan needs approval     |
|                              |
| Evidence                     |
| - Week 5                     |
| - Weekly Plan                |
|                              |
| [Approve]                    |
| [Reject]                     |
+------------------------------+
| Follow up               Send |
+------------------------------+
```

Behavior:

- The drawer becomes full-screen below 640px.
- Inbox and detail use a drill-in pattern instead of split panes.
- Touch targets for action controls remain at least 44px tall.
