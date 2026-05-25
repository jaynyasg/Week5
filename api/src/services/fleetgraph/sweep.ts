import { randomUUID } from 'crypto';
import { pool } from '../../db/client.js';
import { resolveFleetGraphAudience } from './audience.js';
import { createFleetGraphDeliveries } from './deliveries.js';
import { persistFleetGraphFinding } from './findings.js';
import { runFleetGraph } from './runner.js';
import {
  claimNextFleetGraphEvent,
  completeFleetGraphEvent,
  failFleetGraphEvent,
} from './queue.js';
import type {
  FleetGraphFindingCandidate,
  FleetGraphQueueEvent,
  FleetGraphRunResult,
} from './types.js';

export async function drainFleetGraphQueue(input: {
  workerId?: string;
  maxJobs?: number;
} = {}): Promise<{ processed: number; findingsCreated: number; failures: number }> {
  const workerId = input.workerId ?? `fleetgraph-${randomUUID()}`;
  const maxJobs = input.maxJobs ?? 10;
  let processed = 0;
  let findingsCreated = 0;
  let failures = 0;

  for (let index = 0; index < maxJobs; index++) {
    const event = await claimNextFleetGraphEvent({ workerId });
    if (!event) break;
    processed++;

    try {
      const result = await processFleetGraphQueueEvent(event);
      findingsCreated += result.findingsCreated;
      await completeFleetGraphEvent(event.id);
    } catch (error) {
      failures++;
      await failFleetGraphEvent({
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
        retryable: event.attemptCount < 3,
      });
    }
  }

  return { processed, findingsCreated, failures };
}

export async function processFleetGraphQueueEvent(
  event: FleetGraphQueueEvent,
): Promise<{ result: FleetGraphRunResult; findingsCreated: number }> {
  const result = await runFleetGraph({
    workspaceId: event.workspaceId,
    userId: readUserId(event.payload),
    mode: 'proactive',
    triggerType: event.sourceEventType,
    triggerId: event.sourceDocumentId,
    routeContext: event.sourceDocumentId
      ? { documentId: event.sourceDocumentId, path: `/documents/${event.sourceDocumentId}` }
      : undefined,
  });

  if (result.status === 'failed') {
    throw new Error(result.error ?? 'FleetGraph graph failed');
  }

  let findingsCreated = 0;
  for (const finding of result.state.findings) {
    await persistAndDeliverFinding(result, finding);
    findingsCreated++;
  }

  return { result, findingsCreated };
}

export async function enqueueFleetGraphSweepEvents(input: {
  workspaceId: string;
  limit?: number;
}): Promise<number> {
  const result = await pool.query<{ id: string; updated_at: Date | string }>(
    `SELECT id, updated_at
     FROM documents
     WHERE workspace_id = $1
       AND document_type IN ('project', 'sprint', 'issue')
       AND deleted_at IS NULL
       AND archived_at IS NULL
     ORDER BY updated_at DESC
     LIMIT $2`,
    [input.workspaceId, input.limit ?? 50],
  );

  const { enqueueFleetGraphEvent, buildFleetGraphIdempotencyKey } = await import('./queue.js');
  let enqueued = 0;
  for (const row of result.rows) {
    const created = await enqueueFleetGraphEvent({
      workspaceId: input.workspaceId,
      sourceEventType: 'fleetgraph.sweep',
      sourceDocumentId: row.id,
      payload: {
        source: 'sweep',
      },
      idempotencyKey: buildFleetGraphIdempotencyKey({
        workspaceId: input.workspaceId,
        sourceEventType: 'fleetgraph.sweep',
        sourceDocumentId: row.id,
        stateKey: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      }),
    });
    if (created) enqueued++;
  }
  return enqueued;
}

async function persistAndDeliverFinding(
  result: FleetGraphRunResult,
  finding: FleetGraphFindingCandidate,
): Promise<void> {
  const findingDocumentId = await persistFleetGraphFinding({
    context: result.state.context,
    candidate: finding,
  });
  const audience = resolveFleetGraphAudience(finding, result.state.context);
  await createFleetGraphDeliveries({
    workspaceId: result.state.context.workspaceId,
    findingDocumentId,
    finding,
    audience,
  });
}

function readUserId(payload: Record<string, unknown>): string | null {
  return typeof payload.userId === 'string' ? payload.userId : null;
}
