---
title: "Phase 07 - Documents Pagination Contract"
date: 2026-05-20
status: complete
parent: docs/brainstorms/2026-05-19-shipshape-additional-improvements.md
---

# Phase 07 - Documents Pagination Contract

## Goal

Close the remaining Item B API response-time gap by making `/api/documents` expose an explicit page-style pagination contract without breaking existing callers that still expect the legacy array response.

## Implementation

- Preserved `GET /api/documents` and `GET /api/documents?type=wiki` as array responses for the current React document tree and command palette.
- Kept the existing offset mode: `GET /api/documents?limit=50&offset=0&include_total=true`.
- Added page-style pagination:
  - `GET /api/documents?page=1&limit=50`
  - `GET /api/documents?page=1&per_page=50`
  - `GET /api/documents?per_page=50`
- Page-style requests return `{ items, pagination }` and include `pagination.total_count` by default.
- Ambiguous mixed pagination now fails fast: `offset` cannot be combined with `page` or `per_page`, and conflicting `limit` plus `per_page` values are rejected.

## Contract

```json
{
  "items": [],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "page": 1,
    "per_page": 50,
    "returned": 0,
    "has_more": false,
    "total": 0,
    "total_count": 0
  }
}
```

## Evidence

- API route: `api/src/routes/documents.ts`
- OpenAPI schema: `api/src/openapi/schemas/documents.ts`
- Regression test: `api/src/routes/documents-visibility.test.ts`
- Contract note: `eval/results/documents-pagination-contract.md`

