import { createHash, randomUUID } from 'crypto';
import { pool } from '../../db/client.js';
import { getAssistantModel, getAssistantProvider } from './config.js';

export interface AssistantRun {
  id: string | null;
  requestId: string;
  startedAt: number;
}

export interface AssistantTraceEventInput {
  runId?: string | null;
  workspaceId: string;
  userId?: string | null;
  eventType: 'retrieval' | 'rerank' | 'tool' | 'model' | 'extraction' | 'embedding' | 'eval';
  eventName: string;
  sourceType?: string | null;
  sourceId?: string | null;
  documentId?: string | null;
  fileId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  error?: string | null;
}

interface AssistantTraceResponseBody {
  run: {
    traceId: string;
    status: string;
    provider: string | null;
    model: string | null;
    totalSources: number;
    citationsCount: number;
    durationMs: number | null;
    metadata: Record<string, unknown>;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  };
  events: Array<{
    id: string;
    eventType: string;
    eventName: string;
    sourceType: string | null;
    sourceId: string | null;
    documentId: string | null;
    fileId: string | null;
    durationMs: number | null;
    metadata: Record<string, unknown>;
    error: string | null;
    createdAt: string;
  }>;
}

export async function startAssistantRun(input: {
  workspaceId: string;
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<AssistantRun> {
  const requestId = randomUUID();
  if (!isAssistantTracingEnabled()) {
    return {
      id: null,
      requestId,
      startedAt: Date.now(),
    };
  }

  const result = await pool.query<{ id: string }>(
    `INSERT INTO assistant_runs
      (workspace_id, user_id, request_id, message_hash, status, provider, model, metadata)
     VALUES ($1, $2, $3, $4, 'started', $5, $6, $7)
     RETURNING id`,
    [
      input.workspaceId,
      input.userId,
      requestId,
      hashMessage(input.message),
      getAssistantProvider(),
      getAssistantModel(),
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  return {
    id: result.rows[0]!.id,
    requestId,
    startedAt: Date.now(),
  };
}

export async function completeAssistantRun(input: {
  run: AssistantRun;
  status: 'answered' | 'no_context' | 'unavailable' | 'rate_limited' | 'error';
  totalSources: number;
  citationsCount: number;
  metadata?: Record<string, unknown>;
  error?: string | null;
}): Promise<void> {
  if (!isAssistantTracingEnabled() || !input.run.id) return;

  const durationMs = Date.now() - input.run.startedAt;
  await pool.query(
    `UPDATE assistant_runs
     SET status = $1,
         total_sources = $2,
         citations_count = $3,
         duration_ms = $4,
         metadata = metadata || $5::jsonb,
         error = $6,
         completed_at = now()
     WHERE id = $7`,
    [
      input.status,
      input.totalSources,
      input.citationsCount,
      durationMs,
      JSON.stringify(input.metadata ?? {}),
      input.error ?? null,
      input.run.id,
    ],
  );
}

export async function recordAssistantTraceEvent(input: AssistantTraceEventInput): Promise<void> {
  if (!isAssistantTracingEnabled()) return;

  await pool.query(
    `INSERT INTO assistant_trace_events
      (run_id, workspace_id, user_id, event_type, event_name, source_type, source_id, document_id, file_id, duration_ms, metadata, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9::uuid, $10, $11, $12)`,
    [
      input.runId ?? null,
      input.workspaceId,
      input.userId ?? null,
      input.eventType,
      input.eventName,
      input.sourceType ?? null,
      input.sourceId ?? null,
      input.documentId ?? null,
      input.fileId ?? null,
      input.durationMs ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.error ?? null,
    ],
  );
}

export async function safeRecordAssistantTraceEvent(input: AssistantTraceEventInput): Promise<void> {
  try {
    await recordAssistantTraceEvent(input);
  } catch (error) {
    console.warn('Ask Ship trace event could not be recorded:', error instanceof Error ? error.message : error);
  }
}

export async function getAssistantTrace(input: {
  traceId: string;
  workspaceId: string;
  userId: string;
  canInspectWorkspaceTraces?: boolean;
}): Promise<AssistantTraceResponseBody | null> {
  const runResult = await pool.query<{
    id: string;
    request_id: string;
    status: string;
    provider: string | null;
    model: string | null;
    total_sources: number;
    citations_count: number;
    duration_ms: number | null;
    metadata: Record<string, unknown>;
    error: string | null;
    created_at: Date | string;
    completed_at: Date | string | null;
  }>(
    `SELECT id,
            request_id,
            status,
            provider,
            model,
            total_sources,
            citations_count,
            duration_ms,
            metadata,
            error,
            created_at,
            completed_at
     FROM assistant_runs
     WHERE request_id = $1
       AND workspace_id = $2
       AND ($3::boolean OR user_id = $4)
     LIMIT 1`,
    [
      input.traceId,
      input.workspaceId,
      Boolean(input.canInspectWorkspaceTraces),
      input.userId,
    ],
  );

  const runRow = runResult.rows[0];
  if (!runRow) return null;

  const eventResult = await pool.query<{
    id: string;
    event_type: string;
    event_name: string;
    source_type: string | null;
    source_id: string | null;
    document_id: string | null;
    file_id: string | null;
    duration_ms: number | null;
    metadata: Record<string, unknown>;
    error: string | null;
    created_at: Date | string;
  }>(
    `SELECT id,
            event_type,
            event_name,
            source_type,
            source_id,
            document_id,
            file_id,
            duration_ms,
            metadata,
            error,
            created_at
     FROM assistant_trace_events
     WHERE run_id = $1
       AND workspace_id = $2
     ORDER BY created_at ASC, id ASC`,
    [runRow.id, input.workspaceId],
  );

  return {
    run: {
      traceId: runRow.request_id,
      status: runRow.status,
      provider: runRow.provider,
      model: runRow.model,
      totalSources: Number(runRow.total_sources),
      citationsCount: Number(runRow.citations_count),
      durationMs: runRow.duration_ms === null ? null : Number(runRow.duration_ms),
      metadata: runRow.metadata ?? {},
      error: runRow.error,
      createdAt: toIsoString(runRow.created_at),
      completedAt: runRow.completed_at ? toIsoString(runRow.completed_at) : null,
    },
    events: eventResult.rows.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      eventName: event.event_name,
      sourceType: event.source_type,
      sourceId: event.source_id,
      documentId: event.document_id,
      fileId: event.file_id,
      durationMs: event.duration_ms === null ? null : Number(event.duration_ms),
      metadata: event.metadata ?? {},
      error: event.error,
      createdAt: toIsoString(event.created_at),
    })),
  };
}

export function isAssistantTracingEnabled(): boolean {
  return process.env.SHIP_ASSISTANT_TRACING_ENABLED !== 'false';
}

function hashMessage(message: string): string {
  return createHash('sha256').update(message).digest('hex');
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
