import { pool } from '../../db/client.js';
import { getVisibilityContext, VISIBILITY_FILTER_SQL } from '../../middleware/visibility.js';
import { extractText } from '../../utils/document-content.js';
import { getProjectTimeline } from '../timeline.js';
import { ASSISTANT_LIMITS } from './config.js';
import { AssistantEmbeddingError, generateAssistantEmbedding } from './embeddings.js';
import { safeRecordAssistantTraceEvent } from './tracing.js';
import { retrieveStructuredWorkSources } from './work-context.js';
import type { AssistantRetrievedSource, AssistantRetrievalInput } from './types.js';
import type { AssistantSourceType } from '@ship/shared';

interface DocumentSearchRow {
  id: string;
  document_type: string;
  title: string;
  content: unknown;
  properties: Record<string, unknown> | null;
  updated_at: Date | string | null;
  rank: number | null;
  context_boost: number;
}

interface FileChunkSearchRow {
  source_id: string;
  document_id: string | null;
  title: string;
  text: string;
  updated_at: Date | string | null;
  rank: number | null;
  semantic_score?: number | null;
  context_boost: number;
}

interface IndexedDocumentChunkSearchRow {
  source_id: string;
  document_id: string;
  document_type: string;
  title: string;
  text: string;
  updated_at: Date | string | null;
  rank: number | null;
  semantic_score?: number | null;
  context_boost: number;
  fleetgraph_boost: number;
}

type AssistantQueryEmbedding = Awaited<ReturnType<typeof generateAssistantEmbedding>>;

const WORK_INTENT_PATTERN = /\b(blocked|blocker|blocking|risk|at risk|overdue|timeline|dependency|dependencies|project|projects|issue|issues|week|weeks)\b/i;
const FLEETGRAPH_RISK_INTENT_PATTERN = /\b(risk|risks|at risk|blocked|blocker|blocking|overdue|stale|approval|ownership|gap|attention|problem|problems)\b/i;
const FILE_CHUNK_EXCERPT_CHARS = 1400;
const DOCUMENT_EXCERPT_CHARS = 1400;

export async function retrieveAssistantSources(input: AssistantRetrievalInput): Promise<AssistantRetrievedSource[]> {
  const maxSources = input.maxSources ?? ASSISTANT_LIMITS.maxContextChunks;
  const { isAdmin } = await getVisibilityContext(
    input.userId,
    input.workspaceId,
    input.workspaceRole,
    input.isSuperAdmin,
  );

  const contextProjectId = await resolveContextProjectId(input, isAdmin);
  const sources: AssistantRetrievedSource[] = [];

  if (contextProjectId) {
    const timelineSource = await buildProjectTimelineSource({
      projectId: contextProjectId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      isAdmin,
      score: 250,
    });
    if (timelineSource) sources.push(timelineSource);
  }

  sources.push(...await retrieveStructuredWorkSources(input, isAdmin, contextProjectId));

  if (WORK_INTENT_PATTERN.test(input.message)) {
    const projectIds = await getVisibleProjectIds(input.workspaceId, input.userId, isAdmin, contextProjectId);
    for (const projectId of projectIds) {
      const timelineSource = await buildProjectTimelineSource({
        projectId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        isAdmin,
        score: 160,
      });
      if (timelineSource) sources.push(timelineSource);
      if (sources.length >= 4) break;
    }
  }

  sources.push(...await searchFileChunks(input, isAdmin, contextProjectId));
  sources.push(...await searchIndexedDocumentChunks(input, isAdmin, contextProjectId));

  const queryEmbedding = await generateQueryEmbedding(input);
  if (queryEmbedding) {
    sources.push(...await searchSemanticFileChunks(input, isAdmin, contextProjectId, queryEmbedding));
    sources.push(...await searchSemanticIndexedDocumentChunks(input, isAdmin, contextProjectId, queryEmbedding));
  }

  sources.push(...await searchDocuments(input, isAdmin, contextProjectId));

  return dedupeSources(sources)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, maxSources);
}

