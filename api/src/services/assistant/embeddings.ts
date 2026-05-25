import { createHash } from 'crypto';

export interface AssistantEmbeddingConfig {
  enabled: boolean;
  provider: 'openai' | 'mock' | 'disabled';
  model: string | null;
  dimensions: number;
  missingConfiguration: string[];
}

export interface AssistantEmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  provider: 'openai' | 'mock';
}

export class AssistantEmbeddingError extends Error {
  constructor(message = 'Assistant embedding request failed') {
    super(message);
    this.name = 'AssistantEmbeddingError';
  }
}

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

export function getAssistantEmbeddingConfig(): AssistantEmbeddingConfig {
  const enabledValue = process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED?.toLowerCase();
  const assistantProvider = process.env.SHIP_ASSISTANT_PROVIDER?.toLowerCase();
  const enabled = enabledValue === 'true' || enabledValue === 'mock';
  const provider = enabledValue === 'mock' || assistantProvider === 'mock'
    ? 'mock'
    : enabled
      ? 'openai'
      : 'disabled';
  const dimensions = parseEmbeddingDimensions(process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS);
  const model = provider === 'disabled'
    ? null
    : process.env.SHIP_ASSISTANT_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const missingConfiguration = provider === 'openai' && !process.env.OPENAI_API_KEY
    ? ['OPENAI_API_KEY']
    : [];

  return {
    enabled,
    provider,
    model,
    dimensions,
    missingConfiguration,
  };
}

export async function generateAssistantEmbedding(text: string): Promise<AssistantEmbeddingResult | null> {
  const config = getAssistantEmbeddingConfig();
  if (!config.enabled || config.provider === 'disabled') return null;
  if (config.missingConfiguration.length > 0) {
    throw new AssistantEmbeddingError(`Missing assistant embedding configuration: ${config.missingConfiguration.join(', ')}`);
  }

  const input = text.trim();
  if (!input) return null;

  if (config.provider === 'mock') {
    return {
      embedding: deterministicEmbedding(input, config.dimensions),
      model: config.model ?? 'mock-embedding',
      dimensions: config.dimensions,
      provider: 'mock',
    };
  }

  const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input,
      encoding_format: 'float',
      dimensions: config.dimensions === DEFAULT_EMBEDDING_DIMENSIONS ? undefined : config.dimensions,
    }),
  });

  if (!response.ok) {
    throw new AssistantEmbeddingError();
  }

  const body = await response.json() as {
    data?: Array<{ embedding?: number[] }>;
    model?: string;
  };
  const embedding = body.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new AssistantEmbeddingError('Assistant embedding provider returned no vector');
  }

  return {
    embedding,
    model: body.model ?? config.model ?? DEFAULT_EMBEDDING_MODEL,
    dimensions: embedding.length,
    provider: 'openai',
  };
}

function parseEmbeddingDimensions(value: string | undefined): number {
  if (!value) return DEFAULT_EMBEDDING_DIMENSIONS;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 32 || parsed > DEFAULT_EMBEDDING_DIMENSIONS) {
    return DEFAULT_EMBEDDING_DIMENSIONS;
  }
  return parsed;
}

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens.length > 0 ? tokens : [text]) {
    const digest = createHash('sha256').update(token).digest();
    const index = digest.readUInt32BE(0) % dimensions;
    const sign = (digest[4] ?? 0) % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => Number((value / norm).toFixed(8)));
}
