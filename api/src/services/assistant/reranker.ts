import type { AssistantRetrievedSource } from './types.js';

const SOURCE_DIVERSITY_WEIGHT: Record<string, number> = {
  project: 18,
  timeline: 16,
  file: 14,
  week: 12,
  issue: 10,
  program: 8,
  document: 6,
};

export interface AssistantRerankResult {
  sources: AssistantRetrievedSource[];
  strategy: 'score_blend';
}

export function rerankAssistantSources(input: {
  message: string;
  sources: AssistantRetrievedSource[];
  maxSources: number;
}): AssistantRerankResult {
  const queryTerms = tokenize(input.message);
  const seenTypes = new Set<string>();
  const reranked = input.sources
    .map((source) => {
      const lexicalOverlap = overlapScore(queryTerms, tokenize(`${source.title} ${source.excerpt}`));
      const semanticScore = source.retrievalSignals?.semanticScore ?? 0;
      const diversityBoost = seenTypes.has(source.sourceType) ? 0 : SOURCE_DIVERSITY_WEIGHT[source.sourceType] ?? 0;
      seenTypes.add(source.sourceType);

      const rerankScore = source.score + lexicalOverlap * 20 + semanticScore * 80 + diversityBoost;
      return {
        ...source,
        score: rerankScore,
        retrievalSignals: {
          ...source.retrievalSignals,
          rerankScore,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, input.maxSources);

  return {
    sources: reranked,
    strategy: 'score_blend',
  };
}

function overlapScore(queryTerms: Set<string>, sourceTerms: Set<string>): number {
  if (queryTerms.size === 0 || sourceTerms.size === 0) return 0;
  let matches = 0;
  for (const term of queryTerms) {
    if (sourceTerms.has(term)) matches++;
  }
  return matches / queryTerms.size;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 2),
  );
}
