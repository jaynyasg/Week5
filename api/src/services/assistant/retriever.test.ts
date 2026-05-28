import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureAssistantUploadSchema } from '../../db/assistant-upload-schema.js';
import { pool } from '../../db/client.js';
import { generateAssistantEmbedding } from './embeddings.js';
import { retrieveAssistantSources } from './retriever.js';

describe('retrieveAssistantSources', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const workspaceName = `Assistant Retriever ${testRunId}`;
  const uniqueTerm = `retriever-${testRunId}`;
  const userOneEmail = `assistant-retriever-1-${testRunId}@ship.local`;
  const userTwoEmail = `assistant-retriever-2-${testRunId}@ship.local`;

  let workspaceId: string;
  let userOneId: string;
  let userTwoId: string;
  let projectId: string;
  const originalEmbeddingEnv = {
    SHIP_ASSISTANT_EMBEDDINGS_ENABLED: process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED,
    SHIP_ASSISTANT_EMBEDDING_DIMENSIONS: process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS,
  };

  beforeAll(async () => {
    await ensureAssistantUploadSchema();

    const workspaceResult = await pool.query(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING id',
      [workspaceName],
    );
    workspaceId = workspaceResult.rows[0].id;

    const userOneResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Assistant Retriever One')
       RETURNING id`,
      [userOneEmail],
    );
    userOneId = userOneResult.rows[0].id;

    const userTwoResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Assistant Retriever Two')
       RETURNING id`,
      [userTwoEmail],
    );
    userTwoId = userTwoResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
      [workspaceId, userOneId, userTwoId],
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, created_by, visibility)
       VALUES
         ($1, 'wiki', $2, $3, $4, 'workspace'),
         ($1, 'wiki', $5, $6, $7, 'private')`,
      [
        workspaceId,
        `Workspace visible ${uniqueTerm}`,
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Visible context ${uniqueTerm}` }] }] }),
        userOneId,
        `Private hidden ${uniqueTerm}`,
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Hidden private context ${uniqueTerm}` }] }] }),
        userTwoId,
      ],
    );

    const projectResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'project', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `Assistant Launch ${uniqueTerm}`,
        JSON.stringify({ status: 'active', target_date: '2026-06-15' }),
        userOneId,
      ],
    );
    projectId = projectResult.rows[0].id;

    const sprintResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'sprint', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `Week 22 ${uniqueTerm}`,
        JSON.stringify({ sprint_number: 22, start_date: '2026-05-25', end_date: '2026-05-31' }),
        userOneId,
      ],
    );

    const blockerResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'issue', $2, $3, $4, $5, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `Complete security review ${uniqueTerm}`,
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Security review must finish before launch.' }] }] }),
        JSON.stringify({ state: 'todo', priority: 'high' }),
        userOneId,
      ],
    );

    const blockedResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'issue', $2, $3, $4, $5, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `Launch feature rollout ${uniqueTerm}`,
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rollout is waiting on security review approval.' }] }] }),
        JSON.stringify({ state: 'todo', priority: 'high' }),
        userOneId,
      ],
    );

    const weeklyPlanResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'weekly_plan', 'Week 22 Plan', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `This week focuses on assistant rollout and citation verification ${uniqueTerm}.` }] }],
        }),
        JSON.stringify({ week_number: 22, project_id: projectId }),
        userOneId,
      ],
    );

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES
         ($1, $2, 'project'),
         ($3, $2, 'project'),
         ($4, $2, 'project'),
         ($3, $5, 'sprint'),
         ($4, $5, 'sprint'),
         ($4, $3, 'depends_on'),
         ($6, $2, 'project')`,
      [
        sprintResult.rows[0].id,
        projectId,
        blockerResult.rows[0].id,
        blockedResult.rows[0].id,
        sprintResult.rows[0].id,
        weeklyPlanResult.rows[0].id,
      ],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [userOneId, userTwoId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    restoreEnv('SHIP_ASSISTANT_EMBEDDINGS_ENABLED', originalEmbeddingEnv.SHIP_ASSISTANT_EMBEDDINGS_ENABLED);
    restoreEnv('SHIP_ASSISTANT_EMBEDDING_DIMENSIONS', originalEmbeddingEnv.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS);
  });

  it('returns workspace-visible sources but excludes another user private document', async () => {
    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: uniqueTerm,
      maxSources: 8,
    });

    expect(sources.map((source) => source.title)).toContain(`Workspace visible ${uniqueTerm}`);
    expect(sources.map((source) => source.title)).not.toContain(`Private hidden ${uniqueTerm}`);
  });

  it('adds structured project context with issue counts and blocking dependencies', async () => {
    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: 'What is blocked for this project?',
      routeContext: {
        documentId: projectId,
        documentType: 'project',
      },
      maxSources: 8,
    });

    const projectSource = sources.find((source) => source.title === `Assistant Launch ${uniqueTerm} work summary`);
    expect(projectSource).toBeDefined();
    expect(projectSource?.sourceType).toBe('project');
    expect(projectSource?.excerpt).toContain(`Launch feature rollout ${uniqueTerm}`);
    expect(projectSource?.excerpt).toContain(`Complete security review ${uniqueTerm}`);
    expect(projectSource?.excerpt).toContain('Issue states: todo: 2');
    expect(projectSource?.excerpt).toContain('Blocking dependencies:');
  });

  it('uses the active project document when the frontend route context has no loaded document type yet', async () => {
    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: 'Are any items blocked?',
      routeContext: {
        documentId: projectId,
        path: `/documents/${projectId}/timeline`,
      },
      maxSources: 8,
    });

    const projectSource = sources.find((source) => source.title === `Assistant Launch ${uniqueTerm} work summary`);
    expect(projectSource).toBeDefined();
    expect(projectSource?.excerpt).toContain('Timeline summary: 1 blocked');
    expect(projectSource?.excerpt).toContain(`Launch feature rollout ${uniqueTerm} is blocked by Complete security review ${uniqueTerm}`);
  });

  it('adds associated weekly plan and retro content as week sources', async () => {
    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: 'What does the weekly plan say about assistant rollout?',
      routeContext: {
        documentId: projectId,
        documentType: 'project',
      },
      maxSources: 10,
    });

    const weekSource = sources.find((source) => source.sourceType === 'week' && source.title.includes('Week 22 plan'));
    expect(weekSource).toBeDefined();
    expect(weekSource?.excerpt).toContain(`assistant rollout and citation verification ${uniqueTerm}`);
  });

  it('retrieves semantically similar uploaded chunks when lexical terms do not match', async () => {
    process.env.SHIP_ASSISTANT_EMBEDDINGS_ENABLED = 'mock';
    process.env.SHIP_ASSISTANT_EMBEDDING_DIMENSIONS = '64';
    const semanticQuery = `semantic launch dependency ${uniqueTerm}`;
    const embedding = await generateAssistantEmbedding(semanticQuery);
    expect(embedding).toBeDefined();

    const fileResult = await pool.query<{ id: string }>(
      `INSERT INTO files
        (workspace_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, assistant_indexing_status, assistant_indexed_at)
       VALUES ($1, $2, $3, 'text/plain', 42, $4, 'uploaded', 'indexed', now())
       RETURNING id`,
      [workspaceId, userOneId, `Opaque Evidence ${uniqueTerm}.txt`, `assistant-tests/${uniqueTerm}.txt`],
    );
    const fileId = fileResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO assistant_search_chunks
        (workspace_id, source_type, source_id, file_id, chunk_index, title, text, metadata,
         embedding, embedding_model, embedding_dimensions, embedding_created_at)
       VALUES ($1, 'file', $2, $2, 0, $3, $4, '{}', $5, $6, $7, now())`,
      [
        workspaceId,
        fileId,
        `Opaque Evidence ${uniqueTerm}.txt`,
        'Alpha beta gamma without the query vocabulary.',
        embedding?.embedding,
        embedding?.model,
        embedding?.dimensions,
      ],
    );

    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: semanticQuery,
      maxSources: 8,
    });

    const semanticSource = sources.find((source) => source.title === `Opaque Evidence ${uniqueTerm}.txt`);
    expect(semanticSource).toBeDefined();
    expect(semanticSource?.retrievalStrategy).toBe('semantic');
    expect(semanticSource?.retrievalSignals?.semanticScore).toBeGreaterThan(0.9);
  });

  it('retrieves indexed FleetGraph findings as Ask Ship document chunks for risk questions', async () => {
    const hiddenRiskTerm = `latent-vector-risk-${uniqueTerm}`;
    const findingResult = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'fleetgraph_finding', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `FleetGraph launch risk ${uniqueTerm}`,
        JSON.stringify({
          status: 'open',
          severity: 'high',
          kind: 'planning_gap',
          summary: 'FleetGraph found a launch risk that should be reused by Ask Ship.',
          target_document_id: projectId,
          target_document_type: 'project',
        }),
        userOneId,
      ],
    );
    const findingId = findingResult.rows[0]!.id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'project')`,
      [findingId, projectId],
    );

    await pool.query(
      `INSERT INTO assistant_search_chunks
        (workspace_id, source_type, source_id, document_id, chunk_index, title, text, metadata)
       VALUES ($1, 'document', $2, $2, 0, $3, $4, $5)`,
      [
        workspaceId,
        findingId,
        `FleetGraph launch risk ${uniqueTerm}`,
        `FleetGraph previous analysis: ${hiddenRiskTerm} is at risk because approval drift changed the week plan after signoff.`,
        JSON.stringify({ document_type: 'fleetgraph_finding', indexed_for: 'ask_ship' }),
      ],
    );

    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: `What is at risk with ${hiddenRiskTerm}?`,
      routeContext: {
        documentId: projectId,
        documentType: 'project',
      },
      maxSources: 12,
    });

    const fleetGraphSource = sources.find((source) => source.sourceId === findingId);
    expect(fleetGraphSource).toBeDefined();
    expect(fleetGraphSource?.sourceType).toBe('document');
    expect(fleetGraphSource?.excerpt).toContain(hiddenRiskTerm);
    expect(fleetGraphSource?.retrievalSignals?.contextBoost).toBeGreaterThanOrEqual(70);
  });

  it('keeps full uploaded file chunks so late bullet items remain available to the model', async () => {
    const documentResult = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'wiki', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        `Security Probe Brief ${uniqueTerm}.pdf`,
        JSON.stringify({ source: 'assistant_upload' }),
        userOneId,
      ],
    );
    const documentId = documentResult.rows[0]!.id;

    const fileResult = await pool.query<{ id: string }>(
      `INSERT INTO files
        (workspace_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, document_id, assistant_indexing_status, assistant_indexed_at)
       VALUES ($1, $2, $3, 'application/pdf', 1400, $4, 'uploaded', $5, 'indexed', now())
       RETURNING id`,
      [
        workspaceId,
        userOneId,
        `Security Probe Brief ${uniqueTerm}.pdf`,
        `assistant-tests/${uniqueTerm}.pdf`,
        documentId,
      ],
    );
    const fileId = fileResult.rows[0]!.id;
    const lateBullet = `Dependency vulnerabilities ${uniqueTerm}`;
    const longChunk = [
      'The security probe must actively test at least four attack surfaces:',
      `Authentication and session handling ${uniqueTerm}.`,
      `WebSocket message validation ${uniqueTerm}.`,
      'filler '.repeat(150),
      `Input sanitization ${uniqueTerm}.`,
      lateBullet,
    ].join('\n');

    await pool.query(
      `INSERT INTO assistant_search_chunks
        (workspace_id, source_type, source_id, document_id, file_id, chunk_index, title, text, metadata)
       VALUES ($1, 'file', $2, $3, $2, 0, $4, $5, '{}')`,
      [
        workspaceId,
        fileId,
        documentId,
        `Security Probe Brief ${uniqueTerm}.pdf`,
        longChunk,
      ],
    );

    const sources = await retrieveAssistantSources({
      userId: userOneId,
      workspaceId,
      workspaceRole: 'member',
      message: 'What four attack surfaces must the security probe test?',
      routeContext: { documentId },
      maxSources: 8,
    });

    const fileSource = sources.find((source) => source.sourceType === 'file' && source.sourceId === fileId);
    expect(fileSource).toBeDefined();
    expect(fileSource?.excerpt).toContain(lateBullet);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
