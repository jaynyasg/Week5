# FleetGraph Presearch

Last reviewed: 2026-05-25

This file records the sources used before implementation so the Week 5 build starts from explicit assumptions instead of memory.

## PRD Source

- Source file: `Week 5 GFA - FleetGraph PRD.pdf`
- Extracted text: `planning/prd-extract.md`

Important PRD constraints:

- Proactive mode must run without a user present.
- Trigger model must be documented and defended.
- Detection latency target is less than 5 minutes.
- LangSmith tracing is required from day one.
- At least one human-in-the-loop gate is required.
- Chat must be embedded in context, not a standalone chatbot page.
- Agent chat and notifications must be accessible in the UI.
- Real Ship data is required. No mocked responses.

## Ship Reference

Reference repo:

`C:\Users\jaynyasg\OneDrive\Documents\GitLab\ship`

Reference branch and commit:

- Branch: `main`
- Commit: `0a1837f7a16cf14bcbb54164f549a4b8b219e676`

Ship docs reviewed:

- `docs/unified-document-model.md`
- `docs/application-architecture.md`
- `docs/document-model-conventions.md`
- `docs/week-documentation-philosophy.md`
- `docs/accountability-philosophy.md`
- `docs/assistant.md`
- `DEPLOYMENT.md`
- `render.yaml`

Ship code reviewed:

- `api/src/db/schema.sql`
- `api/src/routes/assistant.ts`
- `api/src/services/assistant/chat.ts`
- `api/src/services/assistant/tracing.ts`
- `api/src/services/timeline.ts`
- `api/src/services/accountability.ts`
- `api/src/routes/accountability.ts`
- `api/src/collaboration/index.ts`
- `api/src/middleware/auth.ts`
- `api/src/services/audit.ts`
- `web/src/components/assistant/AskShipPanel.tsx`
- `web/src/hooks/useAssistant.ts`
- `web/src/hooks/useRealtimeEvents.tsx`
- `web/src/pages/App.tsx`

## External Sources

Official LangGraph and LangSmith docs reviewed:

- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts / human-in-the-loop: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- LangSmith trace management and sharing: https://docs.langchain.com/langsmith/manage-trace

Relevant findings:

- LangGraph persistence saves graph state as checkpoints and supports human-in-the-loop, memory, time travel, and fault tolerance.
- LangGraph interrupts pause graph execution and resume through the same `thread_id`.
- The TypeScript docs list `@langchain/langgraph-checkpoint-postgres` as a production Postgres checkpointer.
- LangSmith shared trace links can be viewed by anyone with the link, so shared traces must be checked for sensitive data before submission.

## Accepted Engineering Decisions

1. Full Ship-native integration is in scope despite the larger blast radius.
2. FleetGraph findings are durable Ship documents plus separate delivery/read-state rows.
3. Proactive execution uses a hybrid event queue plus scheduled sweep.
4. LangGraph Postgres checkpoints store resumable graph state.
5. FleetGraph run metadata, action proposals, costs, and trace links live in Ship-owned tables.
6. The UI reuses the existing Ask Ship drawer shell with FleetGraph mode and notifications.
7. FleetGraph uses a system actor for detection and notification.
8. Human approval is required before FleetGraph mutates project, week, issue, approval, or RACI state.
9. Add `fleetgraph_finding` as a document type.
10. Store focal finding target metadata in document properties and use existing org associations for grouping.

## Implementation Questions To Revisit

- Which model and provider will be used for the first real run?
- What exact detection types ship in the MVP?
- Should the sweep run inside the web service, a Render cron job, or both for local/demo?
- How long should finding documents, run records, and checkpoints be retained?
- Should FleetGraph findings be indexed into Ask Ship retrieval immediately, or only after MVP?
- What trace fields must be redacted or omitted before public trace links are submitted?