async function searchFileChunks(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
): Promise<AssistantRetrievedSource[]> {
  const normalizedQuery = normalizeQuery(input.message);
  const contextIds = [
    input.routeContext?.documentId,
    input.routeContext?.projectId,
    contextProjectId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  const result = await pool.query<FileChunkSearchRow>(
    `WITH query AS (SELECT plainto_tsquery('simple', $4) AS q)
     SELECT c.source_id,
            c.document_id,
            c.title,
            c.text,
            c.updated_at,
            ts_rank_cd(c.search_vector, query.q) AS rank,
            CASE WHEN c.document_id = ANY($6::uuid[]) THEN 90 ELSE 0 END AS context_boost
     FROM assistant_search_chunks c
     JOIN files f ON f.id = c.file_id AND f.workspace_id = c.workspace_id
     LEFT JOIN documents d ON d.id = c.document_id
     CROSS JOIN query
     WHERE c.workspace_id = $1
       AND c.source_type = 'file'
       AND f.status = 'uploaded'
       AND (
         c.document_id IS NULL
         OR (
           d.workspace_id = $1
           AND d.archived_at IS NULL
           AND d.deleted_at IS NULL
           AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
         )
       )
       AND (
         c.document_id = ANY($6::uuid[])
         OR c.search_vector @@ query.q
         OR c.title ILIKE $5
         OR c.text ILIKE $5
       )
     ORDER BY context_boost DESC, rank DESC NULLS LAST, c.updated_at DESC
     LIMIT 10`,
    [
      input.workspaceId,
      input.userId,
      isAdmin,
      normalizedQuery,
      `%${normalizedQuery}%`,
      contextIds,
    ],
  );

  return result.rows.map((row) => ({
    sourceType: 'file',
    sourceId: row.source_id,
    title: row.title,
    url: row.document_id ? `/documents/${row.document_id}` : `/api/files/${row.source_id}/serve`,
    excerpt: clampText(row.text, FILE_CHUNK_EXCERPT_CHARS),
    score: (row.context_boost ?? 0) + Number(row.rank ?? 0) * 100 + recencyScore(row.updated_at),
    retrievalStrategy: 'lexical',
    retrievalSignals: {
      lexicalScore: Number(row.rank ?? 0),
      contextBoost: row.context_boost ?? 0,
      recencyScore: recencyScore(row.updated_at),
    },
  }));
}

async function searchIndexedDocumentChunks(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
): Promise<AssistantRetrievedSource[]> {
  const normalizedQuery = normalizeQuery(input.message);
  const contextIds = [
    input.routeContext?.documentId,
    input.routeContext?.projectId,
    contextProjectId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  const hasFleetGraphRiskIntent = FLEETGRAPH_RISK_INTENT_PATTERN.test(input.message);

  const result = await pool.query<IndexedDocumentChunkSearchRow>(
    `WITH query AS (SELECT plainto_tsquery('simple', $4) AS q)
     SELECT c.source_id,
            c.document_id AS document_id,
            d.document_type::text AS document_type,
            c.title,
            c.text,
            c.updated_at,
            ts_rank_cd(c.search_vector, query.q) AS rank,
            CASE
              WHEN d.id = ANY($6::uuid[]) THEN 100
              WHEN project_da.related_id IS NOT NULL THEN 70
              ELSE 0
            END AS context_boost,
            CASE
              WHEN d.document_type::text = 'fleetgraph_finding' AND $8::boolean THEN
                130
                + CASE d.properties->>'severity'
                    WHEN 'critical' THEN 45
                    WHEN 'high' THEN 35
                    WHEN 'medium' THEN 20
                    ELSE 10
                  END
              ELSE 0
            END AS fleetgraph_boost
     FROM assistant_search_chunks c
     JOIN documents d ON d.id = c.document_id
     LEFT JOIN document_associations project_da
       ON project_da.document_id = d.id
      AND project_da.relationship_type = 'project'
      AND project_da.related_id = $7::uuid
     CROSS JOIN query
     WHERE c.workspace_id = $1
       AND c.source_type = 'document'
       AND d.workspace_id = $1
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
       AND (
         d.id = ANY($6::uuid[])
         OR project_da.related_id IS NOT NULL
         OR c.search_vector @@ query.q
         OR c.title ILIKE $5
         OR c.text ILIKE $5
       )
     ORDER BY fleetgraph_boost DESC, context_boost DESC, rank DESC NULLS LAST, c.updated_at DESC
     LIMIT 10`,
    [
      input.workspaceId,
      input.userId,
      isAdmin,
      normalizedQuery,
      `%${normalizedQuery}%`,
      contextIds,
      contextProjectId,
      hasFleetGraphRiskIntent,
    ],
  );

  return result.rows.map((row) => indexedDocumentChunkRowToSource(row, 'lexical'));
}

async function generateQueryEmbedding(input: AssistantRetrievalInput): Promise<AssistantQueryEmbedding> {
  const startedAt = Date.now();
  try {
    return await generateAssistantEmbedding(input.message);
  } catch (error) {
    await safeRecordAssistantTraceEvent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      eventType: 'embedding',
      eventName: 'query_embedding_failed',
      durationMs: Date.now() - startedAt,
      metadata: {
        providerError: error instanceof AssistantEmbeddingError,
      },
      error: error instanceof Error ? error.message.slice(0, 500) : 'Query embedding failed',
    });
    return null;
  }
}

