import type {
  FleetGraphEventStatus,
  FleetGraphFindingSeverity,
  FleetGraphFindingStatus,
  FleetGraphOpsResponse,
  FleetGraphRunStatus,
  FleetGraphRunSummary,
} from '@ship/shared';
import { pool } from '../../db/client.js';
import { fleetGraphDetectorRegistry } from './detectors.js';

export async function getFleetGraphOps(workspaceId: string): Promise<FleetGraphOpsResponse> {
  const [
    queueCounts,
    recentEvents,
    runCounts,
    runLatency,
    recentRuns,
    lastSuccessfulSweep,
    findingSeverityCounts,
    findingStatusCounts,
    findingDetectorCounts,
    proposalCounts,
    costs24h,
    costs30d,
    disabledDetectorCount,
  ] = await Promise.all([
    pool.query<{ status: FleetGraphEventStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM fleetgraph_event_queue
       WHERE workspace_id = $1
       GROUP BY status`,
      [workspaceId],
    ),
    pool.query<QueueEventRow>(
      `SELECT id, source_event_type, source_document_id, status, attempt_count, last_error, created_at, updated_at
       FROM fleetgraph_event_queue
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [workspaceId],
    ),
    pool.query<{ status: FleetGraphRunStatus; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM fleetgraph_runs
       WHERE workspace_id = $1
         AND created_at >= now() - interval '24 hours'
       GROUP BY status`,
      [workspaceId],
    ),
    pool.query<{ average_latency_ms: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)::text AS average_latency_ms
       FROM fleetgraph_runs
       WHERE workspace_id = $1
         AND status = 'completed'
         AND completed_at IS NOT NULL
         AND created_at >= now() - interval '24 hours'`,
      [workspaceId],
    ),
    pool.query<RunRow>(
      `SELECT *
       FROM fleetgraph_runs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [workspaceId],
    ),
    pool.query<RunRow>(
      `SELECT *
       FROM fleetgraph_runs
       WHERE workspace_id = $1
         AND trigger_type = 'fleetgraph.sweep'
         AND status = 'completed'
       ORDER BY completed_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [workspaceId],
    ),
    pool.query<{ severity: FleetGraphFindingSeverity; count: string }>(
      `SELECT COALESCE(properties->>'severity', 'medium') AS severity, COUNT(*)::text AS count
       FROM documents
       WHERE workspace_id = $1
         AND document_type::text = 'fleetgraph_finding'
         AND deleted_at IS NULL
       GROUP BY severity`,
      [workspaceId],
    ),
    pool.query<{ status: FleetGraphFindingStatus; count: string }>(
      `SELECT COALESCE(properties->>'status', 'open') AS status, COUNT(*)::text AS count
       FROM documents
       WHERE workspace_id = $1
         AND document_type::text = 'fleetgraph_finding'
         AND deleted_at IS NULL
       GROUP BY status`,
      [workspaceId],
    ),
    pool.query<{ detector_id: string; count: string; open_count: string }>(
      `SELECT COALESCE(properties->>'detector_id', 'unknown') AS detector_id,
              COUNT(*)::text AS count,
              COUNT(*) FILTER (WHERE COALESCE(properties->>'status', 'open') = 'open')::text AS open_count
       FROM documents
       WHERE workspace_id = $1
         AND document_type::text = 'fleetgraph_finding'
         AND deleted_at IS NULL
       GROUP BY detector_id
       ORDER BY COUNT(*) DESC, detector_id ASC`,
      [workspaceId],
    ),
    pool.query<{ pending: string; failed: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
              COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
       FROM fleetgraph_action_proposals
       WHERE workspace_id = $1`,
      [workspaceId],
    ),
    queryCostWindow(workspaceId, '24 hours'),
    queryCostWindow(workspaceId, '30 days'),
    pool.query<{ disabled: string }>(
      `SELECT COUNT(*) FILTER (WHERE enabled = false)::text AS disabled
       FROM fleetgraph_detector_settings
       WHERE workspace_id = $1`,
      [workspaceId],
    ),
  ]);

  const runCountsByStatus = toCountRecord<FleetGraphRunStatus>(runCounts.rows, 'status');
  const completed = runCountsByStatus.completed ?? 0;
  const failed = runCountsByStatus.failed ?? 0;
  const disabled = Number(disabledDetectorCount.rows[0]?.disabled ?? 0);

  return {
    generatedAt: new Date().toISOString(),
    queue: {
      counts: toCountRecord<FleetGraphEventStatus>(queueCounts.rows, 'status'),
      recentEvents: recentEvents.rows.map((row) => ({
        id: row.id,
        sourceEventType: row.source_event_type,
        sourceDocumentId: row.source_document_id,
        status: row.status,
        attemptCount: Number(row.attempt_count),
        lastError: row.last_error,
        createdAt: toIsoString(row.created_at),
        updatedAt: toIsoString(row.updated_at),
      })),
    },
    runs: {
      last24h: {
        total: Object.values(runCountsByStatus).reduce((sum, count) => sum + count, 0),
        completed,
        failed,
        averageLatencyMs: runLatency.rows[0]?.average_latency_ms === null
          ? null
          : Number(runLatency.rows[0]?.average_latency_ms ?? 0),
        byStatus: runCountsByStatus,
      },
      recent: recentRuns.rows.map(runSummary),
      lastSuccessfulSweep: lastSuccessfulSweep.rows[0] ? runSummary(lastSuccessfulSweep.rows[0]) : null,
    },
    findings: {
      bySeverity: toCountRecord<FleetGraphFindingSeverity>(findingSeverityCounts.rows, 'severity'),
      byStatus: toCountRecord<FleetGraphFindingStatus>(findingStatusCounts.rows, 'status'),
      byDetector: findingDetectorCounts.rows.map((row) => ({
        detectorId: row.detector_id,
        count: Number(row.count),
        openCount: Number(row.open_count),
      })),
    },
    proposals: {
      pending: Number(proposalCounts.rows[0]?.pending ?? 0),
      failed: Number(proposalCounts.rows[0]?.failed ?? 0),
    },
    costs: {
      last24h: costSummary(costs24h.rows[0]),
      last30d: costSummary(costs30d.rows[0]),
    },
    detectors: {
      total: fleetGraphDetectorRegistry.length,
      enabled: Math.max(0, fleetGraphDetectorRegistry.length - disabled),
      disabled,
    },
  };
}

function queryCostWindow(workspaceId: string, interval: '24 hours' | '30 days') {
  return pool.query<CostRow>(
    `SELECT COALESCE(SUM(input_tokens), 0)::text AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
            COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
     FROM fleetgraph_runs
     WHERE workspace_id = $1
       AND created_at >= now() - interval '${interval}'`,
    [workspaceId],
  );
}

function toCountRecord<T extends string>(
  rows: Array<Record<string, unknown> & { count: string }>,
  key: string,
): Partial<Record<T, number>> {
  return Object.fromEntries(
    rows.map((row) => [String(row[key]), Number(row.count)]),
  ) as Partial<Record<T, number>>;
}

function costSummary(row: CostRow | undefined) {
  return {
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    estimatedCostUsd: Number(row?.estimated_cost_usd ?? 0),
  };
}

function runSummary(row: RunRow): FleetGraphRunSummary {
  return {
    id: row.id,
    mode: row.mode,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    threadId: row.thread_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    langsmithTraceUrl: row.langsmith_trace_url,
    metadata: row.metadata ?? {},
    error: row.error,
    createdAt: toIsoString(row.created_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface QueueEventRow {
  id: string;
  source_event_type: string;
  source_document_id: string | null;
  status: FleetGraphEventStatus;
  attempt_count: number;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RunRow {
  id: string;
  mode: FleetGraphRunSummary['mode'];
  trigger_type: string;
  trigger_id: string | null;
  thread_id: string;
  status: FleetGraphRunStatus;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string | number | null;
  langsmith_trace_url: string | null;
  metadata: Record<string, unknown> | null;
  error: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
}

interface CostRow {
  input_tokens: string;
  output_tokens: string;
  estimated_cost_usd: string;
}
