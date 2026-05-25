import { pool } from '../../db/client.js';
import { VISIBILITY_FILTER_SQL } from '../../middleware/visibility.js';
import { extractText } from '../../utils/document-content.js';
import { getProjectTimeline } from '../timeline.js';
import type { AssistantRetrievalInput, AssistantRetrievedSource } from './types.js';

interface WeeklyContextRow {
  id: string;
  title: string;
  document_type: 'weekly_plan' | 'weekly_retro';
  content: unknown;
  properties: Record<string, unknown> | null;
  updated_at: Date | string | null;
  person_name: string | null;
}

const WORK_CONTEXT_INTENT_PATTERN = /\b(blocked|blocker|blocking|risk|at risk|overdue|dependency|dependencies|project|issue|issues|week|weekly|plan|plans|retro|retros|delivered|status)\b/i;

export async function retrieveStructuredWorkSources(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
): Promise<AssistantRetrievedSource[]> {
  if (!contextProjectId && !WORK_CONTEXT_INTENT_PATTERN.test(input.message)) {
    return [];
  }

  const projectIds = contextProjectId
    ? [contextProjectId]
    : await getVisibleProjectIds(input.workspaceId, input.userId, isAdmin);

  const sources: AssistantRetrievedSource[] = [];
  for (const projectId of projectIds) {
    const projectSource = await buildStructuredProjectSource(input, isAdmin, projectId);
    if (projectSource) sources.push(projectSource);

    sources.push(...await buildWeeklyPlanRetroSources(input, isAdmin, projectId));
  }

  return sources
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 6);
}

async function buildStructuredProjectSource(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  projectId: string,
): Promise<AssistantRetrievedSource | null> {
  const timeline = await getProjectTimeline(projectId, input.workspaceId, input.userId, isAdmin);
  if (!timeline) return null;

  const issueRows = timeline.rows.filter((row) => row.document_type === 'issue');
  const weekRows = timeline.rows.filter((row) => row.document_type === 'sprint');
  const blockedRows = timeline.rows.filter((row) => row.blocked);
  const overdueRows = timeline.rows.filter((row) => row.overdue);
  const atRiskRows = timeline.rows.filter((row) => row.at_risk);
  const criticalRows = timeline.rows.filter((row) => row.critical_path);
  const rowById = new Map(timeline.rows.map((row) => [row.id, row]));
  const dependencyLines = timeline.dependencies
    .filter((edge) => edge.is_blocking)
    .slice(0, 8)
    .map((edge) => `${edge.source_title ?? edge.source_id} depends on ${edge.target_title ?? edge.target_id}`);
  const blockedLines = blockedRows
    .slice(0, 8)
    .map((row) => {
      const blockers = row.blocker_ids
        .map((id) => rowById.get(id)?.title)
        .filter((title): title is string => Boolean(title));
      return blockers.length > 0
        ? `${row.title} is blocked by ${blockers.join(', ')}`
        : row.title;
    });

  const excerpt = [
    `Structured project context: ${timeline.scope.title}.`,
    `Timeline summary: ${timeline.summary.blocked_count} blocked, ${timeline.summary.dependency_count} dependencies, ${timeline.summary.at_risk_count} at risk, ${timeline.summary.overdue_count} overdue.`,
    `Issue states: ${summarizeIssueStates(issueRows.map((row) => row.status))}.`,
    `Weeks in scope: ${formatRows(weekRows)}.`,
    `Blocked items: ${blockedLines.length > 0 ? blockedLines.join('; ') : 'none'}.`,
    `Overdue items: ${formatRows(overdueRows)}.`,
    `At-risk items: ${formatRows(atRiskRows)}.`,
    `Critical path: ${formatRows(criticalRows)}.`,
    dependencyLines.length > 0 ? `Blocking dependencies: ${dependencyLines.join('; ')}.` : 'Blocking dependencies: none.',
  ].join(' ');

  return {
    sourceType: 'project',
    sourceId: projectId,
    title: `${timeline.scope.title} work summary`,
    url: `/documents/${projectId}/timeline`,
    excerpt,
    score: 240 + blockedRows.length * 15 + atRiskRows.length * 10 + overdueRows.length * 8,
    retrievalStrategy: 'structured',
  };
}

async function buildWeeklyPlanRetroSources(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  projectId: string,
): Promise<AssistantRetrievedSource[]> {
  const result = await pool.query<WeeklyContextRow>(
    `SELECT d.id,
            d.title,
            d.document_type,
            d.content,
            d.properties,
            d.updated_at,
            person.title AS person_name
     FROM documents d
     LEFT JOIN documents person
       ON person.id::text = d.properties->>'person_id'
      AND person.workspace_id = d.workspace_id
     LEFT JOIN document_associations project_da
       ON project_da.document_id = d.id
      AND project_da.relationship_type = 'project'
     WHERE d.workspace_id = $1
       AND d.document_type IN ('weekly_plan', 'weekly_retro')
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
       AND (
         project_da.related_id = $4::uuid
         OR d.properties->>'project_id' = $4::text
       )
     ORDER BY COALESCE((d.properties->>'week_number')::int, 0) DESC, d.updated_at DESC
     LIMIT 6`,
    [input.workspaceId, input.userId, isAdmin, projectId],
  );

  const sources: AssistantRetrievedSource[] = [];
  for (const row of result.rows) {
    const contentText = extractText(row.content).trim();
    if (!contentText) continue;

    const weekNumber = typeof row.properties?.week_number === 'number'
      ? row.properties.week_number
      : row.properties?.week_number;
    const kind = row.document_type === 'weekly_plan' ? 'plan' : 'retro';
    const title = [
      weekNumber ? `Week ${weekNumber}` : row.title,
      kind,
      row.person_name ? `for ${row.person_name}` : '',
    ].filter(Boolean).join(' ');

    sources.push({
      sourceType: 'week',
      sourceId: row.id,
      title,
      url: `/documents/${row.id}`,
      excerpt: clampText(`Weekly ${kind}: ${title}.\n${contentText}`, 900),
      score: 180 + recencyScore(row.updated_at),
      retrievalStrategy: 'structured',
    });
  }

  return sources;
}

async function getVisibleProjectIds(
  workspaceId: string,
  userId: string,
  isAdmin: boolean,
): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT d.id
     FROM documents d
     WHERE d.workspace_id = $1
       AND d.document_type = 'project'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
     ORDER BY d.updated_at DESC
     LIMIT 6`,
    [workspaceId, userId, isAdmin],
  );

  return result.rows.map((row) => row.id);
}

function summarizeIssueStates(states: Array<string | null>): string {
  if (states.length === 0) return 'none';

  const counts = new Map<string, number>();
  for (const state of states) {
    const key = state ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, count]) => `${state}: ${count}`)
    .join(', ');
}

function formatRows(rows: Array<{ title: string; status?: string | null }>): string {
  if (rows.length === 0) return 'none';
  return rows.slice(0, 8)
    .map((row) => row.status ? `${row.title} (${row.status})` : row.title)
    .join(', ');
}

function recencyScore(updatedAt: Date | string | null): number {
  if (!updatedAt) return 0;
  const updatedMs = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return 0;
  const ageDays = Math.max(0, (Date.now() - updatedMs) / 86_400_000);
  return Math.max(0, 10 - ageDays);
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars - 3).trimEnd()}...`;
}
