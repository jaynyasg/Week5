# Runtime Error Handling After Evidence

Captured: 2026-05-20

## Target

PDF Category 6 required fixing 3 runtime error-handling gaps, with at least one user-facing data-loss or confusion scenario.

## Implemented Fixes

| Gap | Baseline | After |
|---|---|---|
| Top-level React crash handling | No top-level `ErrorBoundary`; render errors could white-screen the app | `web/src/main.tsx` wraps the React tree in `ErrorBoundary`; `web/src/components/ui/ErrorBoundary.tsx` shows a recovery UI and captures the error |
| Client global error capture | No `window.error` / `unhandledrejection` listeners | `web/src/lib/errorCapture.ts` installs both listeners and logs captured errors through the shared utility |
| Server escaped error handling | No global Express error handler | `api/src/middleware/errorHandler.ts` captures errors and returns structured JSON 4xx/5xx responses; `api/src/app.ts` mounts it |
| Server unhandled rejections | No `process.on('unhandledRejection')` handler | `api/src/index.ts` captures unhandled rejections through `@ship/shared` |
| Collaboration reconnect UI | Sync badge did not distinguish cached reconnect from healthy sync | Phase 13 adds explicit `Reconnecting`/`Disconnected`/`Offline` states, a recovery banner, retry controls, and a session check that uses existing login-expiration handling |

## Shared Capture Utility

`shared/src/errorCapture.ts` provides the in-house capture path required by Ship's no-third-party-telemetry constraint:

- Normalizes `unknown` errors into `CapturedError` records.
- Keeps the most recent 100 records in memory.
- Exposes `captureError`, `getCapturedErrors`, and `clearCapturedErrors`.

## Verification

Commands run during the Phase 2 pass:

```powershell
pnpm type-check
pnpm --filter @ship/api test
```

Results:

- `pnpm type-check` passed across shared, api, and web.
- Full API suite passed: 28 files, 455 tests.
- The full API run exercised expected Express error paths; CSRF and forced database-error tests returned structured handled responses rather than crashing the process.

## Phase 13 Stretch Closure

The deferred WebSocket reconnect UI was closed after the core PDF target was met. The editor now announces collaboration recovery states through the existing `sync-status` live region, shows a full-width recovery banner while offline or reconnecting, provides a retry control for reachable-network failures, and probes `/api/auth/session` after collaboration transport failures so expired sessions reuse the app's existing login recovery path.
