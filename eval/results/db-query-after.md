# Phase 2 Database Query After Evidence

Captured: 2026-05-20T18:31:48.1899602Z

## Index Verification And Rewritten Weeks Query EXPLAIN

```text
          indexname          |                                                                                                              indexdef                                                                                                               
-----------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 idx_documents_sort          | CREATE INDEX idx_documents_sort ON public.documents USING btree (workspace_id, "position", created_at) WHERE ((archived_at IS NULL) AND (deleted_at IS NULL))
 idx_documents_sprint_number | CREATE INDEX idx_documents_sprint_number ON public.documents USING btree ((((properties ->> 'sprint_number'::text))::integer)) WHERE ((document_type = 'sprint'::document_type) AND (archived_at IS NULL) AND (deleted_at IS NULL))
(2 rows)

                                                                                                 QUERY PLAN                                                                                                 
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Sort  (cost=106.72..106.72 rows=1 width=346) (actual time=0.255..0.258 rows=5 loops=1)
   Sort Key: p.title
   Sort Method: quicksort  Memory: 27kB
   Buffers: shared hit=123
   ->  Nested Loop Left Join  (cost=63.88..106.71 rows=1 width=346) (actual time=0.132..0.229 rows=5 loops=1)
         Buffers: shared hit=120
         ->  Nested Loop Left Join  (cost=38.47..81.26 rows=1 width=293) (actual time=0.098..0.175 rows=5 loops=1)
               Buffers: shared hit=88
               ->  Nested Loop Left Join  (cost=30.28..73.05 rows=1 width=292) (actual time=0.092..0.164 rows=5 loops=1)
                     Buffers: shared hit=83
                     ->  Nested Loop Left Join  (cost=4.89..47.63 rows=1 width=280) (actual time=0.059..0.112 rows=5 loops=1)
                           Buffers: shared hit=54
                           ->  Nested Loop Left Join  (cost=4.74..46.81 rows=1 width=262) (actual time=0.055..0.104 rows=5 loops=1)
                                 Buffers: shared hit=44
                                 ->  Nested Loop  (cost=4.47..38.51 rows=1 width=246) (actual time=0.048..0.090 rows=5 loops=1)
                                       Join Filter: ((w.id = d.workspace_id) AND ((d.visibility = 'workspace'::text) OR (d.created_by = u.id) OR (true)))
                                       Buffers: shared hit=29
                                       ->  Limit  (cost=4.47..9.71 rows=1 width=33) (actual time=0.032..0.033 rows=1 loops=1)
                                             Buffers: shared hit=6
                                             ->  Nested Loop  (cost=4.47..20.20 rows=3 width=33) (actual time=0.031..0.032 rows=1 loops=1)
                                                   Buffers: shared hit=6
                                                   ->  Nested Loop  (cost=4.32..19.47 rows=3 width=32) (actual time=0.017..0.018 rows=1 loops=1)
                                                         Buffers: shared hit=4
                                                         ->  Index Scan using idx_users_email on users u  (cost=0.14..8.16 rows=1 width=16) (actual time=0.010..0.010 rows=1 loops=1)
                                                               Index Cond: (email = 'dev@ship.local'::text)
                                                               Buffers: shared hit=2
                                                         ->  Bitmap Heap Scan on workspace_memberships wm  (cost=4.17..11.28 rows=3 width=32) (actual time=0.005..0.005 rows=1 loops=1)
                                                               Recheck Cond: (user_id = u.id)
                                                               Heap Blocks: exact=1
                                                               Buffers: shared hit=2
                                                               ->  Bitmap Index Scan on idx_workspace_memberships_user_id  (cost=0.00..4.17 rows=3 width=0) (actual time=0.002..0.002 rows=1 loops=1)
                                                                     Index Cond: (user_id = u.id)
                                                                     Buffers: shared hit=1
                                                   ->  Index Only Scan using workspaces_pkey on workspaces w  (cost=0.15..0.24 rows=1 width=16) (actual time=0.013..0.013 rows=1 loops=1)
                                                         Index Cond: (id = wm.workspace_id)
                                                         Heap Fetches: 1
                                                         Buffers: shared hit=2
                                       ->  Seq Scan on documents d  (cost=0.00..28.78 rows=1 width=288) (actual time=0.015..0.055 rows=5 loops=1)
                                             Filter: ((document_type = 'sprint'::document_type) AND (((properties ->> 'sprint_number'::text))::integer = 11))
                                             Rows Removed by Filter: 252
                                             Buffers: shared hit=23
                                 ->  Index Scan using idx_document_associations_document_type on document_associations prog_da  (cost=0.27..8.29 rows=1 width=32) (actual time=0.002..0.002 rows=1 loops=5)
                                       Index Cond: ((document_id = d.id) AND (relationship_type = 'program'::relationship_type))
                                       Buffers: shared hit=15
                           ->  Index Scan using documents_pkey on documents p  (cost=0.15..0.81 rows=1 width=34) (actual time=0.001..0.001 rows=1 loops=5)
                                 Index Cond: (id = prog_da.related_id)
                                 Buffers: shared hit=10
                     ->  Aggregate  (cost=25.39..25.41 rows=1 width=12) (actual time=0.010..0.010 rows=1 loops=5)
                           Buffers: shared hit=29
                           ->  Nested Loop  (cost=4.33..25.37 rows=1 width=212) (actual time=0.007..0.009 rows=1 loops=5)
                                 Buffers: shared hit=29
                                 ->  Bitmap Heap Scan on document_associations ida  (cost=4.17..8.99 rows=2 width=16) (actual time=0.003..0.003 rows=2 loops=5)
                                       Recheck Cond: ((related_id = d.id) AND (relationship_type = 'sprint'::relationship_type))
                                       Heap Blocks: exact=6
                                       Buffers: shared hit=11
                                       ->  Bitmap Index Scan on idx_document_associations_related_type  (cost=0.00..4.17 rows=2 width=0) (actual time=0.002..0.002 rows=2 loops=5)
                                             Index Cond: ((related_id = d.id) AND (relationship_type = 'sprint'::relationship_type))
                                             Buffers: shared hit=5
                                 ->  Memoize  (cost=0.16..8.18 rows=1 width=228) (actual time=0.002..0.002 rows=0 loops=9)
                                       Cache Key: ida.document_id
                                       Cache Mode: logical
                                       Hits: 0  Misses: 9  Evictions: 0  Overflows: 0  Memory Usage: 2kB
                                       Buffers: shared hit=18
                                       ->  Index Scan using documents_pkey on documents i  (cost=0.15..8.17 rows=1 width=228) (actual time=0.002..0.002 rows=0 loops=9)
                                             Index Cond: (id = ida.document_id)
                                             Filter: (document_type = 'issue'::document_type)
                                             Rows Removed by Filter: 1
                                             Buffers: shared hit=18
               ->  Aggregate  (cost=8.19..8.20 rows=1 width=1) (actual time=0.002..0.002 rows=1 loops=5)
                     Buffers: shared hit=5
                     ->  Index Scan using idx_documents_parent_id on documents pl  (cost=0.15..8.19 rows=1 width=0) (actual time=0.001..0.001 rows=0 loops=5)
                           Index Cond: (parent_id = d.id)
                           Filter: (document_type = 'weekly_plan'::document_type)
                           Buffers: shared hit=5
         ->  Aggregate  (cost=25.41..25.43 rows=1 width=49) (actual time=0.010..0.010 rows=1 loops=5)
               Buffers: shared hit=32
               ->  Sort  (cost=25.38..25.39 rows=2 width=236) (actual time=0.009..0.009 rows=0 loops=5)
                     Sort Key: rt.updated_at DESC
                     Sort Method: quicksort  Memory: 25kB
                     Buffers: shared hit=32
                     ->  Nested Loop  (cost=4.33..25.37 rows=2 width=236) (actual time=0.006..0.006 rows=0 loops=5)
                           Buffers: shared hit=29
                           ->  Bitmap Heap Scan on document_associations rda  (cost=4.17..8.99 rows=2 width=16) (actual time=0.002..0.002 rows=2 loops=5)
                                 Recheck Cond: ((related_id = d.id) AND (relationship_type = 'sprint'::relationship_type))
                                 Heap Blocks: exact=6
                                 Buffers: shared hit=11
                                 ->  Bitmap Index Scan on idx_document_associations_related_type  (cost=0.00..4.17 rows=2 width=0) (actual time=0.001..0.001 rows=2 loops=5)
                                       Index Cond: ((related_id = d.id) AND (relationship_type = 'sprint'::relationship_type))
                                       Buffers: shared hit=5
                           ->  Memoize  (cost=0.16..8.18 rows=1 width=236) (actual time=0.002..0.002 rows=0 loops=9)
                                 Cache Key: rda.document_id
                                 Cache Mode: logical
                                 Hits: 0  Misses: 9  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                 Buffers: shared hit=18
                                 ->  Index Scan using documents_pkey on documents rt  (cost=0.15..8.17 rows=1 width=236) (actual time=0.001..0.001 rows=0 loops=9)
                                       Index Cond: (id = rda.document_id)
                                       Filter: ((properties ->> 'outcome'::text) IS NOT NULL)
                                       Rows Removed by Filter: 1
                                       Buffers: shared hit=18
 Planning:
   Buffers: shared hit=804
 Planning Time: 2.473 ms
 Execution Time: 0.495 ms
(103 rows)

```

