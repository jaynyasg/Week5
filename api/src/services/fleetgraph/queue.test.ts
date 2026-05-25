import { describe, expect, it } from 'vitest';
import { buildFleetGraphIdempotencyKey } from './queue.js';

describe('FleetGraph queue helpers', () => {
  it('builds deterministic idempotency keys for a document state window', () => {
    expect(buildFleetGraphIdempotencyKey({
      workspaceId: 'workspace-1',
      sourceEventType: 'document.updated',
      sourceDocumentId: 'doc-1',
      stateKey: '2026-05-25T00:00:00.000Z',
    })).toBe('workspace-1:document.updated:doc-1:2026-05-25T00:00:00.000Z');
  });
});
