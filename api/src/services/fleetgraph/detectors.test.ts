import { describe, expect, it } from 'vitest';
import {
  detectRaciDrift,
  detectChangedApprovedWeekPlan,
  detectFleetGraphFindings,
  detectMissingApprovedWeekPlan,
  detectMissingOwnership,
  detectOverdueMilestone,
  detectProjectChurn,
  detectScopeChurnRate,
  detectStaleIssue,
  detectWorkloadImbalance,
  fleetGraphDetectorRegistry,
} from './detectors.js';
import type { FleetGraphContext, FleetGraphHistoryRef, FleetGraphIssueRef, FleetGraphRecordRef } from './types.js';

describe('FleetGraph detectors', () => {
  it('defines registry metadata for every detector with unique ids and noise defaults', () => {
    expect(fleetGraphDetectorRegistry).toHaveLength(9);
    expect(new Set(fleetGraphDetectorRegistry.map((detector) => detector.id)).size).toBe(9);
    expect(fleetGraphDetectorRegistry.every((detector) => detector.noiseDefault === 'toast' || detector.noiseDefault === 'badge')).toBe(true);
    expect(fleetGraphDetectorRegistry.map((detector) => detector.id)).toEqual([
      'missing-approved-plan',
      'approved-plan-drift',
      'missing-ownership',
      'stale-issue',
      'project-churn',
      'overdue-milestone',
      'workload-imbalance',
      'scope-churn-rate',
      'raci-drift',
    ]);
  });

  it('surfaces an active week without an approved plan', () => {
    const context = fleetContext({
      week: record('week-1', 'sprint', 'Week 5', {
        sprint_status: 'active',
        owner_id: 'owner-1',
      }),
    });

    const finding = detectMissingApprovedWeekPlan(context);

    expect(finding).toMatchObject({
      key: 'missing-approved-plan:week-1',
      severity: 'high',
      kind: 'planning_gap',
      ownerUserId: 'owner-1',
    });
  });

  it('turns a changed approved plan into a human action proposal candidate', () => {
    const context = fleetContext({
      weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {
        approval_status: 'approved',
        approved_at: '2026-05-20T00:00:00.000Z',
        owner_id: 'owner-1',
      }, '2026-05-22T00:00:00.000Z'),
    });

    const finding = detectChangedApprovedWeekPlan(context);

    expect(finding?.actionProposal).toMatchObject({
      proposedAction: 'request_update',
      targetDocumentId: 'plan-1',
      payload: {
        reason: 'approved_plan_changed',
      },
    });
  });

  it('routes missing owner/accountable metadata as a planning gap', () => {
    const finding = detectMissingOwnership(fleetContext({
      project: record('project-1', 'project', 'Launch Project', { owner_id: null }),
    }));

    expect(finding).toMatchObject({
      key: 'missing-ownership:project-1',
      severity: 'medium',
      kind: 'planning_gap',
    });
  });

  it('detects stale active issues and project churn', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', { owner_id: 'owner-1' }),
      issues: [
        issue('issue-1', 'Todo 1'),
        issue('issue-2', 'Todo 2'),
        issue('issue-3', 'Todo 3'),
      ],
    });

    expect(detectStaleIssue(context)).toMatchObject({
      key: 'stale-issue:issue-1',
      kind: 'stale_commitment',
    });
    expect(detectProjectChurn(context)).toMatchObject({
      key: 'project-churn:project-1',
      severity: 'high',
    });
  });

  it('detects overdue project milestones', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
        status: 'active',
        target_date: '2026-05-10',
      }),
    });

    const finding = detectOverdueMilestone(context);

    expect(finding).toMatchObject({
      key: 'overdue-milestone:project-1:2026-05-10',
      severity: 'high',
      kind: 'stale_commitment',
      ownerUserId: 'owner-1',
    });
    expect(finding?.summary).toContain('15 days past');
  });

  it('detects workload imbalance across active issues', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
      }),
      issues: [
        issue('issue-1', 'Auth hardening', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
        issue('issue-2', 'Billing import', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
        issue('issue-3', 'Latency trace', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
        issue('issue-4', 'Copy polish', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
        issue('issue-5', 'Docs cleanup', 'todo', '2026-05-24T00:00:00.000Z', 'owner-2', 4),
      ],
    });

    const finding = detectWorkloadImbalance(context);

    expect(finding).toMatchObject({
      key: 'workload-imbalance:project-1:owner-1',
      severity: 'medium',
      kind: 'delivery_conflict',
      ownerUserId: 'owner-1',
    });
    expect(finding?.evidence).toHaveLength(4);
  });

  it('detects scope churn from document history changes', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
      }),
      weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {}),
      issues: [
        issue('issue-1', 'Auth hardening', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
        issue('issue-2', 'Billing import', 'todo', '2026-05-24T00:00:00.000Z', 'owner-2', 4),
      ],
      history: [
        history('project-1', 'project', 'Launch Project', 'scope', 'MVP', 'MVP plus import'),
        history('issue-1', 'issue', 'Auth hardening', 'estimate_hours', '4', '8'),
        history('issue-1', 'issue', 'Auth hardening', 'priority', 'medium', 'high'),
        history('issue-2', 'issue', 'Billing import', 'belongs_to', 'Backlog', 'Launch Project'),
        history('plan-1', 'weekly_plan', 'Week Plan', 'content', 'old plan', 'new plan'),
      ],
    });

    const finding = detectScopeChurnRate(context);

    expect(finding).toMatchObject({
      key: 'scope-churn-rate:project-1:2026-05-11',
      severity: 'medium',
      kind: 'scope_drift',
      ownerUserId: 'owner-1',
    });
    expect(finding?.evidence[1]).toMatchObject({
      sourceType: 'timeline',
      title: 'Launch Project',
    });
  });

  it('detects RACI drift from ownership and assignment history', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-3',
        accountable_id: 'accountable-1',
      }),
      issues: [
        issue('issue-1', 'Auth hardening', 'todo', '2026-05-24T00:00:00.000Z', 'owner-1', 8),
      ],
      history: [
        history('project-1', 'project', 'Launch Project', 'owner_id', 'owner-1', 'owner-2'),
        history('project-1', 'project', 'Launch Project', 'accountable_id', 'accountable-0', 'accountable-1'),
        history('issue-1', 'issue', 'Auth hardening', 'assignee_id', 'owner-2', 'owner-1'),
      ],
    });

    const finding = detectRaciDrift(context);

    expect(finding).toMatchObject({
      key: 'raci-drift:project-1:2026-04-25',
      severity: 'medium',
      kind: 'planning_gap',
      ownerUserId: 'owner-3',
    });
    expect(finding?.summary).toContain('3 ownership or accountability changes');
  });

  it('adds detector metadata to registry-driven findings', () => {
    const findings = detectFleetGraphFindings(fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
        status: 'active',
        target_date: '2026-05-10',
      }),
    }));

    expect(findings).toContainEqual(expect.objectContaining({
      detectorId: 'overdue-milestone',
      noiseDefault: 'badge',
    }));
  });

  it('applies workspace detector tuning before surfacing registry findings', () => {
    const context = fleetContext({
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
        status: 'active',
        target_date: '2026-05-10',
      }),
      detectorSettings: {
        'overdue-milestone': {
          enabled: false,
        },
        'missing-ownership': {
          severity: 'critical',
        },
      },
    });

    const findings = detectFleetGraphFindings(context);

    expect(findings).not.toContainEqual(expect.objectContaining({
      detectorId: 'overdue-milestone',
    }));
  });

  it('uses detector threshold overrides for stale issue detection', () => {
    const context = fleetContext({
      issues: [
        issue('issue-1', 'Todo 1', 'todo', '2026-05-24T00:00:00.000Z'),
      ],
      detectorSettings: {
        'stale-issue': {
          thresholds: { staleIssueDays: 1 },
        },
      },
    });

    const finding = detectStaleIssue(context);

    expect(finding?.rationale).toContain('at least 1 days');
  });

  it('returns no findings when no condition is surfacing-worthy', () => {
    const context = fleetContext({
      week: record('week-1', 'sprint', 'Week 5', { sprint_status: 'active' }),
      weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', { approval_status: 'approved' }),
      project: record('project-1', 'project', 'Launch Project', {
        owner_id: 'owner-1',
        accountable_id: 'accountable-1',
      }),
      issues: [issue('issue-1', 'Done', 'done', '2026-05-24T00:00:00.000Z')],
    });

    expect(detectFleetGraphFindings(context)).toEqual([]);
  });
});

function fleetContext(overrides: Partial<FleetGraphContext> = {}): FleetGraphContext {
  return {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    workspaceAdminUserIds: ['admin-1'],
    routePath: '/documents/project-1',
    issues: [],
    history: [],
    now: '2026-05-25T00:00:00.000Z',
    ...overrides,
  };
}

function history(
  documentId: string,
  documentType: string,
  documentTitle: string,
  field: string,
  oldValue: string | null,
  newValue: string | null,
  createdAt = '2026-05-24T00:00:00.000Z',
): FleetGraphHistoryRef {
  return {
    documentId,
    documentType,
    documentTitle,
    field,
    oldValue,
    newValue,
    changedBy: 'user-1',
    automatedBy: null,
    createdAt,
  };
}

function record(
  id: string,
  documentType: string,
  title: string,
  properties: Record<string, unknown> = {},
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
  assigneeId = 'owner-1',
  estimateHours = 1,
): FleetGraphIssueRef {
  return {
    ...record(id, 'issue', title, { state, assignee_id: assigneeId, priority: 'high', estimate_hours: estimateHours }, updatedAt),
    documentType: 'issue',
    state,
    assigneeId,
    priority: 'high',
  };
}
