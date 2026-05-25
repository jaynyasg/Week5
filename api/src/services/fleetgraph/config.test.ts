import { afterEach, describe, expect, it } from 'vitest';
import {
  getFleetGraphMissingConfiguration,
  getFleetGraphObservabilityStatus,
  getFleetGraphStatus,
} from './config.js';

const ENV_KEYS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_REGION',
  'AWS_SECRET_ACCESS_KEY',
  'BEDROCK_MODEL_ID',
  'DATABASE_URL',
  'LANGSMITH_API_KEY',
  'LANGSMITH_PROJECT',
  'OPENAI_API_KEY',
  'SHIP_FLEETGRAPH_ENABLED',
  'SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP',
  'SHIP_FLEETGRAPH_MODEL',
  'SHIP_FLEETGRAPH_PROACTIVE_ENABLED',
  'SHIP_FLEETGRAPH_PROVIDER',
  'SHIP_FLEETGRAPH_SWEEP_INTERVAL_MS',
  'SHIP_FLEETGRAPH_TRACING_ENABLED',
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    restoreEnv(key, originalEnv[key]);
  }
});

describe('FleetGraph config', () => {
  it('reports available when provider, model, database, and LangSmith are configured', () => {
    process.env.DATABASE_URL = 'postgres://ship:test@localhost:5432/ship_test';
    process.env.SHIP_FLEETGRAPH_PROVIDER = 'openai';
    process.env.SHIP_FLEETGRAPH_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.LANGSMITH_API_KEY = 'langsmith-key';
    process.env.LANGSMITH_PROJECT = 'ship-week5';

    const status = getFleetGraphStatus();

    expect(status).toMatchObject({
      enabled: true,
      available: true,
      provider: 'openai',
      model: 'gpt-4o-mini',
      missingConfiguration: [],
      observability: {
        tracesEnabled: true,
        missingConfiguration: [],
      },
    });
  });

  it('keeps graph execution available when only LangSmith tracing config is missing', () => {
    process.env.DATABASE_URL = 'postgres://ship:test@localhost:5432/ship_test';
    process.env.SHIP_FLEETGRAPH_PROVIDER = 'mock';

    const status = getFleetGraphStatus();

    expect(status.available).toBe(true);
    expect(status.missingConfiguration).toEqual([]);
    expect(status.observability).toEqual({
      tracesEnabled: false,
      missingConfiguration: ['LANGSMITH_API_KEY', 'LANGSMITH_PROJECT'],
    });
  });

  it('returns controlled missing configuration for unconfigured providers', () => {
    delete process.env.DATABASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.SHIP_FLEETGRAPH_PROVIDER;

    expect(getFleetGraphMissingConfiguration()).toEqual([
      'DATABASE_URL',
      'SHIP_FLEETGRAPH_MODEL',
      'SHIP_FLEETGRAPH_PROVIDER',
      'OPENAI_API_KEY',
    ]);
  });

  it('allows tracing to be explicitly disabled without reporting missing LangSmith keys', () => {
    process.env.SHIP_FLEETGRAPH_TRACING_ENABLED = 'false';

    expect(getFleetGraphObservabilityStatus()).toEqual({
      tracesEnabled: false,
      missingConfiguration: [],
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
