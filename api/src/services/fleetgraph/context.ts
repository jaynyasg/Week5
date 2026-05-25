import type { AssistantRouteContext } from '@ship/shared';
import { pool } from '../../db/client.js';
import type {
  FleetGraphContext,
  FleetGraphIssueRef,
  FleetGraphRecordRef,
} from './types.js';

interface DocumentRow {
  id: string;
  document_type: string;
  title: string;
  properties: Record<string, unknown> | null;
  created_by: string | null;
  updated_at: Date | string | null;
}

export async function loadFleetGraphContext(input: {
  workspaceId: string;
  userId: string;
  routeContext?: AssistantRouteContext;
  now?: Date;
}): Promise<FleetGraphContext> {
  const routeContext = input.routeContext;
  const currentDocument = routeContext?.documentId
    ? await loadDocument(input.workspaceId, routeContext.documentId)
    : null;

  const project = await resolveProject(input.workspaceId, routeContext, currentDocument);
  const week = await resolveWeek(input.workspaceId, currentDocument, project);
  const program = await resolveProgram(input.workspaceId, currentDocument, project);
  const weekPlan = week ? await loadWeekPlan(input.workspaceId, week.id) : null;
  const issues = await loadRelatedIssues(input.workspaceId, { projectId: project?.id, weekId: week?.id });
  const workspaceAdminUserIds = await loadWorkspaceAdminUserIds(input.workspaceId);

  return {
    workspaceId: input.workspaceId,
    userId: input.userId,
    workspaceAdminUserIds,
    routePath: routeContext?.path ?? null,
    currentDocument,
    program,
    project,
    week,
    weekPlan,
    issues,
    now: (input.now ?? new Date()).toISOString(),
  };
}

export function recordToEvidence(record: FleetGraphRecordRef, excerpt: string) {
  return {
    sourceType: sourceTypeForDocument(record.documentType),
    sourceId: record.id,
    title: record.title,
    excerpt,
    url: record.url,
  };
}

