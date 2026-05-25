# Ask Ship Assistant

Ask Ship is the in-app assistant surfaced from the left icon rail below Teams. It answers questions from the current workspace using Ship documents, projects, issues, weeks, timelines, and indexed documentation uploads. Responses include citations back to Ship records or uploaded documentation context.

## Server Configuration

Configure these variables on the API/web service:

| Variable | Required | Notes |
|---|---:|---|
| `OPENAI_API_KEY` | Yes for OpenAI | Server-side only. Never expose it through `VITE_*` variables. |
| `SHIP_ASSISTANT_ENABLED` | No | Defaults to enabled unless set to `false`. |
| `SHIP_ASSISTANT_PROVIDER` | No | `openai`, `bedrock`, or `mock`. Defaults to `openai` when `OPENAI_API_KEY` is present. |
| `SHIP_ASSISTANT_MODEL` | No | Defaults to `gpt-4o-mini` for OpenAI. |
| `SHIP_ASSISTANT_EMBEDDINGS_ENABLED` | No | Set to `true` to generate embeddings with the configured OpenAI key, or `mock` for deterministic local/eval vectors. Defaults to disabled. |
| `SHIP_ASSISTANT_EMBEDDING_MODEL` | No | Defaults to `text-embedding-3-small`. |
| `SHIP_ASSISTANT_EMBEDDING_DIMENSIONS` | No | Defaults to `1536`; smaller values are accepted for mock/local evals. |
| `SHIP_ASSISTANT_TRACING_ENABLED` | No | Defaults to enabled unless set to `false`. Records assistant run/tool/retrieval/model/extraction metadata without storing full prompts. |
| `SHIP_ASSISTANT_UPLOAD_INDEXING` | No | Defaults to enabled unless set to `false`. |
| `SHIP_UPLOAD_STORAGE` | No | Set to `local` for the Render demo path without S3. Use S3/object storage for durable production uploads. |
| `SHIP_UPLOADS_DIR` | No | Optional local upload directory override. |

The assistant status endpoint is authenticated:

```bash
GET /api/assistant/status
```

It reports whether the assistant is available, which provider/model is selected, missing server configuration, supported upload types, and message/context limits.

## Hybrid Retrieval, Traces, and Evals

Ask Ship uses a bounded retrieval loop: gather Ship context, blend lexical/structured/semantic signals, rerank the candidate sources, then send the final context pack to the model. Semantic retrieval is additive; if embeddings are disabled or unavailable, Ask Ship continues to use PostgreSQL full-text search and structured project/timeline context.

Assistant runs are recorded in `assistant_runs`, with supporting events in `assistant_trace_events`. These rows capture request IDs, retrieval/tool/model/extraction timings, source counts, embedding failures, and indexing metadata. They intentionally avoid storing raw prompts, full extracted content, provider secrets, or model output.

Chat responses include a `traceId`. Use it to inspect the run:

```bash
GET /api/assistant/traces/:traceId
```

The user who created a trace can inspect it. Workspace admins and super-admins can inspect traces created by other members in the same workspace. The trace response returns the run summary and ordered events such as `semantic_file_search`, `search_ship_context`, `score_blend_rerank`, and `answer_generated`.

From a logged-in browser session:

```js
const trace = await fetch('/api/assistant/traces/<traceId>', { credentials: 'include' })
  .then((response) => response.json());
```

With an API token:

```bash
curl -H "Authorization: Bearer $SHIP_API_TOKEN" "$SHIP_API_URL/assistant/traces/<traceId>"
```

Use `SHIP_API_URL=https://<render-app-url>/api` for the deployed Render app.

The eval harness in `api/src/services/assistant/eval-harness.ts` scores deterministic cases for expected citations, required answer terms, and required citation excerpt terms. Use it for local regression tests and future CI artifacts before changing retrieval or prompt behavior.

```bash
pnpm assistant:eval
pnpm assistant:eval -- --input path/to/eval.json --output eval/results/assistant-eval.json --min-score 1
```

