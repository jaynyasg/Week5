import { randomUUID } from 'crypto';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pool } from '../../db/client.js';
import { getFleetGraphModel, getFleetGraphObservabilityStatus, getFleetGraphProvider } from './config.js';
import { estimateFleetGraphCost } from './costs.js';
import type {
  FleetGraphRun,
  FleetGraphRunCompletionInput,
  FleetGraphRunInput,
} from './types.js';

let checkpointerPromise: Promise<PostgresSaver> | null = null;

export interface FleetGraphRunnableConfig {
  configurable: {
    thread_id: string;
    checkpoint_ns: string;
  };
}

export function makeFleetGraphThreadId(input: {
  workspaceId: string;
  mode: string;
  subjectId?: string | null;
}): string {
  const subject = input.subjectId?.trim() || randomUUID();
  return `fleetgraph:${input.workspaceId}:${input.mode}:${subject}`;
}

export function makeFleetGraphRunnableConfig(
  threadId: string,
  checkpointNamespace = '',
): FleetGraphRunnableConfig {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error('FleetGraph thread_id is required for checkpointed graph invocations');
  }

  return {
    configurable: {
      thread_id: normalizedThreadId,
      checkpoint_ns: checkpointNamespace,
    },
  };
}

export async function getFleetGraphCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointerPromise) {
    checkpointerPromise = setupFleetGraphCheckpointer();
  }
  return checkpointerPromise;
}

export function resetFleetGraphCheckpointerForTests(): void {
  checkpointerPromise = null;
}

export async function startFleetGraphRun(input: FleetGraphRunInput): Promise<FleetGraphRun> {
  const provider = getFleetGraphProvider();
  const model = getFleetGraphModel(provider);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleetgraph_runs
      (workspace_id, user_id, mode, trigger_type, trigger_id, thread_id, status, provider, model, metadata)
     VALUES ($1, $2, $3, $4, $5::uuid, $6, 'started', $7, $8, $9)
     RETURNING id`,
    [
      input.workspaceId,
      input.userId ?? null,
      input.mode,
      input.triggerType,
      input.triggerId ?? null,
      input.threadId,
      provider,
      model,
      JSON.stringify(sanitizeFleetGraphMetadata(input.metadata ?? {})),
    ],
  );

  return {
    id: result.rows[0]!.id,
    threadId: input.threadId,
    startedAt: Date.now(),
  };
}

export async function completeFleetGraphRun(input: FleetGraphRunCompletionInput): Promise<void> {
  if (!input.run.id) return;

  const cost = estimateFleetGraphCost(input.usage ?? {});
  const metadata = sanitizeFleetGraphMetadata(input.metadata ?? {});
  const error = input.error ? truncateString(input.error, 2000) : null;

  await pool.query(
    `UPDATE fleetgraph_runs
     SET status = $1,
         provider = COALESCE($2, provider),
         model = COALESCE($3, model),
         input_tokens = $4,
         output_tokens = $5,
         estimated_cost_usd = $6,
         langsmith_trace_url = $7,
         metadata = metadata || $8::jsonb,
         error = $9,
         completed_at = now()
     WHERE id = $10`,
    [
      input.status,
      cost.provider,
      cost.model,
      cost.inputTokens,
      cost.outputTokens,
      cost.estimatedCostUsd,
      input.langsmithTraceUrl ?? null,
      JSON.stringify(metadata),
      error,
      input.run.id,
    ],
  );
}

export async function safeCompleteFleetGraphRun(input: FleetGraphRunCompletionInput): Promise<void> {
  try {
    await completeFleetGraphRun(input);
  } catch (error) {
    console.warn('FleetGraph run metadata could not be completed:', error instanceof Error ? error.message : error);
  }
}

export function isFleetGraphTracingEnabled(): boolean {
  return getFleetGraphObservabilityStatus().tracesEnabled;
}

export function sanitizeFleetGraphMetadata(
  metadata: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth > 3) return {};

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveMetadataKey(key)) continue;

    if (value === null || value === undefined) {
      output[key] = value;
    } else if (typeof value === 'string') {
      output[key] = truncateString(value, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
    } else if (typeof value === 'object') {
      output[key] = sanitizeFleetGraphMetadata(value as Record<string, unknown>, depth + 1);
    }
  }

  return output;
}

async function setupFleetGraphCheckpointer(): Promise<PostgresSaver> {
  const checkpointer = new PostgresSaver(pool);
  await checkpointer.setup();
  return checkpointer;
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateString(value, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetadataValue(item, depth + 1));
  if (typeof value === 'object') return sanitizeFleetGraphMetadata(value as Record<string, unknown>, depth + 1);
  return undefined;
}

function isSensitiveMetadataKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return [
    'authorization',
    'cookie',
    'password',
    'secret',
    'session',
    'token',
    'api_key',
    'apikey',
    'access_key',
  ].some((fragment) => normalized.includes(fragment));
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
