import { describe, expect, it } from 'vitest';
import { recordToEvidence } from './context.js';

describe('FleetGraph context helpers', () => {
  it('maps Ship document records into citation-safe evidence', () => {
    expect(recordToEvidence({
      id: 'project-1',
      documentType: 'project',
      title: 'Launch Project',
      url: '/documents/project-1',
      properties: {},
    }, 'Project is behind schedule.')).toEqual({
      sourceType: 'project',
      sourceId: 'project-1',
      title: 'Launch Project',
      excerpt: 'Project is behind schedule.',
      url: '/documents/project-1',
    });
  });
});