Eval input JSON contains `cases` and `responses`. A case can assert `expectedCitationTitles`, `requiredAnswerTerms`, and `requiredCitationExcerptTerms`. The citation excerpt check is useful for regressions where the final answer looks right but the selected source excerpt does not contain the full supporting passage.

### Trace Diagnosis Checklist

Use this sequence when a deployed Ask Ship answer looks stale, incomplete, or poorly grounded:

1. Check `GET /api/assistant/status` after login. Confirm `available`, provider/model, embeddings, tracing, supported upload types, and missing configuration.
2. Ask a focused question and copy the response `traceId`.
3. Fetch `GET /api/assistant/traces/:traceId`.
4. Confirm the trace includes `search_ship_context`, `score_blend_rerank`, and `answer_generated`. If embeddings are enabled, also check for `semantic_file_search`.
5. Inspect `score_blend_rerank.metadata.selectedSources`. Useful fields include `sourceType`, `title`, `excerptChars`, `retrievalStrategy`, `signals.contextBoost`, `signals.semanticScore`, and `signals.rerankScore`.
6. If the answer cites the wrong source, compare `sourceCounts` and `selectedSources` against the current route context. A strong context boost can intentionally favor the open document.
7. If the answer misses a late list item, confirm the citation excerpt contains that term. Add a deterministic eval case with `requiredCitationExcerptTerms` before changing extraction or reranking.
8. If embeddings fail, look for a `query_embedding_failed` event. Lexical and structured retrieval should still run.
9. If an uploaded file cannot answer, check `GET /api/files/:fileId/assistant-index`, reindex with `POST /api/files/:fileId/reindex`, and confirm `assistant_search_chunks` contains rows for the file.

## Indexed Uploads

The Ask Ship panel shows **Upload Doc** when it is opened from a document route. Uploads are associated with that current document and indexed after upload completion.

Supported MVP formats:

- `.txt`
- `.md`
- `.csv`
- `.pdf`
- `.docx`

Other allowed file uploads still succeed, but assistant indexing marks them `unsupported`. Extraction is capped separately from upload size by `ASSISTANT_LIMITS.maxExtractionBytes` in `api/src/services/assistant/config.ts`.

Indexed files move through these statuses:

- `not_indexed`
- `indexing`
- `indexed`
- `unsupported`
- `failed`

Useful file indexing endpoints:

```bash
GET /api/files/:fileId/assistant-index
POST /api/files/:fileId/reindex
```

## Render Notes

`render.yaml` declares non-secret assistant defaults and `OPENAI_API_KEY` with `sync: false`. For existing Blueprint deployments, add `OPENAI_API_KEY` manually to the `ship` web service in Render because newly added `sync: false` values are not automatically created on existing services.

The current Render demo path uses `SHIP_UPLOAD_STORAGE=local`. That is enough to demonstrate upload-backed answers, but files are not durable across instance rebuilds unless a persistent disk or object storage is configured. For durable production uploads, configure S3/object storage and CDN settings instead.

## FleetGraph Mode

FleetGraph shares the Ask Ship drawer shell but has a separate API, state model, and transcript. Its authenticated endpoints live under `/api/fleetgraph`:

```bash
GET /api/fleetgraph/status
POST /api/fleetgraph/chat
GET /api/fleetgraph/findings
GET /api/fleetgraph/findings/:id
PATCH /api/fleetgraph/deliveries/:id
GET /api/fleetgraph/runs/:id
POST /api/fleetgraph/actions/:id/decision
```

FleetGraph configuration uses `SHIP_FLEETGRAPH_*` variables. The Render Blueprint also declares `LANGSMITH_PROJECT` and `LANGSMITH_API_KEY` for trace evidence. FleetGraph notifications reuse the existing `/events` channel with the `fleetgraph:finding-delivered` event type, so no new browser WebSocket endpoint is required.

## Demo Flow

1. Open a project, timeline, issue, or wiki document.
2. Click the Ask Ship rail button below Teams.
3. Ask a workspace question such as `what is blocked?`.
4. Open a wiki document, upload a small `.md`, `.txt`, `.pdf`, or `.docx` file with **Upload Doc**.
5. Ask a question answered by that uploaded file.
6. Open the cited source link to confirm the answer is grounded in Ship context.
