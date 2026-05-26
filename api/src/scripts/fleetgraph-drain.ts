import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db/client.js';
import {
  drainFleetGraphQueue,
  enqueueFleetGraphSweepEvents,
} from '../services/fleetgraph/sweep.js';

export interface FleetGraphDrainOptions {
  workerId?: string;
  maxJobs: number;
  sweepOnDrain: boolean;
  sweepWorkspaceIds: string[];
  sweepMaxWorkspaces: number;
  sweepLimit: number;
}

export interface FleetGraphDrainSummary {
  processed: number;
  findingsCreated: number;
  failures: number;
  sweepWorkspaces: number;
  sweepEventsCreated: number;
}

export function parseFleetGraphDrainOptions(env: NodeJS.ProcessEnv = process.env): FleetGraphDrainOptions {
  return {
    workerId: env.SHIP_FLEETGRAPH_WORKER_ID,
    maxJobs: readPositiveInteger(env.SHIP_FLEETGRAPH_DRAIN_MAX_JOBS, 10),
    sweepOnDrain: readBoolean(env.SHIP_FLEETGRAPH_SWEEP_ON_DRAIN, false),
    sweepWorkspaceIds: readCsv(env.SHIP_FLEETGRAPH_SWEEP_WORKSPACE_IDS),
    sweepMaxWorkspaces: readPositiveInteger(env.SHIP_FLEETGRAPH_SWEEP_MAX_WORKSPACES, 25),
    sweepLimit: readPositiveInteger(env.SHIP_FLEETGRAPH_MAX_EVENTS_PER_SWEEP, 25),
  };
}

export async function runFleetGraphDrain(
  options: FleetGraphDrainOptions = parseFleetGraphDrainOptions(),
): Promise<FleetGraphDrainSummary> {
  let sweepWorkspaces = 0;
  let sweepEventsCreated = 0;

  if (options.sweepOnDrain) {
    const workspaceIds = await listFleetGraphSweepWorkspaceIds({
      configuredWorkspaceIds: options.sweepWorkspaceIds,
      maxWorkspaces: options.sweepMaxWorkspaces,
    });
    sweepWorkspaces = workspaceIds.length;

    for (const workspaceId of workspaceIds) {
      sweepEventsCreated += await enqueueFleetGraphSweepEvents({
        workspaceId,
        limit: options.sweepLimit,
      });
    }
  }

  const result = await drainFleetGraphQueue({
    workerId: options.workerId,
    maxJobs: options.maxJobs,
  });

  return {
    ...result,
    sweepWorkspaces,
    sweepEventsCreated,
  };
}

export async function listFleetGraphSweepWorkspaceIds(input: {
  configuredWorkspaceIds: string[];
  maxWorkspaces: number;
}): Promise<string[]> {
  if (input.configuredWorkspaceIds.length) return input.configuredWorkspaceIds;

  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM workspaces
     WHERE archived_at IS NULL
     ORDER BY updated_at DESC, created_at DESC
     LIMIT $1`,
    [input.maxWorkspaces],
  );

  return result.rows.map((row) => row.id);
}

async function main(): Promise<void> {
  const result = await runFleetGraphDrain();

  console.log(JSON.stringify(result));
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isMainModule(): boolean {
  return Boolean(process.argv[1])
    && resolve(process.argv[1]!) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main()
    .catch((error) => {
      console.error('FleetGraph drain failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
