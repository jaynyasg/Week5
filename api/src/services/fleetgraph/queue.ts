import { pool } from '../../db/client.js';
import type { FleetGraphQueueEvent } from './types.js';

export async function enqueueFleetGraphEvent(input: {
  workspaceId: string;
  sourceEventType: string;
  sourceDocumentId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  availableAt?: Date;
}): Promise<FleetGraphQueueEvent | null> {
  const result = await pool.query<QueueRow>(
    `INSERT INTO fleetgraph_event_queue (
       workspace_id, source_event_type, source_document_id, payload, idempotency_key, available_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [
      input.workspaceId,
      input.sourceEventType,
      input.sourceDocumentId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.idempotencyKey,
      input.availableAt ?? new Date(),
    ],
  );

  return result.rows[0] ? toQueueEvent(result.rows[0]) : null;
}

export async function safeEnqueueFleetGraphEvent(
  input: Parameters<typeof enqueueFleetGraphEvent>[0],
): Promise<FleetGraphQueueEvent | null> {
  try {
    return await enqueueFleetGraphEvent(input);
  } catch (error) {
    console.warn('FleetGraph event could not be enqueued:', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function claimNextFleetGraphEvent(input: {
  workerId: string;
  now?: Date;
}): Promise<FleetGraphQueueEvent | null> {
  const result = await pool.query<QueueRow>(
    `UPDATE fleetgraph_event_queue
     SET status = 'processing',
         locked_at = now(),
         locked_by = $1,
         attempt_count = attempt_count + 1,
         updated_at = now()
     WHERE id = (
       SELECT id
       FROM fleetgraph_event_queue
       WHERE status IN ('queued', 'retrying')
         AND available_at <= $2
       ORDER BY available_at ASC, created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [input.workerId, input.now ?? new Date()],
  );

  return result.rows[0] ? toQueueEvent(result.rows[0]) : null;
}

export async function claimFleetGraphEventById(input: {
  eventId: string;
  workerId: string;
  now?: Date;
}): Promise<FleetGraphQueueEvent | null> {
  const result = await pool.query<QueueRow>(
    `UPDATE fleetgraph_event_queue
     SET status = 'processing',
         locked_at = now(),
         locked_by = $1,
         attempt_count = attempt_count + 1,
         updated_at = now()
     WHERE id = $2
       AND status IN ('queued', 'retrying')
       AND available_at <= $3
     RETURNING *`,
    [input.workerId, input.eventId, input.now ?? new Date()],
  );

  return result.rows[0] ? toQueueEvent(result.rows[0]) : null;
}

export async function completeFleetGraphEvent(eventId: string): Promise<void> {
  await pool.query(
    `UPDATE fleetgraph_event_queue
     SET status = 'completed',
         locked_at = NULL,
         locked_by = NULL,
         last_error = NULL,
         updated_at = now()
     WHERE id = $1`,
    [eventId],
  );
}

export async function failFleetGraphEvent(input: {
  eventId: string;
  error: string;
  retryable: boolean;
  retryAfterMs?: number;
}): Promise<void> {
  await pool.query(
    `UPDATE fleetgraph_event_queue
     SET status = $1,
         locked_at = NULL,
         locked_by = NULL,
         last_error = $2,
         available_at = $3,
         updated_at = now()
     WHERE id = $4`,
    [
      input.retryable ? 'retrying' : 'failed',
      input.error.slice(0, 2000),
      input.retryable ? new Date(Date.now() + (input.retryAfterMs ?? 60_000)) : new Date(),
      input.eventId,
    ],
  );
}

export function buildFleetGraphIdempotencyKey(input: {
  workspaceId: string;
  sourceEventType: string;
  sourceDocumentId?: string | null;
  stateKey?: string | number | null;
}): string {
  return [
    input.workspaceId,
    input.sourceEventType,
    input.sourceDocumentId ?? 'workspace',
    input.stateKey ?? 'current',
  ].join(':');
}

interface QueueRow {
  id: string;
  workspace_id: string;
  source_event_type: string;
  source_document_id: string | null;
  payload: Record<string, unknown>;
  status: FleetGraphQueueEvent['status'];
  idempotency_key: string;
  attempt_count: number;
  created_at: Date | string;
}

function toQueueEvent(row: QueueRow): FleetGraphQueueEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceEventType: row.source_event_type,
    sourceDocumentId: row.source_document_id,
    payload: row.payload ?? {},
    status: row.status,
    idempotencyKey: row.idempotency_key,
    attemptCount: Number(row.attempt_count),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}
