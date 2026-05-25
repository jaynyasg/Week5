import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('Files API', () => {
  const app = createApp('http://localhost:5173');
  // Use unique identifiers to avoid conflicts between concurrent test runs
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmail = `files-${testRunId}@ship.local`;
  const testWorkspaceName = `Files Test ${testRunId}`;

  let sessionCookie: string;
  let csrfToken: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let testFileId: string;
  let testDocumentId: string;

  beforeAll(async () => {
    // Create test workspace
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1)
       RETURNING id`,
      [testWorkspaceName]
    );
    testWorkspaceId = workspaceResult.rows[0].id;

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Files Test User')
       RETURNING id`,
      [testEmail]
    );
    testUserId = userResult.rows[0].id;

    // Create workspace membership
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [testWorkspaceId, testUserId]
    );

    const documentResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'wiki', 'Files API Test Doc', $2, '{}', $3, 'workspace')
       RETURNING id`,
      [
        testWorkspaceId,
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'File upload test document' }] }],
        }),
        testUserId,
      ],
    );
    testDocumentId = documentResult.rows[0].id;

    // Create session (sessions.id is TEXT not UUID, generated from crypto.randomBytes)
    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, testUserId, testWorkspaceId]
    );
    sessionCookie = `session_id=${sessionId}`;

    // Get CSRF token
    const csrfRes = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie);
    csrfToken = csrfRes.body.token;
    // Add connect.sid cookie for CSRF token storage
    const connectSidCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
    if (connectSidCookie) {
      sessionCookie = `${sessionCookie}; ${connectSidCookie}`;
    }
  });

  afterAll(async () => {
    // Clean up test data in correct order (foreign keys)
    await pool.query('DELETE FROM files WHERE workspace_id = $1', [testWorkspaceId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [testWorkspaceId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId]);
    // Don't close pool - it's shared across test files
  });

  it('POST /api/files/upload returns 403 without valid session (CSRF blocks first)', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('x-csrf-token', 'invalid-token')
      .send({
        filename: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });

    // CSRF protection returns 403 before auth middleware can return 401
    expect(res.status).toBe(403);
  });

  it('POST /api/files/upload creates file record and returns upload URL', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fileId');
    expect(res.body).toHaveProperty('uploadUrl');
    expect(res.body).toHaveProperty('s3Key');
    expect(typeof res.body.fileId).toBe('string');
    expect(typeof res.body.uploadUrl).toBe('string');

    // Save fileId for later tests
    testFileId = res.body.fileId;

    // Verify file record was created in database
    const dbResult = await pool.query(
      'SELECT * FROM files WHERE id = $1',
      [testFileId]
    );
    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].status).toBe('pending');
    expect(dbResult.rows[0].filename).toBe('test.png');
    expect(dbResult.rows[0].mime_type).toBe('image/png');
    expect(dbResult.rows[0].assistant_indexing_status).toBe('unsupported');
  });

  it('POST /api/files/upload reports S3 storage misconfiguration before creating a file row', async () => {
    const previousStorage = process.env.SHIP_UPLOAD_STORAGE;
    const previousBucket = process.env.S3_UPLOADS_BUCKET;
    const previousCdnDomain = process.env.CDN_DOMAIN;
    process.env.SHIP_UPLOAD_STORAGE = 's3';
    delete process.env.S3_UPLOADS_BUCKET;
    delete process.env.CDN_DOMAIN;

    try {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Cookie', sessionCookie)
        .set('x-csrf-token', csrfToken)
        .send({
          filename: 's3-missing-bucket.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('S3_UPLOADS_BUCKET');

      const dbResult = await pool.query(
        'SELECT COUNT(*)::int AS count FROM files WHERE workspace_id = $1 AND filename = $2',
        [testWorkspaceId, 's3-missing-bucket.pdf'],
      );
      expect(dbResult.rows[0].count).toBe(0);
    } finally {
      restoreEnv('SHIP_UPLOAD_STORAGE', previousStorage);
      restoreEnv('S3_UPLOADS_BUCKET', previousBucket);
      restoreEnv('CDN_DOMAIN', previousCdnDomain);
    }
  });

  it('indexes uploaded documentation attached to a document for Ask Ship', async () => {
    const body = Buffer.from('Launch readiness notes\n\nProject Calypso depends on the compliance checklist.');
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'launch-notes.md',
        mimeType: 'text/markdown',
        sizeBytes: body.byteLength,
        documentId: testDocumentId,
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.assistantIndexingStatus).toBe('not_indexed');

    const fileId = uploadRes.body.fileId;
    const localUploadRes = await request(app)
      .post(`/api/files/${fileId}/local-upload`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .set('Content-Type', 'text/markdown')
      .send(body);

    expect(localUploadRes.status).toBe(200);
    expect(localUploadRes.body.assistantIndexingStatus).toBe('indexed');
    expect(localUploadRes.body.documentId).toBe(testDocumentId);

    const statusRes = await request(app)
      .get(`/api/files/${fileId}/assistant-index`)
      .set('Cookie', sessionCookie);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.assistant_indexing_status).toBe('indexed');
    expect(statusRes.body.document_id).toBe(testDocumentId);

    const chunks = await pool.query(
      `SELECT text
       FROM assistant_search_chunks
       WHERE workspace_id = $1 AND source_type = 'file' AND source_id = $2`,
      [testWorkspaceId, fileId],
    );
    expect(chunks.rows.length).toBeGreaterThan(0);
    expect(chunks.rows[0].text).toContain('Project Calypso');
  });

  it('creates a Docs wiki document for standalone Ask Ship documentation uploads', async () => {
    const body = Buffer.from('Workspace source notes should appear under Docs.');
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'workspace-source.md',
        mimeType: 'text/markdown',
        sizeBytes: body.byteLength,
      });

    expect(uploadRes.status).toBe(200);
    const fileId = uploadRes.body.fileId;

    const localUploadRes = await request(app)
      .post(`/api/files/${fileId}/local-upload?createDocument=1`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .set('Content-Type', 'text/markdown')
      .send(body);

    expect(localUploadRes.status).toBe(200);
    expect(localUploadRes.body.assistantIndexingStatus).toBe('indexed');
    expect(typeof localUploadRes.body.documentId).toBe('string');

    const fileResult = await pool.query(
      'SELECT document_id FROM files WHERE id = $1 AND workspace_id = $2',
      [fileId, testWorkspaceId],
    );
    expect(fileResult.rows[0].document_id).toBe(localUploadRes.body.documentId);

    const documentResult = await pool.query(
      `SELECT title, document_type, visibility, properties, content
       FROM documents
       WHERE id = $1 AND workspace_id = $2`,
      [localUploadRes.body.documentId, testWorkspaceId],
    );
    expect(documentResult.rows.length).toBe(1);
    expect(documentResult.rows[0].title).toBe('workspace-source.md');
    expect(documentResult.rows[0].document_type).toBe('wiki');
    expect(documentResult.rows[0].visibility).toBe('workspace');
    expect(documentResult.rows[0].properties.source).toBe('assistant_upload');
    expect(documentResult.rows[0].properties.file_id).toBe(fileId);
    expect(documentResult.rows[0].content.content[0].content[0].text).toContain('Workspace source notes');

    const chunks = await pool.query(
      `SELECT document_id, text
       FROM assistant_search_chunks
       WHERE workspace_id = $1 AND source_type = 'file' AND source_id = $2`,
      [testWorkspaceId, fileId],
    );
    expect(chunks.rows.length).toBeGreaterThan(0);
    expect(chunks.rows[0].document_id).toBe(localUploadRes.body.documentId);
    expect(chunks.rows[0].text).toContain('Workspace source notes');
  });

  it('indexes uploaded PDF documentation attached to a document for Ask Ship', async () => {
    const body = buildPdfWithText('PDF launch notes mention blocked items.');
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'launch-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: body.byteLength,
        documentId: testDocumentId,
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.assistantIndexingStatus).toBe('not_indexed');

    const fileId = uploadRes.body.fileId;
    const localUploadRes = await request(app)
      .post(`/api/files/${fileId}/local-upload`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .set('Content-Type', 'application/pdf')
      .send(body);

    expect(localUploadRes.status).toBe(200);
    expect(localUploadRes.body.assistantIndexingStatus).toBe('indexed');

    const chunks = await pool.query(
      `SELECT text
       FROM assistant_search_chunks
       WHERE workspace_id = $1 AND source_type = 'file' AND source_id = $2`,
      [testWorkspaceId, fileId],
    );
    expect(chunks.rows.length).toBeGreaterThan(0);
    expect(chunks.rows[0].text).toContain('PDF launch notes mention blocked items');
  });

  it('POST /api/files/upload rejects blocked file types', async () => {
    const res = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'malware.exe',
        mimeType: 'application/octet-stream',
        sizeBytes: 1024,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('not allowed');
  });

  it('POST /api/files/:id/confirm updates file status and returns CDN URL', async () => {
    // First create a file
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'confirm-test.png',
        mimeType: 'image/png',
        sizeBytes: 2048,
      });

    const fileId = uploadRes.body.fileId;

    // Confirm the upload
    const confirmRes = await request(app)
      .post(`/api/files/${fileId}/confirm`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body).toHaveProperty('fileId');
    expect(confirmRes.body).toHaveProperty('cdnUrl');
    expect(confirmRes.body).toHaveProperty('status');
    expect(confirmRes.body.status).toBe('uploaded');
    expect(confirmRes.body.cdnUrl).toContain(`/api/files/${fileId}/serve`);

    // Verify database was updated
    const dbResult = await pool.query(
      'SELECT * FROM files WHERE id = $1',
      [fileId]
    );
    expect(dbResult.rows[0].status).toBe('uploaded');
    expect(dbResult.rows[0].cdn_url).toBeTruthy();
  });

  it('POST /api/files/:id/confirm returns 404 for non-existent file', async () => {
    const fakeId = crypto.randomUUID();
    const res = await request(app)
      .post(`/api/files/${fakeId}/confirm`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(res.status).toBe(404);
  });

  it('GET /api/files/:id returns file metadata', async () => {
    // First create and confirm a file
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'metadata-test.png',
        mimeType: 'image/png',
        sizeBytes: 3072,
      });

    const fileId = uploadRes.body.fileId;

    await request(app)
      .post(`/api/files/${fileId}/confirm`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    // Get file metadata
    const res = await request(app)
      .get(`/api/files/${fileId}`)
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('filename');
    expect(res.body).toHaveProperty('mime_type');
    expect(res.body).toHaveProperty('size_bytes');
    expect(res.body).toHaveProperty('cdn_url');
    expect(res.body).toHaveProperty('status');
    expect(res.body.filename).toBe('metadata-test.png');
  });

  it('DELETE /api/files/:id deletes file record', async () => {
    // First create a file
    const uploadRes = await request(app)
      .post('/api/files/upload')
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        filename: 'delete-test.png',
        mimeType: 'image/png',
        sizeBytes: 4096,
      });

    const fileId = uploadRes.body.fileId;

    // Delete the file
    const deleteRes = await request(app)
      .delete(`/api/files/${fileId}`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty('success', true);

    // Verify file was deleted from database
    const dbResult = await pool.query(
      'SELECT * FROM files WHERE id = $1',
      [fileId]
    );
    expect(dbResult.rows.length).toBe(0);
  });
});

function buildPdfWithText(text: string): Buffer {
  const escapedText = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  const stream = `BT /F1 24 Tf 72 720 Td (${escapedText}) Tj ET`;

  return Buffer.from(
    `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
5 0 obj <</Length ${Buffer.byteLength(stream)}>> stream
${stream}
endstream endobj
trailer <</Root 1 0 R>>
%%EOF`,
    'binary',
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
