# Ship Security Audit Report

- Run ID: `b266994e-0052-4e73-990e-b41e6170a751`
- Mode: `local`
- Web URL: `http://localhost:5173`
- API URL: `http://localhost:3000`
- Started: `2026-05-22T20:54:57.275Z`
- Finished: `2026-05-22T20:54:58.937Z`
- Non-interactive: `true`

## Audit Deliverable Matrix

| Metric | Your Baseline | Source |
| --- | --- | --- |
| Security probe tool | Runnable (Yes) | Probe command and report metadata |
| Auth/session vulnerabilities found | No verified vulnerabilities found | Auth/session probes plus manual review |
| WebSocket validation failures | No verified vulnerabilities found | WebSocket probes |
| Input sanitization failures | No verified vulnerabilities found | Input probes plus browser/security test evidence when relevant |
| High/Critical CVEs in dependencies | No verified vulnerabilities found | Parsed dependency audit |
| CORS/CSP misconfiguration | No verified vulnerabilities found | Header probes plus manual review |
| Secrets exposure risk | No verified vulnerabilities found | Common-path/client-bundle checks plus manual review |
| Rate limiting absent on endpoints | No verified vulnerabilities found | Live bounded probes plus route/middleware review |
| Verbose error leakage | No verified vulnerabilities found | Error probes plus error-handler review |

## Summary

- Verified findings: 0
- Status counts: `{"pass":18,"finding":0,"inconclusive":0,"error":0,"not_run_credentials_required":5,"not_run_secondary_credentials_required":1,"not_run_target_unavailable":0,"not_run_safety_limit":0}`
- Severity counts: `{"critical":0,"high":0,"medium":0,"low":0,"info":24}`

## Findings

### tool-runnable: Security probe command executed

- Metric: `security_probe_tool`
- Surface: `tool`
- Status: `pass`
- Severity: `info`

The Category 8 security probe CLI started and produced a report artifact.

**Reproduction Steps**

1. Run the documented security audit command from the repository root.
2. Confirm JSON and Markdown reports are written to the configured output directory.

**Evidence**

  - mode: `"local"`
  - webUrl: `"http://localhost:5173"`
  - apiUrl: `"http://localhost:3000"`
  - reportName: `"security-audit-baseline"`

### auth-unauth-documents-list: Unauthenticated GET /api/documents denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/documents without a session cookie or bearer token.

**Evidence**

  - status: `401`
  - body: `"{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"No session found\"}}"`

### auth-unauth-documents-create: Unauthenticated POST /api/documents denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/documents without a session cookie or bearer token.

**Evidence**

  - status: `403`
  - body: `"{\"error\":{\"code\":\"REQUEST_ERROR\",\"message\":\"invalid csrf token\"}}"`

### auth-unauth-auth-me: Unauthenticated GET /api/auth/me denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/auth/me without a session cookie or bearer token.

**Evidence**

  - status: `401`
  - body: `"{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"No session found\"}}"`

### auth-unauth-admin-workspaces: Unauthenticated GET /api/admin/workspaces denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/admin/workspaces without a session cookie or bearer token.

**Evidence**

  - status: `401`
  - body: `"{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"No session found\"}}"`

### auth-malformed-session: Malformed session cookie denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/auth/me without a session cookie or bearer token.

**Evidence**

  - status: `401`
  - body: `"{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"Invalid session\"}}"`

### auth-malformed-bearer: Malformed bearer token denied unauthenticated access

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `pass`
- Severity: `info`

The protected route did not return protected data without authentication.

**Reproduction Steps**

1. Request http://localhost:3000/api/auth/me without a session cookie or bearer token.

**Evidence**

  - status: `401`
  - body: `"{\"success\":false,\"error\":{\"code\":\"UNAUTHORIZED\",\"message\":\"Invalid or expired API token\"}}"`

### auth-login-primary: Primary credentials failed

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `not_run_credentials_required`
- Severity: `info`

The probe attempted the primary credential pair to unlock authenticated checks.

**Reproduction Steps**

1. Fetch CSRF token.
2. POST /api/auth/login as dev@ship.local.

**Evidence**

  - status: `401`
  - success: `false`
  - credentialSource: `"default"`
  - userId: `undefined`
  - workspaceId: `undefined`

### auth-missing-csrf: Missing CSRF enforcement check requires login.

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `not_run_credentials_required`
- Severity: `info`

Authenticated probe could not run because usable credentials were unavailable.

