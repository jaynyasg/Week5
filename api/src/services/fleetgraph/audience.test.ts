import { describe, expect, it } from 'vitest';
import { resolveFleetGraphAudience } from './audience.js';
import type { FleetGraphContext, FleetGraphFindingCandidate } from './types.js';

describe('FleetGraph audience resolution', () => {
  it('uses owner first, then accountable, then workspace admins', () => {
    const finding = findingCandidate({ ownerUserId: 'owner-1' });
    expect(resolveFleetGraphAudience(finding, context())).toEqual({
      userIds: ['owner-1'],
      reason: 'owner',
    });

    expect(resolveFleetGraphAudience(findingCandidate({ ownerUserId: null }), context({
      project: {
        id: 'project-1',
        documentType: 'project',
        title: 'Project',
        url: '/documents/project-1',
        properties: { accountable_id: 'accountable-1' },
      },
    }))).toEqual({
      userIds: ['accountable-1'],
      reason: 'accountable',
    });

    expect(resolveFleetGraphAudience(findingCandidate({ ownerUserId: null }), context())).toEqual({
      userIds: ['admin-1'],
      reason: 'admin_fallback',
    });
  });
});

function context(overrides: Partial<FleetGraphContext> = {}): FleetGraphContext {
  return {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    workspaceAdminUserIds: ['admin-1'],
    issues: [],
    now: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

function findingCandidate(overrides: Partial<FleetGraphFindingCandidate> = {}): FleetGraphFindingCandidate {
  return {
    key: 'risk-1',
    title: 'Risk',
    severity: 'medium',
    kind: 'planning_gap',
    confidence: 0.8,
    summary: 'Summary',
    rationale: 'Rationale',
    targetDocumentId: 'project-1',
    targetDocumentType: 'project',
    ownerUserId: null,
    evidence: [],
    ...overrides,
  };
}
