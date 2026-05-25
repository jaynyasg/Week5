import type { FleetGraphProvider, FleetGraphStatusResponse } from '@ship/shared';

export const FLEETGRAPH_LIMITS = {
  maxMessageChars: 4000,
  maxHistoryMessages: 12,
  maxFindingsPerRun: 10,
  maxPromptContextChars: 18_000,
} as const;

export const FLEETGRAPH_PROACTIVE_DEFAULTS = {
  sweepIntervalMs: 60_000,
  maxEventsPerSweep: 25,
} as const;

export function getFleetGraphProvider(): FleetGraphProvider {
  const provider = process.env.SHIP_FLEETGRAPH_PROVIDER?.toLowerCase();
  if (provider === 'openai' || provider === 'bedrock' || provider === 'mock') {
    return provider;
  }
  return process.env.OPENAI_API_KEY ? 'openai' : 'unconfigured';
}

export function getFleetGraphModel(provider: FleetGraphProvider = getFleetGraphProvider()): string | null {
  if (process.env.SHIP_FLEETGRAPH_MODEL) return process.env.SHIP_FLEETGRAPH_MODEL;
  if (provider === 'openai') return 'gpt-4o-mini';
  if (provider === 'bedrock') return process.env.BEDROCK_MODEL_ID || null;
  if (provider === 'mock') return 'mock-fleetgraph';
  return null;
}

export function getFleetGraphMissingConfiguration(
  provider: FleetGraphProvider = getFleetGraphProvider(),
): string[] {
  if (process.env.SHIP_FLEETGRAPH_ENABLED === 'false') {
    return ['SHIP_FLEETGRAPH_ENABLED'];
  }

  const missing = new Set<string>();
  if (!process.env.DATABASE_URL) missing.add('DATABASE_URL');

  if (!getFleetGraphModel(provider)) {
    missing.add('SHIP_FLEETGRAPH_MODEL');
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    missing.add('OPENAI_API_KEY');
  }

  if (provider === 'bedrock') {
    for (const key of ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) {
      if (!process.env[key]) missing.add(key);
    }
  }

  if (provider === 'unconfigured') {
    missing.add('SHIP_FLEETGRAPH_PROVIDER');
    missing.add('OPENAI_API_KEY');
  }

  return [...missing];
}

export function getFleetGraphObservabilityStatus(): FleetGraphStatusResponse['observability'] {
  if (process.env.SHIP_FLEETGRAPH_TRACING_ENABLED === 'false') {
    return {
      tracesEnabled: false,
      missingConfiguration: [],
    };
  }

  const missingConfiguration = ['LANGSMITH_API_KEY', 'LANGSMITH_PROJECT']
    .filter((key) => !process.env[key]);

  return {
    tracesEnabled: missingConfiguration.length === 0,
    missingConfiguration,
  };
}

export function getFleetGraphProactiveStatus(): FleetGraphStatusResponse['proactive'] {
  return {
    enabled: process.env.SHIP_FLEETGRAPH_PROACTIVE_ENABLED !== 'false',
    sweepIntervalMs: readPositiveInteger(
      process.env.SHIP_FLEETGRAPH_SWEEP_INTERVAL_MS,
      FLEETGRAPH_PROACTIVE_DEFAULTS.sweepIntervalMs,
    ),
    maxEventsPerSweep: readPositiveInteger(
      process.env.SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP,
      FLEETGRAPH_PROACTIVE_DEFAULTS.maxEventsPerSweep,
    ),
  };
}

export function getFleetGraphStatus(): FleetGraphStatusResponse {
  const provider = getFleetGraphProvider();
  const missingConfiguration = getFleetGraphMissingConfiguration(provider);
  const enabled = process.env.SHIP_FLEETGRAPH_ENABLED !== 'false';

  return {
    enabled,
    available: enabled && missingConfiguration.length === 0 && provider !== 'unconfigured',
    provider,
    model: getFleetGraphModel(provider),
    missingConfiguration,
    proactive: getFleetGraphProactiveStatus(),
    limits: {
      maxMessageChars: FLEETGRAPH_LIMITS.maxMessageChars,
      maxHistoryMessages: FLEETGRAPH_LIMITS.maxHistoryMessages,
      maxFindingsPerRun: FLEETGRAPH_LIMITS.maxFindingsPerRun,
    },
    observability: getFleetGraphObservabilityStatus(),
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
