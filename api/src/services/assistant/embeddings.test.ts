import { afterEach, describe, expect, it } from 'vitest';
import { generateAssistantEmbedding, getAssistantEmbeddingConfig } from './embeddings.js';

describe('assistant embeddings', () => {
  const originalEnv = {
    SHIP_ASSISTANT_EMBEDDINGS_ENABLED: process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED,
    SHIP_ASSISTANT_EMBEDDING_DIMENSIONS: process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS,
    SHIP_ASSISTANT_PROVIDER: process.env.SHIP_ASSISTANT_PROVIDER,
  };

  afterEach(() => {
    restoreEnv('SHIP_ASSISTANT_EMBEDDINGS_ENABLED', originalEnv.SHIP_ASSISTANT_EMBEDDINGS_ENABLED);
    restoreEnv('SHIP_ASSISTANT_EMBEDDING_DIMENSIONS', originalEnv.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS);
    restoreEnv('SHIP_ASSISTANT_PROVIDER', originalEnv.SHIP_ASSISTANT_PROVIDER);
  });

  it('is disabled unless explicitly enabled', () => {
    delete process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED;

    expect(getAssistantEmbeddingConfig()).toMatchObject({
      enabled: false,
      provider: 'disabled',
    });
  });

  it('generates deterministic mock vectors for tests and local evals', async () => {
    process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED = 'mock';
    process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS = '64';

    const first = await generateAssistantEmbedding('security review blocks launch');
    const second = await generateAssistantEmbedding('security review blocks launch');

    expect(first?.provider).toBe('mock');
    expect(first?.dimensions).toBe(64);
    expect(first?.embedding).toEqual(second?.embedding);
    expect(first?.embedding.some((value) => value !== 0)).toBe(true);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