async function searchSemanticFileChunks(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
  embedding: NonNullable<AssistantQueryEmbedding>,
): Promise<AssistantRetrievedSource[]> {
  const startedAt = Date.now();
  const contextIds = [
    input.routeContext?.documentId,
    input.routeContext?.projectId,
    contextProjectId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  const result = await pool.query<FileChunkSearchRow>(
    `SELECT c.source_id,
            c.document_id,
            c.title,
            c.text,
            c.updated_at,
            NULL::real AS rank,
            assistant_cosine_similarity(c.embedding, $4::double precision[]) AS semantic_score,
            CASE WHEN c.document_id = ANY($5::uuid[]) THEN 90 ELSE 0 END AS context_boost
     FROM assistant_search_chunks c
     JOIN files f ON f.id = c.file_id AND f.workspace_id = c.workspace_id
     LEFT JOIN documents d ON d.id = c.document_id
     WHERE c.workspace_id = $1
       AND c.source_type = 'file'
       AND c.embedding IS NOT NULL
       AND f.status = 'uploaded'
       AND (
         c.document_id IS NULL
         OR (
           d.workspace_id = $1
           AND d.archived_at IS NULL
           AND d.deleted_at IS NULL
           AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
         )
       )
     ORDER BY context_boost DESC, semantic_score DESC NULLS LAST, c.updated_at DESC
     LIMIT 8`,
    [
      input.workspaceId,
      input.userId,
      isAdmin,
      embedding.embedding,
      contextIds,
    ],
  );

  await safeRecordAssistantTraceEvent({
    runId: input.runId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventType: 'retrieval',
    eventName: 'semantic_file_search',
    durationMs: Date.now() - startedAt,
    metadata: {
      resultCount: result.rows.length,
      model: embedding.model,
      dimensions: embedding.dimensions,
    },
  });

  return result.rows
    .filter((row) => Number(row.semantic_score ?? 0) > 0.08 || row.context_boost > 0)
    .map((row) => {
      const semanticScore = Number(row.semantic_score ?? 0);
      const recency = recencyScore(row.updated_at);
      return {
        sourceType: 'file',
        sourceId: row.source_id,
        title: row.title,
        url: row.document_id ? `/documents/${row.document_id}` : `/api/files/${row.source_id}/serve`,
        excerpt: clampText(row.text, FILE_CHUNK_EXCERPT_CHARS),
        score: (row.context_boost ?? 0) + semanticScore * 180 + recency,
        retrievalStrategy: 'semantic',
        retrievalSignals: {
          semanticScore,
          contextBoost: row.context_boost ?? 0,
          recencyScore: recency,
        },
      };
    });
}

async function searchSemanticIndexedDocumentChunks(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
  embedding: NonNullable<AssistantQueryEmbedding>,
): Promise<AssistantRetrievedSource[]> {
  const startedAt = Date.now();
  const contextIds = [
    input.routeContext?.documentId,
    input.routeContext?.projectId,
    contextProjectId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);
  const hasFleetGraphRiskIntent = FLEETGRAPH_RISK_INTENT_PATTERN.test(input.message);

  const result = await pool.query<IndexedDocumentChunkSearchRow>(
    `SELECT c.source_id,
            c.document_id AS document_id,
            d.document_type::text AS document_type,
            c.title,
            c.text,
            c.updated_at,
            NULL::real AS rank,
            assistant_cosine_similarity(c.embedding, $4::double precision[]) AS semantic_score,
            CASE
              WHEN d.id = ANY($5::uuid[]) THEN 100
              WHEN project_da.related_id IS NOT NULL THEN 70
              ELSE 0
            END AS context_boost,
            CASE
              WHEN d.document_type::text = 'fleetgraph_finding' AND $7::boolean THEN
                130
                + CASE d.properties->>'severity'
                    WHEN 'critical' THEN 45
                    WHEN 'high' THEN 35
                    WHEN 'medium' THEN 20
                    ELSE 10
                  END
              ELSE 0
            END AS fleetgraph_boost
     FROM assistant_search_chunks c
     JOIN documents d ON d.id = c.document_id
     LEFT JOIN document_associations project_da
       ON project_da.document_id = d.id
      AND project_da.relationship_type = 'project'
      AND project_da.related_id = $6::uuid
     WHERE c.workspace_id = $1
       AND c.source_type = 'document'
       AND c.embedding IS NOT NULL
       AND d.workspace_id = $1
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
     ORDER BY fleetgraph_boost DESC, context_boost DESC, semantic_score DESC NULLS LAST, c.updated_at DESC
     LIMIT 8`,
    [
      input.workspaceId,
      input.userId,
      isAdmin,
      embedding.embedding,
      contextIds,
      contextProjectId,
      hasFleetGraphRiskIntent,
    ],
  );

  await safeRecordAssistantTraceEvent({
    runId: input.runId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    eventType: 'retrieval',
    eventName: 'semantic_document_chunk_search',
    durationMs: Date.now() - startedAt,
    metadata: {
      resultCount: result.rows.length,
      model: embedding.model,
      dimensions: embedding.dimensions,
    },
  });

  return result.rows
    .filter((row) => Number(row.semantic_score ?? 0) > 0.08 || row.context_boost > 0 || row.fleetgraph_boost > 0)
    .map((row) => indexedDocumentChunkRowToSource(row, 'semantic'));
}

async function searchDocuments(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
  contextProjectId: string | null,
): Promise<AssistantRetrievedSource[]> {
  const normalizedQuery = normalizeQuery(input.message);
  const contextIds = [
    input.routeContext?.documentId,
    input.routeContext?.projectId,
    contextProjectId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0);

  const result = await pool.query<DocumentSearchRow>(
    `WITH query AS (SELECT plainto_tsquery('simple', $4) AS q)
     SELECT d.id,
            d.document_type,
            d.title,
            d.content,
            d.properties,
            d.updated_at,
            ts_rank_cd(
              to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d.content::text, '') || ' ' || COALESCE(d.properties::text, '')),
              query.q
            ) AS rank,
            CASE WHEN d.id = ANY($6::uuid[]) THEN 100 ELSE 0 END AS context_boost
     FROM documents d, query
     WHERE d.workspace_id = $1
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
       AND (
         d.id = ANY($6::uuid[])
         OR to_tsvector('simple', COALESCE(d.title, '') || ' ' || COALESCE(d.content::text, '') || ' ' || COALESCE(d.properties::text, '')) @@ query.q
         OR d.title ILIKE $5
         OR d.properties::text ILIKE $5
       )
     ORDER BY context_boost DESC, rank DESC NULLS LAST, d.updated_at DESC
     LIMIT 12`,
    [
      input.workspaceId,
      input.userId,
      isAdmin,
      normalizedQuery,
      `%${normalizedQuery}%`,
      contextIds,
    ],
  );

  return result.rows.map((row) => documentRowToSource(row));
}

async function resolveContextProjectId(
  input: AssistantRetrievalInput,
  isAdmin: boolean,
): Promise<string | null> {
  const explicitProjectId = input.routeContext?.projectId;
  if (explicitProjectId) return explicitProjectId;

  if (input.routeContext?.documentType === 'project' && input.routeContext.documentId) {
    return input.routeContext.documentId;
  }

  const documentId = input.routeContext?.documentId;
  if (!documentId) return null;

  const documentResult = await pool.query<{ document_type: string }>(
    `SELECT d.document_type
     FROM documents d
     WHERE d.id = $1
       AND d.workspace_id = $2
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
     LIMIT 1`,
    [documentId, input.workspaceId, input.userId, isAdmin],
  );

  if (documentResult.rows[0]?.document_type === 'project') {
    return documentId;
  }

  const result = await pool.query<{ related_id: string }>(
    `SELECT da.related_id
     FROM document_associations da
     JOIN documents child ON child.id = da.document_id
     JOIN documents project ON project.id = da.related_id
     WHERE da.document_id = $1
       AND da.relationship_type = 'project'
       AND child.workspace_id = $2
       AND project.workspace_id = $2
       AND ${VISIBILITY_FILTER_SQL('child', '$3', '$4')}
       AND ${VISIBILITY_FILTER_SQL('project', '$3', '$4')}
     LIMIT 1`,
    [documentId, input.workspaceId, input.userId, isAdmin],
  );

  return result.rows[0]?.related_id ?? null;
}

async function getVisibleProjectIds(
  workspaceId: string,
  userId: string,
  isAdmin: boolean,
  contextProjectId: string | null,
): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM documents d
     WHERE d.workspace_id = $1
       AND d.document_type = 'project'
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
     ORDER BY CASE WHEN d.id = $4 THEN 0 ELSE 1 END, d.updated_at DESC
     LIMIT 5`,
    [workspaceId, userId, isAdmin, contextProjectId],
  );

  return result.rows.map((row) => row.id);
}

async function buildProjectTimelineSource(input: {
  projectId: string;
  workspaceId: string;
  userId: string;
  isAdmin: boolean;
  score: number;
}): Promise<AssistantRetrievedSource | null> {
  const timeline = await getProjectTimeline(input.projectId, input.workspaceId, input.userId, input.isAdmin);
  if (!timeline) return null;

  const blockedRows = timeline.rows.filter((row) => row.blocked);
  const overdueRows = timeline.rows.filter((row) => row.overdue);
  const atRiskRows = timeline.rows.filter((row) => row.at_risk);
  const dependencyLines = timeline.dependencies
    .filter((edge) => edge.is_blocking)
    .slice(0, 4)
    .map((edge) => `${edge.source_title ?? edge.source_id} is blocked by ${edge.target_title ?? edge.target_id}`);

  const excerpt = [
    `Project timeline: ${timeline.scope.title}.`,
    `Rows: ${timeline.summary.total_rows}. Dependencies: ${timeline.summary.dependency_count}.`,
    `Blocked count: ${timeline.summary.blocked_count}.`,
    `Blocked items: ${formatTitles(blockedRows.map((row) => row.title))}.`,
    `Overdue: ${formatTitles(overdueRows.map((row) => row.title))}.`,
    `At risk: ${formatTitles(atRiskRows.map((row) => row.title))}.`,
    dependencyLines.length > 0 ? `Blocking dependencies: ${dependencyLines.join('; ')}.` : 'Blocking dependencies: none.',
  ].join(' ');

  return {
    sourceType: 'timeline',
    sourceId: input.projectId,
    title: `${timeline.scope.title} timeline`,
    url: `/documents/${input.projectId}/timeline`,
    excerpt,
    score: input.score + timeline.summary.blocked_count * 12 + timeline.summary.at_risk_count * 8 + timeline.summary.overdue_count * 6,
    retrievalStrategy: 'structured',
  };
}

function indexedDocumentChunkRowToSource(
  row: IndexedDocumentChunkSearchRow,
  strategy: 'lexical' | 'semantic',
): AssistantRetrievedSource {
  const semanticScore = Number(row.semantic_score ?? 0);
  const lexicalScore = Number(row.rank ?? 0);
  const recency = recencyScore(row.updated_at);

  return {
    sourceType: documentTypeToSourceType(row.document_type),
    sourceId: row.document_id,
    title: row.title,
    url: `/documents/${row.document_id}`,
    excerpt: clampText(row.text, DOCUMENT_EXCERPT_CHARS),
    score: (row.context_boost ?? 0)
      + (row.fleetgraph_boost ?? 0)
      + (strategy === 'semantic' ? semanticScore * 180 : lexicalScore * 100)
      + recency,
    retrievalStrategy: strategy,
    retrievalSignals: {
      lexicalScore: strategy === 'lexical' ? lexicalScore : undefined,
      semanticScore: strategy === 'semantic' ? semanticScore : undefined,
      contextBoost: row.context_boost ?? 0,
      recencyScore: recency,
    },
  };
}

function documentRowToSource(row: DocumentSearchRow): AssistantRetrievedSource {
  const sourceType = documentTypeToSourceType(row.document_type);
  const bodyText = extractText(row.content).trim();
  const propertiesText = summarizeProperties(row.properties);
  const excerpt = clampText([bodyText, propertiesText].filter(Boolean).join('\n'), DOCUMENT_EXCERPT_CHARS)
    || `${row.title} is a ${row.document_type} document.`;

  return {
    sourceType,
    sourceId: row.id,
    title: row.title,
    url: `/documents/${row.id}`,
    excerpt,
    score: (row.context_boost ?? 0) + Number(row.rank ?? 0) * 100 + recencyScore(row.updated_at),
    retrievalStrategy: 'lexical',
    retrievalSignals: {
      lexicalScore: Number(row.rank ?? 0),
      contextBoost: row.context_boost ?? 0,
      recencyScore: recencyScore(row.updated_at),
    },
  };
}

function documentTypeToSourceType(documentType: string): AssistantSourceType {
  if (documentType === 'project') return 'project';
  if (documentType === 'program') return 'program';
  if (documentType === 'issue') return 'issue';
  if (documentType === 'sprint' || documentType === 'weekly_plan' || documentType === 'weekly_retro') return 'week';
  return 'document';
}

function summarizeProperties(properties: Record<string, unknown> | null): string {
  if (!properties) return '';

  const entries = Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return entries.join('\n');
}

function normalizeQuery(message: string): string {
  const normalized = message
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const significantTerms = normalized
    .split(' ')
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term.toLowerCase()));

  return significantTerms.join(' ') || normalized || message.trim();
}

const STOP_WORDS = new Set([
  'what',
  'where',
  'when',
  'which',
  'who',
  'how',
  'why',
  'the',
  'and',
  'for',
  'with',
  'from',
  'about',
  'are',
  'is',
  'was',
  'were',
  'can',
  'could',
  'would',
  'should',
  'this',
  'that',
  'ship',
]);

function dedupeSources(sources: AssistantRetrievedSource[]): AssistantRetrievedSource[] {
  const byKey = new Map<string, AssistantRetrievedSource>();

  for (const source of sources) {
    const key = `${source.sourceType}:${source.sourceId}:${source.url}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, source);
      continue;
    }

    byKey.set(key, {
      ...existing,
      excerpt: existing.excerpt.length >= source.excerpt.length ? existing.excerpt : source.excerpt,
      score: Math.max(existing.score, source.score) + Math.min(existing.score, source.score) * 0.15,
      retrievalStrategy: existing.retrievalStrategy === source.retrievalStrategy
        ? existing.retrievalStrategy
        : 'hybrid',
      retrievalSignals: {
        ...existing.retrievalSignals,
        ...source.retrievalSignals,
      },
    });
  }

  return Array.from(byKey.values());
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
  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}

function formatTitles(titles: string[]): string {
  return titles.length > 0 ? titles.slice(0, 6).join(', ') : 'none';
}
