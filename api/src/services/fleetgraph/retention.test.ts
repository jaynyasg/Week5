import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import {
  defaultFleetGraphRetentionOptions,
  parseFleetGraphRetentionOptions,
  runFleetGraphRetention,
  type FleetGraphRetentionOptions,
} from './retention.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fleetGraphDocumentTypeMigrationPath = resolve(__dirname, '../../db/migrations/048_fleetgraph_foundation.sql');
const fleetGraphTablesMigrationPath = resolve(__dirname, '../../db/migrations/049_fleetgraph_foundation_tables.sql');
const fleetGraphCostRollupsMigrationPath = resolve(__dirname, '../../db/migrations/052_fleetgraph_cost_rollups.sql');
const NOW = new Date('2026-05-29T12:00:00.000Z');

describe('FleetGraph retention', () => {
  beforeAll(async () => {
    await pool.query(await readFile(fleetGraphDocumentTypeMigrationPath, 'utf8'));
    await pool.query(await readFile(fleetGraphTablesMigrationPath, 'utf8'));
    await pool.query(await readFile(fleetGraphCostRollupsMigrationPath, 'utf8'));
  });

  afterEach(async () => {
    await pool.query(`TRUNCATE TABLE
      fleetgraph_monthly_cost_rollups,
      fleetgraph_action_proposals, fleetgraph_event_queue, fleetgraph_runs,
      fleetgraph_deliveries, documents, workspace_memberships, users, workspaces
      CASCADE`);
  });

  it('parses configurable retention windows with safe defaults', () => {
    const options = parseFleetGraphRetentionOptions({
      SHIP_FLEETGRAPH_RETENTION_COMPLETED_EVENTS_DAYS: '7',
      SHIP_FLEETGRAPH_RETENTION_FAILED_EVENTS_DAYS: 'bad',
      SHIP_FLEETGRAPH_RETENTION_RUNS_DAYS: '120',
      SHIP_FLEETGRAPH_RETENTION_RESOLVED_FINDINGS_DAYS: '365',
      SHIP_FLEETGRAPH_RETENTION_CHECKPOINTS_DAYS: '60',
      SHIP_FLEETGRAPH_RETENTION_DRY_RUN: 'yes',
    });

    expect(options).toMatchObject({
      completedEventDays: 7,
      failedEventDays: defaultFleetGraphRetentionOptions.failedEventDays,
      runDays: 120,
      resolvedFindingDays: 365,
      checkpointDays: 60,
      dryRun: true,
    });
  });

  it('reports retention candidates without deleting them in dry run mode', async () => {
    const data = await seedRetentionData();

    const summary = await runFleetGraphRetention(retentionOptions({ dryRun: true }));

    expect(summary).toMatchObject({
      completedEvents: 1,
      failedEvents: 1,
      costRollupRows: 1,
      runs: 1,
      resolvedFindingsSoftDeleted: 1,
      checkpointThreads: 1,
      dryRun: true,
    });

    await expectEventToExist(data.oldCompletedEventId);
    await expectRunToExist(data.oldTerminalRunId);
    await expectFindingDeletedAt(data.resolvedFindingId, null);
    await expectCostRollupRows(0);
  });

  it('prunes old terminal history while preserving active work and human gates', async () => {
    const data = await seedRetentionData();

    const summary = await runFleetGraphRetention(retentionOptions({ dryRun: false }));

    expect(summary).toMatchObject({
      completedEvents: 1,
      failedEvents: 1,
      costRollupRows: 1,
      runs: 1,
      resolvedFindingsSoftDeleted: 1,
      checkpointThreads: 1,
      dryRun: false,
    });

    await expectEventToBeDeleted(data.oldCompletedEventId);
    await expectEventToBeDeleted(data.oldFailedEventId);
    await expectEventToExist(data.recentCompletedEventId);
    await expectEventToExist(data.queuedEventId);
    await expectRunToBeDeleted(data.oldTerminalRunId);
    await expectRunToExist(data.pendingGateRunId);
    await expectRunToExist(data.startedRunId);
    await expectHistoricalProposalRetained(data.historicalProposalId);
    await expectCostRollup({
      runCount: 1,
      inputTokens: 1000,
      outputTokens: 250,
      estimatedCostUsd: '0.000300',
    });
    await expectFindingDeletedAt(data.resolvedFindingId, expect.any(Date));
    await expectFindingDeletedAt(data.openFindingId, null);
  });
});

