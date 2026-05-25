import { pool } from '../db/client.js';
import { VISIBILITY_FILTER_SQL } from '../middleware/visibility.js';

export type TimelineScopeType = 'project' | 'program';
export type TimelineDocumentType = 'program' | 'project' | 'sprint' | 'issue';

const DAY_MS = 24 * 60 * 60 * 1000;
interface TimelineDocumentRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  properties?: Record<string, unknown> | null;
  archived_at?: Date | string | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  started_at?: Date | string | null;
  completed_at?: Date | string | null;
  cancelled_at?: Date | string | null;
  sprint_start_date?: Date | string | null;
}

interface AssociationRow {
  document_id: string;
  related_id: string;
  relationship_type: 'program' | 'project' | 'sprint';
}

interface DependencyRow {
  source_id: string;
  target_id: string;
  metadata?: Record<string, unknown> | null;
  created_at?: Date | string | null;
  source_title: string;
  target_title: string;
  source_document_type: TimelineDocumentType;
  target_document_type: TimelineDocumentType;
  source_properties?: Record<string, unknown> | null;
  target_properties?: Record<string, unknown> | null;
  source_archived_at?: Date | string | null;
  target_archived_at?: Date | string | null;
  source_started_at?: Date | string | null;
  target_started_at?: Date | string | null;
  source_completed_at?: Date | string | null;
  target_completed_at?: Date | string | null;
  source_cancelled_at?: Date | string | null;
  target_cancelled_at?: Date | string | null;
}

export interface TimelineDependencyEdge {
  source_id: string;
  target_id: string;
  relationship_type: 'depends_on';
  source_in_scope: boolean;
  target_in_scope: boolean;
  source_title?: string;
  target_title?: string;
  source_document_type?: TimelineDocumentType;
  target_document_type?: TimelineDocumentType;
  target_status?: string | null;
  is_blocking: boolean;
}

export interface TimelineRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  status: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  program_ids: string[];
  project_ids: string[];
  sprint_ids: string[];
  dependency_ids: string[];
  blocker_ids: string[];
  blocks_ids: string[];
  blocked: boolean;
  overdue: boolean;
  at_risk: boolean;
  critical_path: boolean;
  critical_path_order: number | null;
  sprint_number?: number | null;
}

export interface TimelineResponse {
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  generated_at: string;
  rows: TimelineRow[];
  dependencies: TimelineDependencyEdge[];
  summary: {
    total_rows: number;
    dependency_count: number;
    blocked_count: number;
    overdue_count: number;
    at_risk_count: number;
    critical_path_count: number;
  };
}

export interface TimelineBaselineRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  planned_start: string | null;
  planned_end: string | null;
  status: string | null;
}

export interface TimelineBaselineSnapshot {
  captured_at: string;
  captured_by: string;
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  rows: TimelineBaselineRow[];
  summary: {
    total_rows: number;
    dependency_count: number;
    blocked_count: number;
    overdue_count: number;
    at_risk_count: number;
    critical_path_count: number;
    planned_start: string | null;
    planned_end: string | null;
  };
}

export interface TimelineVarianceRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  current_planned_start: string | null;
  current_planned_end: string | null;
  current_status: string | null;
  baseline_planned_start: string | null;
  baseline_planned_end: string | null;
  baseline_status: string | null;
  start_variance_days: number | null;
  end_variance_days: number | null;
  status_changed: boolean;
  missing_from_baseline: boolean;
  missing_from_current: boolean;
  blocked: boolean;
  overdue: boolean;
  at_risk: boolean;
}