**Reproduction Steps**

1. Provide valid credentials and rerun the probe.

**Evidence**

_No evidence captured._

### auth-role-boundary-secondary: Role-boundary probe requires secondary credentials

- Metric: `auth_session_vulnerabilities`
- Surface: `auth_session`
- Status: `not_run_secondary_credentials_required`
- Severity: `info`

No secondary credential pair was provided for privilege-escalation checks.

**Reproduction Steps**

1. Provide SHIP_SECURITY_ALT_EMAIL and SHIP_SECURITY_ALT_PASSWORD, or --alt-email and --alt-password.

**Evidence**

  - secondaryProvided: `false`

### input-login-payloads: Login rejects XSS and SQLi-like payloads safely

- Metric: `input_sanitization_failures`
- Surface: `input_sanitization`
- Status: `pass`
- Severity: `info`

The adversarial input was rejected or not reflected in an executable response context.

**Reproduction Steps**

1. POST /api/auth/login with XSS marker email and SQLi-like password.

**Evidence**

  - status: `401`
  - contentType: `"application/json; charset=utf-8"`
  - reflectedPayloads: `[]`
  - body: `"{\"success\":false,\"error\":{\"code\":\"INVALID_CREDENTIALS\",\"message\":\"Invalid email or password\"}}"`

### input-public-feedback-program-id: Public feedback program lookup handles malformed ID safely

- Metric: `input_sanitization_failures`
- Surface: `input_sanitization`
- Status: `pass`
- Severity: `info`

The adversarial input was rejected or not reflected in an executable response context.

**Reproduction Steps**

1. GET /api/feedback/program/<event-handler-payload>.

**Evidence**

  - status: `404`
  - contentType: `"application/json; charset=utf-8"`
  - reflectedPayloads: `[]`
  - body: `"{\"error\":\"Program not found\"}"`

### input-authenticated-write-probes: Authenticated input write probes require login.

- Metric: `input_sanitization_failures`
- Surface: `input_sanitization`
- Status: `not_run_credentials_required`
- Severity: `info`

Authenticated input probe could not run because usable credentials were unavailable.

**Reproduction Steps**

1. Provide valid credentials and rerun the probe.

**Evidence**

_No evidence captured._

### dependency-high-critical-cves: No high or critical dependency CVEs found

- Metric: `high_critical_cves`
- Surface: `dependency_cve`
- Status: `pass`
- Severity: `info`

The probe parsed pnpm audit JSON and counted high/critical advisories.

**Reproduction Steps**

1. Run pnpm audit --json from the repository root.

**Evidence**

  - counts: `{"critical":0,"high":0}`
  - advisories: `[]`
  - rawExitStatus: `1`

### cors-csp-cors: CORS did not allow untrusted credentialed origin

- Metric: `cors_csp_misconfiguration`
- Surface: `cors_csp`
- Status: `pass`
- Severity: `info`

The probe sent an untrusted Origin preflight and inspected CORS response headers.

**Reproduction Steps**

1. Send OPTIONS /api/auth/me with Origin: https://ship-security-probe.invalid.
2. Inspect Access-Control-Allow-Origin and Access-Control-Allow-Credentials.

**Evidence**

  - status: `204`
  - allowOrigin: `"http://localhost:5173"`
  - allowCredentials: `"true"`

### cors-csp-api-csp: API Content Security Policy header present

- Metric: `cors_csp_misconfiguration`
- Surface: `cors_csp`
- Status: `pass`
- Severity: `info`

The target response included a Content-Security-Policy header.

**Reproduction Steps**

1. GET http://localhost:3000/health.
2. Inspect the Content-Security-Policy response header.

**Evidence**

  - status: `200`
  - csp: `"default-src 'self';script-src 'self' 'unsafe-inline';style-src 'self' 'unsafe-inline';img-src 'self' data: blob: https:;connect-src 'self' wss: ws:;font-src 'self' data:;object-src 'none';frame-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'self';script-src-attr 'none';upgrade-insecure-requests"`
  - hasUnsafeInline: `true`
  - localDevTolerated: `false`
  - error: `undefined`

### cors-csp-web-csp: Web Content Security Policy header missing on local dev target (tolerated)

- Metric: `cors_csp_misconfiguration`
- Surface: `cors_csp`
- Status: `pass`
- Severity: `info`

The local Vite development target did not include a Content-Security-Policy header; deployed targets are still treated as findings.

**Reproduction Steps**

