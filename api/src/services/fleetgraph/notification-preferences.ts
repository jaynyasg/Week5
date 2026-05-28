import { pool } from '../../db/client.js';
import type {
  FleetGraphFindingSeverity,
  FleetGraphNotificationPreferences,
  FleetGraphNotificationPreferencesUpdateRequest,
  FleetGraphToastMinSeverity,
} from '@ship/shared';

const DEFAULT_PREFERENCES: FleetGraphNotificationPreferences = {
  toastMinSeverity: 'high',
  toastActionRequired: true,
  showUnreadBadge: true,
  updatedAt: null,
};

const SEVERITY_RANK: Record<FleetGraphFindingSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

interface PreferenceColumns {
  toast_min_severity: FleetGraphToastMinSeverity;
  toast_action_required: boolean;
  show_unread_badge: boolean;
  updated_at: Date | string;
}

interface PreferenceRow extends PreferenceColumns {
  user_id: string;
}

export function defaultFleetGraphNotificationPreferences(): FleetGraphNotificationPreferences {
  return { ...DEFAULT_PREFERENCES };
}

export async function getFleetGraphNotificationPreferences(input: {
  workspaceId: string;
  userId: string;
}): Promise<FleetGraphNotificationPreferences> {
  const result = await pool.query<PreferenceColumns>(
    `SELECT toast_min_severity, toast_action_required, show_unread_badge, updated_at
     FROM fleetgraph_notification_preferences
     WHERE workspace_id = $1 AND user_id = $2
     LIMIT 1`,
    [input.workspaceId, input.userId],
  );

  return rowToPreferences(result.rows[0]);
}

export async function getFleetGraphNotificationPreferencesForUsers(input: {
  workspaceId: string;
  userIds: string[];
}): Promise<Map<string, FleetGraphNotificationPreferences>> {
  const preferencesByUserId = new Map<string, FleetGraphNotificationPreferences>();
  for (const userId of input.userIds) {
    preferencesByUserId.set(userId, defaultFleetGraphNotificationPreferences());
  }

  if (input.userIds.length === 0) return preferencesByUserId;

  const result = await pool.query<PreferenceRow>(
    `SELECT user_id, toast_min_severity, toast_action_required, show_unread_badge, updated_at
     FROM fleetgraph_notification_preferences
     WHERE workspace_id = $1 AND user_id = ANY($2::uuid[])`,
    [input.workspaceId, input.userIds],
  );

  for (const row of result.rows) {
    preferencesByUserId.set(row.user_id, rowToPreferences(row));
  }

  return preferencesByUserId;
}

export async function upsertFleetGraphNotificationPreferences(input: {
  workspaceId: string;
  userId: string;
  updates: FleetGraphNotificationPreferencesUpdateRequest;
}): Promise<FleetGraphNotificationPreferences> {
  const current = await getFleetGraphNotificationPreferences(input);
  const next = {
    toastMinSeverity: input.updates.toastMinSeverity ?? current.toastMinSeverity,
    toastActionRequired: input.updates.toastActionRequired ?? current.toastActionRequired,
    showUnreadBadge: input.updates.showUnreadBadge ?? current.showUnreadBadge,
  };

  const result = await pool.query<PreferenceRow>(
    `INSERT INTO fleetgraph_notification_preferences (
       workspace_id, user_id, toast_min_severity, toast_action_required, show_unread_badge
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, user_id)
     DO UPDATE SET
       toast_min_severity = EXCLUDED.toast_min_severity,
       toast_action_required = EXCLUDED.toast_action_required,
       show_unread_badge = EXCLUDED.show_unread_badge,
       updated_at = now()
     RETURNING toast_min_severity, toast_action_required, show_unread_badge, updated_at`,
    [
      input.workspaceId,
      input.userId,
      next.toastMinSeverity,
      next.toastActionRequired,
      next.showUnreadBadge,
    ],
  );

  return rowToPreferences(result.rows[0]);
}

export function shouldToastForFleetGraphFinding(input: {
  preferences: FleetGraphNotificationPreferences;
  severity: FleetGraphFindingSeverity;
  actionRequired: boolean;
}): boolean {
  if (input.actionRequired && input.preferences.toastActionRequired) return true;
  if (input.preferences.toastMinSeverity === 'off') return false;
  return SEVERITY_RANK[input.severity] >= SEVERITY_RANK[input.preferences.toastMinSeverity];
}

function rowToPreferences(row: PreferenceColumns | undefined): FleetGraphNotificationPreferences {
  if (!row) return defaultFleetGraphNotificationPreferences();

  return {
    toastMinSeverity: row.toast_min_severity,
    toastActionRequired: row.toast_action_required,
    showUnreadBadge: row.show_unread_badge,
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
