import { describe, expect, it } from 'vitest';
import {
  makeFleetGraphRunnableConfig,
  makeFleetGraphThreadId,
  sanitizeFleetGraphMetadata,
} from './tracing.js';

describe('FleetGraph tracing helpers', () => {
  it('builds stable thread ids from workspace, mode, and subject', () => {
    expect(makeFleetGraphThreadId({
      workspaceId: 'workspace-1',
      mode: 'proactive',
      subjectId: 'document-1',
    })).toBe('fleetgraph:workspace-1:proactive:document-1');
  });

  it('requires thread_id in runnable config for checkpointed invocations', () => {
    expect(makeFleetGraphRunnableConfig('thread-1')).toEqual({
      configurable: {
        thread_id: 'thread-1',
        checkpoint_ns: '',
      },
    });
    expect(() => makeFleetGraphRunnableConfig('   ')).toThrow('thread_id is required');
  });

  it('removes sensitive metadata and keeps safe bounded values', () => {
    const metadata = sanitizeFleetGraphMetadata({
      route: '/documents/123',
      authorization: 'Bearer secret',
      nested: {
        sessionToken: 'secret',
        count: 3,
      },
      longText: 'x'.repeat(700),
      items: Array.from({ length: 30 }, (_, index) => ({ index, apiKey: 'secret' })),
    });

    expect(metadata.authorization).toBeUndefined();
    expect(metadata.nested).toEqual({ count: 3 });
    expect(String(metadata.longText)).toHaveLength(503);
    expect(metadata.items).toHaveLength(20);
    expect(metadata.items).not.toContainEqual(expect.objectContaining({ apiKey: 'secret' }));
  });
});