1. GET http://localhost:5173.
2. Inspect the Content-Security-Policy response header.

**Evidence**

  - status: `200`
  - csp: `undefined`
  - hasUnsafeInline: `false`
  - localDevTolerated: `true`
  - error: `undefined`

### secrets-common-paths: No secret-like values on common paths

- Metric: `secrets_exposure_risk`
- Surface: `secrets`
- Status: `pass`
- Severity: `info`

The probe requested common accidental exposure paths and searched for secret-like values.

**Reproduction Steps**

1. GET http://localhost:5173/.env.
2. GET http://localhost:3000/.env.
3. GET http://localhost:3000/api/.env.
4. GET http://localhost:5173/config.json.

**Evidence**

  - checked: `[{"url":"http://localhost:5173/.env","status":403},{"url":"http://localhost:3000/.env","status":404},{"url":"http://localhost:3000/api/.env","status":404},{"url":"http://localhost:5173/config.json","status":200}]`
  - exposures: `[]`

### rate-limit-coverage-review: API and WebSocket rate limiting coverage present by code review

- Metric: `rate_limiting_absent`
- Surface: `rate_limiting`
- Status: `pass`
- Severity: `info`

Manual review found global API, login, WebSocket connection, and WebSocket message limiters wired in application code.

**Reproduction Steps**

1. Review api/src/app.ts for loginLimiter and apiLimiter.
2. Review api/src/collaboration/index.ts for connection and message rate limits.

**Evidence**

  - apiLimiter: `"api/src/app.ts app.use(/api/, apiLimiter)"`
  - loginLimiter: `"api/src/app.ts app.use(/api/auth/login, loginLimiter)"`
  - websocketLimits: `"api/src/collaboration/index.ts RATE_LIMIT"`
  - absentEndpoints: `[]`

### verbose-error-malformed-json: Malformed JSON did not leak verbose internals

- Metric: `verbose_error_leakage`
- Surface: `verbose_errors`
- Status: `pass`
- Severity: `info`

The probe sent malformed JSON and inspected the response for stack traces, SQL, paths, or secret names.

**Reproduction Steps**

1. POST malformed JSON to /api/auth/login.

**Evidence**

  - status: `400`
  - leaks: `[]`
  - body: `"{\"error\":{\"code\":\"REQUEST_ERROR\",\"message\":\"Invalid JSON body\"}}"`

### ws-unauth-events: Unauthenticated /events WebSocket upgrade rejected

- Metric: `websocket_validation_failures`
- Surface: `websocket`
- Status: `pass`
- Severity: `info`

The WebSocket endpoint rejected an unauthenticated upgrade request.

**Reproduction Steps**

1. Open ws://localhost:3000/events without a session cookie.

**Evidence**

  - url: `"ws://localhost:3000/events"`
  - opened: `false`
  - httpStatus: `401`
  - closeCode: `undefined`
  - closeReason: `undefined`
  - error: `undefined`
  - messages: `[]`

### ws-unauth-collaboration: Unauthenticated collaboration WebSocket upgrade rejected

- Metric: `websocket_validation_failures`
- Surface: `websocket`
- Status: `pass`
- Severity: `info`

The WebSocket endpoint rejected an unauthenticated upgrade request.

**Reproduction Steps**

1. Open ws://localhost:3000/collaboration/wiki:00000000-0000-4000-8000-000000000000 without a session cookie.

**Evidence**

  - url: `"ws://localhost:3000/collaboration/wiki:00000000-0000-4000-8000-000000000000"`
  - opened: `false`
  - httpStatus: `401`
  - closeCode: `undefined`
  - closeReason: `undefined`
  - error: `undefined`
  - messages: `[]`

### ws-auth-events: Authenticated /events WebSocket checks require login.

- Metric: `websocket_validation_failures`
- Surface: `websocket`
- Status: `not_run_credentials_required`
- Severity: `info`

Authenticated WebSocket probe could not run because usable credentials were unavailable.

**Reproduction Steps**

1. Provide valid credentials and rerun the probe.

**Evidence**

_No evidence captured._

### ws-auth-collaboration: Authenticated collaboration checks require login.

- Metric: `websocket_validation_failures`
- Surface: `websocket`
- Status: `not_run_credentials_required`
- Severity: `info`

Authenticated WebSocket probe could not run because usable credentials were unavailable.

**Reproduction Steps**

1. Provide valid credentials and rerun the probe.

**Evidence**

_No evidence captured._

