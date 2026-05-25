# FleetGraph UI Plan

Last updated: 2026-05-25

Generated via `$gsd-docs-update` from the focused design review and Ship UI reference files.

## Purpose

This plan makes the FleetGraph UI concrete before implementation. It extracts the high-risk UI decisions from `FLEETGRAPH.md` into a build checklist.

## Existing Ship UI To Reuse

Verified reference files:

- `web/src/components/assistant/AskShipPanel.tsx`
- `web/src/components/assistant/AssistantMessages.tsx`
- `web/src/components/assistant/AssistantComposer.tsx`
- `web/src/components/ui/TabBar.tsx`
- `web/src/components/ui/Toast.tsx`
- `web/src/hooks/useAssistant.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`
- `shared/src/types/assistant.ts`

Reuse these patterns:

- Right-side drawer.
- Compact dark workspace styling.
- Thin borders and muted secondary text.
- Existing toast provider.
- Existing realtime subscription hook.
- Existing route-context pattern from `AssistantRouteContext`.

Avoid:

- Standalone chatbot page.
- Marketing layout.
- Decorative AI branding.
- Dashboard card grid.
- Nested cards inside the drawer.

## Main User Flows

### Flow 1: Open FleetGraph From Rail

1. User clicks the existing assistant rail button.
2. Drawer opens.
3. User sees Ask Ship and FleetGraph modes.
4. FleetGraph mode shows context-filtered findings when the current route provides document/project context.
5. If no findings exist, the user sees a useful empty state and can ask a contextual question.

### Flow 2: New Finding Notification

1. Backend commits a finding document and delivery row.
2. Backend emits `fleetgraph:finding-delivered`.
3. Rail badge increments.
4. High/critical finding also shows a toast.
5. Toast action opens FleetGraph directly to the finding detail.

### Flow 3: Human Approval

1. User opens a finding with a pending action proposal.
2. UI shows proposed action, target, evidence, and authorization note.
3. Authorized user approves or rejects.
4. UI disables controls while submitting.
5. UI updates status in place and preserves the finding detail.
6. Unauthorized user sees read-only proposal and who can act.

### Flow 4: On-Demand Chat

1. User opens FleetGraph from project/week/issue/program context.
2. Composer sends message plus route context.
3. Response cites Ship records and may link to relevant findings.
4. If FleetGraph proposes a mutation, it creates an action proposal rather than executing immediately.

## Component Plan

Suggested components:

- `FleetGraphPanel`
- `FleetGraphModeTabs`
- `FleetGraphStatusBanner`
- `FleetGraphFindingsInbox`
- `FleetGraphFindingRow`
- `FleetGraphFindingDetail`
- `FleetGraphEvidenceList`
- `FleetGraphActionProposal`
- `FleetGraphRunDetails`
- `FleetGraphComposer`
- `FleetGraphEmptyState`

Likely integration point:

- Extend `AskShipPanel` to host modes, or wrap the current Ask Ship panel content in a new assistant shell component.

Do not rewrite Ask Ship internals unless needed to create a shared shell.

## Drawer Layout

```text
+--------------------------------------------------+
| Header                                           |
| Ask Ship | FleetGraph        status / close      |
+--------------------------------------------------+
| Findings inbox OR selected finding detail        |
|                                                  |
| Severity + summary                               |
| Target + context                                 |
| Evidence                                         |
| Recommended next step                            |
| Action proposal gate, when present               |
| Run details, collapsed                           |
+--------------------------------------------------+
| Composer / contextual prompt shortcuts           |
+--------------------------------------------------+
```

Desktop:

- Keep current `max-w-[420px]` drawer width.
- Keep `fixed inset-y-0 right-0`.
- Header and composer stay pinned.
- Body scrolls.

Mobile:

- Full viewport width below 640px.
- Header sticky at top.
- Composer pinned at bottom.
- Finding inbox/detail uses drill-in, not side-by-side.

## Interaction States

| Surface | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Status | "Checking FleetGraph" | Not applicable | "FleetGraph unavailable" with retry | "Ready" | "Limited" when config is missing |
| Inbox | Skeleton rows | No findings plus ask action | Inline retry | Sorted rows | Rows plus partial warning |
| Detail | Detail skeleton | Select a finding | Back-to-list retry | Evidence and controls | Missing evidence/trace labeled |
| Chat | Thinking state | Prompt shortcuts | Assistant failure message | Cited answer | Partial context warning |
| Proposal | Submitting state | Block hidden | Inline retry | Status updated | Read-only unauthorized state |
| Notifications | Badge updates | Badge hidden | Toast for action failure | Opens detail | Badge reconciles after fetch |

## Copy Rules

Good FleetGraph copy is specific and calm:

- "Week plan changed after approval"
- "3 issues are stale in FleetGraph"
- "Approve proposed issue status change"
- "No FleetGraph findings for this project"

Avoid:

- "Unlock insights"
- "AI-powered intelligence"
- "No items found"
- "Something went wrong" without recovery path

## Accessibility Plan

Required:

- Drawer keeps `role="dialog"`.
- Ask Ship/FleetGraph tabs have accessible labels and selected state.
- Finding rows are keyboard-focusable buttons or links.
- Action proposal buttons have visible focus.
- Badge changes use polite live regions.
- Critical action failures can use assertive live region.
- Status color always has text.
- Touch targets are at least 44px on mobile.

Manual checks:

- Open drawer with keyboard.
- Switch tabs with keyboard.
- Move through findings list.
- Open finding detail.
- Approve/reject proposal.
- Return to inbox.
- Send a FleetGraph chat message.

## UI Test Plan

Add focused UI tests or E2E fixtures for:

- Empty inbox.
- Loading inbox.
- Error inbox.
- Finding detail success state.
- Finding missing trace state.
- Pending action proposal.
- Unauthorized action proposal.
- Snoozed and dismissed delivery state.
- Mobile full-screen drawer.
- Toast does not cover composer on mobile.

## Open Questions

- Should Ask Ship and FleetGraph share one transcript history or maintain separate histories?
- Should FleetGraph mode auto-open for critical findings, or only toast/badge?
- Should read state change when a row is focused, opened, or explicitly marked read?

Recommended defaults:

- Separate histories by mode.
- Do not auto-open the drawer.
- Mark read when finding detail is opened.

