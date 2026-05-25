---
title: "Phase 13 - WebSocket Reconnect UI"
date: 2026-05-20
status: complete
parent: AUDIT.md
---

# Phase 13 - WebSocket Reconnect UI

## Goal

Close the runtime-resilience stretch follow-up documented in `AUDIT.md`, `SUBMISSION.md`, and `eval/results/error-after.md`: collaboration reconnects were technically handled by Yjs, but the editor UI did not clearly tell users when they were editing cached content while the WebSocket recovered.

## Implementation

- Added `web/src/components/editor/syncStatus.ts` as a small typed display-state helper.
- Added `web/src/components/editor/syncStatus.test.ts` to cover the healthy, cached, reconnecting, and offline states.
- Updated `web/src/components/Editor.tsx` so WebSocket disconnects with cached content show `Reconnecting` instead of the ambiguous `Cached`.
- Added a full-width recovery banner for offline/reconnecting/disconnected states.
- Added an icon retry button that calls `provider.connect()` while preserving y-websocket automatic retry.
- Added a throttled `/api/auth/session` check after collaboration connection failures so expired sessions reuse the existing login-expiration path.
- Kept the existing `role="status"` / `aria-live="polite"` sync region and added `data-sync-status` for testability.

## Verification

```powershell
pnpm --filter @ship/web test -- src/components/editor/syncStatus.test.ts
pnpm type-check
pnpm build:web
git diff --check
```

## Outcome

The editor now gives users a clear recovery model:

- `Saved` means collaboration is connected.
- `Cached` means local cache loaded while initial connection opens.
- `Reconnecting` means local edits continue while collaboration is restored.
- `Offline` means the browser is offline and local edits will sync when the network returns.
- `Disconnected` means the server-side collaboration path is unavailable and can be retried.
