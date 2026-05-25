import { ASSISTANT_LIMITS } from './config.js';
import { rerankAssistantSources } from './reranker.js';
import { retrieveAssistantSources } from './retriever.js';
import { safeRecordAssistantTraceEvent } from './tracing.js';
import type { AssistantRequestContext, AssistantRetrievedSource } from './types.js';
import type { AssistantChatRequest } from '@ship/shared';

export interface AssistantToolLoopResult {
  sources: AssistantRetrievedSource[];
  toolCalls: Array<{
    name: string;
    resultCount: number;
    durationMs: number;
  }>;
}

export async function runAssistantToolLoop(input: {
  request: AssistantChatRequest;
  context: AssistantRequestContext;
  runId?: string | null;
}): Promise<AssistantToolLoopResult> {
  const maxSources = ASSISTANT_LIMITS.maxContextChunks * 2;
  const searchStartedAt = Date.now();
  const rawSources = await retrieveAssistantSources({
    ...input.context,
    message: input.request.message,
    routeContext: input.request.context,
    maxSources,
    runId: input.runId ?? undefined,
  });
  const searchDurationMs = Date.now() - searchStartedAt;

  await safeRecordAssistantTraceEvent({
    runId: input.runId,
    workspaceId: input.context.workspaceId,
    userId: input.context.userId,
    eventType: 'tool',
    eventName: 'search_ship_context',
    durationMs: searchDurationMs,
    metadata: {
      resultCount: rawSources.length,
      routeContext: input.request.context ?? null,
    },
  });

  const rerankStartedAt = Date.now();
  const reranked = rerankAssistantSources({
    message: input.request.message,
    sources: rawSources,
    maxSources: ASSISTANT_LIMITS.maxContextChunks,
  });

  await safeRecordAssistantTraceEvent({
    runId: input.runId,
    workspaceId: input.context.workspaceId,
    userId: input.context.userId,
    eventType: 'rerank',
    eventName: 'score_blend_rerank',
    durationMs: Date.now() - rerankStartedAt,
    metadata: {
      inputCount: rawSources.length,
      outputCount: reranked.sources.length,
      strategy: reranked.strategy,
      sourceTypes: reranked.sources.map((source) => source.sourceType),
      selectedSources: reranked.sources.map(traceSourceSummary),
    },
  });

  return {
    sources: reranked.sources,
    toolCalls: [{
      name: 'search_ship_context',
      resultCount: rawSources.length,
      durationMs: searchDurationMs,
    }],
  };
}

function traceSourceSummary(source: AssistantRetrievedSource): Record<string, unknown> {
  return {
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    title: source.title,
    url: source.url,
    retrievalStrategy: source.retrievalStrategy ?? null,
    score: roundTraceNumber(source.score),
    excerptChars: source.excerpt.length,
    signals: summarizeTraceSignals(source.retrievalSignals),
  };
}

function summarizeTraceSignals(
  signals: AssistantRetrievedSource['retrievalSignals'],
): Record<string, number> {
  if (!signals) return {};

  return Object.fromEntries(
    Object.entries(signals)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([key, value]) => [key, roundTraceNumber(value as number)]),
  );
}

function roundTraceNumber(value: number): number {
  return Number(value.toFixed(3));
}
