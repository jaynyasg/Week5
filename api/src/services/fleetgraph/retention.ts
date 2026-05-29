import type { PoolClient } from 'pg';
import { pool } from '../../db/client.js';

export interface FleetGraphRetentionOptions {
  completedEventDays: number;
  failedEventDays: number;
  runDays: number;
  resolvedFindingDays: number;
  checkpointDays: number;
  dryRun: boolean;
  now?: Date;
}

export interface FleetGraphRetentionSummary {
  completedEvents: number;
  failedEvents: number;
  runs: number;
  resolvedFindingsSoftDeleted: number;
  costRollupRows: number;
  checkpointThreads: number;
  checkpointRows: {
    checkpoints: number;
    blobs: number;
    writes: number;
  };
  dryRun: boolean;
}

export const defaultFleetGraphRetentionOptions: FleetGraphRetentionOptions = {
  completedEventDays: 14,
  failedEventDays: 90,
  runDays: 90,
  resolvedFindingDays: 180,
  checkpointDays: 90,
  dryRun: false,
};

const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'cancelled'] as const;

export function parseFleetGraphRetentionOptions(env: NodeJS.ProcessEnv = process.env): FleetGraphRetentionOptions {
  return {
    completedEventDays: readPositiveInteger(
      env.SHIP_FLEETGRAPH_RETENTION_COMPLETED_EVENTS_DAYS,
      defaultFleetGraphRetentionOptions.completedEventDays,
    ),
    failedEventDays: readPositiveInteger(
      env.SHIP_FLEETGRAPH_RETENTION_FAILED_EVENTS_DAYS,
      defaultFleetGraphRetentionOptions.failedEventDays,
    ),
    runDays: readPositiveInteger(
      env.SHIP_FLEETGRAPH_RETENTION_RUNS_DAYS,
      defaultFleetGraphRetentionOptions.runDays,
    ),
    resolvedFindingDays: readPositiveInteger(
      env.SHIP_FLEETGRAPH_RETENTION_RESOLVED_FINDINGS_DAYS,
      defaultFleetGraphRetentionOptions.resolvedFindingDays,
    ),
    checkpointDays: readPositiveInteger(
      env.SHIP_FLEETGRAPH_RETENTION_CHECKPOINTS_DAYS,
      defaultFleetGraphRetentionOptions.checkpointDays,
    ),
    dryRun: readBoolean(
      env.SHIP_FLEETGRAPH_RETENTION_DRY_RUN,
      defaultFleetGraphRetentionOptions.dryRun,
    ),
  };
}

