# Database Query Efficiency Baseline (U4 / Category 4)

> **Audit unit:** U4 (Database Query Efficiency)
> **Captured at:** 2026-05-19
> **Source artifacts:** `eval/results/db-schema-documents.txt`, `eval/results/db-query-log.txt`, `eval/results/db-tables.txt`
> **Tools used:** PostgreSQL `\d` schema inspection, `log_statement = 'all'` query logging, code inspection of `api/src/routes/*.ts`

---

## Database state at baseline

| Table | Row count | Notes |
|---|---|---|
| `documents` | 257 | All content types (wiki, issue, program, project, sprint, weekly_plan, weekly_retro, person, view) |
| `document_associations` | 401 | Junction table for many-to-many relationships (program/project/sprint membership) |
| `users` | 11 | Seed creates dev user + 10 fake team members |
| `workspace_memberships` | 11 | One per user, all in single seed workspace |
| `audit_logs` | 3 | Unexpectedly small — either audit log writes aren't happening for these test runs, or the table was recently emptied |

---

## `documents` table schema (the load-bearing table)

26 columns including 2 heavy ones:
- `content` (JSONB) — TipTap document state, default `{"type":"doc","content":[{"type":"paragraph"}]}`
- `yjs_state` (BYTEA) — binary Yjs CRDT state

13 indexes:

| Index | Coverage | Type |
|---|---|---|
| `documents_pkey` | `id` | B-tree primary key |
| `idx_documents_workspace_id` | `workspace_id` | B-tree |
| `idx_documents_document_type` | `document_type` | B-tree |
| **`idx_documents_active`** | **`(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL`** | **Partial B-tree composite** |
| `idx_documents_parent_id` | `parent_id` | B-tree |
| `idx_documents_properties` | `properties` | GIN |
| `idx_documents_visibility` | `visibility` | B-tree |
| `idx_documents_visibility_created_by` | `(visibility, created_by)` | B-tree composite |
| `idx_documents_archived_at` | `archived_at WHERE NOT NULL` | Partial B-tree |
| `idx_documents_deleted_at` | `deleted_at WHERE NOT NULL` | Partial B-tree |
| `idx_documents_converted_from` | `converted_from_id WHERE NOT NULL` | Partial B-tree |
| `idx_documents_converted_to` | `converted_to_id WHERE NOT NULL` | Partial B-tree |
| `idx_documents_person_user_id` | `(properties->>'user_id') WHERE document_type='person'` | Partial B-tree on JSONB expression |

**Index strategy is generally excellent.** Partial indexes are used judiciously (archived, deleted, converted, person types). GIN index on `properties` enables JSONB key lookups. The `idx_documents_active` partial composite is exactly what we'd recommend.

**Major finding — invalidates U14's original plan:** The composite index on `(workspace_id, document_type)` filtering active rows ALREADY EXISTS as `idx_documents_active`. U14's planned "add missing composite index" target is no longer applicable. Need to either find a different index opportunity OR re-target U14 toward query-shape improvements.

---

## Query analysis by endpoint

### `GET /api/documents` (route `api/src/routes/documents.ts` line 94)

```sql
SELECT id, workspace_id, document_type, title, parent_id, position,
       ticket_number, properties,
       created_at, updated_at, created_by, visibility
FROM documents
WHERE workspace_id = $1
  AND archived_at IS NULL
  AND deleted_at IS NULL
  AND (visibility = 'workspace' OR created_by = $2 OR $3 = TRUE)
ORDER BY position ASC, created_at DESC;
```

**Diagnosis:**
- ✅ Already excludes `content` and `yjs_state` (good projection discipline)
- ⚠️ Returns ALL matching rows — no pagination (returns all 257 docs for our test workspace)
- ⚠️ Includes `properties` JSONB — for some doc types (weeks with embedded plan data), `properties` can be 1-3 KB per row
- ⚠️ `ORDER BY position ASC, created_at DESC` — no index covers this; Postgres sorts in-memory after filtering
- ✅ `WHERE workspace_id = $1 AND archived_at IS NULL AND deleted_at IS NULL` matches the `idx_documents_active` partial index perfectly
- ⚠️ The `(visibility = 'workspace' OR created_by = $2 OR $3 = TRUE)` OR-clause may defeat index usage on visibility-only paths; would need EXPLAIN to confirm

**Why latency degrades under concurrency** (per U4 API benchmark):
- Each row averages ~580 bytes serialized (15 columns × ~40 bytes), so 257 rows = ~150 KB
- At c=25 concurrency, 25 connections each requesting 150 KB simultaneously = 3.75 MB of serialization + transport work in flight
- API process competing for CPU on JSON serialization is the likely bottleneck (not DB time)

### `GET /api/issues` (route `api/src/routes/issues.ts` line 115)

