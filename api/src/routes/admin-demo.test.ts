import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('Admin timeline demo seed', () => {
  const app = createApp('http://localhost:5173');
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmail = `admin-demo-${testRunId}@ship.local`;
  const testWorkspaceName = `Admin Demo Test ${testRunId}`;

  let sessionCookie: string;
  let csrfToken: string;
  let testWorkspaceId: string;
  let testUserId: string;

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name, sprint_start_date)
       VALUES ($1, CURRENT_DATE)
       RETURNING id`,
      [testWorkspaceName],
    );
    testWorkspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name, is_super_admin)
       VALUES ($1, 'test-hash', 'Admin Demo User', TRUE)
       RETURNING id`,
      [testEmail],
    );
    testUserId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
      [testWorkspaceId, testUserId],
    );

    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, testUserId, testWorkspaceId],
    );
    sessionCookie = `session_id=${sessionId}`;

    const csrfRes = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie);
    csrfToken = csrfRes.body.token;
    const connectSidCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (connectSidCookie) {
      sessionCookie = `${sessionCookie}; ${connectSidCookie}`;
    }
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [testWorkspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId]);
  });

  it('repairs a partial existing demo project into a populated timeline demo', async () => {
    const partialProject = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'project', 'Public Submission Launch Demo', '{"status":"active"}', $2, 'workspace')
       RETURNING id`,
      [testWorkspaceId, testUserId],
    );
    const projectId = partialProject.rows[0].id;

    const seedResponse = await request(app)
      .post('/api/admin/demo/timeline')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(seedResponse.status).toBe(201);
    expect(seedResponse.body.data.projectId).toBe(projectId);
    expect(seedResponse.body.data.timelineUrl).toBe(`/documents/${projectId}/timeline`);

    const timelineResponse = await request(app)
      .get(`/api/projects/${projectId}/timeline`)
      .set('Cookie', sessionCookie);

    expect(timelineResponse.status).toBe(200);
    expect(timelineResponse.body.summary.total_rows).toBe(11);
    expect(timelineResponse.body.summary.dependency_count).toBe(4);
    expect(timelineResponse.body.summary.blocked_count).toBe(3);

    const gridResponse = await request(app)
      .get(`/api/weekly-plans/project-allocation-grid/${projectId}`)
      .set('Cookie', sessionCookie);

    expect(gridResponse.status).toBe(200);
    expect(gridResponse.body.people).toHaveLength(1);
    expect(gridResponse.body.weeks).toHaveLength(3);
    expect(gridResponse.body.people[0].weeks['1'].isAllocated).toBe(true);
    expect(gridResponse.body.people[0].weeks['2'].planId).toBeTruthy();

    const retroResponse = await request(app)
      .get(`/api/projects/${projectId}/retro`)
      .set('Cookie', sessionCookie);

    expect(retroResponse.status).toBe(200);
    expect(retroResponse.body.issues_summary.total).toBe(7);
    expect(retroResponse.body.weeks).toHaveLength(3);
  });
});
