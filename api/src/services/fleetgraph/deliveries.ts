import { broadcastToUser } from '../../collaboration/index.js';
import { pool } from '../../db/client.js';
import type {
  FleetGraphAudience,
  FleetGraphDeliveryPayload,
  FleetGraphFindingCandidate,
} from './types.js';

export async function createFleetGraphDeliveries(input: {
  workspaceId: string;
  findingDocumentId: string;
  finding: FleetGraphFindingCandidate;
  audience: FleetGraphAudience;
}): Promise<FleetGraphDeliveryPayload[]> {
  const payloads: FleetGraphDeliveryPayload[] = [];
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
}): FleetGraphDeliveryPayload {
  return {
    findingId: input.findingDocumentId,
    deliveryId: input.deliveryId,
    severity: input.finding.severity,
    title: input.finding.title,
    targetLabel: input.finding.evidence[0]?.title ?? null,
    actionRequired: Boolean(input.finding.actionProposal),
  };
}
