# WebSocket Reconnect UI

Date: 2026-05-20

## Baseline Gap

The editor already had a compact `sync-status` live region and y-websocket already retried automatically, but the UI collapsed several materially different states:

- Cached local content could be shown as `Cached` even after the collaboration WebSocket disconnected.
- Users did not get a visible recovery banner explaining that edits were local while reconnection continued.
- There was no manual retry affordance for collaboration transport failures.
- Expired sessions during collaboration reconnect did not trigger a lightweight session probe from the editor path.

## Fix

- Added a typed sync status display helper.
- Added explicit `Reconnecting` and `Disconnected` states.
- Added an offline/reconnect recovery banner with `aria-live="polite"`.
- Added an icon retry control that calls `provider.connect()`.
- Added a throttled `/api/auth/session` probe on collaboration connection failures, reusing the app's existing expired-session redirect behavior.

## Verification

Commands:

```powershell
pnpm --filter @ship/web test -- src/components/editor/syncStatus.test.ts
pnpm type-check
pnpm build:web
git diff --check
```

Results:

- Focused web test passed: 1 file, 4 tests.
- Type-check passed across shared, api, and web.
- Web production build passed through the cross-platform build script.
- Diff whitespace check passed.
