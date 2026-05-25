import type {
  AssistantCitation,
  AssistantClientMessage,
  AssistantRouteContext,
  AssistantSourceCounts,
} from './assistant.js';

export type FleetGraphProvider = 'openai' | 'bedrock' | 'mock' | 'unconfigured';

export type FleetGraphMode = 'proactive' | 'chat' | 'manual';

export type FleetGraphRunStatus =
  | 'started'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'cancelled';

export type FleetGraphEventStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'retrying'
  | 'failed';

export type FleetGraphFindingStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'dismissed';

export type FleetGraphFindingSeverity =
  | 'info'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type FleetGraphFindingKind =
  | 'dependency_risk'
  | 'stale_commitment'
  | 'missing_update'
  | 'scope_drift'
  | 'planning_gap'
  | 'delivery_conflict'
  | 'other';

export type FleetGraphDeliveryStatus =
  | 'unread'
  | 'read'
  | 'dismissed'
  | 'snoozed';

export type FleetGraphActionProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'failed';

export type FleetGraphActionType =
  | 'create_issue'
  | 'update_document'
  | 'create_association'
  | 'notify_owner'
  | 'request_update';

export type FleetGraphChatStatus =
  | 'answered'
  | 'no_context'
  | 'unavailable'
  | 'rate_limited'
  | 'interrupted'
  | 'error';

export type FleetGraphErrorCode =
  | 'FLEETGRAPH_UNAVAILABLE'
  | 'MESSAGE_REQUIRED'
  | 'MESSAGE_TOO_LONG'
  | 'RATE_LIMITED'
  | 'MODEL_ERROR'
  | 'GRAPH_ERROR'
  | 'CHECKPOINT_REQUIRED'
  | 'PROPOSAL_NOT_FOUND';

export interface FleetGraphStatusResponse {
  enabled: boolean;
  available: boolean;
  provider: FleetGraphProvider;
  model: string | null;
  missingConfiguration: string[];
  proactive: {
    enabled: boolean;
    sweepIntervalMs: number;
    maxEventsPerSweep: number;
  };
  limits: {
    maxMessageChars: number;
    maxHistoryMessages: number;
    maxFindingsPerRun: number;
  };
  observability: {
    tracesEnabled: boolean;
    missingConfiguration: string[];
  };
}

export interface FleetGraphEvidence {
  sourceType: 'document' | 'issue' | 'project' | 'program' | 'week' | 'timeline' | 'file';
  sourceId: string;
  title: string;
  excerpt: string;
  url?: string;
}

export interface FleetGraphFindingProperties {
  status: FleetGraphFindingStatus;
  severity: FleetGraphFindingSeverity;
  kind: FleetGraphFindingKind;
  confidence: number;
  summary: string;
  rationale: string;
  target_document_id?: string | null;
  target_document_type?: string | null;
  owner_user_id?: string | null;
  run_id?: string | null;
  evidence: FleetGraphEvidence[];
  first_detected_at: string;
  last_observed_at: string;
  resolved_at?: string | null;
  dismissed_reason?: string | null;
  [key: string]: unknown;
}

export interface FleetGraphFindingSummary {
  id: string;
  title: string;
  status: FleetGraphFindingStatus;
  severity: FleetGraphFindingSeverity;
  kind: FleetGraphFindingKind;
  confidence: number;
  summary: string;
  targetDocumentId: string | null;
  targetDocumentType: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetGraphFindingDetail extends FleetGraphFindingSummary {
  rationale: string;
  evidence: FleetGraphEvidence[];
  runId: string | null;
  firstDetectedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
  dismissedReason: string | null;
}

export interface FleetGraphDelivery {
  id: string;
  findingDocumentId: string;
  userId: string;
  status: FleetGraphDeliveryStatus;
  deliveredAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
}

export interface FleetGraphRunSummary {
  id: string;
  mode: FleetGraphMode;
  triggerType: string;
  triggerId: string | null;
  threadId: string;
  status: FleetGraphRunStatus;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number | null;
  langsmithTraceUrl: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface FleetGraphActionProposal {
  id: string;
  findingDocumentId: string | null;
  runId: string | null;
  proposedAction: FleetGraphActionType | string;
  targetDocumentId: string | null;
  payload: Record<string, unknown>;
  status: FleetGraphActionProposalStatus;
  requestedByActor: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FleetGraphChatRequest {
  message: string;
  history?: AssistantClientMessage[];
  context?: AssistantRouteContext;
  findingId?: string;
}

export interface FleetGraphMessage {
  id: string;
  role: 'assistant';
  content: string;
  createdAt: string;
}

export interface FleetGraphError {
  code: FleetGraphErrorCode;
  message: string;
}

export interface FleetGraphChatResponse {
  status: FleetGraphChatStatus;
  message: FleetGraphMessage;
  findings: FleetGraphFindingSummary[];
  proposals: FleetGraphActionProposal[];
  citations: AssistantCitation[];
  sourceCounts: AssistantSourceCounts;
  runId?: string;
  traceId?: string;
  error?: FleetGraphError;
}

export interface FleetGraphFindingsResponse {
  findings: FleetGraphFindingSummary[];
  deliveries: FleetGraphDelivery[];
}

export interface FleetGraphActionDecisionRequest {
  status: Extract<FleetGraphActionProposalStatus, 'approved' | 'rejected'>;
  note?: string;
}
