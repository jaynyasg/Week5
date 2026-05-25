# Dependency Override Retirement Pass

Run date: 2026-05-22

## Goal

Reduce maintenance overhead from Phase 08 dependency-security overrides without reintroducing audit advisories.

## Retired Overrides

Removed 25 overrides whose patched versions are now supplied by direct package ranges, updated parent package ranges, or the refreshed lockfile:

- `@hono/node-server`
- `@protobufjs/utf8`
- `ajv`
- `brace-expansion`
- `express-rate-limit`
- `fast-uri`
- `fast-xml-parser`
- `flatted`
- `hono`
- `ip-address`
- `lodash`
- `markdown-it`
- `minimatch@5.1.6`
- `minimatch@9.0.5`
- `path-to-regexp@0.1.12`
- `path-to-regexp@8.3.0`
- `picomatch@2.3.1`
- `picomatch@4.0.3`
- `postcss`
- `protobufjs`
- `rollup`
- `svgo`
- `undici`
- `vite`
- `yaml`

The second pass refreshed direct parent ranges for the AWS SDK clients to `^3.1052.0` and `@modelcontextprotocol/sdk` to `^1.29.0`, allowing the lockfile to resolve patched transitive packages without long-lived root pins.

## Current Overrides

Two carried-forward overrides avoid known resolver backslides:

- `uuid`
- `ws`

`uuid` and `ws` were explicitly kept after a trial removal caused the resolver to reintroduce `uuid@10.0.0` through `testcontainers` and old optional `ws@6.2.3` through `y-websocket`. Keeping those pins preserves the zero-advisory gate and avoids stale optional WebSocket runtime code.

A third override, `qs@6.15.2`, was reintroduced after `pnpm audit:ci` surfaced `GHSA-q8mj-m7cp-5q26` / `CVE-2026-8723` on 2026-05-22 through `api > express > qs@6.14.2`. Express 4.22.1 still resolves the vulnerable `qs` range, so the root pin keeps the hosted dependency audit gate at zero advisories without a risky Express 5 migration.

## Follow-up Retest Criteria

Revisit the carried-forward `uuid` and `ws` overrides after upstream parent packages publish ranges that naturally resolve patched transitive versions. The next retirement attempt should:

1. Remove only `uuid` and `ws` from root `pnpm.overrides`.
2. Run `pnpm install --lockfile-only`.
3. Inspect resolver paths with `pnpm why uuid` and `pnpm why ws`.
4. Confirm no stale `uuid@10.0.0` or `ws@6.2.3` paths remain in `pnpm-lock.yaml`.
5. Run `pnpm audit:ci`, `pnpm type-check`, `pnpm build:api`, and `pnpm build:web`.

Only retire the `uuid` and `ws` overrides when all checks pass and the lockfile resolves patched versions without root pins. Until then, keep both overrides because the hosted dependency audit gate treats any advisory as a release-blocking failure.

Revisit `qs` separately once Express 4 or the selected parent package naturally resolves `qs@6.15.2` or newer. Do not remove the `qs` pin until `pnpm audit:ci` remains at zero advisories without it.

## Verification

```powershell
pnpm install --lockfile-only
pnpm install
pnpm audit:ci
pnpm type-check
pnpm build:api
pnpm build:web
```

Result: all commands passed. `pnpm audit:ci` reports 0 critical, 0 high, 0 moderate, 0 low, and 0 info advisories.
