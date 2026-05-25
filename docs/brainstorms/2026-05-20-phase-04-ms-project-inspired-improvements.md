---
title: "Phase 04 - Microsoft Project-Inspired Timeline and Dependency Planning"
date: 2026-05-20
status: completed
origin: conversation - post-Phase 02 improvement roadmap
depends_on: Phase 03 readiness/submission polish
---

# Phase 04 - Microsoft Project-Inspired Timeline and Dependency Planning

## Goal

After Phase 03 submission/readiness is complete, implement a product-facing project-management upgrade inspired by the strongest Microsoft Project concepts while keeping Ship's unified document model intact.

The recommended first feature bundle is **Project Timeline + Dependencies**: a Gantt-style view that shows projects, weeks, issues, blockers, schedule drift, and critical path in one operational surface.

## Why This Is Phase 04

Phase 02 was the measured audit-improvement pass across the 7 PDF categories. Phase 03 should finish the submission story and readiness review. Phase 04 is the next product-improvement phase because it adds user-facing functionality rather than changing audit evidence.

## Microsoft Project Concepts To Adapt

| Microsoft Project concept | Ship adaptation |
|---|---|
| Gantt chart | Timeline view for projects, weeks, and issues |
| Task dependencies/predecessors | Document association relationships such as `blocks`, `blocked_by`, and `depends_on` |
| Critical path | Highlight chains of blocking work that threaten target dates |
| Baseline vs actual | Store planned start/end dates and compare against current status/completion dates |
| Milestones | Represent major delivery checkpoints as lightweight document properties or milestone-type documents if justified |
| Resource allocation | Surface people with overloaded or under-assigned active work |
| Variance reporting | Show schedule drift, overdue work, and forecast risk at project/program level |

## Fit With Ship Architecture

- Keep "everything is a document" as the core model.
- Prefer `document_associations` for dependency edges instead of adding type-specific dependency tables.
- Add JSONB expression indexes only for hot query fields proven by `EXPLAIN` or benchmark evidence.
- Reuse the existing `Editor` and 4-panel document layout; the timeline should be a view/tab, not a separate type-specific editor.
- Preserve "Untitled" title behavior for any new document creation.

## Proposed Scope

### Phase 04A - Dependency Data Model

- Add dependency association types: `blocks`, `blocked_by`, `depends_on`.
- Add API endpoints or extend association endpoints to create/read/delete dependency edges.
- Validate no circular dependency chains for issue/project dependencies.
- Add focused tests for dependency creation, deletion, workspace scoping, and cycle prevention.

### Phase 04B - Timeline Read Model

- Add an API endpoint that returns timeline rows for a project/program:
  - project/week/issue id and title
  - planned start/end
  - actual start/completion where available
  - status/state
  - dependency edges
  - blocked/at-risk flags
- Add indexes only after measuring the query plan.

### Phase 04C - Timeline UI

- Add a timeline tab or view that visualizes weeks and issues on a horizontal time scale.
- Show dependencies as connecting lines or grouped blockers.
- Use clear visual states for blocked, overdue, complete, and at-risk work.
- Include a compact critical-path highlight rather than a heavyweight scheduling engine.

### Phase 04D - Baseline And Variance

- Capture a project baseline snapshot.
- Compare baseline dates against current dates and completion state.
- Summarize variance at project/program level.

### Phase 04E - Critical Path Highlight

- Compute a compact critical path from unresolved in-scope dependency chains.
- Surface critical-path count, row membership, and path order in the timeline API.
- Highlight critical rows in the timeline tab without introducing a scheduling engine.

## Out Of Scope For First Pass

- Full Microsoft Project import/export.
- Automatic resource leveling.
- Full scheduling engine with calendars, constraints, and task-duration propagation.
- New content tables that bypass the unified document model.

## 7-Category Improvement Mapping

| Audit category | Phase 04 contribution |
|---|---|
| Type safety | Typed dependency/timeline DTOs shared across API and web |
| Bundle size | Lazy-load the timeline view and any visualization library |
| API response time | Bounded timeline endpoint with measured query plans |
| DB query efficiency | Association indexes added only when benchmarked |
| Test coverage | Unit/API tests for dependency rules and cycle prevention; UI smoke tests for timeline rendering |
| Runtime error handling | Graceful handling for malformed dependency graphs and missing dates |
| Accessibility | Keyboard-navigable timeline rows, non-color-only status labels, screen-reader-friendly dependency summaries |

## Acceptance Criteria

- A project/program timeline can show related weeks and issues.
- Users can create and remove dependencies between supported documents.
- Circular dependency attempts are rejected with a clear error.
- Blocked and at-risk work is visible in the timeline.
- Critical path is highlighted for at least one project/program flow.
- Baseline vs actual variance is visible for project-level planning.
- `pnpm type-check` and relevant API/web tests pass.

## Execution Order

1. Finish Phase 03 readiness/submission review.
2. Spec Phase 04A in detail.
3. Implement dependency data model and tests.
4. Implement timeline API and benchmark it.
5. Implement timeline UI and accessibility checks.
6. Add baseline/variance reporting.
7. Add compact critical-path highlighting.

## Detailed Specs

- Phase 04A: `docs/brainstorms/2026-05-20-phase-04a-dependency-data-model-plan.md`

## Implementation Evidence

- Phase 04B timeline read-model timing: `eval/results/phase04b-timeline-benchmark.json`
- Phase 04C timeline UI verification: `pnpm type-check`, `pnpm --filter @ship/web test -- src/lib/document-tabs.test.ts`, and `pnpm build:web`
- Phase 04C bundle evidence: Vite emits the lazy `TimelineTab` chunk at about 11.39 kB minified / 3.69 kB gzip
- Phase 04D baseline/variance verification: `pnpm type-check`, `pnpm --filter @ship/api test -- src/routes/timeline.test.ts src/routes/dependencies.test.ts`, `pnpm --filter @ship/web test -- src/lib/document-tabs.test.ts`, and `pnpm build:web`
- Phase 04D bundle evidence: Vite emits the lazy `TimelineTab` chunk at about 15.45 kB minified / 4.49 kB gzip after baseline controls
- Phase 04E critical-path verification: `pnpm type-check`, `pnpm --filter @ship/api test -- src/routes/timeline.test.ts src/routes/dependencies.test.ts`, `pnpm --filter @ship/web test -- src/lib/document-tabs.test.ts`, and `pnpm build:web`
- Phase 04E bundle evidence: Vite emits the lazy `TimelineTab` chunk at about 15.90 kB minified / 4.62 kB gzip after critical-path highlighting