```sql
SELECT d.id, d.title, d.properties, d.ticket_number,
       d.content,                          -- ⚠️ SMOKING GUN: full TipTap content included
       d.created_at, d.updated_at, d.created_by,
       d.started_at, d.completed_at, d.cancelled_at, d.reopened_at,
       d.converted_from_id,
       u.name as assignee_name,
       CASE WHEN person_doc.archived_at IS NOT NULL THEN true ELSE false END as assignee_archived
FROM documents d
LEFT JOIN users u ON (d.properties->>'assignee_id')::uuid = u.id
LEFT JOIN documents person_doc ON person_doc.workspace_id = d.workspace_id
  AND person_doc.document_type = 'person'
  AND person_doc.properties->>'user_id' = d.properties->>'assignee_id'
WHERE d.workspace_id = $1 AND d.document_type = 'issue'
  AND [visibility filter]
  AND d.archived_at IS NULL AND d.deleted_at IS NULL;
```

**Diagnosis:**
- ❌ **Includes `d.content` in SELECT** — even though most issues don't have rich-text content, the default `{"type":"doc","content":[{"type":"paragraph"}]}` adds ~60 bytes per row. With actual content (issue descriptions, comments), it can be much larger.
- ⚠️ Two LEFT JOINs per row: users + documents-as-person — adds query work
- ⚠️ The `person_doc` join filters via JSONB key extraction (`properties->>'user_id'`) — the GIN index on properties helps but JSONB extractions are slower than column joins
- ✅ `WHERE workspace_id AND document_type = 'issue' AND archived_at IS NULL AND deleted_at IS NULL` matches `idx_documents_active` perfectly

**Headline U13 fix:** Remove `d.content` from this SELECT. That single change should cut response size by 30-50% on average.

### `GET /api/weeks` (worst query — captured live from logs)

```sql
SELECT d.id, d.title, d.properties, prog_da.related_id as program_id,
       p.title as program_name,
       p.properties->>'prefix' as program_prefix,
       p.properties->>'accountable_id' as program_accountable_id,
       (SELECT op.properties->>'reports_to' FROM documents op
        WHERE d.properties->>'owner_id' IS NOT NULL
          AND op.id = (d.properties->>'owner_id')::uuid
          AND op.document_type = 'person'
          AND op.workspace_id = d.workspace_id) as owner_reports_to,
       $5::timestamp as workspace_sprint_start_date,
       u.id as owner_id, u.name as owner_name, u.email as owner_email,
       (SELECT COUNT(*) FROM documents i
        JOIN document_associations ida ON ida.document_id = i.id
          AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue') as issue_count,
       (SELECT COUNT(*) FROM documents i
        JOIN document_associations ida ON ida.document_id = i.id
          AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue' AND i.properties->>'state' = 'done') as completed_count,
       (SELECT COUNT(*) FROM documents i
        JOIN document_associations ida ON ida.document_id = i.id
          AND ida.related_id = d.id AND ida.relationship_type = 'sprint'
        WHERE i.document_type = 'issue'
          AND i.properties->>'state' IN ('in_progress', 'in_review')) as started_count,
       (SELECT COUNT(*) > 0 FROM documents pl
        WHERE pl.parent_id = d.id AND pl.document_type = 'weekly_plan') as has_plan,
       (SELECT COUNT(*) > 0 FROM documents rt
        JOIN document_associations rda ON rda.document_id = rt.id
          AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL) as has_retro,
       (SELECT rt.properties->>'outcome' FROM documents rt
        JOIN document_associations rda ON rda.document_id = rt.id
          AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_outcome,
       (SELECT rt.id FROM documents rt
        JOIN document_associations rda ON rda.document_id = rt.id
          AND rda.related_id = d.id AND rda.relationship_type = 'sprint'
        WHERE rt.properties->>'outcome' IS NOT NULL LIMIT 1) as retro_id
FROM documents d
LEFT JOIN document_associations prog_da ON prog_da.document_id = d.id
  AND prog_da.relationship_type = 'program'
LEFT JOIN documents p ON prog_da.related_id = p.id
LEFT JOIN users u ON (d.properties->'assignee_ids'->>0)::uuid = u.id
WHERE d.workspace_id = $1 AND d.document_type = 'sprint'
  AND (d.properties->>'sprint_number')::int = $2
  AND [visibility filter]
ORDER BY (d.properties->>'sprint_number')::int, p.title;
```

**Diagnosis — THE worst query in the codebase by inspection:**
- ❌ **7 correlated subqueries per row returned** (owner_reports_to, issue_count, completed_count, started_count, has_plan, has_retro, retro_outcome, retro_id)
- Each subquery touches the `documents` table again, JOINed with `document_associations`
- The `has_retro` and `retro_outcome` subqueries are essentially the same query repeated twice (could be combined)
- The `has_plan` subquery uses `parent_id` (column lookup, fast) but `has_retro` uses junction table (more expensive)
- Sort by `(d.properties->>'sprint_number')::int` requires casting JSONB to int per row — no index serves this
- 3 outer JOINs on top of the 7 subqueries

**Optimization potential:** Rewrite as a single query with LATERAL JOINs or LEFT JOINs to `document_associations` and `documents` (issues), with conditional COUNT/MAX aggregations grouped by week. Should be 5-10× faster.

