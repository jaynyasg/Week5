import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../../db/client.js';
import { indexFleetGraphFindingForAssistant } from './indexer.js';

describe('indexFleetGraphFindingForAssistant', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const workspaceName = `Assistant FleetGraph Index ${testRunId}`;
  const userEmail = `assistant-fleetgraph-index-${testRunId}@ship.local`;
  const originalEnv = {
    SHIP_ASSISTANT_EMBEDDINGS_ENABLED: process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED,
    SHIP_ASSISTANT_EMBEDDING_DIMENSIONS: process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS,
  };

  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
      [workspaceName],
    );
    workspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Assistant FleetGraph Indexer')
       RETURNING id`,
      [userEmail],
    );
    userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [workspaceId, userId],
    );
  });

  afterEach(() => {
    restoreEnv('SHIP_ASSISTANT_EMBEDDINGS_ENABLED', originalEnv.SHIP_ASSISTANT_EMBEDDINGS_ENABLED);
    restoreEnv('SHIP_ASSISTANT_EMBEDDING_DIMENSIONS', originalEnv.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  it('writes FleetGraph findings into the Ask Ship chunk index with embeddings when available', async () => {
    process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED = 'mock';
    process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS = '64';

    const findingResult = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'fleetgraph_finding', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `FleetGraph approval drift ${testRunId}`,
        JSON.stringify({
          status: 'open',
          severity: 'high',
          kind: 'approval_drift',
          confidence: 0.91,
          summary: `Launch plan ${testRunId} is at risk because approval drift was detected.`,
          rationale: 'The approved plan changed after signoff and needs human review.',
          target_document_type: 'sprint',
          evidence: [{
            sourceType: 'week',
            sourceId: workspaceId,
            title: `Week plan ${testRunId}`,
            excerpt: 'Approved plan changed after approval.',
            url: '/documents/week-plan',
          }],
        }),
        userId,
      ],
    );

    await indexFleetGraphFindingForAssistant({
      findingDocumentId: findingResult.rows[0]!.id,
      workspaceId,
      userId,
    });

    const chunks = await pool.query<{
      source_type: string;
      document_id: string;
      title: string;
      text: string;
      metadata: Record<string, unknown>;
      embedding_dimensions: number | null;
    }>(
      `SELECT source_type, document_id, title, text, metadata, embedding_dimensions
       FROM assistant_search_chunks
       WHERE workspace_id = $1
         AND source_type = 'document'
         AND source_id = $2
       ORDER BY chunk_index`,
      [workspaceId, findingResult.rows[0]!.id],
    );

    expect(chunks.rows).toHaveLength(1);
    expect(chunks.rows[0]).toMatchObject({
      source_type: 'document',
      document_id: findingResult.rows[0]!.id,
      title: `FleetGraph approval drift ${testRunId}`,
      embedding_dimensions: 64,
    });
    expect(chunks.rows[0]?.metadata).toMatchObject({
      document_type: 'fleetgraph_finding',
      indexed_for: 'ask_ship',
    });
    expect(chunks.rows[0]?.text).toContain('FleetGraph risk analysis');
    expect(chunks.rows[0]?.text).toContain(`Launch plan ${testRunId} is at risk`);
    expect(chunks.rows[0]?.text).toContain('Approved plan changed after approval');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
