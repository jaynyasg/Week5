# Ship Threat Model

## Scope

This threat model covers the Ship monorepo at the Phase 06 security remediation pass. It focuses on the deployed Express API, React web app, PostgreSQL-backed document model, WebSocket collaboration server, and dependency supply chain.

## Key Assets

| Asset | Why It Matters |
|---|---|
| Session cookies and CSRF tokens | Control authenticated access to workspace data |
| Workspace documents | Store project plans, issues, people, reviews, and wiki content |
| Yjs collaboration state | Stores real-time document edits and can contain sensitive content |
| File upload records and S3 objects | May contain user-provided attachments |
| AWS credentials and service clients | Access S3, SSM, Secrets Manager, and Bedrock integrations |
| Dependency tree | Executes inside API, web build, tests, and local tooling |

## Existing Controls

- Helmet and CSP are configured in the API.
- CSRF protection guards mutating cookie-authenticated routes.
- Session timeout and absolute session expiry limit stolen-cookie lifetime.
- Workspace membership checks scope document access.
- Rate limits protect authentication and collaboration paths.
- Local error capture avoids third-party telemetry while preserving crash visibility.
- The unified document model keeps access checks concentrated on a small set of document paths.

## Dependency Security Baseline

The original dependency audit baseline was captured on 2026-05-19 in `eval/results/dependency-audit-baseline.json` and summarized in `eval/results/dependency-summary-baseline.md`.

| Audit | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|
| Original baseline | 2 | 30 | 38 | 4 |
| Fresh pre-remediation audit after Phase 05 | 2 | 31 | 38 | 4 |
| Phase 06 after remediation | 0 | 25 | 31 | 3 |
| Phase 08 after remediation | 0 | 0 | 0 | 0 |

## Phase 06 Critical CVE Remediation

Phase 06 remediated the two critical findings with narrow `pnpm.overrides` instead of broad parent-package upgrades.

| CVE / Advisory | Path | Before | After | Outcome |
|---|---|---:|---:|---|
| `CVE-2026-25896` / `GHSA-m7jm-9gc2-mpf2` | `api > @aws-sdk/client-bedrock-runtime > @aws-sdk/core > @aws-sdk/xml-builder > fast-xml-parser` | `fast-xml-parser@5.3.4` | `fast-xml-parser@5.7.0` | Critical cleared |
| `CVE-2026-41242` / `GHSA-xq3m-2v4x-88gg` | root dev tooling `testcontainers > dockerode > protobufjs` | `protobufjs@7.5.4` | `protobufjs@7.6.0` | Critical cleared |

Additional override:

- `@protobufjs/utf8@1.1.1` clears the protobuf UTF-8 transitive advisory family that remained behind `protobufjs`.

Evidence:

- `eval/results/dependency-audit-after.json`
- `pnpm --filter @ship/api why fast-xml-parser`
- `pnpm why protobufjs`

## Residual Risks

No dependency audit advisories remain after Phase 08. The remediation uses targeted `pnpm.overrides` where parent packages still resolve stale transitive versions. A 2026-05-22 override retirement pass removed 26 now-redundant overrides while keeping the zero-advisory gate green; only `uuid` and `ws` remain pinned because trial removal reintroduced stale resolver paths.

Phase 15 temporarily adjusted the `ip-address` override from `10.1.1` to `10.2.0` because `express-rate-limit@8.5.2` depends on the newer `Address6.networkForm()` API for the fixed IPv6 key generator. The later 2026-05-22 parent-range refresh removed that override while preserving the zero-advisory gate.

| Risk | Current Status | Rationale |
|---|---|---|
| High/moderate production dependency advisories | Mitigated | Phase 08 reduces the audit count to zero while preserving the current API and frontend parent package surfaces. |
| Testcontainers advisories outside critical path | Mitigated with overrides | Testcontainers remains dev/E2E tooling, but its audited transitive packages are now forced to patched versions. |
| AWS SDK transitive XML parser drift | Resolved by parent update | The AWS SDK packages now resolve patched XML parser dependencies without a root override. |
| Override maintenance | Reduced, still accepted temporarily | `eval/results/dependency-override-retirement.md` retires 25 overrides. The carried-forward `uuid` and `ws` pins should be revisited once upstream parent packages stop resolving stale transitive versions; `qs` is pinned separately for the 2026-05-22 Express transitive advisory. |
| `pnpm approve-builds` pending for native build scripts | Accepted temporarily | Existing install flow already ignores these scripts; no new runtime code depends on approving them in this pass. |

## Phase 08 High/Moderate Remediation

Phase 08 cleared the remaining high, moderate, and low dependency advisories with targeted overrides and a refreshed lockfile. On 2026-05-22, follow-up passes retired 25 overrides, retained the carried-forward `uuid` and `ws` pins, and added a narrow `qs@6.15.2` pin after `GHSA-q8mj-m7cp-5q26` appeared through `api > express > qs`.

| Cluster | Patched packages |
|---|---|
| API runtime and MCP transitive deps | Remaining overrides: `qs`, `uuid`, `ws`. Retired overrides: `express-rate-limit`, `path-to-regexp`, `ip-address`, `hono`, `@hono/node-server`, `ajv`, `fast-uri`. |
| Web build/editor deps | Remaining overrides: none. Retired overrides: `vite`, `rollup`, `postcss`, `picomatch`, `markdown-it`, `svgo`. |
| Test/dev tooling deps | Remaining overrides: `uuid`, `ws`. Retired overrides: `minimatch`, `flatted`, `undici`, `lodash`, `brace-expansion`, `yaml`. |
| AWS/protobuf transitive deps | Remaining overrides: none. Retired overrides: `fast-xml-parser`, `protobufjs`, `@protobufjs/utf8`. |

Evidence:

- `eval/results/dependency-audit-after.json`
- `eval/results/dependency-override-retirement.md`
- `package.json` `pnpm.overrides`
- `pnpm-lock.yaml`

## Phase 09 Dependency Audit Gate

Phase 09 makes the zero-advisory baseline enforceable in both hosted remotes.

| Surface | Control |
|---|---|
| Local/CI command | `pnpm audit:ci` runs `scripts/check-dependency-audit.mjs`, parses `pnpm audit --json`, and fails if any `info`, `low`, `moderate`, `high`, or `critical` advisory is present. |
| GitHub | `.github/workflows/dependency-audit.yml` runs on pull requests, pushes to `main`, weekly schedule, and manual dispatch. |
| GitLab | `.gitlab-ci.yml` runs the same audit job for merge requests, default-branch pushes, and scheduled pipelines. |

## Recommended Follow-Up

1. Continue replacing the remaining overrides with normal parent dependency updates once upstream dependency ranges carry patched versions.
2. Keep `eval/results/dependency-audit-after.json` refreshed whenever dependency security work lands.
3. Monitor the new GitHub/GitLab audit jobs after the next push to confirm both hosted environments have registry access.
