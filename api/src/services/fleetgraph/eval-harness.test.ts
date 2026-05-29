import { describe, expect, it } from 'vitest';
import { evaluateFleetGraphRuns } from './eval-harness.js';
import { runFleetGraphState } from './graph.js';
import type { FleetGraphContext, FleetGraphIssueRef, FleetGraphRecordRef } from './types.js';

describe('FleetGraph eval harness', () => {
  it('scores deterministic graph paths needed for submission evidence', () => {
    const results = {
      'week-starts-without-approved-plan': runFleetGraphState({
        context: context({
          week: record('week-1', 'sprint', 'Week 5', {
            sprint_status: 'active',
            owner_id: 'owner-1',
          }),
        }),
      }),
      'project-churn-stalled-issues': runFleetGraphState({
        context: context({
          project: record('project-1', 'project', 'Launch Project', {
            owner_id: 'owner-1',
            accountable_id: 'accountable-1',
          }),
          issues: [
            issue('issue-1', 'Blocked integration'),
            issue('issue-2', 'Late review'),
            issue('issue-3', 'Unassigned dependency'),
          ],
        }),
      }),
      'stale-blocked-engineer-issue': runFleetGraphState({
        context: context({
          issues: [
            issue('issue-1', 'Blocked integration'),
          ],
        }),
      }),
      'approved-plan-changes-after-approval': runFleetGraphState({
        context: context({
          weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {
            approval_status: 'approved',
            approved_at: '2026-05-20T00:00:00.000Z',
            changed_after_approval: true,
          }),
        }),
      }),
      'missing-owner-accountable-role': runFleetGraphState({
        context: context({
          project: record('project-1', 'project', 'Launch Project', {}),
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
            issue('issue-1', 'Blocked integration', 'todo', '2026-05-24T00:00:00.000Z'),
            issue('issue-2', 'Late review', 'todo', '2026-05-24T00:00:00.000Z'),
          ],
        }),
        message: 'What should I look at next?',
      }),
    };

    const report = evaluateFleetGraphRuns([
      {
        id: 'week-starts-without-approved-plan',
        expectedStatus: 'completed',
        minFindings: 1,
        expectedFindingKinds: ['planning_gap'],
      },
      {
        id: 'project-churn-stalled-issues',
        expectedStatus: 'completed',
        minFindings: 2,
        expectedFindingKinds: ['dependency_risk', 'stale_commitment'],
      },
      {
        id: 'stale-blocked-engineer-issue',
        expectedStatus: 'completed',
        minFindings: 1,
        expectedFindingKinds: ['stale_commitment'],
      },
      {
        id: 'approved-plan-changes-after-approval',
        expectedStatus: 'interrupted',
        minFindings: 1,
        expectedFindingKinds: ['scope_drift'],
        expectedProposalActions: ['request_update'],
      },
      {
        id: 'missing-owner-accountable-role',
        expectedStatus: 'completed',
        minFindings: 1,
        expectedFindingKinds: ['planning_gap'],
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
      total: 7,
      passed: 7,
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
    history: [],
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

function issue(
  id: string,
  title: string,
  state = 'todo',
  updatedAt = '2026-05-01T00:00:00.000Z',
): FleetGraphIssueRef {
  return {
    ...record(id, 'issue', title, {
      state,
      assignee_id: 'owner-1',
      priority: 'high',
    }, updatedAt),
    documentType: 'issue',
    state,
    assigneeId: 'owner-1',
    priority: 'high',
  };
}
