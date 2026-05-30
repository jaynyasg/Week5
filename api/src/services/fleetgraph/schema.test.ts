import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';
import type {
  FleetGraphChatResponse,
  FleetGraphFindingProperties,
  FleetGraphStatusResponse,
} from '@ship/shared';
import { pool } from '../../db/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationPath = resolve(__dirname, '../../db/migrations/048_fleetgraph_foundation.sql');
const notificationPreferencesMigrationPath = resolve(
  __dirname,
  '../../db/migrations/051_fleetgraph_notification_preferences.sql',
);
const costRollupsMigrationPath = resolve(__dirname, '../../db/migrations/052_fleetgraph_cost_rollups.sql');
const opsTuningReplayMigrationPath = resolve(
  __dirname,
  '../../db/migrations/053_fleetgraph_ops_tuning_replay.sql',
);

describe('FleetGraph schema foundation', () => {
  let workspaceId: string;
  let userId: string;
  let findingDocumentId: string;
  let programId: string;
  let projectId: string;
  let weekId: string;
  let runId: string;

  beforeAll(async () => {
    const migrationSql = await readFile(migrationPath, 'utf8');
    const notificationPreferencesMigrationSql = await readFile(notificationPreferencesMigrationPath, 'utf8');
    const costRollupsMigrationSql = await readFile(costRollupsMigrationPath, 'utf8');
    const opsTuningReplayMigrationSql = await readFile(opsTuningReplayMigrationPath, 'utf8');
    await pool.query(migrationSql);
    await pool.query(migrationSql);
    await pool.query(notificationPreferencesMigrationSql);
    await pool.query(notificationPreferencesMigrationSql);
    await pool.query(costRollupsMigrationSql);
    await pool.query(costRollupsMigrationSql);
    await pool.query(opsTuningReplayMigrationSql);
    await pool.query(opsTuningReplayMigrationSql);

    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ('FleetGraph Test') RETURNING id`,
    );
    workspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ('fleetgraph-schema@ship.local', 'test-hash', 'FleetGraph User')
       RETURNING id`,
    );
    userId = userResult.rows[0].id;

    const docsResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES
         ($1, 'program', 'Program Alpha', '{}', $2),
         ($1, 'project', 'Project Beta', '{}', $2),
         ($1, 'sprint', 'Week 5', '{"sprint_number":5}', $2),
         ($1, 'fleetgraph_finding', 'FleetGraph Risk', $3, $2)
       RETURNING id, document_type`,
      [workspaceId, userId, JSON.stringify(findingProperties())],
    );

    for (const row of docsResult.rows) {
      if (row.document_type === 'program') programId = row.id;
      if (row.document_type === 'project') projectId = row.id;
      if (row.document_type === 'sprint') weekId = row.id;
      if (row.document_type === 'fleetgraph_finding') findingDocumentId = row.id;
    }

    const runResult = await pool.query(
      `INSERT INTO fleetgraph_runs (
         workspace_id, user_id, mode, trigger_type, trigger_id, thread_id,
         provider, model, input_tokens, output_tokens, estimated_cost_usd
       )
       VALUES ($1, $2, 'proactive', 'document.updated', $3, 'thread-schema-test',
         'mock', 'mock-fleetgraph', 42, 17, 0.001234)
       RETURNING id`,
      [workspaceId, userId, findingDocumentId],
    );
    runId = runResult.rows[0].id;
  });

  it('adds the fleetgraph_finding document type and durable tables', async () => {
    const enumResult = await pool.query(
      `SELECT enumlabel
       FROM pg_enum
       WHERE enumtypid = 'document_type'::regtype
         AND enumlabel = 'fleetgraph_finding'`,
    );

    expect(enumResult.rowCount).toBe(1);

    const tableResult = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       ORDER BY table_name`,
      [[
        'fleetgraph_action_proposals',
        'fleetgraph_deliveries',
        'fleetgraph_detector_settings',
        'fleetgraph_event_queue',
        'fleetgraph_monthly_cost_rollups',
        'fleetgraph_notification_preferences',
        'fleetgraph_replay_runs',
        'fleetgraph_replay_scenarios',
        'fleetgraph_runs',
      ]],
    );

    expect(tableResult.rows.map((row) => row.table_name)).toEqual([
      'fleetgraph_action_proposals',
      'fleetgraph_deliveries',
      'fleetgraph_detector_settings',
      'fleetgraph_event_queue',
      'fleetgraph_monthly_cost_rollups',
      'fleetgraph_notification_preferences',
      'fleetgraph_replay_runs',
      'fleetgraph_replay_scenarios',
      'fleetgraph_runs',
    ]);
  });

  it('keeps event enqueue idempotency scoped to a workspace', async () => {
    await pool.query(
      `INSERT INTO fleetgraph_event_queue (
         workspace_id, source_event_type, source_document_id, idempotency_key, payload
       )
       VALUES ($1, 'document.updated', $2, 'document-updated:test', '{"reason":"schema"}')`,
      [workspaceId, findingDocumentId],
    );

    await expect(pool.query(
      `INSERT INTO fleetgraph_event_queue (
         workspace_id, source_event_type, source_document_id, idempotency_key, payload
       )
       VALUES ($1, 'document.updated', $2, 'document-updated:test', '{}')`,
      [workspaceId, findingDocumentId],
    )).rejects.toMatchObject({ code: '23505' });
  });

  it('prevents duplicate delivery rows for the same user and finding', async () => {
    await pool.query(
      `INSERT INTO fleetgraph_deliveries (workspace_id, finding_document_id, user_id)
       VALUES ($1, $2, $3)`,
      [workspaceId, findingDocumentId, userId],
    );

    await expect(pool.query(
      `INSERT INTO fleetgraph_deliveries (workspace_id, finding_document_id, user_id)
       VALUES ($1, $2, $3)`,
      [workspaceId, findingDocumentId, userId],
    )).rejects.toMatchObject({ code: '23505' });
  });

  it('prevents duplicate active finding documents for the same FleetGraph key', async () => {
    const properties = {
      ...findingProperties(),
      fleetgraph_key: 'schema-duplicate-risk',
    };

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'fleetgraph_finding', 'Duplicate FleetGraph Risk', $2, $3)`,
      [workspaceId, JSON.stringify(properties), userId],
    );

    await expect(pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'fleetgraph_finding', 'Duplicate FleetGraph Risk', $2, $3)`,
      [workspaceId, JSON.stringify(properties), userId],
    )).rejects.toMatchObject({ code: '23505' });
  });

  it('preserves rejected and failed action proposals for review', async () => {
    await pool.query(
      `INSERT INTO fleetgraph_action_proposals (
         workspace_id, finding_document_id, run_id, proposed_action,
         target_document_id, payload, status, decided_by_user_id,
         decided_at, decision_note, error
       )
       VALUES
         ($1, $2, $3, 'create_issue', $2, '{"title":"Follow up"}',
          'rejected', $4, now(), 'Already tracked', NULL),
         ($1, $2, $3, 'update_document', $2, '{"field":"priority"}',
          'failed', NULL, NULL, NULL, 'Target document changed')`,
      [workspaceId, findingDocumentId, runId, userId],
    );

    const result = await pool.query(
      `SELECT status, decision_note, error
       FROM fleetgraph_action_proposals
       WHERE finding_document_id = $1
       ORDER BY status`,
      [findingDocumentId],
    );

    expect(result.rows).toEqual([
      { status: 'failed', decision_note: null, error: 'Target document changed' },
      { status: 'rejected', decision_note: 'Already tracked', error: null },
    ]);
  });

  it('associates finding documents to program, project, and week through document_associations', async () => {
    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES
         ($1, $2, 'program'),
         ($1, $3, 'project'),
         ($1, $4, 'sprint')`,
      [findingDocumentId, programId, projectId, weekId],
    );

    const result = await pool.query(
      `SELECT da.relationship_type, d.document_type
       FROM document_associations da
       JOIN documents d ON d.id = da.related_id
       WHERE da.document_id = $1
       ORDER BY da.relationship_type`,
      [findingDocumentId],
    );

    expect(result.rows).toHaveLength(3);
    expect(result.rows).toEqual(expect.arrayContaining([
      { relationship_type: 'program', document_type: 'program' },
      { relationship_type: 'project', document_type: 'project' },
      { relationship_type: 'sprint', document_type: 'sprint' },
    ]));
  });

  it('keeps shared FleetGraph contracts usable by API responses', () => {
    const status: FleetGraphStatusResponse = {
      enabled: true,
      available: true,
      provider: 'mock',
      model: 'mock-fleetgraph',
      missingConfiguration: [],
      proactive: {
        enabled: true,
        sweepIntervalMs: 60000,
        maxEventsPerSweep: 25,
      },
      limits: {
        maxMessageChars: 4000,
        maxHistoryMessages: 8,
        maxFindingsPerRun: 10,
      },
      observability: {
        tracesEnabled: false,
        missingConfiguration: [],
      },
    };

    const response: FleetGraphChatResponse = {
      status: 'answered',
      message: {
        id: 'msg_1',
        role: 'assistant',
        content: 'FleetGraph found one risk.',
        createdAt: new Date(0).toISOString(),
      },
      findings: [{
        id: findingDocumentId,
        title: 'FleetGraph Risk',
        status: 'open',
        severity: 'high',
        kind: 'dependency_risk',
        confidence: 0.86,
        summary: 'Dependency is at risk.',
        targetDocumentId: projectId,
        targetDocumentType: 'project',
        ownerUserId: userId,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }],
      proposals: [],
      citations: [],
      sourceCounts: {
        documents: 1,
        projects: 1,
        programs: 1,
        issues: 0,
        weeks: 1,
        timeline: 0,
        files: 0,
        total: 4,
      },
      runId,
    };

    expect(status.provider).toBe('mock');
    expect(response.findings[0]?.severity).toBe('high');
  });
});

function findingProperties(): FleetGraphFindingProperties {
  return {
    status: 'open',
    severity: 'high',
    kind: 'dependency_risk',
    confidence: 0.86,
    summary: 'Dependency is at risk.',
    rationale: 'The target project has a blocked dependency without a recent update.',
    target_document_id: null,
    target_document_type: null,
    owner_user_id: null,
    run_id: null,
    evidence: [{
      sourceType: 'project',
      sourceId: '00000000-0000-0000-0000-000000000000',
      title: 'Project Beta',
      excerpt: 'Blocked by upstream dependency.',
    }],
    first_detected_at: new Date(0).toISOString(),
    last_observed_at: new Date(0).toISOString(),
  };
}