export async function runFleetGraphRetention(
  options: FleetGraphRetentionOptions = parseFleetGraphRetentionOptions(),
): Promise<FleetGraphRetentionSummary> {
  const client = await pool.connect();
  const now = options.now ?? new Date();

  try {
    await client.query('BEGIN');

    const completedEvents = await pruneEventQueue(client, {
      statusSql: "status = 'completed'",
      cutoff: daysAgo(now, options.completedEventDays),
      dryRun: options.dryRun,
    });
    const failedEvents = await pruneEventQueue(client, {
      statusSql: "status = 'failed'",
      cutoff: daysAgo(now, options.failedEventDays),
      dryRun: options.dryRun,
    });
    const costRollupRows = await rollupPrunableRuns(client, {
      cutoff: daysAgo(now, options.runDays),
      dryRun: options.dryRun,
    });
    const checkpointThreadIds = await listPrunableCheckpointThreadIds(client, daysAgo(now, options.checkpointDays));
    const runs = await pruneRuns(client, {
      cutoff: daysAgo(now, options.runDays),
      dryRun: options.dryRun,
    });
    const resolvedFindingsSoftDeleted = await pruneResolvedFindings(client, {
      cutoff: daysAgo(now, options.resolvedFindingDays),
      now,
      dryRun: options.dryRun,
    });
    const checkpointRows = await pruneCheckpoints(client, {
      threadIds: checkpointThreadIds,
      dryRun: options.dryRun,
    });

    await client.query('COMMIT');

    return {
      completedEvents,
      failedEvents,
      runs,
      resolvedFindingsSoftDeleted,
      costRollupRows,
      checkpointThreads: checkpointThreadIds.length,
      checkpointRows,
      dryRun: options.dryRun,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function rollupPrunableRuns(
  client: PoolClient,
  input: { cutoff: Date; dryRun: boolean },
): Promise<number> {
  const params = [input.cutoff.toISOString(), TERMINAL_RUN_STATUSES];
  const whereSql = `
    status = ANY($2::text[])
    AND created_at < $1
    AND NOT EXISTS (
      SELECT 1
      FROM fleetgraph_action_proposals proposal
      WHERE proposal.run_id = fleetgraph_runs.id
        AND proposal.status = 'pending'
    )`;

  if (input.dryRun) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM (
         SELECT workspace_id, date_trunc('month', created_at)::date, mode,
                COALESCE(provider, 'unknown'), COALESCE(model, 'unknown')
         FROM fleetgraph_runs
         WHERE ${whereSql}
         GROUP BY workspace_id, date_trunc('month', created_at)::date, mode,
                  COALESCE(provider, 'unknown'), COALESCE(model, 'unknown')
       ) rollups`,
      params,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const result = await client.query(
    `INSERT INTO fleetgraph_monthly_cost_rollups (
       workspace_id, month, mode, provider, model, run_count,
       input_tokens, output_tokens, estimated_cost_usd
     )
     SELECT workspace_id,
            date_trunc('month', created_at)::date AS month,
            mode,
            COALESCE(provider, 'unknown') AS provider,
            COALESCE(model, 'unknown') AS model,
            COUNT(*)::integer AS run_count,
            COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::numeric(14, 6) AS estimated_cost_usd
     FROM fleetgraph_runs
     WHERE ${whereSql}
     GROUP BY workspace_id, date_trunc('month', created_at)::date, mode,
              COALESCE(provider, 'unknown'), COALESCE(model, 'unknown')
     ON CONFLICT (workspace_id, month, mode, provider, model)
     DO UPDATE SET
       run_count = fleetgraph_monthly_cost_rollups.run_count + EXCLUDED.run_count,
       input_tokens = fleetgraph_monthly_cost_rollups.input_tokens + EXCLUDED.input_tokens,
       output_tokens = fleetgraph_monthly_cost_rollups.output_tokens + EXCLUDED.output_tokens,
       estimated_cost_usd = fleetgraph_monthly_cost_rollups.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
       updated_at = now()`,
    params,
  );
  return result.rowCount ?? 0;
}

async function pruneEventQueue(
  client: PoolClient,
  input: { statusSql: string; cutoff: Date; dryRun: boolean },
): Promise<number> {
  if (input.dryRun) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM fleetgraph_event_queue
       WHERE ${input.statusSql}
         AND updated_at < $1`,
      [input.cutoff.toISOString()],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const result = await client.query(
    `DELETE FROM fleetgraph_event_queue
     WHERE ${input.statusSql}
       AND updated_at < $1`,
    [input.cutoff.toISOString()],
  );
  return result.rowCount ?? 0;
}

async function pruneRuns(
  client: PoolClient,
  input: { cutoff: Date; dryRun: boolean },
): Promise<number> {
  const params = [input.cutoff.toISOString(), TERMINAL_RUN_STATUSES];
  const whereSql = `
    status = ANY($2::text[])
    AND created_at < $1
    AND NOT EXISTS (
      SELECT 1
      FROM fleetgraph_action_proposals proposal
      WHERE proposal.run_id = fleetgraph_runs.id
        AND proposal.status = 'pending'
    )`;

  if (input.dryRun) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM fleetgraph_runs
       WHERE ${whereSql}`,
      params,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const result = await client.query(
    `DELETE FROM fleetgraph_runs
     WHERE ${whereSql}`,
    params,
  );
  return result.rowCount ?? 0;
}

async function pruneResolvedFindings(
  client: PoolClient,
  input: { cutoff: Date; now: Date; dryRun: boolean },
): Promise<number> {
  const params = [input.cutoff.toISOString(), input.now.toISOString()];
  const whereSql = `
    document_type::text = 'fleetgraph_finding'
    AND deleted_at IS NULL
    AND properties->>'status' IN ('resolved', 'dismissed')
    AND updated_at < $1
    AND NOT EXISTS (
      SELECT 1
      FROM fleetgraph_action_proposals proposal
      WHERE proposal.finding_document_id = documents.id
        AND proposal.status = 'pending'
    )`;

  if (input.dryRun) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM documents
       WHERE ${whereSql}`,
      [input.cutoff.toISOString()],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const result = await client.query(
    `UPDATE documents
     SET deleted_at = $2,
         updated_at = $2
     WHERE ${whereSql}`,
    params,
  );
  return result.rowCount ?? 0;
}

async function listPrunableCheckpointThreadIds(client: PoolClient, cutoff: Date): Promise<string[]> {
  const result = await client.query<{ thread_id: string }>(
    `SELECT DISTINCT thread_id
     FROM fleetgraph_runs
     WHERE thread_id IS NOT NULL
       AND status = ANY($2::text[])
       AND created_at < $1
       AND NOT EXISTS (
         SELECT 1
         FROM fleetgraph_action_proposals proposal
         WHERE proposal.run_id = fleetgraph_runs.id
           AND proposal.status = 'pending'
       )`,
    [cutoff.toISOString(), TERMINAL_RUN_STATUSES],
  );

  return result.rows.map((row) => row.thread_id);
}

async function pruneCheckpoints(
  client: PoolClient,
  input: { threadIds: string[]; dryRun: boolean },
): Promise<FleetGraphRetentionSummary['checkpointRows']> {
  if (!input.threadIds.length) {
    return { checkpoints: 0, blobs: 0, writes: 0 };
  }

  const tables = {
    checkpoints: await tableExists(client, 'checkpoints'),
    blobs: await tableExists(client, 'checkpoint_blobs'),
    writes: await tableExists(client, 'checkpoint_writes'),
  };

  const writes = tables.writes
    ? await countOrDeleteCheckpointRows(client, 'checkpoint_writes', input.threadIds, input.dryRun)
    : 0;
  const blobs = tables.blobs
    ? await countOrDeleteCheckpointRows(client, 'checkpoint_blobs', input.threadIds, input.dryRun)
    : 0;
  const checkpoints = tables.checkpoints
    ? await countOrDeleteCheckpointRows(client, 'checkpoints', input.threadIds, input.dryRun)
    : 0;

  return { checkpoints, blobs, writes };
}

async function countOrDeleteCheckpointRows(
  client: PoolClient,
  tableName: 'checkpoint_writes' | 'checkpoint_blobs' | 'checkpoints',
  threadIds: string[],
  dryRun: boolean,
): Promise<number> {
  if (dryRun) {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM ${tableName}
       WHERE thread_id = ANY($1::text[])`,
      [threadIds],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  const result = await client.query(
    `DELETE FROM ${tableName}
     WHERE thread_id = ANY($1::text[])`,
    [threadIds],
  );
  return result.rowCount ?? 0;
}

async function tableExists(client: PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [tableName],
  );
  return result.rows[0]?.exists ?? false;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
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
