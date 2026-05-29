import { describe, expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { runFleetGraphState, runFleetGraphWorkflow } from './graph.js';
import { makeFleetGraphRunnableConfig } from './tracing.js';
import type { FleetGraphContext, FleetGraphRecordRef } from './types.js';

describe('FleetGraph graph state runner', () => {
  it('completes with no findings when context has no surfacing-worthy condition', () => {
    const result = runFleetGraphState({
      context: context({
        project: record('project-1', 'project', 'Project', {
          owner_id: 'owner-1',
          accountable_id: 'accountable-1',
        }),
      }),
    });

    expect(result.status).toBe('completed');
    expect(result.state.findings).toEqual([]);
    expect(result.state.interrupt).toBeUndefined();
  });

  it('returns finding-only results without proposing actions', () => {
    const result = runFleetGraphState({
      context: context({
        week: record('week-1', 'sprint', 'Week 5', {
          sprint_status: 'active',
          owner_id: 'owner-1',
        }),
      }),
    });

    expect(result.status).toBe('completed');
    expect(result.state.findings).toHaveLength(1);
    expect(result.state.proposals).toEqual([]);
  });

  it('interrupts at the human action proposal gate and resumes with a decision', () => {
    const approvedPlanChanged = context({
      weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {
        approval_status: 'approved',
        approved_at: '2026-05-20T00:00:00.000Z',
        changed_after_approval: true,
      }),
    });

    const interrupted = runFleetGraphState({ context: approvedPlanChanged });
    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.state.interrupt).toMatchObject({
      kind: 'action_proposal',
      proposal: {
        proposedAction: 'request_update',
      },
    });

    const resumed = runFleetGraphState({
      context: approvedPlanChanged,
      decision: { status: 'approved', note: 'Ask owner for re-review' },
    });
    expect(resumed.status).toBe('completed');
    expect(resumed.state.proposals[0]?.payload.decision).toEqual({
      status: 'approved',
      note: 'Ask owner for re-review',
    });
  });

  it('answers on-demand project chat from route context with citations', () => {
    const result = runFleetGraphState({
      context: context({
        project: record('project-1', 'project', 'Launch Project', {
          owner_id: 'owner-1',
          accountable_id: 'accountable-1',
        }),
      }),
      message: 'What is risky?',
    });

    expect(result.state.answer).toMatchObject({
      status: 'answered',
      citations: [expect.objectContaining({ sourceType: 'project', title: 'Launch Project' })],
    });
  });

  it('runs as a checkpointed LangGraph workflow and resumes an approval interrupt', async () => {
    const checkpointer = new MemorySaver();
    const config = makeFleetGraphRunnableConfig('fleetgraph:test:thread-1');
    const approvedPlanChanged = context({
      weekPlan: record('plan-1', 'weekly_plan', 'Week Plan', {
        approval_status: 'approved',
        approved_at: '2026-05-20T00:00:00.000Z',
        changed_after_approval: true,
      }),
    });

    const interrupted = await runFleetGraphWorkflow({
      context: approvedPlanChanged,
      checkpointer,
      config,
    });

    expect(interrupted.status).toBe('interrupted');
    expect(interrupted.state.findings).toHaveLength(1);
    expect(interrupted.state.proposals).toHaveLength(1);
    expect(interrupted.state.interrupt).toMatchObject({
      kind: 'action_proposal',
      proposal: {
        proposedAction: 'request_update',
      },
    });

    const resumed = await runFleetGraphWorkflow({
      context: approvedPlanChanged,
      checkpointer,
      config,
      decision: { status: 'rejected', note: 'Needs a tighter plan diff' },
    });

    expect(resumed.status).toBe('completed');
    expect(resumed.state.proposals[0]?.payload.decision).toEqual({
      status: 'rejected',
      note: 'Needs a tighter plan diff',
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
): FleetGraphRecordRef {
  return {
    id,
    documentType,
    title,
    url: `/documents/${id}`,
    properties,
    createdBy: 'user-1',
    updatedAt: '2026-05-24T00:00:00.000Z',
  };
}
