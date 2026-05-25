import { getFleetGraphModel, getFleetGraphProvider } from './config.js';
import type {
  FleetGraphCostEstimate,
  FleetGraphTokenUsage,
  FleetGraphUsageInput,
} from './types.js';

interface ModelRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

const DEFAULT_MODEL_RATES: Record<string, ModelRate> = {
  'openai:gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.60,
  },
  'mock:mock-fleetgraph': {
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
};

export function normalizeFleetGraphUsage(input: FleetGraphUsageInput = {}): FleetGraphTokenUsage {
  const usage = input.usage ?? {};
  const inputTokens = readTokenCount(
    input.inputTokens,
    usage.inputTokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.prompt_tokens,
  );
  const outputTokens = readTokenCount(
    input.outputTokens,
    usage.outputTokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.completion_tokens,
  );
  const totalTokens = readTokenCount(
    input.totalTokens,
    usage.totalTokens,
    usage.total_tokens,
    inputTokens + outputTokens,
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function estimateFleetGraphCost(input: FleetGraphUsageInput = {}): FleetGraphCostEstimate {
  const provider = input.provider ?? getFleetGraphProvider();
  const model = input.model ?? (isFleetGraphProvider(provider) ? getFleetGraphModel(provider) : null);
  const usage = normalizeFleetGraphUsage(input);

  if (typeof input.estimatedCostUsd === 'number' && Number.isFinite(input.estimatedCostUsd)) {
    return {
      ...usage,
      provider,
      model,
      inputCostUsd: 0,
      outputCostUsd: 0,
      estimatedCostUsd: roundCurrency(input.estimatedCostUsd),
    };
  }

  const rate = getModelRate(provider, model);
  if (!rate) {
    return {
      ...usage,
      provider,
      model,
      inputCostUsd: 0,
      outputCostUsd: 0,
      estimatedCostUsd: null,
    };
  }

  const inputCostUsd = (usage.inputTokens / 1_000_000) * rate.inputPerMillion;
  const outputCostUsd = (usage.outputTokens / 1_000_000) * rate.outputPerMillion;

  return {
    ...usage,
    provider,
    model,
    inputCostUsd: roundCurrency(inputCostUsd),
    outputCostUsd: roundCurrency(outputCostUsd),
    estimatedCostUsd: roundCurrency(inputCostUsd + outputCostUsd),
  };
}

export function getModelRate(provider: string | null, model: string | null): ModelRate | null {
  if (!provider || !model) return null;

  const envInputRate = Number(process.env.SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION);
  const envOutputRate = Number(process.env.SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION);
  if (Number.isFinite(envInputRate) && Number.isFinite(envOutputRate)) {
    return {
      inputPerMillion: envInputRate,
      outputPerMillion: envOutputRate,
    };
  }

  return DEFAULT_MODEL_RATES[`${provider}:${model}`] ?? null;
}

function readTokenCount(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
    }
  }
  return 0;
}

function isFleetGraphProvider(value: string | null): value is ReturnType<typeof getFleetGraphProvider> {
  return value === 'openai' || value === 'bedrock' || value === 'mock' || value === 'unconfigured';
}

function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
