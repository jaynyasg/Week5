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

export type FleetGraphToastMinSeverity =
  | 'off'
  | FleetGraphFindingSeverity;

export interface FleetGraphNotificationPreferences {
  toastMinSeverity: FleetGraphToastMinSeverity;
  toastActionRequired: boolean;
  showUnreadBadge: boolean;
  updatedAt: string | null;
}

export interface FleetGraphNotificationPreferencesUpdateRequest {
  toastMinSeverity?: FleetGraphToastMinSeverity;
  toastActionRequired?: boolean;
  showUnreadBadge?: boolean;
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
  proposals: FleetGraphActionProposal[];
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

export interface FleetGraphOpsResponse {
  generatedAt: string;
  queue: {
    counts: Partial<Record<FleetGraphEventStatus, number>>;
    recentEvents: Array<{
      id: string;
      sourceEventType: string;
      sourceDocumentId: string | null;
      status: FleetGraphEventStatus;
      attemptCount: number;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  runs: {
    last24h: {
      total: number;
      completed: number;
      failed: number;
      averageLatencyMs: number | null;
      byStatus: Partial<Record<FleetGraphRunStatus, number>>;
    };
    recent: FleetGraphRunSummary[];
    lastSuccessfulSweep: FleetGraphRunSummary | null;
  };
  findings: {
    bySeverity: Partial<Record<FleetGraphFindingSeverity, number>>;
    byStatus: Partial<Record<FleetGraphFindingStatus, number>>;
    byDetector: Array<{
      detectorId: string;
      count: number;
      openCount: number;
    }>;
  };
  proposals: {
    pending: number;
    failed: number;
  };
  costs: {
    last24h: {
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    };
    last30d: {
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    };
  };
  detectors: {
    total: number;
    enabled: number;
    disabled: number;
  };
}

export interface FleetGraphDetectorSetting {
  id: string;
  label: string;
  description: string;
  kind: FleetGraphFindingKind;
  defaultSeverity: FleetGraphFindingSeverity;
  noiseDefault: 'toast' | 'badge';
  windowDays: number | null;
  enabled: boolean;
  severity: FleetGraphFindingSeverity | null;
  thresholds: Record<string, number>;
  updatedAt: string | null;
}

export interface FleetGraphDetectorSettingsResponse {
  detectors: FleetGraphDetectorSetting[];
}

export interface FleetGraphDetectorUpdateRequest {
  enabled?: boolean;
  severity?: FleetGraphFindingSeverity | null;
  thresholds?: Record<string, number>;
}

export type FleetGraphReplayStatus = 'completed' | 'interrupted' | 'failed';

export interface FleetGraphReplayExpected {
  expectedStatus: FleetGraphReplayStatus;
  minFindings?: number;
  expectedFindingKinds?: FleetGraphFindingKind[];
  expectedProposalActions?: FleetGraphActionType[];
  requiredAnswerTerms?: string[];
  expectedCitationTitles?: string[];
}

export interface FleetGraphReplayCaseResult {
  id: string;
  passed: boolean;
  score: number;
  checks: Record<string, boolean>;
  missingFindingKinds: FleetGraphFindingKind[];
  missingProposalActions: FleetGraphActionType[];
  missingAnswerTerms: string[];
  missingCitationTitles: string[];
}

export interface FleetGraphReplayReport {
  total: number;
  passed: number;
  score: number;
  cases: FleetGraphReplayCaseResult[];
}

export interface FleetGraphReplayRunSummary {
  id: string;
  scenarioId: string;
  runId: string | null;
  status: FleetGraphReplayStatus;
  score: number;
  report: FleetGraphReplayReport;
  createdAt: string;
}

export interface FleetGraphReplayScenario {
  id: string;
  name: string;
  description: string;
  routeContext: AssistantRouteContext;
  triggerType: string;
  triggerId: string | null;
  message: string | null;
  expected: FleetGraphReplayExpected;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastRun: FleetGraphReplayRunSummary | null;
}

export interface FleetGraphReplayScenariosResponse {
  scenarios: FleetGraphReplayScenario[];
}

export interface FleetGraphReplayScenarioCreateRequest {
  name: string;
  description?: string;
  routeContext?: AssistantRouteContext;
  triggerType?: string;
  triggerId?: string | null;
  message?: string | null;
  expected: FleetGraphReplayExpected;
}

export interface FleetGraphReplayRunResponse {
  scenario: FleetGraphReplayScenario;
  run: FleetGraphReplayRunSummary;
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
