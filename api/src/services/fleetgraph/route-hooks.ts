import { buildFleetGraphIdempotencyKey, safeEnqueueFleetGraphEvent } from './queue.js';
import { drainFleetGraphQueue } from './sweep.js';

export function enqueueFleetGraphDocumentMutation(input: {
  workspaceId?: string;
  userId?: string;
  documentId?: string | null;
  sourceEventType: string;
  stateKey?: string | number | null;
  payload?: Record<string, unknown>;
}): void {
  if (!input.workspaceId || !input.documentId) return;

  void safeEnqueueFleetGraphEvent({
    workspaceId: input.workspaceId,
    sourceEventType: input.sourceEventType,
    sourceDocumentId: input.documentId,
    payload: {
      ...input.payload,
      userId: input.userId,
    },
    idempotencyKey: buildFleetGraphIdempotencyKey({
      workspaceId: input.workspaceId,
      sourceEventType: input.sourceEventType,
      sourceDocumentId: input.documentId,
      stateKey: input.stateKey ?? Date.now(),
    }),
  }).then((event) => {
    if (event) kickFleetGraphInlineDrain(input.workspaceId!, event.id);
  });
}

function kickFleetGraphInlineDrain(workspaceId: string, eventId: string): void {
  if (process.env.SHIP_FLEETGRAPH_INLINE_DRAIN === 'false') return;
  if (process.env.SHIP_FLEETGRAPH_PROACTIVE_ENABLED === 'false') return;

  void drainFleetGraphQueue({
    workerId: `fleetgraph-inline:${workspaceId}:${Date.now()}`,
    eventId,
    maxJobs: 1,
  }).catch((error) => {
    console.warn('FleetGraph inline drain failed:', error instanceof Error ? error.message : error);
  });
}