This is route-handler code (in `api/src/routes/weeks.ts`), so the fix is a U13 (API performance) candidate, not a U14 (migration) candidate.

### `GET /api/programs`

Per code inspection of `api/src/routes/programs.ts` (similar pattern):
- Returns 5 program documents from the seed
- Small payload — autocannon's flooding behavior triggered rate limit during benchmark

No baseline latency data captured due to rate limit; expected to be fast given the small dataset.

### `GET /api/dashboard`

**Returned 404 during testing — the route `/api/dashboard` has no root handler.** Per `api/src/app.ts` line 209: `app.use('/api/dashboard', dashboardRoutes);` — the route is mounted but the actual handlers are at sub-paths (likely `/api/dashboard/widgets` or similar). Our benchmark of `/api/dashboard` was meaningless.

Documented as a methodology note. Dashboard sub-paths would need to be identified for proper benchmarking.

---

## Findings summary

| # | Finding | Severity | Audit category |
|---|---|---|---|
| F1 | `idx_documents_active` partial composite index on `(workspace_id, document_type) WHERE archived_at IS NULL AND deleted_at IS NULL` already exists | Positive | Invalidates U14 original plan; opens opportunity for different DB-layer improvement |
| F2 | `/api/issues` query INCLUDES `d.content` in SELECT — heavyweight TipTap JSON returned in list responses | High (Category 3 + 4) | U13 priority fix — single-column removal yields large savings |
| F3 | `/api/weeks` query has 7 correlated subqueries per row — can be rewritten with JOINs + conditional aggregations | High (Category 3 + 4) | U13 candidate — bigger refactor but bigger win |
| F4 | `/api/documents` and `/api/issues` lack pagination — return all matching rows | Medium (Category 3) | U13 candidate; adds bounded latency under load |
| F5 | `ORDER BY position, created_at` on documents query has no covering index — in-memory sort after filter | Medium (Category 4) | U14 candidate — add composite index `(workspace_id, document_type, position, created_at)` to support ORDER BY |
| F6 | `/api/dashboard` 404 at root — route mounted but no root handler | Low (methodology) | Document; benchmark sub-paths if needed |
| F7 | `audit_logs` table has only 3 rows — either audit logging isn't happening for benchmark traffic, OR logs were recently truncated | Low (investigate) | Worth verifying for THREAT_MODEL.md — audit logging is documented as a feature |
| F8 | Multiple `properties->>` JSONB extractions in WHERE clauses across queries | Medium (Category 4) | Performance concern at scale; GIN index helps, but explicit JSONB indexes for hot keys (`sprint_number`, `state`, `assignee_id`) could help |

---

## Updated U14 target

The original U14 plan target — "add missing composite index on `(workspace_id, document_type)`" — is invalidated by F1. The composite index already exists as a partial index.

**New U14 target options** (pick one for the audit improvement):

1. **Add composite index for ORDER BY support** (F5): create `idx_documents_active_ordered` partial index on `(workspace_id, document_type, position ASC, created_at DESC) WHERE archived_at IS NULL AND deleted_at IS NULL`. Supports the documents list endpoint's ORDER BY without in-memory sort.
2. **Add JSONB expression index on `properties->>'state'` for issues** (F8): `CREATE INDEX idx_documents_issue_state ON documents ((properties->>'state')) WHERE document_type = 'issue' AND archived_at IS NULL`. Supports common issue filters by state.
3. **Add JSONB expression index on `properties->>'sprint_number'` for weeks** (F8): `CREATE INDEX idx_documents_sprint_number ON documents (((properties->>'sprint_number')::int)) WHERE document_type = 'sprint' AND archived_at IS NULL`. Eliminates per-row cast in the weeks query.

Recommendation: Option 3 has the highest impact because the weeks query's pain (7 subqueries) is amplified by the per-row JSONB cast for ORDER BY.

---

## Improvement target for U14

**PDF requirement:** "20% query count reduction on at least one user flow, OR 50% improvement on the slowest query."

**Selected option (proposed):**
- Slowest query: `/api/weeks` (7 correlated subqueries per row, JSONB cast in ORDER BY)
- Target: 50% improvement via JSONB expression index on `sprint_number` (Option 3 above)
- **AND** complementary improvement in U13: rewrite the 7 subqueries as a single GROUP BY query

This combination should yield far more than 50% improvement — likely 5-10× faster.

---

## Reproducibility

To re-run this baseline:
1. Ensure Docker Postgres is running (`pnpm docker:up postgres`)
2. Ensure `log_statement = 'all'` is set on the Postgres container
3. Login via API to obtain a session cookie
4. Hit the 5 endpoints with `Invoke-WebRequest` + the session
5. Capture logs with `docker logs ship-postgres-1 --tail 500`
6. Re-run `\d documents` and table row counts via `docker exec ship-postgres-1 psql -U ship -d ship_dev -c ...`

The query log file (`eval/results/db-query-log.txt`) and schema dump (`eval/results/db-schema-documents.txt`) are committed alongside this report.
