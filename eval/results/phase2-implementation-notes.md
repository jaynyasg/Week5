# Phase 2 Implementation Notes

**Date:** 2026-05-20  
**Status:** Measurement pass completed — evidence artifacts captured; all seven PDF category targets are now met (U11, U12, U13, U14, U15, U16/U7, U17).

## Completed in codebase

| Unit | Change |
|------|--------|
| U13 | Removed `d.content` from `GET /api/issues` list SELECT; weeks active list query rewritten with `LEFT JOIN LATERAL` aggregations |
| U13 | Added backward-compatible `GET /api/documents?limit=&offset=` pagination with optional `include_total=true`; default `/api/documents` array response remains unchanged |
| U13 | Added backward-compatible `GET /api/issues?limit=&offset=` pagination with optional `include_total=true`; default `/api/issues` array response remains unchanged |
| U14 | Migration `038_shipshape_query_perf_indexes.sql` (`idx_documents_sprint_number`, `idx_documents_sort`) |
| U14 | Throttled authenticated session `last_activity` writes to the existing 60-second sliding-cookie window and reused authenticated workspace roles in weeks visibility checks |
| U12 | `React.lazy` + `Suspense` for `UnifiedDocumentPage`; SlashCommands static imports (fixes mixed dynamic/static warnings) |
| U12 | Route-level lazy loading for `AppLayout` and top-level pages; heavy app/editor/page code now loads from async chunks instead of the entry script |
| U16/U7 | `@ship/shared` error capture; Express `errorHandler`; `unhandledRejection`; client listeners; top-level `ErrorBoundary` |
| U17 | FilterTabs contrast (`text-foreground/80`); TeamMode week header contrast; Login `<main>` landmark |
| U11 (partial) | `IssueRow` type + typed `extractIssueFromRow` in `issues.ts` |
| U11 | Typed Yjs/TipTap conversion utilities, y-protocol declarations, project/week route helpers, unified editor/panel narrowing, and TipTap editor extension callbacks |

## Measurement results captured

| Unit | Artifact | Result |
|------|----------|--------|
| U11 | `eval/results/type-safety-after.json`, `eval/results/type-coverage-after.txt` | Target met: conservative grep violations reduced from 399 to 294 (-26.32%); type-coverage improved from 93.47% to 93.96% |
| U12 | `eval/results/bundle-after.json` | Target met: entry script 2,073.70 KB → 287.36 KB (-86.14%); `AppLayout`, editor-heavy document pages, login, reviews, team, and settings code deferred into async chunks |
| U13 | `eval/results/api-benchmark-after.json`, `eval/results/api-benchmark-documents-limit50-c25.json`, `eval/results/api-benchmark-issues-limit50-c25.json` | Target met: documents paginated c=25 improved 71.02% (283 ms -> 82 ms P97.5); issues paginated c=25 improved 39.58% (192 ms -> 116 ms P97.5) |
| U14 | `eval/results/db-query-after.md`, `eval/results/api-benchmark-weeks-u14-after.json` | Target met by query-count reduction: `GET /api/weeks` drops from 5 -> 3 DB statements for seeded super-admin flow (-40%) and 6 -> 4 for normal member flow (-33.33%); c=50 P97.5 rerun is 130 ms with 0 non-2xx |
| U15 | `eval/results/test-coverage-after.json`, `eval/results/empty-tests-after.json` | 455/455 API tests pass with 41.27% line coverage; empty-test detector now reports 0 empty tests |
| U16/U7 | `eval/results/error-after.md`, `eval/results/websocket-reconnect-ui.md` | Target met: top-level React `ErrorBoundary`, global client listeners, Express `errorHandler`, shared in-house capture, and `process.on('unhandledRejection')`; Phase 13 closes the WebSocket reconnect UI stretch |
| U17 | `eval/results/axe-after.json` | 0 Critical/Serious/Moderate/Minor axe violations across login/docs/projects/team after final contrast fixes |

## Deferred then closed

- Full all-suite Playwright E2E was deferred during the Phase 2 implementation pass. Phase 14 added the compact runner and Phase 15 verified the isolated E2E harness with `pnpm test:e2e -- e2e/spike-isolated.spec.ts --workers=1`.
- Resolved 2026-05-22: the final release gate ran with `pnpm test:e2e -- --workers=2` and completed with 869 passed, 0 failed, 0 skipped, and 0 pending tests. See `eval/results/full-e2e-gate.md`.
