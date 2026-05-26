# FleetGraph Deployment and Ops Plan

Last updated: 2026-05-26

Generated via `$gsd-docs-update` from Week5 planning docs and Ship deployment references.

## Purpose

This plan defines how FleetGraph should run when no user is present, how it fits the existing Render deployment, and what operational checks are needed for submission.

## Existing Deployment Shape

Verified reference files:

- `DEPLOYMENT.md`
- `render.yaml`
- `api/src/index.ts`
- `api/src/app.ts`
- `api/src/collaboration/index.ts`

Existing Render setup:

- One Render web service named `ship`.
- One Render PostgreSQL database named `ship-db`.
- Web service build runs workspace install and `pnpm build`.
- Web service start command runs migrations before `node api/dist/index.js`.
- Same Express origin serves API, frontend, `/events`, and `/collaboration/*`.
- Existing Render cron job exists for `ship-security-probe`.

## Deployment Decision

Recommended MVP path:

- Keep FleetGraph API and UI inside the existing `ship` web service.
- Add a FleetGraph queue drain command that can run from a Render cron job.
- Keep a scheduled sweep as the backstop.
- Avoid a separate long-running worker service unless cron cadence or queue volume proves insufficient.

Why:

- Matches existing Render model.
- Keeps session cookies and WebSocket events same-origin.
- Minimizes deployment resources for the Week5 deadline.
- Render cron is already present in the project.

## Runtime Model

Proactive flow:

1. Ship mutation enqueues a durable FleetGraph event.
2. FleetGraph cron runs every 1-2 minutes if Render supports the chosen cadence.
3. Queue drain claims available jobs with DB locks.
4. Graph run creates findings/deliveries/action proposals.
5. Web service broadcasts realtime notifications to connected users.
6. Scheduled sweep catches missed/stale state.

On-demand flow:

1. Browser calls `/api/fleetgraph/chat`.
2. Web service runs graph with route context and authenticated user.
3. Response returns cited answer, optional finding links, and optional action proposal.

## Render Configuration Plan

Add environment variables to web service:

- `SHIP_FLEETGRAPH_ENABLED=true`
- `SHIP_FLEETGRAPH_PROVIDER=openai`
- `SHIP_FLEETGRAPH_MODEL=<chosen model>`
- `SHIP_FLEETGRAPH_PROACTIVE_ENABLED=true`
- `SHIP_FLEETGRAPH_SWEEP_INTERVAL_MS=60000`
- `SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP=25`
- `SHIP_FLEETGRAPH_TRACING_ENABLED=true`
- `LANGSMITH_API_KEY` with `sync: false`
- `LANGSMITH_PROJECT=<project name>`

Use existing `OPENAI_API_KEY` if the provider is OpenAI and the same key is acceptable.

Add a Render cron job:

- name: `ship-fleetgraph-drain`
- build command: same API-capable build path as existing cron
- start command: `node api/dist/scripts/fleetgraph-drain.js`
- schedule: every 2 minutes for the demo branch, with the in-service sweep fallback retained for missed runs
- `SHIP_FLEETGRAPH_SWEEP_ON_DRAIN=true` so each cron run can enqueue bounded sweep events before claiming queued jobs
- `SHIP_FLEETGRAPH_SWEEP_MAX_WORKSPACES=25` and `SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP=25` to keep sweep work bounded

Do not commit secrets into `render.yaml`.

## Local Development Plan

Local dev should support:

- API/UI through existing `pnpm dev`.
- Manual queue drain command for deterministic testing.
- Optional interval runner behind an env flag.
- Seed helper or fixture to create a state that should produce one finding.

Proposed scripts after implementation:

- `pnpm --filter @ship/api fleetgraph:drain`
- `node api/dist/scripts/fleetgraph-drain.js` after `pnpm build:api`

Add root scripts only if they are useful for the final submission workflow.

## Health and Status

`GET /api/fleetgraph/status` should report:

- enabled
- provider/model
- LangSmith configured
- checkpointer reachable
- queue counts
- last successful drain
- last successful sweep
- missing configuration

Do not expose secrets.

## Operational Failure Modes

| Failure | Expected behavior |
|---|---|
| LangSmith unavailable | Graph still runs; run stores trace error or missing trace state |
| Model provider unavailable | Run fails safely; finding is not created from partial reasoning |
| Queue drain overlap | DB lock prevents duplicate processing |
| Web service restart | queued jobs remain durable |
| Cron missed | scheduled sweep catches stale state later |
| Notification socket offline | delivery row remains unread for next UI fetch |
| Action approval auth changed | approval route rejects and proposal remains visible |

## Deployment Verification

After deploy:

- `/health` returns OK.
- Login/setup works.
- `/events` connects over `wss`.
- `GET /api/fleetgraph/status` returns enabled/available.
- Manual queue drain can run.
- Proactive finding can be generated against real Ship data.
- FleetGraph drawer opens in deployed UI.
- LangSmith trace URL is stored for a real run.
- Render logs show no migration or startup errors.

Current local verification status on 2026-05-26:

- `pnpm --filter @ship/api test:fleetgraph-api` passed against isolated Docker Postgres.
- `pnpm --filter @ship/api exec vitest run src/openapi/fleetgraph.test.ts src/routes/fleetgraph.test.ts` passed against isolated Docker Postgres.
- `pnpm test:e2e -- e2e/fleetgraph.spec.ts --workers=1` passed 2/2 and covered `/api/fleetgraph/status`, drawer access, action rejection, context chat, manual queue drain, and a timed event-to-finding path under 5 minutes.
- Public Render verification is still pending because the local process did not include `RENDER_API_KEY` or a known deployed FleetGraph URL.
- Model-backed LangSmith traces and billable cost rows are still pending because the local process did not include `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, or `LANGSMITH_PROJECT`.

## Open Ops Questions

- What exact Render cron cadence is allowed on the selected plan?
- Should queue drain run only as cron or also inside the web service for the demo?
- How long should LangGraph checkpoints be retained?
- Should old run rows be retained for the full project or cleaned after submission?

Recommended defaults:

- Cron plus sweep fallback.
- Keep run rows and findings through submission.
- Defer checkpoint cleanup until after the final demo.
