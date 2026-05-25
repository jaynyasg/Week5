import type { AssistantRouteContext, FleetGraphMode } from '@ship/shared';
import { loadFleetGraphContext } from './context.js';
import { runFleetGraphState } from './graph.js';
import {
  completeFleetGraphRun,
  makeFleetGraphThreadId,
  safeCompleteFleetGraphRun,
  startFleetGraphRun,
} from './tracing.js';
import type {
  FleetGraphContext,
  FleetGraphRunResult,
} from './types.js';

export async function runFleetGraph(input: {
  workspaceId: string;
  userId?: string | null;
  mode: FleetGraphMode;
  triggerType: string;
  triggerId?: string | null;
  routeContext?: AssistantRouteContext;
  message?: string;
  context?: FleetGraphContext;
  decision?: { status: 'approved' | 'rejected'; note?: string };
}): Promise<FleetGraphRunResult> {
  const context = input.context ?? await loadFleetGraphContext({
    workspaceId: input.workspaceId,
    userId: input.userId ?? 'system',
    routeContext: input.routeContext,
  });
  const threadId = makeFleetGraphThreadId({
    workspaceId: input.workspaceId,
    mode: input.mode,
    subjectId: input.triggerId ?? input.routeContext?.documentId ?? input.routeContext?.projectId,
  });

  const run = await startFleetGraphRun({
    workspaceId: input.workspaceId,
    userId: input.userId ?? null,
    mode: input.mode,
    triggerType: input.triggerType,
    triggerId: input.triggerId ?? input.routeContext?.documentId ?? null,
    threadId,
    metadata: {
      routePath: input.routeContext?.path,
      hasMessage: Boolean(input.message),
    },
  });

  const result = runFleetGraphState({
    context,
    message: input.message,
    decision: input.decision,
  });

  await completeFleetGraphRun({
    run,
    status: result.status === 'failed' ? 'failed' : result.status === 'interrupted' ? 'interrupted' : 'completed',
    metadata: {
      findingCount: result.state.findings.length,
      proposalCount: result.state.proposals.length,
      hasInterrupt: Boolean(result.state.interrupt),
      answerStatus: result.state.answer?.status,
    },
    error: result.error ?? null,
  });

  return {
    ...result,
    runId: run.id,
    threadId,
  };
}

export async function safeRunFleetGraph(input: Parameters<typeof runFleetGraph>[0]): Promise<FleetGraphRunResult> {
  try {
    return await runFleetGraph(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await safeCompleteFleetGraphRun({
      run: {
        id: null,
        threadId: 'fleetgraph:failed-before-run',
        startedAt: Date.now(),
      },
      status: 'failed',
      error: message,
    });

    return {
      status: 'failed',
      error: message,
      state: {
        context: input.context ?? {
          workspaceId: input.workspaceId,
          userId: input.userId ?? 'system',
          workspaceAdminUserIds: [],
          issues: [],
          now: new Date().toISOString(),
        },
        message: input.message,
        findings: [],
        proposals: [],
      },
    };
  }
}
