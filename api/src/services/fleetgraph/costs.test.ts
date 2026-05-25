import { afterEach, describe, expect, it } from 'vitest';
import {
  estimateFleetGraphCost,
  getModelRate,
  normalizeFleetGraphUsage,
} from './costs.js';

const originalEnv = {
  SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION: process.env.SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION,
  SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION: process.env.SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION,
  SHIP_FLEETGRAPH_PROVIDER: process.env.SHIP_FLEETGRAPH_PROVIDER,
  SHIP_FLEETGRAPH_MODEL: process.env.SHIP_FLEETGRAPH_MODEL,
};

afterEach(() => {
  restoreEnv('SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION', originalEnv.SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION);
  restoreEnv('SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION', originalEnv.SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION);
  restoreEnv('SHIP_FLEETGRAPH_PROVIDER', originalEnv.SHIP_FLEETGRAPH_PROVIDER);
  restoreEnv('SHIP_FLEETGRAPH_MODEL', originalEnv.SHIP_FLEETGRAPH_MODEL);
});

describe('FleetGraph costs', () => {
  it('normalizes common provider usage shapes', () => {
    expect(normalizeFleetGraphUsage({
      usage: {
        prompt_tokens: 1200,
        completion_tokens: '300',
      },
    })).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
    });
  });

  it('handles missing provider usage as zero tokens', () => {
    expect(normalizeFleetGraphUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it('uses configured per-million rates when present', () => {
    process.env.SHIP_FLEETGRAPH_INPUT_COST_PER_MILLION = '2';
    process.env.SHIP_FLEETGRAPH_OUTPUT_COST_PER_MILLION = '10';

    const estimate = estimateFleetGraphCost({
      provider: 'bedrock',
      model: 'custom-model',
      inputTokens: 500_000,
      outputTokens: 25_000,
    });

    expect(estimate).toMatchObject({
      inputCostUsd: 1,
      outputCostUsd: 0.25,
      estimatedCostUsd: 1.25,
    });
  });

  it('returns null cost for unknown models without hiding token counts', () => {
    const estimate = estimateFleetGraphCost({
      provider: 'bedrock',
      model: 'unknown',
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(estimate.inputTokens).toBe(10);
    expect(estimate.outputTokens).toBe(5);
    expect(estimate.estimatedCostUsd).toBeNull();
  });

  it('exposes the built-in mock model as free', () => {
    expect(getModelRate('mock', 'mock-fleetgraph')).toEqual({
      inputPerMillion: 0,
      outputPerMillion: 0,
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
