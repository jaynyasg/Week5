---
date: 2026-05-21
topic: phase-16-category-8-security-audit
---

# Phase 16 Category 8 Security Audit

## Summary

Category 8 adds a first-class security audit to ShipShape: a runnable security probe tool plus baseline and after-fix evidence for Ship's live attack surface. The phase will document the required PDF metrics, run probes against local or remote targets including production, and fix at least two verified security findings with before/after proof.

---

## Problem Frame

The original ShipShape audit covered seven quality categories and later remediated dependency CVEs, but the new security audit PDF asks for a broader standard: actively probing the running application rather than only reading code or running a package scanner. Ship has authentication, sessions, WebSocket collaboration, user-generated content, PostgreSQL-backed APIs, and third-party dependencies, so the security category must measure how those surfaces behave under malformed, unauthenticated, oversized, and adversarial inputs.

The grader-facing deliverable must be reproducible from a fresh app instance with a single command and must produce structured evidence. The audit report also needs baseline measurements in the exact metric shape requested by the PDF, then improvement evidence for at least two verified vulnerabilities or security findings.

---

## Actors

- A1. Grader: Runs the probe tool against a fresh local or remote Ship instance and reviews the structured report.
- A2. Auditor: Interprets the probe/manual-review findings, updates `AUDIT.md`, and implements at least two verified fixes.
- A3. Ship operator: Provides target URL and credentials when the target requires authenticated checks.
- A4. Ship application: The API, frontend, WebSocket collaboration endpoint, database-backed content flows, and dependency tree under audit.

---

## Key Flows

- F1. Baseline security probe
  - **Trigger:** The auditor or grader runs the probe against local, remote, or production Ship.
  - **Actors:** A1, A2, A3, A4
  - **Steps:** Start with the requested target URL, try default credentials, fall back to provided credentials or prompt when needed, run all required unauthenticated and authenticated checks that can be run, and emit JSON plus Markdown reports.
  - **Outcome:** `AUDIT.md` can list the Category 8 baseline metrics with severity, reproduction steps, and not-run reasons where credentials are unavailable.
  - **Covered by:** R1, R2, R3, R4, R5, R6, R7

- F2. Manual security review
  - **Trigger:** The probe baseline exists and the auditor needs the PDF's manual checklist.
  - **Actors:** A2, A4
  - **Steps:** Review CORS/CSP, environment and secret exposure, rate limiting, and verbose error behavior; record yes/no findings with concrete examples.
  - **Outcome:** The Category 8 baseline includes every manual-review metric required by the PDF.
  - **Covered by:** R8, R9, R10, R11

- F3. Before/after remediation proof
  - **Trigger:** The baseline identifies at least two verified security findings.
  - **Actors:** A2, A4
  - **Steps:** Select at least two findings, capture reproduction evidence, apply targeted fixes, rerun the probe or regression tests, and document the before/after proof.
  - **Outcome:** Category 8 satisfies the improvement target without breaking existing verification.
  - **Covered by:** R12, R13, R14

---

## Requirements

**Probe tool**
- R1. The phase must add a runnable script or CLI security probe that a grader can execute with a single command against a fresh Ship instance.
- R2. The probe must support both local and remote target modes, including production URLs.
- R3. The probe must run required checks by default, including input and WebSocket probes, with bounded payload volume, unique probe markers, and cleanup where practical.
- R4. The probe must first try `dev@ship.local / admin123` in both local and remote modes, then use explicit credentials or an interactive prompt when login is required.
- R5. If a required authenticated check cannot run because credentials are unavailable or invalid, the report must mark it as `not_run_credentials_required` or equivalent rather than silently skipping it.
- R6. The probe must test authentication/session behavior, including unauthenticated route access, malformed or missing session tokens, token expiry indicators where observable, and role-boundary or privilege-escalation checks when multiple credential sets are available.
- R7. The probe must test WebSocket message validation, including malformed, oversized, and unexpected message types, and report whether the server rejects safely, accepts invalid state, disconnects, or crashes.
- R8. The probe must test input sanitization across reachable user-facing fields, including XSS, SQL injection-like payloads, excessively long input, stored vectors where authentication is available, and reflected vectors where applicable.
- R9. The probe must programmatically run the dependency audit, parse the output, flag high or critical CVEs, and identify the affected dependency path or related application feature where determinable.
- R10. The probe must emit both JSON and Markdown reports with findings, severity ratings, reproduction steps, target metadata, run timestamp, and not-run reasons.

**Manual review**
- R11. The audit must manually review CORS and CSP configuration and report misconfiguration as Yes/No with details.
- R12. The audit must manually review environment variable and secret handling and report exposure risk as Yes/No with details.
- R13. The audit must manually review rate limiting across API and WebSocket surfaces and list endpoints or channels where rate limiting appears absent.
- R14. The audit must manually review error message verbosity and report leakage as Yes/No with examples when found.

