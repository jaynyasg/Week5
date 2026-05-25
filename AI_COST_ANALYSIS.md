# AI Cost Analysis

## Summary

This audit used Codex as the primary AI engineering assistant for codebase comprehension, implementation, verification, deployment support, and submission synthesis. The work also used local command-line tools from the repository: `pnpm`, TypeScript, ESLint, Vitest, Playwright through the compact runner, PostgreSQL, and Git.

The exact billable AI dollar spend is not stored in this repository and was not exposed by the local Codex workspace during the audit. For final submission, this report uses a conservative projected usage-equivalent estimate. If provider billing data is available, replace the projection with the exact billing-dashboard number.

| Cost item | Amount | Source |
|---|---:|---|
| AI assistant projected usage-equivalent | ~$50 working estimate; plausible range ~$25-$75 | Projection based on several multi-hour Codex sessions covering audit synthesis, implementation, verification, Render deployment support, and final documentation |
| Added third-party SaaS tools | $0 | No new paid telemetry, analytics, security, or hosted test services were added |
| Local development tools | $0 incremental | Existing local Node, pnpm, PostgreSQL, Docker, and Git tooling |
| New dependency cost | $0 | Added packages are open-source dev/runtime dependencies installed through pnpm |
| Deployment infrastructure | Render billing dashboard required for exact spend | Public submission deployment is live on Render; AWS application deployment was deferred due cost. See `DEPLOYMENT_DECISION.md` for the `$220-$300/month` AWS estimate and Render decision |

## Projection Basis

The `$50` working estimate is intentionally labeled as a projection, not an invoice. It assumes several extended assistant sessions across the audit lifecycle:

- codebase orientation and architecture tracing
- Phase 2 implementation planning and evidence stitching
- focused code edits across API, web, shared, scripts, CI, and deployment docs
- repeated verification using type-checks, builds, tests, lint, E2E runner evidence, and the security probe
- Render deployment support, security-probe operations, and final submission documentation

If exact billing data is available, use the provider dashboard number instead. If the work was performed under a flat monthly subscription instead of usage-based billing, a pro-rated estimate is also acceptable:

```text
Pro-rated AI cost = monthly subscription price * (audit work days / billing-cycle days)
```

## What AI Was Effective At

**Codebase orientation.** AI was most valuable during the first-contact phase: scanning `README.md`, `ORIENTATION.md`, `AUDIT.md`, `AGENTS.md`, package scripts, and source directories to build a map of what mattered. This was especially useful because Ship is a monorepo with a unified document model, API routes, frontend pages, E2E harnesses, deployment scripts, and evidence artifacts.

**Evidence stitching.** The assistant helped keep before/after measurements connected to their raw artifacts. Examples include linking audit categories in `AUDIT.md` and `SUBMISSION.md` to `eval/results/*`, preserving command outputs, and avoiding unsupported claims when a gate had not actually run.

**Mechanical cleanup at scale.** AI was effective for broad but shallow cleanup work such as ESLint burn-down, unused variables, React Hooks findings, and JSX accessibility fixes. These tasks benefit from fast pattern recognition but still require verification because a mechanically valid lint fix can change interaction behavior.

**Verification discipline.** The most important value was not code generation alone. It was repeatedly running the appropriate checks after changes: `pnpm type-check`, focused tests, `pnpm build:api`, `pnpm build:web`, `pnpm audit:ci`, `pnpm security:audit`, and the compact E2E runner.

## Where AI Needed Guardrails

**Exact cost accounting.** The assistant could not derive exact AI billing from repository state. The `$50` value is a projection for submission purposes; any exact dollar number must come from the user's billing dashboard.

**Deployment authority.** The assistant can inspect deployment scripts and readiness, but it should not deploy without explicit approval and credentials. The original Ship deploy path touches AWS, Terraform state, SSM parameters, S3, CloudFront, Elastic Beanstalk, and Docker. The final public submission deploy used Render instead; exact infrastructure spend should come from Render billing.

**Cloud cost estimation.** AWS pricing depends on region, resource uptime, traffic, log volume, and managed service request volume. The repository can support a bounded estimate from Terraform, but exact monthly spend must come from AWS Pricing Calculator and billing data after deployment.

**Local noise and generated files.** The working tree had recurring local/generated entries such as `.codex/`, `api/coverage/`, and line-ending/index noise. The assistant had to stage files surgically and avoid committing local artifacts.

**Behavioral review after lint fixes.** Lint fixes can alter keyboard, focus, or click behavior. For example, converting interactive `div` elements to semantic controls still required review to avoid double-toggle and drag-and-drop keyboard conflicts.

## Cost Effectiveness Reflection

AI was most cost-effective for comprehension and high-volume mechanical work. It compressed the time required to discover project conventions, trace audit evidence, and apply many small consistency fixes. It was less suited to tasks that require external authority or private data, such as exact billing totals and production deployment credentials.

The best workflow was:

1. Read the code and docs first.
2. Make narrow changes that match existing patterns.
3. Run focused checks immediately.
4. Commit in logical batches.
5. Keep raw evidence in `eval/results/`.

The audit would have been slower without AI because the work crossed many surfaces: TypeScript, React, Express, PostgreSQL, WebSocket collaboration, dependency security, Playwright, CI, and AWS deployment scripts. The main risk of using AI was overconfidence. That was managed by grounding every claim in source files, commands, and committed measurement artifacts.
