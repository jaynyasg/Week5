import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('FleetGraph API', () => {
  const app = createApp('http://localhost:5173');
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let sessionCookie: string;
  let otherSessionCookie: string;
  let adminSessionCookie: string;
  let csrfToken: string;
  let otherCsrfToken: string;
  let workspaceId: string;
  let userId: string;
  let otherUserId: string;
  let adminUserId: string;
  let documentId: string;
  let findingDocumentId: string;
  let deliveryId: string;
  let proposalId: string;
  let runId: string;

  const originalEnv = {
    SHIP_FLEETGRAPH_ENABLED: process.env.SHIP_FLEETGRAPH_ENABLED,
    SHIP_FLEETGRAPH_PROVIDER: process.env.SHIP_FLEETGRAPH_PROVIDER,
    SHIP_FLEETGRAPH_MODEL: process.env.SHIP_FLEETGRAPH_MODEL,
    SHIP_FLEETGRAPH_TRACING_ENABLED: process.env.SHIP_FLEETGRAPH_TRACING_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1)
       RETURNING id`,
      [`FleetGraph Test ${testRunId}`],
    );
    workspaceId = workspaceResult.rows[0].id;

    userId = await createUser(`fleetgraph-${testRunId}@ship.local`, 'FleetGraph Member');
    otherUserId = await createUser(`fleetgraph-other-${testRunId}@ship.local`, 'FleetGraph Other');
    adminUserId = await createUser(`fleetgraph-admin-${testRunId}@ship.local`, 'FleetGraph Admin');

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member'), ($1, $3, 'member'), ($1, $4, 'admin')`,
      [workspaceId, userId, otherUserId, adminUserId],
    );

    sessionCookie = await createSessionCookie(userId, workspaceId);
    otherSessionCookie = await createSessionCookie(otherUserId, workspaceId);
    adminSessionCookie = await createSessionCookie(adminUserId, workspaceId);

    const csrfRes = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie);
    csrfToken = csrfRes.body.token;
    const connectSidCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (connectSidCookie) {
      sessionCookie = `${sessionCookie}; ${connectSidCookie}`;
    }

    const otherCsrfRes = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', otherSessionCookie);
    otherCsrfToken = otherCsrfRes.body.token;
    const otherConnectSidCookie = otherCsrfRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (otherConnectSidCookie) {
      otherSessionCookie = `${otherSessionCookie}; ${otherConnectSidCookie}`;
    }

    const documentResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by)
       VALUES ($1, 'wiki', 'FleetGraph Brief', $2, '{}', $3)
       RETURNING id`,
      [
        workspaceId,
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'FleetGraph should catch delivery risk.' }] }],
        }),
        userId,
      ],
    );
    documentId = documentResult.rows[0].id;

    const runResult = await pool.query(
      `INSERT INTO fleetgraph_runs (
         workspace_id, user_id, mode, trigger_type, trigger_id, thread_id, status, provider, model, metadata, completed_at
       )
       VALUES ($1, $2, 'chat', 'chat', $3, $4, 'completed', 'mock', 'mock-fleetgraph', $5, now())
       RETURNING id`,
      [workspaceId, userId, documentId, `fleetgraph:test:${testRunId}`, JSON.stringify({ source: 'test' })],
    );
    runId = runResult.rows[0].id;

    const findingResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'fleetgraph_finding', 'FleetGraph Test Finding', $2, $3, 'workspace')
       RETURNING id`,
      [workspaceId, JSON.stringify(findingProperties(runId, documentId, userId)), userId],
    );
    findingDocumentId = findingResult.rows[0].id;

    const deliveryResult = await pool.query(
      `INSERT INTO fleetgraph_deliveries (workspace_id, finding_document_id, user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [workspaceId, findingDocumentId, userId],
    );
    deliveryId = deliveryResult.rows[0].id;

    const proposalResult = await pool.query(
      `INSERT INTO fleetgraph_action_proposals (
         workspace_id, finding_document_id, run_id, proposed_action, target_document_id, payload
       )
       VALUES ($1, $2, $3, 'request_update', $4, $5)
       RETURNING id`,
      [
        workspaceId,
        findingDocumentId,
        runId,
        documentId,
        JSON.stringify({ reason: 'test_proposal' }),
      ],
    );
    proposalId = proposalResult.rows[0].id;
  });

  beforeEach(() => {
    process.env.SHIP_FLEETGRAPH_ENABLED = 'true';
    process.env.SHIP_FLEETGRAPH_PROVIDER = 'openai';
    delete process.env.SHIP_FLEETGRAPH_MODEL;
    delete process.env.SHIP_FLEETGRAPH_TRACING_ENABLED;
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    restoreEnv('SHIP_FLEETGRAPH_ENABLED', originalEnv.SHIP_FLEETGRAPH_ENABLED);
    restoreEnv('SHIP_FLEETGRAPH_PROVIDER', originalEnv.SHIP_FLEETGRAPH_PROVIDER);
    restoreEnv('SHIP_FLEETGRAPH_MODEL', originalEnv.SHIP_FLEETGRAPH_MODEL);
    restoreEnv('SHIP_FLEETGRAPH_TRACING_ENABLED', originalEnv.SHIP_FLEETGRAPH_TRACING_ENABLED);
    restoreEnv('OPENAI_API_KEY', originalEnv.OPENAI_API_KEY);
  });

  it('GET /api/fleetgraph/status returns 401 without authentication', async () => {
    const res = await request(app).get('/api/fleetgraph/status');

    expect(res.status).toBe(401);
  });

  it('GET /api/fleetgraph/status returns unavailable when provider key is missing', async () => {
    const res = await request(app)
      .get('/api/fleetgraph/status')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.available).toBe(false);
    expect(res.body.provider).toBe('openai');
    expect(res.body.missingConfiguration).toContain('OPENAI_API_KEY');
  });

  it('POST /api/fleetgraph/chat enforces CSRF for session-authenticated requests', async () => {
    const res = await request(app)
      .post('/api/fleetgraph/chat')
      .set('Cookie', sessionCookie)
      .send({ message: 'What should we watch?' });

    expect(res.status).toBe(403);
  });

  it('POST /api/fleetgraph/chat returns controlled unavailable response when provider is not configured', async () => {
    const res = await request(app)
      .post('/api/fleetgraph/chat')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ message: 'What should we watch?' });

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.error.code).toBe('FLEETGRAPH_UNAVAILABLE');
  });

  it('POST /api/fleetgraph/chat returns a cited mock response with run metadata', async () => {
    process.env.SHIP_FLEETGRAPH_PROVIDER = 'mock';

    const res = await request(app)
      .post('/api/fleetgraph/chat')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        message: 'What does FleetGraph see?',
        context: { documentId, path: `/documents/${documentId}` },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('answered');
    expect(res.body.runId).toEqual(expect.any(String));
    expect(res.body.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'FleetGraph Brief',
        sourceType: 'document',
      }),
    ]));
    expect(res.body.sourceCounts.total).toBeGreaterThan(0);
  });

  it('GET /api/fleetgraph/findings returns own delivered findings', async () => {
    const res = await request(app)
      .get('/api/fleetgraph/findings')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: findingDocumentId,
        severity: 'high',
        kind: 'planning_gap',
      }),
    ]));
    expect(res.body.deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: deliveryId,
        findingDocumentId,
        status: 'unread',
      }),
    ]));
  });

  it('GET /api/fleetgraph/findings/:id denies members without delivery state', async () => {
    const res = await request(app)
      .get(`/api/fleetgraph/findings/${findingDocumentId}`)
      .set('Cookie', otherSessionCookie);

    expect(res.status).toBe(404);
  });

  it('GET /api/fleetgraph/findings/:id allows workspace admins to inspect findings', async () => {
    const res = await request(app)
      .get(`/api/fleetgraph/findings/${findingDocumentId}`)
      .set('Cookie', adminSessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(findingDocumentId);
    expect(res.body.rationale).toContain('test rationale');
    expect(res.body.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: proposalId,
        status: 'pending',
      }),
    ]));
  });

  it('PATCH /api/fleetgraph/deliveries/:id updates only owned delivery state', async () => {
    const denied = await request(app)
      .patch(`/api/fleetgraph/deliveries/${deliveryId}`)
      .set('Cookie', otherSessionCookie)
      .set('x-csrf-token', otherCsrfToken)
      .send({ status: 'read' });

    expect(denied.status).toBe(404);

    const res = await request(app)
      .patch(`/api/fleetgraph/deliveries/${deliveryId}`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ status: 'read' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/fleetgraph/runs/:id allows owners and workspace admins only', async () => {
    const denied = await request(app)
      .get(`/api/fleetgraph/runs/${runId}`)
      .set('Cookie', otherSessionCookie);

    expect(denied.status).toBe(404);

    const admin = await request(app)
      .get(`/api/fleetgraph/runs/${runId}`)
      .set('Cookie', adminSessionCookie);

    expect(admin.status).toBe(200);
    expect(admin.body.id).toBe(runId);
    expect(admin.body.threadId).toContain('fleetgraph:test');
  });

  it('POST /api/fleetgraph/actions/:id/decision records authorized human decisions', async () => {
    const denied = await request(app)
      .post(`/api/fleetgraph/actions/${proposalId}/decision`)
      .set('Cookie', otherSessionCookie)
      .set('x-csrf-token', otherCsrfToken)
      .send({ status: 'approved', note: 'no delivery access' });

    expect(denied.status).toBe(404);

    const res = await request(app)
      .post(`/api/fleetgraph/actions/${proposalId}/decision`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({ status: 'approved', note: 'looks right' });

    expect(res.status).toBe(200);
    expect(res.body.proposal).toMatchObject({
      id: proposalId,
      status: 'approved',
      decidedByUserId: userId,
      decisionNote: 'looks right',
    });
  });

  it('OpenAPI JSON includes FleetGraph paths', async () => {
    const res = await request(app).get('/api/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.paths['/fleetgraph/status']).toBeDefined();
    expect(res.body.paths['/fleetgraph/chat']).toBeDefined();
    expect(res.body.paths['/fleetgraph/findings']).toBeDefined();
    expect(res.body.paths['/fleetgraph/findings/{id}']).toBeDefined();
    expect(res.body.paths['/fleetgraph/deliveries/{id}']).toBeDefined();
    expect(res.body.paths['/fleetgraph/runs/{id}']).toBeDefined();
    expect(res.body.paths['/fleetgraph/actions/{id}/decision']).toBeDefined();
  });
});

async function createUser(email: string, name: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, 'test-hash', $2)
     RETURNING id`,
    [email, name],
  );
  return result.rows[0].id;
}

async function createSessionCookie(userId: string, workspaceId: string): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
     VALUES ($1, $2, $3, now() + interval '1 hour')`,
    [sessionId, userId, workspaceId],
  );
  return `session_id=${sessionId}`;
}

function findingProperties(runId: string, documentId: string, ownerUserId: string) {
  const now = new Date().toISOString();
  return {
    status: 'open',
    severity: 'high',
    kind: 'planning_gap',
    confidence: 0.91,
    summary: 'A test FleetGraph finding is ready.',
    rationale: 'test rationale for FleetGraph route coverage',
    target_document_id: documentId,
    target_document_type: 'wiki',
    owner_user_id: ownerUserId,
    run_id: runId,
    evidence: [{
      sourceType: 'document',
      sourceId: documentId,
      title: 'FleetGraph Brief',
      excerpt: 'Evidence from a seeded document.',
      url: `/documents/${documentId}`,
    }],
    first_detected_at: now,
    last_observed_at: now,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
