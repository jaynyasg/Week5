import { describe, expect, it } from 'vitest';
import { estimateFleetGraphUsage } from './runner.js';
import type { FleetGraphState } from './types.js';

describe('FleetGraph run usage estimation', () => {
  it('estimates nonzero token usage from context, findings, proposals, and answers', () => {
    const usage = estimateFleetGraphUsage(state({
      message: 'What changed this week?',
      findings: [{
        key: 'approved-plan-changed:plan-1',
        title: 'Approved plan changed',
        severity: 'medium',
        kind: 'scope_drift',
        confidence: 0.88,
        summary: 'An approved plan changed after approval.',
        rationale: 'Approved plans should be re-reviewed.',
        targetDocumentId: 'plan-1',
        targetDocumentType: 'weekly_plan',
        ownerUserId: 'owner-1',
        evidence: [
          {
            sourceType: 'document',
            sourceId: 'plan-1',
            title: 'Week Plan',
            excerpt: 'Changed after approval.',
          },
        ],
        actionProposal: {
          proposedAction: 'request_update',
          targetDocumentId: 'plan-1',
          payload: { reason: 'approved_plan_changed' },
          reason: 'Request a human re-review.',
        },
      }],
      proposals: [{
        proposedAction: 'request_update',
        targetDocumentId: 'plan-1',
        payload: { reason: 'approved_plan_changed' },
        reason: 'Request a human re-review.',
      }],
      answer: {
        status: 'answered',
        content: 'FleetGraph checked the week plan and found one approval risk.',
        citations: [],
      },
    }));

    expect(usage.inputTokens).toBeGreaterThan(1000);
    expect(usage.outputTokens).toBeGreaterThan(300);
    expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
  });
});

function state(overrides: Partial<FleetGraphState> = {}): FleetGraphState {
  return {
    context: {
      workspaceId: 'workspace-1',
      userId: 'user-1',
      workspaceAdminUserIds: ['admin-1'],
      project: {
        id: 'project-1',
        documentType: 'project',
        title: 'Launch Project',
        url: '/documents/project-1',
        properties: { owner_id: 'owner-1' },
      },
      weekPlan: {
        id: 'plan-1',
        documentType: 'weekly_plan',
        title: 'Week Plan',
        url: '/documents/plan-1',
        properties: { approval_status: 'approved' },
      },
      issues: [{
        id: 'issue-1',
        documentType: 'issue',
        title: 'Blocked integration',
        url: '/documents/issue-1',
        properties: { state: 'todo' },
        state: 'todo',
        assigneeId: 'owner-1',
        priority: 'high',
      }],
      now: '2026-05-25T00:00:00.000Z',
    },
    findings: [],
    proposals: [],
    ...overrides,
  };
}
