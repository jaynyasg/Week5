import type {
  AssistantRouteContext,
  FleetGraphReplayExpected,
  FleetGraphReplayReport,
  FleetGraphReplayRunResponse,
  FleetGraphReplayRunSummary,
  FleetGraphReplayScenario,
  FleetGraphReplayScenarioCreateRequest,
  FleetGraphReplayScenariosResponse,
  FleetGraphReplayStatus,
} from '@ship/shared';
import { pool } from '../../db/client.js';
import { evaluateFleetGraphRun, type FleetGraphEvalCase } from './eval-harness.js';
import { runFleetGraph } from './runner.js';

export async function listFleetGraphReplayScenarios(
  workspaceId: string,
): Promise<FleetGraphReplayScenariosResponse> {
  const result = await pool.query<ReplayScenarioRow & ReplayRunJoinedRow>(
    `SELECT scenario.*,
            latest.id AS last_run_id,
            latest.run_id AS last_graph_run_id,
            latest.status AS last_status,
            latest.score AS last_score,
            latest.report AS last_report,
            latest.created_at AS last_created_at
     FROM fleetgraph_replay_scenarios scenario
     LEFT JOIN LATERAL (
       SELECT id, run_id, status, score, report, created_at
       FROM fleetgraph_replay_runs
       WHERE scenario_id = scenario.id
       ORDER BY created_at DESC
       LIMIT 1
     ) latest ON true
     WHERE scenario.workspace_id = $1
     ORDER BY scenario.updated_at DESC, scenario.created_at DESC`,
    [workspaceId],
  );

  return {
    scenarios: result.rows.map(scenarioSummary),
  };
}

export async function createFleetGraphReplayScenario(input: {
  workspaceId: string;
  userId: string;
  scenario: FleetGraphReplayScenarioCreateRequest;
}): Promise<FleetGraphReplayScenario> {
  const result = await pool.query<ReplayScenarioRow>(
    `INSERT INTO fleetgraph_replay_scenarios (
       workspace_id, name, description, route_context, trigger_type, trigger_id, message, expected, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.workspaceId,
      input.scenario.name.trim(),
      input.scenario.description?.trim() ?? '',
      JSON.stringify(input.scenario.routeContext ?? {}),
      input.scenario.triggerType?.trim() || 'manual_replay',
      input.scenario.triggerId ?? null,
      input.scenario.message?.trim() || null,
      JSON.stringify(input.scenario.expected),
      input.userId,
    ],
  );

  return scenarioSummary(result.rows[0]!);
}

export async function runFleetGraphReplayScenario(input: {
  workspaceId: string;
  userId: string;
  scenarioId: string;
}): Promise<FleetGraphReplayRunResponse | null> {
  const scenarioResult = await pool.query<ReplayScenarioRow>(
    `SELECT *
     FROM fleetgraph_replay_scenarios
     WHERE id = $1
       AND workspace_id = $2
     LIMIT 1`,
    [input.scenarioId, input.workspaceId],
  );
  const scenario = scenarioResult.rows[0];
  if (!scenario) return null;

  const routeContext = normalizeRouteContext(scenario.route_context);
  const graphResult = await runFleetGraph({
    workspaceId: input.workspaceId,
    userId: input.userId,
    mode: 'manual',
    triggerType: scenario.trigger_type,
    triggerId: scenario.trigger_id ?? routeContext.documentId ?? routeContext.projectId ?? null,
    routeContext,
    message: scenario.message ?? replayMessage(scenario),
  });

  const expected = normalizeExpected(scenario.expected);
  const reportCase = evaluateFleetGraphRun(toEvalCase(scenario.id, expected), graphResult);
  const report: FleetGraphReplayReport = {
    total: 1,
    passed: reportCase.passed ? 1 : 0,
    score: reportCase.score,
    cases: [reportCase],
  };

  const runResult = await pool.query<ReplayRunRow>(
    `INSERT INTO fleetgraph_replay_runs (
       workspace_id, scenario_id, run_id, status, score, report, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.workspaceId,
      scenario.id,
      graphResult.runId ?? null,
      graphResult.status,
      report.score,
      JSON.stringify(report),
      input.userId,
    ],
  );

  return {
    scenario: scenarioSummary(scenario),
    run: replayRunSummary(runResult.rows[0]!),
  };
}

function toEvalCase(id: string, expected: FleetGraphReplayExpected): FleetGraphEvalCase {
  return {
    id,
    expectedStatus: expected.expectedStatus,
    minFindings: expected.minFindings,
    expectedFindingKinds: expected.expectedFindingKinds,
    expectedProposalActions: expected.expectedProposalActions,
    requiredAnswerTerms: expected.requiredAnswerTerms,
    expectedCitationTitles: expected.expectedCitationTitles,
  };
}

function replayMessage(scenario: ReplayScenarioRow): string {
  return `Replay FleetGraph scenario: ${scenario.name}`;
}

function scenarioSummary(row: ReplayScenarioRow & Partial<ReplayRunJoinedRow>): FleetGraphReplayScenario {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    routeContext: normalizeRouteContext(row.route_context),
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    message: row.message,
    expected: normalizeExpected(row.expected),
    createdByUserId: row.created_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    lastRun: row.last_run_id
      ? {
          id: row.last_run_id,
          scenarioId: row.id,
          runId: row.last_graph_run_id ?? null,
          status: row.last_status as FleetGraphReplayStatus,
          score: Number(row.last_score),
          report: normalizeReport(row.last_report),
          createdAt: toIsoString(row.last_created_at!),
        }
      : null,
  };
}

function replayRunSummary(row: ReplayRunRow): FleetGraphReplayRunSummary {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    runId: row.run_id,
    status: row.status,
    score: Number(row.score),
    report: normalizeReport(row.report),
    createdAt: toIsoString(row.created_at),
  };
}

function normalizeRouteContext(value: unknown): AssistantRouteContext {
  return value && typeof value === 'object' ? value as AssistantRouteContext : {};
}

function normalizeExpected(value: unknown): FleetGraphReplayExpected {
  const expected = value && typeof value === 'object'
    ? value as Partial<FleetGraphReplayExpected>
    : {};
  return {
    ...expected,
    expectedStatus: expected.expectedStatus ?? 'completed',
  };
}

function normalizeReport(value: unknown): FleetGraphReplayReport {
  if (value && typeof value === 'object') return value as FleetGraphReplayReport;
  return {
    total: 0,
    passed: 0,
    score: 0,
    cases: [],
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface ReplayScenarioRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  route_context: Record<string, unknown> | null;
  trigger_type: string;
  trigger_id: string | null;
  message: string | null;
  expected: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReplayRunRow {
  id: string;
  workspace_id: string;
  scenario_id: string;
  run_id: string | null;
  status: FleetGraphReplayStatus;
  score: string | number;
  report: Record<string, unknown> | null;
  created_by: string | null;
  created_at: Date | string;
}

interface ReplayRunJoinedRow {
  last_run_id: string | null;
  last_graph_run_id: string | null;
  last_status: string | null;
  last_score: string | number | null;
  last_report: Record<string, unknown> | null;
  last_created_at: Date | string | null;
}
