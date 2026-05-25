---
title: "Phase 08 - Dependency Audit Zero"
date: 2026-05-20
status: complete
parent: THREAT_MODEL.md
---

# Phase 08 - Dependency Audit Zero

## Goal

Reduce the remaining high, moderate, and low dependency advisories after Phase 06 without broad parent-package migrations.

## Baseline

After Phase 06, the refreshed audit still reported:

| Critical | High | Moderate | Low |
|---:|---:|---:|---:|
| 0 | 25 | 31 | 3 |

## Implementation

Added targeted `pnpm.overrides` and refreshed `pnpm-lock.yaml` with `pnpm install`.

Major clusters patched:

- API runtime and MCP transitive deps: `express-rate-limit`, `ip-address`, `hono`, `@hono/node-server`, `ajv`, `fast-uri`, `path-to-regexp`, `uuid`, `ws`.
- Web build/editor deps: `vite`, `rollup`, `postcss`, `markdown-it`, `svgo`, `picomatch`.
- Test/dev tooling deps: `flatted`, `undici`, `lodash`, `qs`, `brace-expansion`, `minimatch`, `yaml`.

Branch-sensitive overrides were used for packages with incompatible major lines:

- `path-to-regexp@0.1.12` -> `0.1.13` for Express 4.
- `path-to-regexp@8.3.0` -> `8.4.2` for Express 5/router transitive usage.
- `picomatch@2.3.1` -> `2.3.2` and `picomatch@4.0.3` -> `4.0.4`.
- `minimatch@5.1.6` -> `5.1.8` and `minimatch@9.0.5` -> `9.0.7`.

## Result

`pnpm audit --json` now reports:

| Critical | High | Moderate | Low |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 0 |

Evidence is in `eval/results/dependency-audit-after.json`.

## Compatibility Notes

This phase intentionally avoids app-code changes. Parent dependencies remain on their current public API surfaces, while patched transitive versions are forced until upstream dependency ranges naturally absorb them.

