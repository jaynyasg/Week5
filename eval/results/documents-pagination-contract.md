# Documents Pagination Contract

Date: 2026-05-20

Phase 07 closes the remaining `/api/documents` pagination gap without changing the default response shape that existing frontend callers consume.

## Supported Modes

| Request | Response shape | Count behavior |
|---|---|---|
| `GET /api/documents` | `DocumentListItem[]` | No count query |
| `GET /api/documents?limit=50&offset=0` | `{ items, pagination }` | Count only when `include_total=true` |
| `GET /api/documents?page=1&limit=50` | `{ items, pagination }` | Includes `total` and `total_count` by default |
| `GET /api/documents?page=1&per_page=50` | `{ items, pagination }` | Includes `total` and `total_count` by default |
| `GET /api/documents?per_page=50` | `{ items, pagination }` | Defaults to page 1 and includes count metadata |

## Page-Style Metadata

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

## Compatibility Decision

The original brainstorm suggested making bare `GET /api/documents` default to page 1. Phase 07 intentionally keeps the bare route as an array because `web/src/hooks/useDocumentsQuery.ts` and `web/src/components/CommandPalette.tsx` consume it directly as a list. Page-style pagination is opt-in, which gives benchmark and API clients the performance contract without creating a frontend migration inside this phase.

