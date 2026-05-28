import { broadcastToUser } from '../../collaboration/index.js';
import { pool } from '../../db/client.js';
import type { FleetGraphNotificationPreferences } from '@ship/shared';
import type {
  FleetGraphAudience,
  FleetGraphDeliveryPayload,
  FleetGraphFindingCandidate,
} from './types.js';
import {
  defaultFleetGraphNotificationPreferences,
  getFleetGraphNotificationPreferencesForUsers,
  shouldToastForFleetGraphFinding,
} from './notification-preferences.js';

export async function createFleetGraphDeliveries(input: {
  workspaceId: string;
  findingDocumentId: string;
  finding: FleetGraphFindingCandidate;
  audience: FleetGraphAudience;
}): Promise<FleetGraphDeliveryPayload[]> {
  const payloads: FleetGraphDeliveryPayload[] = [];
  const preferencesByUserId = await getFleetGraphNotificationPreferencesForUsers({
    workspaceId: input.workspaceId,
    userIds: input.audience.userIds,
  });

  for (const userId of input.audience.userIds) {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO fleetgraph_deliveries (workspace_id, finding_document_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (finding_document_id, user_id) DO NOTHING
       RETURNING id`,
      [input.workspaceId, input.findingDocumentId, userId],
    );

    const deliveryId = result.rows[0]?.id;
    if (!deliveryId) continue;

    const payload = toDeliveryPayload({
      deliveryId,
      findingDocumentId: input.findingDocumentId,
      finding: input.finding,
      preferences: preferencesByUserId.get(userId),
    });
    broadcastToUser(userId, 'fleetgraph:finding-delivered', { ...payload });
    payloads.push(payload);
  }
  return payloads;
}

export function toDeliveryPayload(input: {
  deliveryId: string;
  findingDocumentId: string;
  finding: FleetGraphFindingCandidate;
  preferences?: FleetGraphNotificationPreferences;
}): FleetGraphDeliveryPayload {
  const preferences = input.preferences ?? defaultFleetGraphNotificationPreferences();
  const actionRequired = Boolean(input.finding.actionProposal);
  return {
    findingId: input.findingDocumentId,
    deliveryId: input.deliveryId,
    severity: input.finding.severity,
    title: input.finding.title,
    targetLabel: input.finding.evidence[0]?.title ?? null,
    actionRequired,
    toast: shouldToastForFleetGraphFinding({
      preferences,
      severity: input.finding.severity,
      actionRequired,
    }),
    badge: preferences.showUnreadBadge,
  };
}
