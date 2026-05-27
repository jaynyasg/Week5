import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildFleetGraphIdempotencyKey: vi.fn(() => 'fleetgraph:key'),
  safeEnqueueFleetGraphEvent: vi.fn((): Promise<{ id: string } | null> => Promise.resolve({ id: 'event-1' })),
  drainFleetGraphQueue: vi.fn(() => Promise.resolve({ processed: 1, findingsCreated: 1, failures: 0 })),
}));

vi.mock('./queue.js', () => ({
  buildFleetGraphIdempotencyKey: mocks.buildFleetGraphIdempotencyKey,
  safeEnqueueFleetGraphEvent: mocks.safeEnqueueFleetGraphEvent,
}));

vi.mock('./sweep.js', () => ({
  drainFleetGraphQueue: mocks.drainFleetGraphQueue,
}));

import { enqueueFleetGraphDocumentMutation } from './route-hooks.js';

describe('FleetGraph route hooks', () => {
  const originalInlineDrain = process.env.SHIP_FLEETGRAPH_INLINE_DRAIN;
  const originalProactiveEnabled = process.env.SHIP_FLEETGRAPH_PROACTIVE_ENABLED;

  beforeEach(() => {
    mocks.buildFleetGraphIdempotencyKey.mockClear();
    mocks.safeEnqueueFleetGraphEvent.mockClear();
    mocks.drainFleetGraphQueue.mockClear();
    process.env.SHIP_FLEETGRAPH_INLINE_DRAIN = originalInlineDrain;
    process.env.SHIP_FLEETGRAPH_PROACTIVE_ENABLED = originalProactiveEnabled;
  });

  it('kicks one inline drain after enqueueing a document mutation', async () => {
    enqueueFleetGraphDocumentMutation({
      workspaceId: '4a6fa27d-ef41-4f6e-8a7b-5342a6eab83a',
      userId: 'd4bf8076-5077-49e2-a21e-37ea98eb900d',
      documentId: '64ff9a7d-a49e-4600-a74e-b7650d942d16',
      sourceEventType: 'document.created',
      stateKey: 'updated-at',
      payload: { documentType: 'sprint' },
    });

    await vi.waitFor(() => {
      expect(mocks.safeEnqueueFleetGraphEvent).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: '4a6fa27d-ef41-4f6e-8a7b-5342a6eab83a',
        sourceDocumentId: '64ff9a7d-a49e-4600-a74e-b7650d942d16',
      }));
      expect(mocks.drainFleetGraphQueue).toHaveBeenCalledWith(expect.objectContaining({
        eventId: 'event-1',
        maxJobs: 1,
      }));
    });
  });

  it('does not inline drain when disabled', async () => {
    process.env.SHIP_FLEETGRAPH_INLINE_DRAIN = 'false';

    enqueueFleetGraphDocumentMutation({
      workspaceId: '4a6fa27d-ef41-4f6e-8a7b-5342a6eab83a',
      documentId: '64ff9a7d-a49e-4600-a74e-b7650d942d16',
      sourceEventType: 'document.updated',
    });

    await vi.waitFor(() => {
      expect(mocks.safeEnqueueFleetGraphEvent).toHaveBeenCalled();
    });
    expect(mocks.drainFleetGraphQueue).not.toHaveBeenCalled();
  });

  it('does not inline drain when enqueue is deduped or unavailable', async () => {
    mocks.safeEnqueueFleetGraphEvent.mockResolvedValueOnce(null);

    enqueueFleetGraphDocumentMutation({
      workspaceId: '4a6fa27d-ef41-4f6e-8a7b-5342a6eab83a',
      documentId: '64ff9a7d-a49e-4600-a74e-b7650d942d16',
      sourceEventType: 'document.updated',
    });

    await vi.waitFor(() => {
      expect(mocks.safeEnqueueFleetGraphEvent).toHaveBeenCalled();
    });
    expect(mocks.drainFleetGraphQueue).not.toHaveBeenCalled();
  });
});
