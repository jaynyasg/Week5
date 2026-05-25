import { buildFleetGraphIdempotencyKey, safeEnqueueFleetGraphEvent } from './queue.js';

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
  });
}