async function seedRetentionData(): Promise<{
  oldCompletedEventId: string;
  oldFailedEventId: string;
  recentCompletedEventId: string;
  queuedEventId: string;
  oldTerminalRunId: string;
  pendingGateRunId: string;
  startedRunId: string;
  historicalProposalId: string;
  resolvedFindingId: string;
  openFindingId: string;
}> {
  const suffix = randomUUID();
  const workspaceResult = await pool.query<{ id: string }>(
    `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
    [`FleetGraph Retention ${suffix}`],
  );
  const workspaceId = workspaceResult.rows[0]!.id;

  const userResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'test-hash', 'FleetGraph Retention User')
     RETURNING id`,
    [`fleetgraph-retention-${suffix}@ship.local`],
  );
  const userId = userResult.rows[0]!.id;

  const findingResult = await pool.query<{ id: string; title: string }>(
    `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, updated_at)
     VALUES
       ($1, 'fleetgraph_finding', 'Resolved finding', $2, $3, $4),
       ($1, 'fleetgraph_finding', 'Open finding', $5, $3, $4)
     RETURNING id, title`,
    [
      workspaceId,
      JSON.stringify(findingProperties('resolved')),
      userId,
      daysAgo(210).toISOString(),
      JSON.stringify(findingProperties('open')),
    ],
  );
  const resolvedFindingId = findingResult.rows.find((row) => row.title === 'Resolved finding')!.id;
  const openFindingId = findingResult.rows.find((row) => row.title === 'Open finding')!.id;

  const eventResult = await pool.query<{ id: string; idempotency_key: string }>(
    `INSERT INTO fleetgraph_event_queue (
       workspace_id, source_event_type, source_document_id, payload, status, idempotency_key, updated_at
     )
     VALUES
       ($1, 'document.updated', $2, '{}', 'completed', $3, $4),
       ($1, 'document.updated', $2, '{}', 'failed', $5, $6),
       ($1, 'document.updated', $2, '{}', 'completed', $7, $8),
       ($1, 'document.updated', $2, '{}', 'queued', $9, $4)
     RETURNING id, idempotency_key`,
    [
      workspaceId,
      resolvedFindingId,
      `old-completed:${suffix}`,
      daysAgo(30).toISOString(),
      `old-failed:${suffix}`,
      daysAgo(120).toISOString(),
      `recent-completed:${suffix}`,
      daysAgo(2).toISOString(),
      `queued:${suffix}`,
    ],
  );

  const runResult = await pool.query<{ id: string; thread_id: string }>(
    `INSERT INTO fleetgraph_runs (
       workspace_id, user_id, mode, trigger_type, trigger_id, thread_id, status, created_at, completed_at
     )
     VALUES
       ($1, $2, 'proactive', 'document.updated', $3, $4, 'completed', $5, $5),
       ($1, $2, 'proactive', 'document.updated', $3, $6, 'completed', $5, $5),
       ($1, $2, 'proactive', 'document.updated', $3, $7, 'started', $5, NULL)
     RETURNING id, thread_id`,
    [
      workspaceId,
      userId,
      resolvedFindingId,
      `thread-old-terminal-${suffix}`,
      daysAgo(120).toISOString(),
      `thread-pending-gate-${suffix}`,
      `thread-started-${suffix}`,
    ],
  );
  const oldTerminalRunId = runResult.rows.find((row) => row.thread_id.startsWith('thread-old-terminal'))!.id;
  const pendingGateRunId = runResult.rows.find((row) => row.thread_id.startsWith('thread-pending-gate'))!.id;
  const startedRunId = runResult.rows.find((row) => row.thread_id.startsWith('thread-started'))!.id;

  await pool.query(
    `UPDATE fleetgraph_runs
     SET provider = 'openai',
         model = 'gpt-4o-mini',
         input_tokens = 1000,
         output_tokens = 250,
         estimated_cost_usd = 0.000300
     WHERE id = $1`,
    [oldTerminalRunId],
  );

  await pool.query(
    `INSERT INTO fleetgraph_action_proposals (
       workspace_id, finding_document_id, run_id, proposed_action, target_document_id, payload, status
     )
     VALUES ($1, $2, $3, 'request_update', $2, '{}', 'pending')`,
    [workspaceId, openFindingId, pendingGateRunId],
  );
  const historicalProposalResult = await pool.query<{ id: string }>(
    `INSERT INTO fleetgraph_action_proposals (
       workspace_id, finding_document_id, run_id, proposed_action, target_document_id, payload, status,
       decided_by_user_id, decided_at, decision_note
     )
     VALUES ($1, $2, $3, 'request_update', $2, '{}', 'rejected', $4, $5, 'Already handled')
     RETURNING id`,
    [workspaceId, resolvedFindingId, oldTerminalRunId, userId, daysAgo(119).toISOString()],
  );

  return {
    oldCompletedEventId: eventResult.rows.find((row) => row.idempotency_key.startsWith('old-completed'))!.id,
    oldFailedEventId: eventResult.rows.find((row) => row.idempotency_key.startsWith('old-failed'))!.id,
    recentCompletedEventId: eventResult.rows.find((row) => row.idempotency_key.startsWith('recent-completed'))!.id,
    queuedEventId: eventResult.rows.find((row) => row.idempotency_key.startsWith('queued'))!.id,
    oldTerminalRunId,
    pendingGateRunId,
    startedRunId,
    historicalProposalId: historicalProposalResult.rows[0]!.id,
    resolvedFindingId,
    openFindingId,
  };
}