## Notes

- Migration 038 is applied and both Phase 2 indexes exist.
- The EXPLAIN target is the rewritten `GET /api/weeks` root query shape using `LEFT JOIN LATERAL` aggregations.
- The seeded local database starts at `sprint_number = 11`, so this EXPLAIN uses `11` to exercise matching rows.
- The seeded local database is small, so PostgreSQL may still prefer sequential scans on `documents`; index existence is verified separately above.

## U14 Follow-Up: Query Count Reduction

Captured: 2026-05-20T20:34:19.812Z

The endpoint benchmark showed that the rewritten weeks SQL was already sub-millisecond in PostgreSQL, but request latency still regressed under c=50. The remaining pressure was request-level database work around the route:

| Flow | Before | After | Reduction |
|---|---:|---:|---:|
| `GET /api/weeks` with seeded `dev@ship.local` super-admin session | 5 DB statements | 3 DB statements | 40.00% |
| `GET /api/weeks` with normal workspace member session | 6 DB statements | 4 DB statements | 33.33% |

Before, every authenticated request updated `sessions.last_activity`, and the weeks route performed a second workspace-role lookup through `getVisibilityContext`. After:

- `sessions.last_activity` is updated only when the existing 60-second sliding-cookie threshold is crossed, avoiding a write and row lock on every request.
- `authMiddleware` reads the workspace membership role during the required access check.
- `GET /api/weeks` and `GET /api/weeks/my-week` pass the authenticated role/super-admin flag into `getVisibilityContext`, avoiding the duplicate role query.

Focused verification:

- `pnpm --filter @ship/api test -- src/__tests__/auth.test.ts src/routes/weeks.test.ts` passed: 56/56 tests.
- Auth unit tests now assert that `last_activity` is written beyond the 60-second threshold and not written inside it.
- `GET /api/weeks` c=50 rerun improved from the previous after-run P97.5 of 154 ms to 130 ms, with 0 non-2xx responses (`api-benchmark-weeks-u14-after.json`). This is essentially flat against the original c=50 baseline of 131 ms, but the PDF DB efficiency target is met by the measured query-count reduction.