export interface TimelineVarianceResponse {
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  generated_at: string;
  baseline: TimelineBaselineSnapshot | null;
  rows: TimelineVarianceRow[];
  summary: {
    total_rows: number;
    current_rows: number;
    baseline_rows: number;
    missing_from_baseline_count: number;
    missing_from_current_count: number;
    start_variance_count: number;
    end_variance_count: number;
    status_changed_count: number;
    delayed_count: number;
    improved_count: number;
    total_end_variance_days: number;
    average_end_variance_days: number | null;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toDateOnly(value: unknown): string | null {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function diffDateOnlyDays(fromValue: string | null, toValue: string | null): number | null {
  if (!fromValue || !toValue) return null;
  const fromDate = toDate(`${fromValue}T00:00:00Z`);
  const toDateValue = toDate(`${toValue}T00:00:00Z`);
  if (!fromDate || !toDateValue) return null;
  return Math.round((toDateValue.getTime() - fromDate.getTime()) / DAY_MS);
}

function todayUtcDateOnly(): Date {
  const today = new Date();
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}

function calculateSprintDates(
  sprintNumber: number | null,
  workspaceStartDate: Date | string | null | undefined
): { start: string | null; end: string | null } {
  if (!sprintNumber || sprintNumber < 1) return { start: null, end: null };

  const startDate = toDate(workspaceStartDate);
  if (!startDate) return { start: null, end: null };

  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  start.setUTCDate(start.getUTCDate() + (sprintNumber - 1) * 7);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function computeSprintStatus(plannedStart: string | null, plannedEnd: string | null): string {
  if (!plannedStart || !plannedEnd) return 'planning';
  const today = todayUtcDateOnly();
  const start = toDate(`${plannedStart}T00:00:00Z`);
  const end = toDate(`${plannedEnd}T00:00:00Z`);
  if (!start || !end) return 'planning';
  if (today < start) return 'upcoming';
  if (today > end) return 'completed';
  return 'active';
}

function statusForDocument(
  documentType: TimelineDocumentType,
  properties: Record<string, unknown>,
  archivedAt?: Date | string | null,
  plannedStart?: string | null,
  plannedEnd?: string | null
): string | null {
  if (archivedAt) return 'archived';

  if (documentType === 'issue') {
    return asString(properties.state) ?? 'backlog';
  }

  if (documentType === 'sprint') {
    return asString(properties.status) ?? computeSprintStatus(plannedStart ?? null, plannedEnd ?? null);
  }

  if (documentType === 'project') {
    if (properties.plan_validated !== undefined && properties.plan_validated !== null) return 'completed';
    return asString(properties.status) ?? 'planned';
  }

  return asString(properties.status) ?? 'active';
}

function isCompleteStatus(status: string | null): boolean {
  return status === 'done' || status === 'completed' || status === 'cancelled' || status === 'archived';
}

function isOverdue(plannedEnd: string | null, status: string | null): boolean {
  if (!plannedEnd || isCompleteStatus(status)) return false;
  const end = toDate(`${plannedEnd}T00:00:00Z`);
  return !!end && end < todayUtcDateOnly();
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

function earliest(values: Array<string | null>): string | null {
  const filtered = values.filter((value): value is string => !!value).sort();
  return filtered[0] ?? null;
}

function latest(values: Array<string | null>): string | null {
  const filtered = values.filter((value): value is string => !!value).sort();
  return filtered[filtered.length - 1] ?? null;
}

async function getScopeDocument(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<{ id: string; title: string } | null> {
  const result = await pool.query(
    `SELECT id, title
     FROM documents d
     WHERE d.id = $1
       AND d.workspace_id = $2
       AND d.document_type = $3
       AND ${VISIBILITY_FILTER_SQL('d', '$4', '$5')}`,
    [scopeId, workspaceId, scopeType, userId, isAdmin]
  );
  return result.rows[0] ?? null;
}

async function getProjectTimelineDocuments(
  projectId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineDocumentRow[]> {
  const result = await pool.query(
    `WITH project_sprints AS (
       SELECT d.id
       FROM documents d
       JOIN document_associations da
         ON da.document_id = d.id
        AND da.related_id = $1
        AND da.relationship_type = 'project'
       WHERE d.workspace_id = $2
         AND d.document_type = 'sprint'
     ),
     project_issues AS (
       SELECT DISTINCT d.id
       FROM documents d
       LEFT JOIN document_associations project_da
         ON project_da.document_id = d.id
        AND project_da.related_id = $1
        AND project_da.relationship_type = 'project'
       LEFT JOIN document_associations sprint_da
         ON sprint_da.document_id = d.id
        AND sprint_da.relationship_type = 'sprint'
       WHERE d.workspace_id = $2
         AND d.document_type = 'issue'
         AND (
           project_da.id IS NOT NULL
           OR sprint_da.related_id IN (SELECT id FROM project_sprints)
         )
     ),
     scope_ids AS (
       SELECT $1::uuid AS id
       UNION SELECT id FROM project_sprints
       UNION SELECT id FROM project_issues
     )
     SELECT d.id, d.title, d.document_type, d.properties, d.archived_at,
            d.created_at, d.updated_at, d.started_at, d.completed_at, d.cancelled_at,
            w.sprint_start_date
     FROM scope_ids s
     JOIN documents d ON d.id = s.id
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE d.workspace_id = $2
       AND d.document_type IN ('project', 'sprint', 'issue')
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
     ORDER BY
       CASE d.document_type WHEN 'project' THEN 0 WHEN 'sprint' THEN 1 ELSE 2 END,
       COALESCE((d.properties->>'sprint_number')::int, 999999),
       d.title`,
    [projectId, workspaceId, userId, isAdmin]
  );
  return result.rows;
}

async function getProgramTimelineDocuments(
  programId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineDocumentRow[]> {
  const result = await pool.query(
    `WITH program_projects AS (
       SELECT d.id
       FROM documents d
       JOIN document_associations da
         ON da.document_id = d.id
        AND da.related_id = $1
        AND da.relationship_type = 'program'
       WHERE d.workspace_id = $2
         AND d.document_type = 'project'
     ),
     program_sprints AS (
       SELECT DISTINCT d.id
       FROM documents d
       LEFT JOIN document_associations program_da
         ON program_da.document_id = d.id
        AND program_da.related_id = $1
        AND program_da.relationship_type = 'program'
       LEFT JOIN document_associations project_da
         ON project_da.document_id = d.id
        AND project_da.relationship_type = 'project'
       WHERE d.workspace_id = $2
         AND d.document_type = 'sprint'
         AND (
           program_da.id IS NOT NULL
           OR project_da.related_id IN (SELECT id FROM program_projects)
         )
     ),
     program_issues AS (
       SELECT DISTINCT d.id
       FROM documents d
       LEFT JOIN document_associations program_da
         ON program_da.document_id = d.id
        AND program_da.related_id = $1
        AND program_da.relationship_type = 'program'
       LEFT JOIN document_associations project_da
         ON project_da.document_id = d.id
        AND project_da.relationship_type = 'project'
       LEFT JOIN document_associations sprint_da
         ON sprint_da.document_id = d.id
        AND sprint_da.relationship_type = 'sprint'
       WHERE d.workspace_id = $2
         AND d.document_type = 'issue'
         AND (
           program_da.id IS NOT NULL
           OR project_da.related_id IN (SELECT id FROM program_projects)
           OR sprint_da.related_id IN (SELECT id FROM program_sprints)
         )
     ),
     scope_ids AS (
       SELECT $1::uuid AS id
       UNION SELECT id FROM program_projects
       UNION SELECT id FROM program_sprints
       UNION SELECT id FROM program_issues
     )
     SELECT d.id, d.title, d.document_type, d.properties, d.archived_at,
            d.created_at, d.updated_at, d.started_at, d.completed_at, d.cancelled_at,
            w.sprint_start_date
     FROM scope_ids s
     JOIN documents d ON d.id = s.id
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE d.workspace_id = $2
       AND d.document_type IN ('program', 'project', 'sprint', 'issue')
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
     ORDER BY
       CASE d.document_type WHEN 'program' THEN 0 WHEN 'project' THEN 1 WHEN 'sprint' THEN 2 ELSE 3 END,
       COALESCE((d.properties->>'sprint_number')::int, 999999),
       d.title`,
    [programId, workspaceId, userId, isAdmin]
  );
  return result.rows;
}

async function getTimelineAssociations(documentIds: string[]): Promise<AssociationRow[]> {
  if (documentIds.length === 0) return [];

  const result = await pool.query(
    `SELECT document_id, related_id, relationship_type
     FROM document_associations
     WHERE document_id = ANY($1::uuid[])
       AND relationship_type IN ('program', 'project', 'sprint')`,
    [documentIds]
  );
  return result.rows;
}

async function getTimelineDependencies(
  documentIds: string[],
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<DependencyRow[]> {
  if (documentIds.length === 0) return [];

  const result = await pool.query(
    `SELECT da.document_id as source_id,
            da.related_id as target_id,
            da.metadata,
            da.created_at,
            source_doc.title as source_title,
            target_doc.title as target_title,
            source_doc.document_type as source_document_type,
            target_doc.document_type as target_document_type,
            source_doc.properties as source_properties,
            target_doc.properties as target_properties,
            source_doc.archived_at as source_archived_at,
            target_doc.archived_at as target_archived_at,
            source_doc.started_at as source_started_at,
            target_doc.started_at as target_started_at,
            source_doc.completed_at as source_completed_at,
            target_doc.completed_at as target_completed_at,
            source_doc.cancelled_at as source_cancelled_at,
            target_doc.cancelled_at as target_cancelled_at
     FROM document_associations da
     JOIN documents source_doc ON source_doc.id = da.document_id
     JOIN documents target_doc ON target_doc.id = da.related_id
     WHERE da.relationship_type = 'depends_on'
       AND (da.document_id = ANY($1::uuid[]) OR da.related_id = ANY($1::uuid[]))
       AND source_doc.workspace_id = $2
       AND target_doc.workspace_id = $2
       AND ${VISIBILITY_FILTER_SQL('source_doc', '$3', '$4')}
       AND ${VISIBILITY_FILTER_SQL('target_doc', '$3', '$4')}
     ORDER BY da.created_at ASC`,
    [documentIds, workspaceId, userId, isAdmin]
  );
  return result.rows;
}

function buildBaseRows(documents: TimelineDocumentRow[], associations: AssociationRow[]): TimelineRow[] {
  const assocByDocument = new Map<string, AssociationRow[]>();
  for (const association of associations) {
    const current = assocByDocument.get(association.document_id) ?? [];
    current.push(association);
    assocByDocument.set(association.document_id, current);
  }

  const rows = documents.map((document): TimelineRow => {
    const properties = asRecord(document.properties);
    const documentAssociations = assocByDocument.get(document.id) ?? [];
    const sprintNumber = document.document_type === 'sprint' ? asNumber(properties.sprint_number) : null;
    const sprintDates = document.document_type === 'sprint'
      ? calculateSprintDates(sprintNumber, document.sprint_start_date)
      : { start: null, end: null };

    const plannedStart = toDateOnly(properties.planned_start_date)
      ?? toDateOnly(properties.start_date)
      ?? sprintDates.start;
    const plannedEnd = toDateOnly(properties.planned_end_date)
      ?? toDateOnly(properties.end_date)
      ?? toDateOnly(properties.target_date)
      ?? toDateOnly(properties.due_date)
      ?? sprintDates.end;
    const status = statusForDocument(document.document_type, properties, document.archived_at, plannedStart, plannedEnd);

    return {
      id: document.id,
      title: document.title,
      document_type: document.document_type,
      status,
      planned_start: plannedStart,
      planned_end: plannedEnd,
      actual_start: toDateOnly(document.started_at) ?? toDateOnly(properties.started_at),
      actual_end: toDateOnly(document.completed_at) ?? toDateOnly(document.cancelled_at) ?? toDateOnly(properties.completed_at),
      program_ids: unique(documentAssociations.filter(a => a.relationship_type === 'program').map(a => a.related_id)),
      project_ids: unique(documentAssociations.filter(a => a.relationship_type === 'project').map(a => a.related_id)),
      sprint_ids: unique(documentAssociations.filter(a => a.relationship_type === 'sprint').map(a => a.related_id)),
      dependency_ids: [],
      blocker_ids: [],
      blocks_ids: [],
      blocked: false,
      overdue: false,
      at_risk: false,
      critical_path: false,
      critical_path_order: null,
      sprint_number: document.document_type === 'sprint' ? sprintNumber : undefined,
    };
  });

  const rowById = new Map(rows.map(row => [row.id, row]));

  for (const row of rows) {
    if (row.document_type === 'issue' && (!row.planned_start || !row.planned_end)) {
      const sprint = row.sprint_ids.map(id => rowById.get(id)).find(Boolean);
      if (sprint) {
        row.planned_start = row.planned_start ?? sprint.planned_start;
        row.planned_end = row.planned_end ?? sprint.planned_end;
      }
    }
  }

  for (const row of rows) {
    if (row.document_type !== 'project' && row.document_type !== 'program') continue;

    const childRows = row.document_type === 'program'
      ? rows.filter(candidate => candidate.id !== row.id)
      : rows.filter(candidate => candidate.project_ids.includes(row.id));

    if (!row.planned_start) {
      row.planned_start = earliest(childRows.map(child => child.planned_start));
    }
    if (!row.planned_end) {
      row.planned_end = latest(childRows.map(child => child.planned_end));
    }
  }

  for (const row of rows) {
    row.overdue = isOverdue(row.planned_end, row.status);
    row.at_risk = row.overdue;
  }

  return rows;
}

function buildDependencyEdges(dependencies: DependencyRow[], rows: TimelineRow[]): TimelineDependencyEdge[] {
  const rowById = new Map(rows.map(row => [row.id, row]));

  return dependencies.map((dependency): TimelineDependencyEdge => {
    const sourceRow = rowById.get(dependency.source_id);
    const targetRow = rowById.get(dependency.target_id);
    const targetStatus = targetRow?.status
      ?? statusForDocument(
        dependency.target_document_type,
        asRecord(dependency.target_properties),
        dependency.target_archived_at
      );

    return {
      source_id: dependency.source_id,
      target_id: dependency.target_id,
      relationship_type: 'depends_on',
      source_in_scope: !!sourceRow,
      target_in_scope: !!targetRow,
      source_title: dependency.source_title,
      target_title: dependency.target_title,
      source_document_type: dependency.source_document_type,
      target_document_type: dependency.target_document_type,
      target_status: targetStatus,
      is_blocking: !isCompleteStatus(targetStatus),
    };
  });
}

function applyDependencyFlags(rows: TimelineRow[], edges: TimelineDependencyEdge[]): void {
  const rowById = new Map(rows.map(row => [row.id, row]));

  for (const edge of edges) {
    const source = rowById.get(edge.source_id);
    const target = rowById.get(edge.target_id);

    if (source) {
      source.dependency_ids = unique([...source.dependency_ids, edge.target_id]);
      if (edge.is_blocking) {
        source.blocker_ids = unique([...source.blocker_ids, edge.target_id]);
        source.blocked = true;
      }
    }

    if (target) {
      target.blocks_ids = unique([...target.blocks_ids, edge.source_id]);
    }
  }

  for (const row of rows) {
    row.at_risk = row.blocked || row.overdue;
  }
}

function comparePathCandidates(
  current: string[],
  candidate: string[],
  rowById: Map<string, TimelineRow>
): string[] {
  if (candidate.length > current.length) return candidate;
  if (candidate.length < current.length) return current;

  const currentEnd = rowById.get(current[current.length - 1] ?? '')?.planned_end ?? '';
  const candidateEnd = rowById.get(candidate[candidate.length - 1] ?? '')?.planned_end ?? '';
  return candidateEnd > currentEnd ? candidate : current;
}

function applyCriticalPath(rows: TimelineRow[], edges: TimelineDependencyEdge[]): void {
  const rowById = new Map(rows.map(row => [row.id, row]));
  const blockersBySource = new Map<string, string[]>();

  for (const edge of edges) {
    if (!edge.is_blocking || !edge.source_in_scope || !edge.target_in_scope) continue;
    const blockers = blockersBySource.get(edge.source_id) ?? [];
    blockers.push(edge.target_id);
    blockersBySource.set(edge.source_id, blockers);
  }

  const memo = new Map<string, string[]>();
  const visiting = new Set<string>();

  function longestBlockingPathTo(rowId: string): string[] {
    const cached = memo.get(rowId);
    if (cached) return cached;
    if (visiting.has(rowId)) return [rowId];

    visiting.add(rowId);
    let bestPath = [rowId];
    const blockers = blockersBySource.get(rowId) ?? [];

    for (const blockerId of blockers) {
      if (!rowById.has(blockerId)) continue;
      const candidate = [...longestBlockingPathTo(blockerId), rowId];
      bestPath = comparePathCandidates(bestPath, candidate, rowById);
    }

    visiting.delete(rowId);
    memo.set(rowId, bestPath);
    return bestPath;
  }

  const candidates = rows.filter(row => row.at_risk || row.blocked || row.overdue);
  let criticalPath: string[] = [];

  for (const row of candidates) {
    const path = longestBlockingPathTo(row.id);
    criticalPath = comparePathCandidates(criticalPath, path, rowById);
  }

  if (criticalPath.length === 0) return;

  const criticalPathIds = new Set(criticalPath);
  for (const row of rows) {
    if (!criticalPathIds.has(row.id)) continue;
    row.critical_path = true;
    row.critical_path_order = criticalPath.indexOf(row.id) + 1;
  }
}

function sortRows(rows: TimelineRow[]): TimelineRow[] {
  const rank: Record<TimelineDocumentType, number> = {
    program: 0,
    project: 1,
    sprint: 2,
    issue: 3,
  };

  return rows.sort((a, b) => {
    const startCompare = (a.planned_start ?? '9999-12-31').localeCompare(b.planned_start ?? '9999-12-31');
    if (startCompare !== 0) return startCompare;
    const rankCompare = rank[a.document_type] - rank[b.document_type];
    if (rankCompare !== 0) return rankCompare;
    return a.title.localeCompare(b.title);
  });
}

async function getTimeline(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineResponse | null> {
  const scope = await getScopeDocument(scopeType, scopeId, workspaceId, userId, isAdmin);
  if (!scope) return null;

  const documents = scopeType === 'project'
    ? await getProjectTimelineDocuments(scopeId, workspaceId, userId, isAdmin)
    : await getProgramTimelineDocuments(scopeId, workspaceId, userId, isAdmin);
  const documentIds = documents.map(document => document.id);
  const associations = await getTimelineAssociations(documentIds);
  const dependencyRows = await getTimelineDependencies(documentIds, workspaceId, userId, isAdmin);

  const rows = buildBaseRows(documents, associations);
  const dependencies = buildDependencyEdges(dependencyRows, rows);
  applyDependencyFlags(rows, dependencies);
  applyCriticalPath(rows, dependencies);

  const sortedRows = sortRows(rows);

  return {
    scope: {
      id: scope.id,
      type: scopeType,
      title: scope.title,
    },
    generated_at: new Date().toISOString(),
    rows: sortedRows,
    dependencies,
    summary: {
      total_rows: sortedRows.length,
      dependency_count: dependencies.length,
      blocked_count: sortedRows.filter(row => row.blocked).length,
      overdue_count: sortedRows.filter(row => row.overdue).length,
      at_risk_count: sortedRows.filter(row => row.at_risk).length,
      critical_path_count: sortedRows.filter(row => row.critical_path).length,
    },
  };
}

function toBaselineRow(row: TimelineRow): TimelineBaselineRow {
  return {
    id: row.id,
    title: row.title,
    document_type: row.document_type,
    planned_start: row.planned_start,
    planned_end: row.planned_end,
    status: row.status,
  };
}

function buildBaselineSnapshot(timeline: TimelineResponse, capturedBy: string): TimelineBaselineSnapshot {
  const rows = timeline.rows.map(toBaselineRow);

  return {
    captured_at: new Date().toISOString(),
    captured_by: capturedBy,
    scope: timeline.scope,
    rows,
    summary: {
      total_rows: rows.length,
      dependency_count: timeline.summary.dependency_count,
      blocked_count: timeline.summary.blocked_count,
      overdue_count: timeline.summary.overdue_count,
      at_risk_count: timeline.summary.at_risk_count,
      critical_path_count: timeline.summary.critical_path_count,
      planned_start: earliest(rows.map(row => row.planned_start)),
      planned_end: latest(rows.map(row => row.planned_end)),
    },
  };
}

function isTimelineDocumentType(value: unknown): value is TimelineDocumentType {
  return value === 'program' || value === 'project' || value === 'sprint' || value === 'issue';
}

function parseBaselineRow(value: unknown): TimelineBaselineRow | null {
  const row = asRecord(value);
  if (typeof row.id !== 'string' || row.id.length === 0) return null;
  if (typeof row.title !== 'string') return null;
  if (!isTimelineDocumentType(row.document_type)) return null;

  return {
    id: row.id,
    title: row.title,
    document_type: row.document_type,
    planned_start: toDateOnly(row.planned_start),
    planned_end: toDateOnly(row.planned_end),
    status: typeof row.status === 'string' ? row.status : null,
  };
}

function parseBaselineSnapshot(value: unknown): TimelineBaselineSnapshot | null {
  const snapshot = asRecord(value);
  const scope = asRecord(snapshot.scope);
  const rowsValue = Array.isArray(snapshot.rows) ? snapshot.rows : null;

  if (typeof snapshot.captured_at !== 'string') return null;
  if (typeof snapshot.captured_by !== 'string') return null;
  if (typeof scope.id !== 'string' || !isTimelineScopeType(scope.type) || typeof scope.title !== 'string') return null;
  if (!rowsValue) return null;

  const capturedAt = toDate(snapshot.captured_at);
  if (!capturedAt) return null;

  const rows = rowsValue.map(parseBaselineRow).filter((row): row is TimelineBaselineRow => row !== null);
  const summary = asRecord(snapshot.summary);

  return {
    captured_at: capturedAt.toISOString(),
    captured_by: snapshot.captured_by,
    scope: {
      id: scope.id,
      type: scope.type,
      title: scope.title,
    },
    rows,
    summary: {
      total_rows: typeof summary.total_rows === 'number' ? summary.total_rows : rows.length,
      dependency_count: typeof summary.dependency_count === 'number' ? summary.dependency_count : 0,
      blocked_count: typeof summary.blocked_count === 'number' ? summary.blocked_count : 0,
      overdue_count: typeof summary.overdue_count === 'number' ? summary.overdue_count : 0,
      at_risk_count: typeof summary.at_risk_count === 'number' ? summary.at_risk_count : 0,
      critical_path_count: typeof summary.critical_path_count === 'number' ? summary.critical_path_count : 0,
      planned_start: toDateOnly(summary.planned_start) ?? earliest(rows.map(row => row.planned_start)),
      planned_end: toDateOnly(summary.planned_end) ?? latest(rows.map(row => row.planned_end)),
    },
  };
}

function isTimelineScopeType(value: unknown): value is TimelineScopeType {
  return value === 'project' || value === 'program';
}

async function getStoredBaseline(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineBaselineSnapshot | null> {
  const result = await pool.query(
    `SELECT d.properties->'timeline_baseline' as baseline
     FROM documents d
     WHERE d.id = $1
       AND d.workspace_id = $2
       AND d.document_type = $3
       AND ${VISIBILITY_FILTER_SQL('d', '$4', '$5')}`,
    [scopeId, workspaceId, scopeType, userId, isAdmin]
  );

  return parseBaselineSnapshot(result.rows[0]?.baseline);
}

async function saveBaseline(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  snapshot: TimelineBaselineSnapshot
): Promise<void> {
  await pool.query(
    `UPDATE documents
     SET properties = jsonb_set(COALESCE(properties, '{}'::jsonb), '{timeline_baseline}', $1::jsonb, true),
         updated_at = now()
     WHERE id = $2
       AND workspace_id = $3
       AND document_type = $4`,
    [JSON.stringify(snapshot), scopeId, workspaceId, scopeType]
  );
}

function buildVarianceResponse(
  timeline: TimelineResponse,
  baseline: TimelineBaselineSnapshot | null
): TimelineVarianceResponse {
  const currentById = new Map(timeline.rows.map(row => [row.id, row]));
  const baselineRows = baseline?.rows ?? [];
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  const orderedIds = [
    ...timeline.rows.map(row => row.id),
    ...baselineRows.map(row => row.id).filter(id => !currentById.has(id)),
  ];

  const rows = orderedIds.map((id): TimelineVarianceRow => {
    const current = currentById.get(id) ?? null;
    const baselineRow = baselineById.get(id) ?? null;
    const title = current?.title ?? baselineRow?.title ?? 'Unknown document';
    const documentType = current?.document_type ?? baselineRow?.document_type ?? 'issue';
    const startVarianceDays = diffDateOnlyDays(
      baselineRow?.planned_start ?? null,
      current?.planned_start ?? null
    );
    const endVarianceDays = diffDateOnlyDays(
      baselineRow?.planned_end ?? null,
      current?.planned_end ?? null
    );

    return {
      id,
      title,
      document_type: documentType,
      current_planned_start: current?.planned_start ?? null,
      current_planned_end: current?.planned_end ?? null,
      current_status: current?.status ?? null,
      baseline_planned_start: baselineRow?.planned_start ?? null,
      baseline_planned_end: baselineRow?.planned_end ?? null,
      baseline_status: baselineRow?.status ?? null,
      start_variance_days: startVarianceDays,
      end_variance_days: endVarianceDays,
      status_changed: !!baselineRow && !!current && baselineRow.status !== current.status,
      missing_from_baseline: !baselineRow,
      missing_from_current: !current,
      blocked: current?.blocked ?? false,
      overdue: current?.overdue ?? false,
      at_risk: current?.at_risk ?? false,
    };
  });

  const endVarianceValues = rows
    .map(row => row.end_variance_days)
    .filter((value): value is number => typeof value === 'number');
  const totalEndVarianceDays = endVarianceValues.reduce((total, value) => total + value, 0);

  return {
    scope: timeline.scope,
    generated_at: new Date().toISOString(),
    baseline,
    rows,
    summary: {
      total_rows: rows.length,
      current_rows: timeline.rows.length,
      baseline_rows: baselineRows.length,
      missing_from_baseline_count: rows.filter(row => row.missing_from_baseline).length,
      missing_from_current_count: rows.filter(row => row.missing_from_current).length,
      start_variance_count: rows.filter(row => typeof row.start_variance_days === 'number' && row.start_variance_days !== 0).length,
      end_variance_count: rows.filter(row => typeof row.end_variance_days === 'number' && row.end_variance_days !== 0).length,
      status_changed_count: rows.filter(row => row.status_changed).length,
      delayed_count: endVarianceValues.filter(value => value > 0).length,
      improved_count: endVarianceValues.filter(value => value < 0).length,
      total_end_variance_days: totalEndVarianceDays,
      average_end_variance_days: endVarianceValues.length > 0
        ? Number((totalEndVarianceDays / endVarianceValues.length).toFixed(2))
        : null,
    },
  };
}

async function getTimelineVariance(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  const timeline = await getTimeline(scopeType, scopeId, workspaceId, userId, isAdmin);
  if (!timeline) return null;

  const baseline = await getStoredBaseline(scopeType, scopeId, workspaceId, userId, isAdmin);
  return buildVarianceResponse(timeline, baseline);
}

async function captureTimelineBaseline(
  scopeType: TimelineScopeType,
  scopeId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  const timeline = await getTimeline(scopeType, scopeId, workspaceId, userId, isAdmin);
  if (!timeline) return null;

  const baseline = buildBaselineSnapshot(timeline, userId);
  await saveBaseline(scopeType, scopeId, workspaceId, baseline);

  return buildVarianceResponse(timeline, baseline);
}

export function getProjectTimeline(
  projectId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineResponse | null> {
  return getTimeline('project', projectId, workspaceId, userId, isAdmin);
}

export function getProgramTimeline(
  programId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineResponse | null> {
  return getTimeline('program', programId, workspaceId, userId, isAdmin);
}

export function getProjectTimelineVariance(
  projectId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  return getTimelineVariance('project', projectId, workspaceId, userId, isAdmin);
}

export function getProgramTimelineVariance(
  programId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  return getTimelineVariance('program', programId, workspaceId, userId, isAdmin);
}

export function captureProjectTimelineBaseline(
  projectId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  return captureTimelineBaseline('project', projectId, workspaceId, userId, isAdmin);
}

export function captureProgramTimelineBaseline(
  programId: string,
  workspaceId: string,
  userId: string,
  isAdmin: boolean
): Promise<TimelineVarianceResponse | null> {
  return captureTimelineBaseline('program', programId, workspaceId, userId, isAdmin);
}
