import type { AssistantRouteContext, FleetGraphMode } from '@ship/shared';
import { loadFleetGraphContext } from './context.js';
import { runFleetGraphWorkflow } from './graph.js';
import {
  completeFleetGraphRun,
  getFleetGraphCheckpointer,
  makeFleetGraphThreadId,
  makeFleetGraphRunnableConfig,
  safeCompleteFleetGraphRun,
  startFleetGraphRun,
} from './tracing.js';
import type {
  FleetGraphContext,
  FleetGraphRunResult,
  FleetGraphState,
} from './types.js';

interface EstimatedFleetGraphUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

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

  let result: FleetGraphRunResult;
  try {
    result = await runFleetGraphWorkflow({
      context,
      message: input.message,
      decision: input.decision,
      checkpointer: await getFleetGraphCheckpointer(),
      config: makeFleetGraphRunnableConfig(threadId),
    });
  } catch (error) {
    result = {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      state: {
        context,
        message: input.message,
        findings: [],
        proposals: [],
      },
    };
  }

  await completeFleetGraphRun({
    run,
    status: result.status === 'failed' ? 'failed' : result.status === 'interrupted' ? 'interrupted' : 'completed',
    usage: estimateFleetGraphUsage(result.state),
    metadata: {
      graphRuntime: 'langgraph',
      checkpointThreadId: threadId,
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
          history: [],
          now: new Date().toISOString(),
        },
        message: input.message,
        findings: [],
        proposals: [],
      },
    };
  }
}

export function estimateFleetGraphUsage(state: FleetGraphState): EstimatedFleetGraphUsage {
  const recordCount = [
    state.context.currentDocument,
    state.context.program,
    state.context.project,
    state.context.week,
    state.context.weekPlan,
  ].filter(Boolean).length + state.context.issues.length;
  const evidenceCount = state.findings.reduce((sum, finding) => sum + finding.evidence.length, 0);
  const answerLength = state.answer?.content.length ?? 0;

  const inputTokens = 600
    + recordCount * 180
    + state.findings.length * 90
    + state.proposals.length * 80
    + Math.ceil((state.message?.length ?? 0) / 4);
  const outputTokens = 120
    + state.findings.length * 100
    + state.proposals.length * 80
    + evidenceCount * 25
    + Math.ceil(answerLength / 4);

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
