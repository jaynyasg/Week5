import { randomUUID } from 'crypto';
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantSourceCounts,
} from '@ship/shared';
import { buildAssistantPrompt } from './prompt.js';
import { AssistantProviderError, generateAssistantAnswer } from './llm.js';
import { runAssistantToolLoop } from './tool-loop.js';
import {
  completeAssistantRun,
  safeRecordAssistantTraceEvent,
  startAssistantRun,
} from './tracing.js';
import type { AssistantRequestContext } from './types.js';

export async function answerAssistantQuestion(input: {
  request: AssistantChatRequest;
} & AssistantRequestContext): Promise<AssistantChatResponse> {
  const run = await startAssistantRun({
    workspaceId: input.workspaceId,
    userId: input.userId,
    message: input.request.message,
    metadata: {
      routeContext: input.request.context ?? null,
      historyCount: input.request.history?.length ?? 0,
    },
  });

  try {
    const toolLoop = await runAssistantToolLoop({
      request: input.request,
      runId: run.id,
      context: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        workspaceRole: input.workspaceRole,
        isSuperAdmin: input.isSuperAdmin,
      },
    });
    const sources = toolLoop.sources;

    if (sources.length === 0) {
      const noContext = response(
        'no_context',
        'I could not find enough Ship context to answer that. Try asking from a project, issue, timeline, or document page.',
        [],
        sourceCounts([]),
        undefined,
        run.requestId,
      );
      await completeAssistantRun({
        run,
        status: 'no_context',
        totalSources: 0,
        citationsCount: 0,
        metadata: { toolCalls: toolLoop.toolCalls },
      });
      return noContext;
    }

    const prompt = buildAssistantPrompt({
      request: input.request,
      sources,
    });
    const modelStartedAt = Date.now();
    const content = await generateAssistantAnswer({
      messages: prompt.messages,
      citationIds: prompt.citations.map((citation) => citation.id),
    });
    await safeRecordAssistantTraceEvent({
      runId: run.id,
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventType: 'model',
      eventName: 'answer_generated',
      durationMs: Date.now() - modelStartedAt,
      metadata: {
        citationCount: prompt.citations.length,
        promptContextChars: prompt.citations.reduce((sum, citation) => sum + citation.excerpt.length, 0),
      },
    });

    const answered = response('answered', content, prompt.citations, sourceCounts(sources), undefined, run.requestId);
    await completeAssistantRun({
      run,
      status: 'answered',
      totalSources: sources.length,
      citationsCount: prompt.citations.length,
      metadata: { toolCalls: toolLoop.toolCalls },
    });
    return answered;
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      const providerError = response(
        'error',
        'Ask Ship found relevant context, but the model provider could not complete the answer. Try again in a moment.',
        [],
        sourceCounts([]),
        { code: 'MODEL_ERROR', message: 'Assistant model provider failed' },
        run.requestId,
      );
      await completeAssistantRun({
        run,
        status: 'error',
        totalSources: 0,
        citationsCount: 0,
        error: 'Assistant model provider failed',
      });
      return providerError;
    }

    console.error('Ask Ship retrieval error:', error);
    const retrievalError = response(
      'error',
      'Ask Ship could not retrieve Ship context for that question.',
      [],
      sourceCounts([]),
      { code: 'RETRIEVAL_ERROR', message: 'Assistant retrieval failed' },
      run.requestId,
    );
    await completeAssistantRun({
      run,
      status: 'error',
      totalSources: 0,
      citationsCount: 0,
      error: error instanceof Error ? error.message.slice(0, 500) : 'Assistant retrieval failed',
    });
    return retrievalError;
  }
}

function response(
  status: AssistantChatResponse['status'],
  content: string,
  citations: AssistantChatResponse['citations'],
  counts: AssistantSourceCounts,
  error?: AssistantChatResponse['error'],
  traceId?: string,
): AssistantChatResponse {
  return {
    status,
    message: {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    },
    citations,
    sourceCounts: counts,
    traceId,
    error,
  };
}

function sourceCounts(sources: Array<{ sourceType: string }>): AssistantSourceCounts {
  const counts: AssistantSourceCounts = {
    documents: 0,
    projects: 0,
    programs: 0,
    issues: 0,
    weeks: 0,
    timeline: 0,
    files: 0,
    total: sources.length,
  };

  for (const source of sources) {
    if (source.sourceType === 'document') counts.documents++;
    if (source.sourceType === 'project') counts.projects++;
    if (source.sourceType === 'program') counts.programs++;
    if (source.sourceType === 'issue') counts.issues++;
    if (source.sourceType === 'week') counts.weeks++;
    if (source.sourceType === 'timeline') counts.timeline++;
    if (source.sourceType === 'file') counts.files++;
  }

  return counts;
}
