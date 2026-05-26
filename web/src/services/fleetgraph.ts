import type {
  FleetGraphActionDecisionRequest,
  FleetGraphActionProposal,
  FleetGraphChatRequest,
  FleetGraphChatResponse,
  FleetGraphFindingDetail,
  FleetGraphFindingsResponse,
  FleetGraphRunSummary,
  FleetGraphStatusResponse,
  AssistantRouteContext,
} from '@ship/shared';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

export async function getFleetGraphStatus(): Promise<FleetGraphStatusResponse> {
  const response = await apiGet('/api/fleetgraph/status');
  if (!response.ok) {
    throw new Error('Failed to load FleetGraph status');
  }
  return response.json();
}

export async function sendFleetGraphMessage(
  request: FleetGraphChatRequest,
): Promise<FleetGraphChatResponse> {
  const response = await apiPost('/api/fleetgraph/chat', request);
  const data = await response.json();

  if (!response.ok && !data?.status) {
    throw new Error('FleetGraph request failed');
  }

  return data;
}

export async function getFleetGraphFindings(
  context?: Pick<AssistantRouteContext, 'documentId' | 'projectId'>,
): Promise<FleetGraphFindingsResponse> {
  const params = new URLSearchParams();
  if (context?.documentId) params.set('documentId', context.documentId);
  if (context?.projectId) params.set('projectId', context.projectId);

  const query = params.toString();
  const response = await apiGet(`/api/fleetgraph/findings${query ? `?${query}` : ''}`);
  if (!response.ok) {
    throw new Error('Failed to load FleetGraph findings');
  }
  return response.json();
}

export async function getFleetGraphFinding(id: string): Promise<FleetGraphFindingDetail> {
  const response = await apiGet(`/api/fleetgraph/findings/${id}`);
  if (!response.ok) {
    throw new Error('Failed to load FleetGraph finding');
  }
  return response.json();
}

export async function getFleetGraphRun(id: string): Promise<FleetGraphRunSummary> {
  const response = await apiGet(`/api/fleetgraph/runs/${id}`);
  if (!response.ok) {
    throw new Error('Failed to load FleetGraph run');
  }
  return response.json();
}

export async function updateFleetGraphDelivery(
  id: string,
  status: 'read' | 'dismissed' | 'snoozed',
  snoozedUntil?: string,
): Promise<void> {
  const response = await apiPatch(`/api/fleetgraph/deliveries/${id}`, { status, snoozedUntil });
  if (!response.ok) {
    throw new Error('Failed to update FleetGraph delivery');
  }
}

export async function decideFleetGraphAction(
  id: string,
  decision: FleetGraphActionDecisionRequest,
): Promise<FleetGraphActionProposal> {
  const response = await apiPost(`/api/fleetgraph/actions/${id}/decision`, decision);
  const data = await response.json();

  if (!response.ok) {
    throw new Error('Failed to update FleetGraph action');
  }

  return data.proposal;
}
