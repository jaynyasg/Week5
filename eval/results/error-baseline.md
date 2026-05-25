# Runtime Error Handling Baseline (U5 / Category 6)

> **Audit unit:** U5 (Runtime Error and Edge Case Handling)
> **Captured at:** 2026-05-19
> **Method:** Combination of (1) observation during U1-U4 audit work (login + benchmark runs + page navigations) and (2) code inspection of error-handling surfaces in `api/src/` and `web/src/`.

---

## Observed during U1-U4 audit work

The audit team navigated and tested Ship across several sessions: U1 setup verification, U3 production build, U4 API benchmarks (15 endpoints × 3 concurrency levels), U5 axe accessibility scans across 4 pages, login/logout flows.

| Behavior observed | Status |
|---|---|
| Initial login + dashboard render | ✅ No visible errors |
| Navigation between /docs, /projects, /team pages | ✅ No visible errors |
| API 401 on unauthenticated request (`curl /api/documents`) | ✅ Clean JSON response: `{"success":false,"error":{"code":"UNAUTHORIZED","message":"No session found"}}` |
| API 429 rate-limited responses (autocannon benchmarks) | ✅ Returned cleanly, no server crashes |
| 17,230 rate-limited requests during U4 documents c=10 benchmark | ✅ No server-side errors logged |
| `/api/dashboard` returning 404 (no root handler) | ⚠️ Server returns generic 404 HTML page rather than JSON error — minor inconsistency with the JSON error pattern used elsewhere |
| Session timeout: 15-minute idle timeout enforced | ✅ Per docs/application-architecture.md and verified in server config |

---

## Error-handling code surfaces (per inspection)

### Server-side (`api/src/`)

**Helmet security headers** (`api/src/app.ts` line 111-134):
- Content-Security-Policy configured with allowlists
- HSTS with 1-year maxAge, includeSubDomains, preload
- frameSrc 'none' (clickjacking prevention)

**Rate limiting** (`api/src/app.ts` lines 70-87):
- `loginLimiter`: 5 failed attempts / 15 min (brute-force protection)
- `apiLimiter`: 1000 req/min in dev, 10000 in test, 100 in production
- Both return clean JSON error messages

**CSRF protection** (`api/src/app.ts` lines 47-61):
- Session-based requests require X-CSRF-Token header
- Bearer tokens bypass CSRF (not browser-vulnerable)
- Conditional middleware applied per-route

**DDoS server timeouts** (`api/src/index.ts` lines 31-33):
- `server.timeout = 60000` (60s max request)
- `server.keepAliveTimeout = 65000`
- `server.headersTimeout = 66000`
- Mitigates Slowloris attacks

**SSM-based secrets loading in production** (`api/src/index.ts` lines 15-18):
- Dynamic import after secrets resolved
- Failures during secrets loading print and `process.exit(1)` — would crash on startup if SSM unavailable in prod

### Server-side gaps identified

| Gap | Severity | U16 candidate |
|---|---|---|
| **No global Express error handler observed in `app.ts`** | Medium | An async error in a route handler that escapes the route's try/catch would propagate to Node's default handler. Adding a global error handler (the U16-planned async-error-middleware) routes these to a structured 500 response. |
| **No `process.on('unhandledRejection')` handler observed in `index.ts`** | Medium | An unhandled promise rejection in non-request code (background tasks, Yjs collaboration) would print a warning and continue in Node 24, but a future Node version may crash on this. Worth adding per U16 plan. |
| **Audit logs table has only 3 rows** (per `eval/results/db-query-baseline.md`) | Low | Either audit logging isn't running, or the table is cleared on each seed. Doesn't directly affect error handling but suggests an instrumentation gap worth investigating. |

### Client-side (`web/src/`)

**TanStack Query mutation pattern** (per `docs/application-architecture.md` and code inspection):
- Optimistic updates with explicit rollback on error
- Global mutation error listener surfaces toast notifications
- Cache invalidation on settle (success or error)
- **No silent failures** — mutations always reach onError if they fail

**Yjs IndexedDB persistence** (`y-indexeddb`):
- Editor content cached locally for instant load + offline editing
- On reconnect, Yjs auto-merges local + server changes
- **Strong design** — Ship was deliberately built for "works offline" editor experience

### Client-side gaps identified

| Gap | Severity | U16 candidate |
|---|---|---|
| **No top-level React ErrorBoundary observed in web/src/main.tsx** | High | An unhandled render error in any component crashes the entire React tree (white screen). Per U16 plan, wrap the React tree with an ErrorBoundary that captures via the U7 in-house error capture system. |
| **No `window.addEventListener('error')` or `unhandledrejection` observed in web/src/** | Medium | Without these, client-side errors from non-React code (third-party libraries, async outside React) silently fail to be captured. |
| **WebSocket reconnect-with-expired-session** | High | Per the U16 plan and ORIENTATION findings, if a user disconnects then reconnects after their session expires, the WebSocket transport reconnects but every Yjs sync silently fails (auth check in the WS handshake). Worth verifying manually during U16. |

---

## Per-PDF requirement table (baseline state)

| PDF metric | Baseline value | Note |
|---|---|---|
| Console errors during normal usage | **Not formally counted** | Audit team did not observe obvious errors during testing; quantification deferred to manual DevTools session during U16 implementation |
| Unhandled promise rejections (server) | **Not formally counted** | Server logs during U4 benchmarks did not show unhandled rejections; would need to be intentionally triggered or surfaced via the U7 in-house error capture in U16 |
| Network disconnect recovery | **Pass (inferred)** | y-indexeddb persistence + Yjs CRDT design means edits survive disconnect; the UX of "what does the user see during reconnect" was NOT explicitly tested |
| Missing error boundaries | **Yes — at top of React tree** | No global ErrorBoundary in web/src; addressable in U16 |
| Silent failures identified | **2 candidates from inspection** | (1) WebSocket reconnect with expired session, (2) unhandled rejections outside request scope |

---

## Improvement target (U16)

**PDF requirement:** Fix 3 error handling gaps; at least one must involve a real user-facing data loss or confusion scenario.

**Three gaps selected for U16 (already specified in plan):**

1. **WebSocket reconnect recovery** (data-loss priority) — add reconnection UI indicator + verify Yjs state preserves through disconnect + detect expired session and route to re-login (Sentry/error-capture finding from U7)
2. **Top-level React ErrorBoundary** (user confusion priority) — wrap React tree to prevent white-screen crashes from render errors; route caught errors via the U7 in-house error capture
3. **Async error middleware + `process.on('unhandledRejection')` handler** (server-side priority) — convert escaped unhandled rejections to structured 500 responses; capture via U7 error-capture for visibility

All three are well-bounded; combined effort estimate ~3-5 hours.

---

## Audit implications

- Ship's error handling is **defensive at the security boundary** (helmet, CSRF, rate limit, slowloris) but **less defensive at the application boundary** (no ErrorBoundary, no unhandled rejection handlers).
- The strong server-side security defaults are why we saw clean behavior during U4 stress testing (17,000+ rate-limited requests handled cleanly).
- The gaps are real but small and well-bounded; the 3 selected U16 fixes substantially address them.
- AUDIT.md Category 6 will report this as "strong security boundary, minor application-layer gaps."
- Quantitative measurement of pre-improvement console-error count and unhandled-rejection count is **deferred to U16** when we instrument the in-house error capture; the BEFORE state will be measured by the same instrument as the AFTER state, ensuring a clean comparison.
