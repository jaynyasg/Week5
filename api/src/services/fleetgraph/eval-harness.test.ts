import { describe, expect, it } from 'vitest';
import { evaluateFleetGraphRuns } from './eval-harness.js';
import { runFleetGraphState } from './graph.js';
import type { FleetGraphContext, FleetGraphIssueRef, FleetGraphRecordRef } from './types.js';

describe('FleetGraph eval harness', () => {
  it('scores deterministic graph paths needed for submission evidence', () => {
    const results = {
      'proactive-finding-only': runFleetGraphState({
        context: context({
          week: record('week-1', 'sprint', 'Week 5', {
            sprint_status: 'active',
            owner_id: 'owner-1',
          }),
        }),
      }),
      'hitl-action-proposal': runFleetGraphState({
        context: context({
          weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {
            approval_status: 'approved',
            approved_at: '2026-05-20T00:00:00.000Z',
            changed_after_approval: true,
          }),
        }),
      }),
      'no-finding': runFleetGraphState({
        context: context({
          project: record('project-1', 'project', 'Healthy Project', {
            owner_id: 'owner-1',
            accountable_id: 'accountable-1',
          }),
        }),
      }),
      'context-chat': runFleetGraphState({
        context: context({
          project: record('project-1', 'project', 'Launch Project', {
            owner_id: 'owner-1',
            accountable_id: 'accountable-1',
          }),
          issues: [
            issue('issue-1', 'Blocked integration'),
            issue('issue-2', 'Late review'),
          ],
        }),
        message: 'What should I look at next?',
      }),
    };

    const report = evaluateFleetGraphRuns([
      {
        id: 'proactive-finding-only',
        expectedStatus: 'completed',
        minFindings: 1,
        expectedFindingKinds: ['planning_gap'],
      },
      {
        id: 'hitl-action-proposal',
        expectedStatus: 'interrupted',
        minFindings: 1,
        expectedFindingKinds: ['scope_drift'],
        expectedProposalActions: ['request_update'],
      },
      {
        id: 'no-finding',
        expectedStatus: 'completed',
        minFindings: 0,
      },
      {
        id: 'context-chat',
        expectedStatus: 'completed',
        requiredAnswerTerms: ['fleetgraph checked', 'active issues'],
        expectedCitationTitles: ['Launch Project'],
      },
    ], results);

    expect(report).toMatchObject({
      total: 4,
      passed: 4,
      score: 1,
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

function record(
  id: string,
  documentType: string,
  title: string,
  properties: Record<string, unknown>,
  updatedAt = '2026-05-24T00:00:00.000Z',
): FleetGraphRecordRef {
  return {
    id,
    documentType,
    title,
    url: `/documents/${id}`,
    properties,
    createdBy: 'user-1',
    updatedAt,
  };
}

function issue(id: string, title: string): FleetGraphIssueRef {
  return {
    ...record(id, 'issue', title, {
      state: 'todo',
      assignee_id: 'owner-1',
      priority: 'high',
    }, '2026-05-01T00:00:00.000Z'),
    documentType: 'issue',
    state: 'todo',
    assigneeId: 'owner-1',
    priority: 'high',
  };
}
