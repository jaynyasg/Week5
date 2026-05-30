import type {
  FleetGraphDetectorSetting,
  FleetGraphDetectorSettingsResponse,
  FleetGraphDetectorUpdateRequest,
  FleetGraphFindingSeverity,
} from '@ship/shared';
import { pool } from '../../db/client.js';
import {
  type FleetGraphDetectorId,
  fleetGraphDetectorRegistry,
  fleetGraphDetectorThresholdDefaults,
} from './detectors.js';
import type { FleetGraphDetectorSettingsById } from './types.js';

const DETECTOR_IDS = new Set(fleetGraphDetectorRegistry.map((detector) => detector.id));
const SEVERITIES = new Set(['info', 'low', 'medium', 'high', 'critical']);

export async function getFleetGraphDetectorSettings(
  workspaceId: string,
): Promise<FleetGraphDetectorSettingsById> {
  const result = await pool.query<DetectorSettingsRow>(
    `SELECT detector_id, enabled, severity, thresholds
     FROM fleetgraph_detector_settings
     WHERE workspace_id = $1`,
    [workspaceId],
  );

  return Object.fromEntries(
    result.rows
      .filter((row) => DETECTOR_IDS.has(row.detector_id as FleetGraphDetectorId))
      .map((row) => [
        row.detector_id,
        {
          enabled: row.enabled,
          severity: normalizeSeverity(row.severity),
          thresholds: mergeThresholds(row.detector_id as FleetGraphDetectorId, row.thresholds),
        },
      ]),
  );
}

export async function listFleetGraphDetectorSettings(
  workspaceId: string,
): Promise<FleetGraphDetectorSettingsResponse> {
  const result = await pool.query<DetectorSettingsRow & { updated_at: Date | string }>(
    `SELECT detector_id, enabled, severity, thresholds, updated_at
     FROM fleetgraph_detector_settings
     WHERE workspace_id = $1`,
    [workspaceId],
  );
  const settingsById = new Map(result.rows.map((row) => [row.detector_id, row]));

  return {
    detectors: fleetGraphDetectorRegistry.map((detector) => {
      const setting = settingsById.get(detector.id);
      return detectorSettingResponse(detector.id, setting);
    }),
  };
}

export async function upsertFleetGraphDetectorSetting(input: {
  workspaceId: string;
  detectorId: string;
  updates: FleetGraphDetectorUpdateRequest;
}): Promise<FleetGraphDetectorSetting> {
  if (!DETECTOR_IDS.has(input.detectorId as FleetGraphDetectorId)) {
    throw new UnknownFleetGraphDetectorError(input.detectorId);
  }

  const current = await pool.query<DetectorSettingsRow>(
    `SELECT detector_id, enabled, severity, thresholds
     FROM fleetgraph_detector_settings
     WHERE workspace_id = $1
       AND detector_id = $2
     LIMIT 1`,
    [input.workspaceId, input.detectorId],
  );
  const row = current.rows[0];
  const thresholds = input.updates.thresholds === undefined
    ? normalizeThresholds(row?.thresholds)
    : {
        ...normalizeThresholds(row?.thresholds),
        ...normalizeThresholds(input.updates.thresholds),
      };
  const severity = Object.prototype.hasOwnProperty.call(input.updates, 'severity')
    ? normalizeSeverity(input.updates.severity ?? null)
    : normalizeSeverity(row?.severity ?? null);

  const result = await pool.query<DetectorSettingsRow & { updated_at: Date | string }>(
    `INSERT INTO fleetgraph_detector_settings (
       workspace_id, detector_id, enabled, severity, thresholds
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, detector_id)
     DO UPDATE SET
       enabled = EXCLUDED.enabled,
       severity = EXCLUDED.severity,
       thresholds = EXCLUDED.thresholds,
       updated_at = now()
     RETURNING detector_id, enabled, severity, thresholds, updated_at`,
    [
      input.workspaceId,
      input.detectorId,
      input.updates.enabled ?? row?.enabled ?? true,
      severity,
      JSON.stringify(thresholds),
    ],
  );

  return detectorSettingResponse(input.detectorId as FleetGraphDetectorId, result.rows[0]);
}

export class UnknownFleetGraphDetectorError extends Error {
  constructor(detectorId: string) {
    super(`Unknown FleetGraph detector: ${detectorId}`);
    this.name = 'UnknownFleetGraphDetectorError';
  }
}

function detectorSettingResponse(
  detectorId: FleetGraphDetectorId,
  row?: (DetectorSettingsRow & { updated_at?: Date | string }) | null,
): FleetGraphDetectorSetting {
  const detector = fleetGraphDetectorRegistry.find((item) => item.id === detectorId)!;
  return {
    id: detector.id,
    label: detector.label,
    description: detector.description,
    kind: detector.kind,
    defaultSeverity: detector.defaultSeverity,
    noiseDefault: detector.noiseDefault,
    windowDays: detector.windowDays ?? null,
    enabled: row?.enabled ?? true,
    severity: normalizeSeverity(row?.severity ?? null),
    thresholds: mergeThresholds(detectorId, row?.thresholds),
    updatedAt: row?.updated_at ? toIsoString(row.updated_at) : null,
  };
}

function mergeThresholds(
  detectorId: FleetGraphDetectorId,
  thresholds: Record<string, unknown> | null | undefined,
): Record<string, number> {
  return {
    ...(fleetGraphDetectorThresholdDefaults[detectorId] ?? {}),
    ...normalizeThresholds(thresholds),
  };
}

function normalizeThresholds(thresholds: Record<string, unknown> | null | undefined): Record<string, number> {
  if (!thresholds || typeof thresholds !== 'object') return {};
  return Object.fromEntries(
    Object.entries(thresholds)
      .map(([key, value]) => [key, typeof value === 'number' ? value : Number(value)] as const)
      .filter(([, value]) => Number.isFinite(value) && value >= 0),
  );
}

function normalizeSeverity(value: unknown): FleetGraphFindingSeverity | null {
  return typeof value === 'string' && SEVERITIES.has(value)
    ? value as FleetGraphFindingSeverity
    : null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface DetectorSettingsRow {
  detector_id: string;
  enabled: boolean;
  severity: string | null;
  thresholds: Record<string, unknown> | null;
}
