# FleetGraph Cost and Tracing Plan

Last updated: 2026-05-26

Generated via `$gsd-docs-update` from the PRD, `PRESEARCH.md`, and `FLEETGRAPH.md`.

## Purpose

This plan defines how FleetGraph will track graph costs, produce LangSmith traces, and fill the final cost analysis required by the PRD.

## PRD Requirements

FleetGraph must document:

- LangSmith tracing from day one.
- At least two shared trace links.
- Trace links that show different graph paths.
- Actual development/testing spend.
- Claude/API cost input and output token breakdown if applicable.
- Number of graph invocations during development.
- Total development spend.
- Production monthly cost projections at 100, 1,000, and 10,000 users.
- Assumptions for proactive runs, on-demand invocations, and average tokens.

## Trace Storage Plan

Store trace metadata in `fleetgraph_runs`:

- `langsmith_trace_url`
- `thread_id`
- `mode`
- `trigger_type`
- `model`
- `input_tokens`
- `output_tokens`
- `estimated_cost_usd`
- safe metadata

Store trace URL summary in finding document properties:

- `properties.langsmith_trace_url`
- `properties.run_id`
- `properties.thread_id`

Do not store:

- API keys
- bearer tokens
- cookies
- raw private document dumps
- full prompt text if it includes sensitive state

## Required Trace Paths

Trace A: proactive finding-only path.

Expected route:

```text
event/sweep -> normalize context -> fetch Ship state -> detect condition -> persist finding -> create delivery -> notify -> complete
```

Trace B: HITL path.

Expected route:

```text
event/chat -> normalize context -> fetch Ship state -> detect condition -> create proposal -> interrupt -> approve/reject -> resume -> complete
```

Optional Trace C: no-finding path.

Expected route:

```text
event/sweep -> normalize context -> fetch Ship state -> no surfacing-worthy condition -> complete without finding
```

## Token and Cost Capture

Capture per graph run:

- provider
- model
- prompt/input tokens
- completion/output tokens
- total tokens
- provider-reported cost if available
- estimated cost if provider does not return cost
- graph mode: proactive or on-demand
- detection type
- source route/context

If using OpenAI-compatible metadata, normalize model token usage into the same fields regardless of graph path.

## Cost Formula

Per run:

```text
estimated_cost = (input_tokens / 1_000_000 * input_price_per_million)
               + (output_tokens / 1_000_000 * output_price_per_million)
```

Monthly projection:

```text
monthly_cost = users
             * projects_per_user
             * proactive_runs_per_project_per_day
             * 30
             * avg_proactive_run_cost
           + users
             * on_demand_invocations_per_user_per_day
             * 30
             * avg_on_demand_run_cost
```

Use current provider prices on the submission date. Do not hard-code stale prices in final docs without rechecking.

## Current Starter Pricing Snapshot

Checked on 2026-05-26 against [OpenAI GPT-4o mini model pricing](https://platform.openai.com/docs/models/gpt-4o-mini).

| Model | Input | Output | Notes |
|---|---:|---:|---|
| `gpt-4o-mini` | $0.15 / 1M tokens | $0.60 / 1M tokens | Starter low-cost model for demo estimates; recheck on submission day |

Seeded local evidence uses 1,200 input tokens and 280 output tokens, which evaluates to $0.000348 with this pricing. A second isolated Docker Postgres validation row captured 787 input tokens and 149 output tokens, which evaluates to $0.000207 at the same price.

Implementation status:

- FleetGraph run completion now records estimated input/output tokens for local graph runs when provider metadata is unavailable.
- The timed FleetGraph E2E verifies the linked `fleetgraph_runs` row has nonzero token metadata and a non-null estimated cost field.
- Mock local runs still use the mock model rate unless price overrides are configured, so final submission must replace local evidence with deployed or model-backed run rows.

## Initial Assumptions To Replace With Measurements

These are placeholders until real runs exist:

| Variable | Starter assumption | Replace with |
|---|---:|---|
| Projects per user | 1 | observed Ship demo data |
| Proactive runs per project/day | 12 | queue/sweep plan after implementation |
| On-demand invocations per user/day | 3 | demo usage estimate |
| Avg proactive input tokens | 5,000 | `fleetgraph_runs.input_tokens` |
| Avg proactive output tokens | 500 | `fleetgraph_runs.output_tokens` |
| Avg on-demand input tokens | 8,000 | `fleetgraph_runs.input_tokens` |
| Avg on-demand output tokens | 800 | `fleetgraph_runs.output_tokens` |

Derived starter costs:

| Run type | Starter tokens | Estimated cost/run |
|---|---:|---:|
| Proactive | 5,000 input / 500 output | $0.00105 |
| On-demand | 8,000 input / 800 output | $0.00168 |

## Development Spend Log

Add a table to final `FLEETGRAPH.md`.

| Date | Run type | Count | Input tokens | Output tokens | Cost | Notes |
|---|---:|---:|---:|---:|---:|---|
| 2026-05-26 | proactive seed | 1 | 1,200 | 280 | $0.000348 | Actual E2E seed `fleetgraph_runs` row using mock provider; stored estimate matches current `gpt-4o-mini` pricing |
| 2026-05-26 | on-demand chat validation | 1 | 787 | 149 | $0.000207 | Actual isolated Docker Postgres `fleetgraph_runs` row using mock provider; cost recomputed as `gpt-4o-mini` equivalent |
| 2026-05-26 | on-demand chat validation | 1 | 0 | 0 | $0.000000 | Actual isolated Docker Postgres `fleetgraph_runs` row with no provider usage captured |
| 2026-05-26 | proactive finding trace | 1 | 1,050 | 245 | $0.000305 | Local OpenAI-provider FleetGraph run `f25df8ca-e643-45a7-bf6e-e4ca21bb902d`; shared LangSmith trace captured |
| 2026-05-26 | HITL action proposal trace | 1 | 1,310 | 325 | $0.000392 | Local OpenAI-provider FleetGraph run `2328e746-019a-46cd-896f-1dc3a51ea045`; shared LangSmith trace captured |
| 2026-05-26 | on-demand chat trace | 1 | 973 | 162 | $0.000243 | Local OpenAI-provider FleetGraph run `8ff69405-894c-4cc4-a7bc-3a1a2dd04764`; shared LangSmith trace captured |

Deployed billable spend remains pending until FleetGraph is verified on Render. The local trace rows above use FleetGraph's stored usage estimates with the OpenAI provider configured.

## Production Projection Table

Final `FLEETGRAPH.md` should include:

| Scale | Monthly estimate | Assumptions |
|---|---:|---|
| 100 users | $52.92 | 1 project/user, 12 proactive runs/project/day, 3 on-demand runs/user/day |
| 1,000 users | $529.20 | Same starter assumptions |
| 10,000 users | $5,292.00 | Same starter assumptions |

## Trace Submission Checklist

Before pasting shared trace links into final docs:

- Open each shared link in a clean browser session.
- Confirm it does not reveal secrets.
- Confirm it shows expected graph nodes/branches.
- Confirm the two required links show different execution paths.
- Record the Ship state that triggered each trace.
- Record the expected output next to the trace link.

## Implementation Hooks

Code areas likely involved:

- `api/src/services/fleetgraph/runner`
- `api/src/services/fleetgraph/tracing`
- `api/src/services/fleetgraph/costs`
- `api/src/services/fleetgraph/findings`
- `api/src/routes/fleetgraph.ts`

Existing reference:

- `api/src/services/assistant/tracing.ts`
- `api/src/db/migrations/046_assistant_hybrid_rag_traces.sql`
- `docs/assistant.md`
