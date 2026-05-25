# Phase 04A Plan - Dependency Data Model

**Date:** 2026-05-20  
**Status:** planned  
**Parent:** `docs/brainstorms/2026-05-20-phase-04-ms-project-inspired-improvements.md`

## Goal

Add a small, reliable dependency model for Ship documents so later Phase 04 work can render Microsoft Project-inspired timelines, blocked work, and critical path without bypassing the unified document model.

## Product Decision

Use one canonical stored relationship:

```text
document_id --depends_on--> related_id
```

Meaning: the source document should not be considered unblocked until the related document is complete enough for planning purposes.

The UI and read APIs can present the same edge as:

- `depends_on`: "A depends on B"
- `blocked_by`: reverse label from A's perspective
- `blocks`: reverse label from B's perspective

Do not store duplicate reciprocal rows for `blocks` and `blocked_by` in Phase 04A. That would create two sources of truth and make cycle prevention harder. If a future API accepts `blocks` or `blocked_by` as input, it should normalize them into one stored `depends_on` edge.

## Scope

Phase 04A includes:

- Database support for the `depends_on` association type.
- Shared TypeScript types for dependency associations.
- API support for creating, reading, and deleting dependency edges.
- Cycle prevention for direct and transitive dependency loops.
- Tests for validation, workspace scoping, duplicates, deletion, and cycle prevention.

Phase 04A does not include:

- Timeline UI.
- Critical path visualization.
- Baseline snapshots.
- Automatic scheduling, date propagation, or resource leveling.
- Microsoft Project import/export.

## Data Model

Add migration `api/src/db/migrations/039_add_dependency_association_type.sql`:

```sql
ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'depends_on';
```

No new table is needed. `document_associations` already has:

- `document_id`
- `related_id`
- `relationship_type`
- `metadata`
- uniqueness on `(document_id, related_id, relationship_type)`
- indexes on `(document_id, relationship_type)` and `(related_id, relationship_type)`

Those indexes are enough for Phase 04A dependency CRUD and reverse lookups. Do not add more indexes until Phase 04B timeline query plans prove a need.

### Supported Document Types

Allow dependency edges between:

- `issue`
- `project`
- `sprint`

Reject dependency edges involving:

- `person`
- `program`
- `wiki`
- weekly ritual documents (`weekly_plan`, `weekly_retro`, `weekly_review`, `standup`)

Rationale: issues, projects, and weeks are schedulable work items. Programs group work; people are resources; wiki and ritual docs should not become dependency tasks.

### Metadata

Keep metadata optional and boring:

```ts
interface DependencyMetadata {
  kind?: 'finish_to_start';
  lag_days?: number;
  note?: string;
}
```

Phase 04A only stores this metadata. It does not interpret lag or scheduling constraints.

## API Shape

Reuse the existing association routes where possible:

- `GET /api/documents/:id/associations?type=depends_on`
- `POST /api/documents/:id/associations`
- `DELETE /api/documents/:id/associations/:relatedId?type=depends_on`
- `GET /api/documents/:id/reverse-associations?type=depends_on`

Extend the existing validation in `api/src/routes/associations.ts`:

- `relationship_type` enum includes `depends_on`.
- Creation of `depends_on` calls dependency-specific validation.
- Existing relationship types keep their current behavior.

Add a dedicated read endpoint only if the UI needs it in Phase 04C:

```text
GET /api/documents/:id/dependencies
```

Expected response:

```ts
interface DocumentDependenciesResponse {
  depends_on: DependencyAssociation[];
  blocks: DependencyAssociation[];
}
```

For Phase 04A, the existing associations and reverse-associations endpoints are enough.

## Cycle Prevention

When adding `A depends_on B`, reject the request if `B` already depends on `A` directly or transitively.

Use a recursive CTE over canonical `depends_on` edges:

```sql
WITH RECURSIVE dependency_chain AS (
  SELECT document_id, related_id
  FROM document_associations
  WHERE document_id = $2
    AND relationship_type = 'depends_on'

  UNION

  SELECT da.document_id, da.related_id
  FROM document_associations da
  JOIN dependency_chain dc ON da.document_id = dc.related_id
  WHERE da.relationship_type = 'depends_on'
)
SELECT 1
FROM dependency_chain
WHERE related_id = $1
LIMIT 1;
```

Parameters:

- `$1` = source document id (`A`)
- `$2` = related/predecessor document id (`B`)

If a row exists, adding `A -> B` would close a cycle and must return:

```json
{
  "error": "circular_dependency",
  "message": "Cannot create dependency because it would create a cycle"
}
```

Use HTTP 400 for this validation failure.

## Shared Types

Update `shared/src/types/document.ts` or a new shared type file with:

```ts
export type RelationshipType =
  | 'parent'
  | 'project'
  | 'sprint'
  | 'program'
  | 'depends_on';

export type DependencyDisplayType = 'depends_on' | 'blocks' | 'blocked_by';
```

Keep `BelongsToType` limited to current hierarchy/grouping relationships. Dependency edges should not appear in `belongs_to` arrays.

## Tests

Add focused API tests, preferably `api/src/routes/dependencies.test.ts` or a dependency section in `associations-regression.test.ts`.

Required coverage:

- Creates `depends_on` between two supported same-workspace documents.
- Returns dependency via `GET /api/documents/:id/associations?type=depends_on`.
- Returns reverse blocker via `GET /api/documents/:id/reverse-associations?type=depends_on`.
- Duplicate create updates metadata rather than creating a second row.
- Deletes a dependency edge.
- Rejects self-dependency.
- Rejects invalid relationship type.
- Rejects cross-workspace related document.
- Rejects unsupported document type.
- Rejects two-node cycle: `A depends_on B`, then `B depends_on A`.
- Rejects transitive cycle: `A -> B -> C`, then `C -> A`.

## Verification

Run:

```powershell
pnpm db:migrate
pnpm type-check
pnpm --filter @ship/api test -- src/routes/dependencies.test.ts
pnpm --filter @ship/api test -- src/routes/associations-regression.test.ts
```

If no new dedicated test file is created, replace the dependencies test command with the exact file that receives the Phase 04A coverage.

## Implementation Order

1. Add migration `039_add_dependency_association_type.sql`.
2. Extend shared relationship types without adding dependency edges to `belongs_to`.
3. Extend `api/src/routes/associations.ts` validation with `depends_on`.
4. Add dependency-specific source/related document type validation.
5. Add recursive cycle prevention for `depends_on` creates.
6. Add or extend API tests.
7. Run the verification commands.

