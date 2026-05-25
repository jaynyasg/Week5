import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { createApp } from '../app.js'
import { pool } from '../db/client.js'

describe('Document dependency associations', () => {
  const app = createApp()
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const testEmail = `dependencies-${testRunId}@ship.local`
  const testWorkspaceName = `Dependencies Test ${testRunId}`

  let sessionCookie: string
  let csrfToken: string
  let testWorkspaceId: string
  let testUserId: string
  let issueAId: string
  let issueBId: string
  let issueCId: string
  let projectId: string
  let sprintId: string
  let programId: string
  let otherWorkspaceIssueId: string

  async function createDocument(documentType: string, title: string, workspaceId = testWorkspaceId): Promise<string> {
    const result = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [workspaceId, documentType, title, testUserId]
    )
    return result.rows[0].id
  }

  async function deleteDependency(documentId: string, relatedId: string): Promise<void> {
    await pool.query(
      `DELETE FROM document_associations
       WHERE document_id = $1 AND related_id = $2 AND relationship_type = 'depends_on'`,
      [documentId, relatedId]
    )
  }

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1)
       RETURNING id`,
      [testWorkspaceName]
    )
    testWorkspaceId = workspaceResult.rows[0].id

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Dependency Test User')
       RETURNING id`,
      [testEmail]
    )
    testUserId = userResult.rows[0].id

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [testWorkspaceId, testUserId]
    )

    issueAId = await createDocument('issue', 'Issue A')
    issueBId = await createDocument('issue', 'Issue B')
    issueCId = await createDocument('issue', 'Issue C')
    projectId = await createDocument('project', 'Dependency Project')
    sprintId = await createDocument('sprint', 'Dependency Week')
    programId = await createDocument('program', 'Dependency Program')

    const otherWorkspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1)
       RETURNING id`,
      [`Other Workspace ${testRunId}`]
    )
    const otherWorkspaceId = otherWorkspaceResult.rows[0].id
    otherWorkspaceIssueId = await createDocument('issue', 'Other Workspace Issue', otherWorkspaceId)

    const sessionId = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, testUserId, testWorkspaceId]
    )
    sessionCookie = `session_id=${sessionId}`

    const csrfRes = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie)
    csrfToken = csrfRes.body.token
    const connectSidCookie = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] || ''
    if (connectSidCookie) {
      sessionCookie = `${sessionCookie}; ${connectSidCookie}`
    }
  })

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId])
    await pool.query('DELETE FROM documents WHERE created_by = $1', [testUserId])
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [testUserId])
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId])
    await pool.query('DELETE FROM workspaces WHERE name IN ($1, $2)', [
      testWorkspaceName,
      `Other Workspace ${testRunId}`,
    ])
  })

  it('creates a depends_on edge between supported documents', async () => {
    await deleteDependency(issueAId, issueBId)

    const response = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueBId,
        relationship_type: 'depends_on',
        metadata: { kind: 'finish_to_start', note: 'B must land first' },
      })

    expect(response.status).toBe(201)
    expect(response.body.document_id).toBe(issueAId)
    expect(response.body.related_id).toBe(issueBId)
    expect(response.body.relationship_type).toBe('depends_on')
    expect(response.body.metadata.note).toBe('B must land first')
  })

  it('returns dependency and reverse blocker associations', async () => {
    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'depends_on')
       ON CONFLICT DO NOTHING`,
      [issueAId, issueBId]
    )

    const dependencies = await request(app)
      .get(`/api/documents/${issueAId}/associations?type=depends_on`)
      .set('Cookie', sessionCookie)

    expect(dependencies.status).toBe(200)
    expect(dependencies.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: issueAId,
          related_id: issueBId,
          relationship_type: 'depends_on',
          related_title: 'Issue B',
        }),
      ])
    )

    const blockers = await request(app)
      .get(`/api/documents/${issueBId}/reverse-associations?type=depends_on`)
      .set('Cookie', sessionCookie)

    expect(blockers.status).toBe(200)
    expect(blockers.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          document_id: issueAId,
          related_id: issueBId,
          relationship_type: 'depends_on',
          document_title: 'Issue A',
        }),
      ])
    )
  })

  it('updates metadata instead of creating duplicate edges', async () => {
    await deleteDependency(projectId, sprintId)

    const first = await request(app)
      .post(`/api/documents/${projectId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: sprintId,
        relationship_type: 'depends_on',
        metadata: { note: 'first note' },
      })

    expect(first.status).toBe(201)

    const second = await request(app)
      .post(`/api/documents/${projectId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: sprintId,
        relationship_type: 'depends_on',
        metadata: { note: 'updated note' },
      })

    expect(second.status).toBe(201)
    expect(second.body.metadata.note).toBe('updated note')

    const count = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM document_associations
       WHERE document_id = $1 AND related_id = $2 AND relationship_type = 'depends_on'`,
      [projectId, sprintId]
    )
    expect(count.rows[0].count).toBe(1)
  })

  it('deletes a dependency edge', async () => {
    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'depends_on')
       ON CONFLICT DO NOTHING`,
      [issueAId, issueBId]
    )

    const response = await request(app)
      .delete(`/api/documents/${issueAId}/associations/${issueBId}?type=depends_on`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)

    expect(response.status).toBe(200)
    expect(response.body.deleted).toBe(1)

    const count = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM document_associations
       WHERE document_id = $1 AND related_id = $2 AND relationship_type = 'depends_on'`,
      [issueAId, issueBId]
    )
    expect(count.rows[0].count).toBe(0)
  })

  it('rejects self-dependency', async () => {
    const response = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueAId,
        relationship_type: 'depends_on',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Cannot create self-referencing association')
  })

  it('rejects invalid relationship type', async () => {
    const response = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueBId,
        relationship_type: 'blocked_by',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Invalid input')
  })

  it('rejects cross-workspace related documents', async () => {
    const response = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: otherWorkspaceIssueId,
        relationship_type: 'depends_on',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Related document not found')
  })

  it('rejects unsupported dependency document types', async () => {
    const response = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: programId,
        relationship_type: 'depends_on',
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('unsupported_dependency_type')
  })

  it('rejects a two-node dependency cycle', async () => {
    await deleteDependency(issueAId, issueBId)
    await deleteDependency(issueBId, issueAId)

    const first = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueBId,
        relationship_type: 'depends_on',
      })

    expect(first.status).toBe(201)

    const cycle = await request(app)
      .post(`/api/documents/${issueBId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueAId,
        relationship_type: 'depends_on',
      })

    expect(cycle.status).toBe(400)
    expect(cycle.body.error).toBe('circular_dependency')
  })

  it('rejects a transitive dependency cycle', async () => {
    await deleteDependency(issueAId, issueBId)
    await deleteDependency(issueBId, issueCId)
    await deleteDependency(issueCId, issueAId)

    const first = await request(app)
      .post(`/api/documents/${issueAId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueBId,
        relationship_type: 'depends_on',
      })

    expect(first.status).toBe(201)

    const second = await request(app)
      .post(`/api/documents/${issueBId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueCId,
        relationship_type: 'depends_on',
      })

    expect(second.status).toBe(201)

    const cycle = await request(app)
      .post(`/api/documents/${issueCId}/associations`)
      .set('Cookie', sessionCookie)
      .set('x-csrf-token', csrfToken)
      .send({
        related_id: issueAId,
        relationship_type: 'depends_on',
      })

    expect(cycle.status).toBe(400)
    expect(cycle.body.error).toBe('circular_dependency')
  })
})