async function loadDocument(workspaceId: string, documentId: string): Promise<FleetGraphRecordRef | null> {
  const result = await pool.query<DocumentRow>(
    `SELECT id, document_type, title, properties, created_by, updated_at
     FROM documents
     WHERE workspace_id = $1
       AND id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [workspaceId, documentId],
  );

  return result.rows[0] ? toRecordRef(result.rows[0]) : null;
}

async function resolveProject(
  workspaceId: string,
  routeContext: AssistantRouteContext | undefined,
  currentDocument: FleetGraphRecordRef | null,
): Promise<FleetGraphRecordRef | null> {
  if (routeContext?.projectId) {
    return loadDocument(workspaceId, routeContext.projectId);
  }
  if (currentDocument?.documentType === 'project') return currentDocument;
  if (!currentDocument) return null;
  return loadAssociatedDocument(workspaceId, currentDocument.id, 'project');
}

async function resolveWeek(
  workspaceId: string,
  currentDocument: FleetGraphRecordRef | null,
  project: FleetGraphRecordRef | null,
): Promise<FleetGraphRecordRef | null> {
  if (currentDocument?.documentType === 'sprint') return currentDocument;
  if (currentDocument) {
    const directWeek = await loadAssociatedDocument(workspaceId, currentDocument.id, 'sprint');
    if (directWeek) return directWeek;
  }
  if (!project) return null;

  const result = await pool.query<DocumentRow>(
    `SELECT d.id, d.document_type, d.title, d.properties, d.created_by, d.updated_at
     FROM documents d
     JOIN document_associations da ON da.document_id = d.id
     WHERE d.workspace_id = $1
       AND da.related_id = $2
       AND da.relationship_type = 'project'
       AND d.document_type = 'sprint'
       AND d.deleted_at IS NULL
     ORDER BY d.updated_at DESC
     LIMIT 1`,
    [workspaceId, project.id],
  );
  return result.rows[0] ? toRecordRef(result.rows[0]) : null;
}

async function resolveProgram(
  workspaceId: string,
  currentDocument: FleetGraphRecordRef | null,
  project: FleetGraphRecordRef | null,
): Promise<FleetGraphRecordRef | null> {
  if (currentDocument?.documentType === 'program') return currentDocument;
  if (currentDocument) {
    const directProgram = await loadAssociatedDocument(workspaceId, currentDocument.id, 'program');
    if (directProgram) return directProgram;
  }
  if (project) return loadAssociatedDocument(workspaceId, project.id, 'program');
  return null;
}

async function loadAssociatedDocument(
  workspaceId: string,
  documentId: string,
  relationshipType: 'program' | 'project' | 'sprint',
): Promise<FleetGraphRecordRef | null> {
  const result = await pool.query<DocumentRow>(
    `SELECT d.id, d.document_type, d.title, d.properties, d.created_by, d.updated_at
     FROM document_associations da
     JOIN documents d ON d.id = da.related_id
     WHERE da.document_id = $1
       AND da.relationship_type = $2
       AND d.workspace_id = $3
       AND d.deleted_at IS NULL
     LIMIT 1`,
    [documentId, relationshipType, workspaceId],
  );
  return result.rows[0] ? toRecordRef(result.rows[0]) : null;
}

async function loadWeekPlan(workspaceId: string, weekId: string): Promise<FleetGraphRecordRef | null> {
  const result = await pool.query<DocumentRow>(
    `SELECT d.id, d.document_type, d.title, d.properties, d.created_by, d.updated_at
     FROM documents d
     LEFT JOIN document_associations da ON da.document_id = d.id
       AND da.relationship_type = 'sprint'
     WHERE d.workspace_id = $1
       AND d.document_type = 'weekly_plan'
       AND d.deleted_at IS NULL
       AND (da.related_id = $2 OR d.properties->>'sprint_id' = $2::text)
     ORDER BY d.updated_at DESC
     LIMIT 1`,
    [workspaceId, weekId],
  );
  return result.rows[0] ? toRecordRef(result.rows[0]) : null;
}

async function loadRelatedIssues(
  workspaceId: string,
  input: { projectId?: string; weekId?: string },
): Promise<FleetGraphIssueRef[]> {
  if (!input.projectId && !input.weekId) return [];

  const result = await pool.query<DocumentRow>(
    `SELECT DISTINCT d.id, d.document_type, d.title, d.properties, d.created_by, d.updated_at
     FROM documents d
     LEFT JOIN document_associations project_assoc ON project_assoc.document_id = d.id
       AND project_assoc.relationship_type = 'project'
     LEFT JOIN document_associations week_assoc ON week_assoc.document_id = d.id
       AND week_assoc.relationship_type = 'sprint'
     WHERE d.workspace_id = $1
       AND d.document_type = 'issue'
       AND d.deleted_at IS NULL
       AND (
         ($2::uuid IS NOT NULL AND project_assoc.related_id = $2::uuid)
         OR ($3::uuid IS NOT NULL AND week_assoc.related_id = $3::uuid)
       )
     ORDER BY d.updated_at DESC
     LIMIT 50`,
    [workspaceId, input.projectId ?? null, input.weekId ?? null],
  );

  return result.rows.map(toIssueRef);
}

async function loadWorkspaceAdminUserIds(workspaceId: string): Promise<string[]> {
  const result = await pool.query<{ user_id: string }>(
    `SELECT user_id
     FROM workspace_memberships
     WHERE workspace_id = $1
       AND role = 'admin'`,
    [workspaceId],
  );
  return result.rows.map((row) => row.user_id);
}

function toRecordRef(row: DocumentRow): FleetGraphRecordRef {
  return {
    id: row.id,
    documentType: row.document_type,
    title: row.title,
    url: `/documents/${row.id}`,
    properties: row.properties ?? {},
    createdBy: row.created_by,
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : null,
  };
}

function toIssueRef(row: DocumentRow): FleetGraphIssueRef {
  const record = toRecordRef(row);
  return {
    ...record,
    documentType: 'issue',
    state: readString(record.properties.state),
    assigneeId: readString(record.properties.assignee_id),
    priority: readString(record.properties.priority),
  };
}

function sourceTypeForDocument(documentType: string): 'document' | 'issue' | 'project' | 'program' | 'week' {
  if (documentType === 'issue') return 'issue';
  if (documentType === 'project') return 'project';
  if (documentType === 'program') return 'program';
  if (documentType === 'sprint') return 'week';
  return 'document';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
