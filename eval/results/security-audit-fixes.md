# Category 8 Security Audit Fix Proof

## Fix 1: Collaboration WebSocket malformed-frame handling

- Vulnerability class: WebSocket validation failure / crash-only denial of service.
- Reproduction: run `pnpm security:audit -- --mode local --non-interactive` with seeded `dev@ship.local / admin123`, then inspect `ws-collaboration-malformed-binary`.
- Before evidence: `eval/results/security-audit-baseline.md` records `Status: finding`, `Severity: medium`, and `closeCode: 1006` after sending a 1-byte malformed collaboration frame.
- Fix applied: `api/src/collaboration/index.ts` now catches malformed collaboration protocol messages, closes with controlled code `1008`, and registers WebSocket error handlers so parser/payload errors do not terminate the API process.
- After evidence: `eval/results/security-audit-after.md` records `Status: pass`, `closeCode: 1008`, and `ws-post-probe-health` shows `/health` returned `200` after malformed and oversized WebSocket probes.

## Fix 2: Malformed JSON verbose error leakage

- Vulnerability class: verbose error leakage from body-parser JSON parse failures.
- Reproduction: send malformed JSON to `POST /api/auth/login`.
- Before evidence: `eval/results/security-audit-baseline.md` records `Status: finding` for `verbose-error-malformed-json`, with parser details including JSON position, line, and column.
- Fix applied: `api/src/middleware/errorHandler.ts` now maps `entity.parse.failed` errors to `Invalid JSON body` while continuing to log internal details server-side.
- After evidence: `eval/results/security-audit-after.md` records `Status: pass`, `leaks: []`, and response body `{"error":{"code":"REQUEST_ERROR","message":"Invalid JSON body"}}`. Regression coverage is in `api/src/middleware/errorHandler.test.ts`.

## Verification

- `pnpm type-check` passed.
- `pnpm --filter @ship/api test:security-probe` passed.
- `pnpm security:audit -- --mode local --non-interactive --report-name security-audit-after` passed with zero verified findings.