**Audit report metrics**
- R15. `AUDIT.md` must add Category 8 with the exact baseline metric set from the PDF: security probe runnable, auth/session vulnerabilities, WebSocket validation failures, input sanitization failures, high/critical CVEs, CORS/CSP misconfiguration, secrets exposure risk, rate limiting absent on endpoints, and verbose error leakage.
- R16. Each listed vulnerability or failure must include severity and enough reproduction detail for a grader to understand how it was verified.
- R17. `SUBMISSION.md` must include Category 8 in the reviewer-facing map once baseline and remediation evidence exist.

**Improvement target**
- R18. The phase must fix at least two verified security findings, preferring high or critical vulnerabilities when found.
- R19. If no high or critical findings are found, fixing two verified lower-severity findings is acceptable.
- R20. Each fix must include vulnerability class, reproduction steps, fix summary, and before/after proof from probe output or a regression test.
- R21. The fixes must not break existing tests or the relevant build/type-check gates.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R10.** Given a locally running Ship instance, when a grader runs the documented single command, the probe completes and writes both JSON and Markdown reports.
- AE2. **Covers R4, R5.** Given a remote production URL where `dev@ship.local / admin123` fails and no other credentials are available, when the probe reaches authenticated checks, it prompts if interactive or records credentials-required findings if non-interactive.
- AE3. **Covers R7.** Given the collaboration WebSocket endpoint, when the probe sends malformed and unexpected message types, the report records whether the endpoint rejected, disconnected, accepted, or crashed.
- AE4. **Covers R8.** Given valid credentials, when the probe submits bounded XSS and long-input payloads to editable fields, the report records whether the payload is stored, reflected, sanitized, rejected, or causes an error.
- AE5. **Covers R15.** Given the baseline is complete, when a grader reads `AUDIT.md`, every PDF deliverable metric has a baseline value in the requested shape.
- AE6. **Covers R18, R20.** Given two verified findings have been fixed, when the probe or regression tests are rerun, the after evidence demonstrates the findings no longer reproduce.

---

## Success Criteria

- Category 8 is readable as a complete eighth audit category beside the original seven, with no missing PDF metric rows.
- A grader can run one documented command against local or remote Ship and receive JSON plus Markdown security findings.
- The report distinguishes verified vulnerabilities, lower-severity findings, safe passes, and checks that could not run due to missing credentials.
- At least two verified security findings are fixed with clear before/after proof.
- Existing verification remains green for type-check/build and the relevant test gates.

---

## Scope Boundaries

- Full multi-role privilege escalation testing is included only when multiple credential sets are provided or available.
- Production probing is allowed, but probes should remain bounded, identifiable, and cleanup-oriented rather than destructive stress testing.
- The paused full E2E release gate remained paused until Category 8 was planned and executed.
- Resolved 2026-05-22: Category 8 is complete and the final full release gate ran with `pnpm test:e2e -- --workers=2`, passing 869/869 tests.
- Broad penetration testing beyond the PDF surfaces is out of scope for this phase.
- External third-party scanners are not a substitute for the required Ship-specific probe tool, though dependency audit output is included as one required input.

---

## Key Decisions

- Both local and remote modes are required: this keeps the tool useful for graders and deployed environments.
- Production targets are allowed: the audit should reflect the live app surface, while keeping probes bounded and non-destructive.
- All required checks run by default: the PDF explicitly requires WebSocket and input failure testing, so those cannot hide behind an opt-in flag.
- Credentials are progressive: try the known seeded login first, then explicit credentials, then prompt, then report credentials-required if non-interactive.
- Lower-severity findings can satisfy the improvement target if no high or critical findings are found: the target is verified remediation, not manufacturing severity.

---

## Dependencies / Assumptions

- The probe can assume Ship exposes a reachable web/API base URL and, for authenticated checks, login-compatible credentials.
- Local and remote targets may not have identical data; reports must include target metadata so baseline evidence is interpretable.
- Dependency audit results may already be clean from earlier phases, but Category 8 must still run and report the CVE metric.
- The implementation plan should verify current auth, CSRF, WebSocket, CORS/CSP, and rate-limit behavior against the actual code before finalizing probe mechanics.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1-R10][Technical] What script runtime and command shape best fits the repo's existing tooling and Windows constraints?
- [Affects R6-R8][Needs research] Which authenticated fields and WebSocket paths can be probed safely while still satisfying the PDF's active-testing requirement?
- [Affects R13][Needs research] What rate-limit thresholds should the probe use to distinguish absent protection from intentionally high test-mode limits?