async function expectCostRollupRows(count: number): Promise<void> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM fleetgraph_monthly_cost_rollups',
  );
  expect(Number(result.rows[0]?.count ?? 0)).toBe(count);
}

async function expectCostRollup(expected: {
  runCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: string;
}): Promise<void> {
  const result = await pool.query<{
    month: Date;
    mode: string;
    provider: string;
    model: string;
    run_count: number;
    input_tokens: string;
    output_tokens: string;
    estimated_cost_usd: string;
  }>(
    `SELECT month, mode, provider, model, run_count, input_tokens, output_tokens, estimated_cost_usd
     FROM fleetgraph_monthly_cost_rollups`,
  );

  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({
    mode: 'proactive',
    provider: 'openai',
    model: 'gpt-4o-mini',
    run_count: expected.runCount,
    input_tokens: String(expected.inputTokens),
    output_tokens: String(expected.outputTokens),
    estimated_cost_usd: expected.estimatedCostUsd,
  });
}

async function expectHistoricalProposalRetained(proposalId: string): Promise<void> {
  const result = await pool.query<{ run_id: string | null; status: string }>(
    `SELECT run_id, status
     FROM fleetgraph_action_proposals
     WHERE id = $1`,
    [proposalId],
  );
  expect(result.rows[0]).toEqual({
    run_id: null,
    status: 'rejected',
  });
}

function retentionOptions(overrides: Partial<FleetGraphRetentionOptions>): FleetGraphRetentionOptions {
  return {
    ...defaultFleetGraphRetentionOptions,
    now: NOW,
    ...overrides,
  };
}

function findingProperties(status: 'open' | 'resolved'): Record<string, unknown> {
  return {
    status,
    severity: 'medium',
    kind: 'planning_gap',
    confidence: 0.8,
    summary: `${status} finding`,
    rationale: 'Retention test finding.',
    evidence: [],
    first_detected_at: daysAgo(220).toISOString(),
    last_observed_at: daysAgo(210).toISOString(),
  };
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

async function expectEventToExist(eventId: string): Promise<void> {
  const result = await pool.query('SELECT 1 FROM fleetgraph_event_queue WHERE id = $1', [eventId]);
  expect(result.rowCount).toBe(1);
}

async function expectEventToBeDeleted(eventId: string): Promise<void> {
  const result = await pool.query('SELECT 1 FROM fleetgraph_event_queue WHERE id = $1', [eventId]);
  expect(result.rowCount).toBe(0);
}

async function expectRunToExist(runId: string): Promise<void> {
  const result = await pool.query('SELECT 1 FROM fleetgraph_runs WHERE id = $1', [runId]);
  expect(result.rowCount).toBe(1);
}

async function expectRunToBeDeleted(runId: string): Promise<void> {
  const result = await pool.query('SELECT 1 FROM fleetgraph_runs WHERE id = $1', [runId]);
  expect(result.rowCount).toBe(0);
}

async function expectFindingDeletedAt(findingId: string, expected: Date | null | unknown): Promise<void> {
  const result = await pool.query<{ deleted_at: Date | null }>(
    'SELECT deleted_at FROM documents WHERE id = $1',
    [findingId],
  );
  expect(result.rows[0]?.deleted_at).toEqual(expected);
}
