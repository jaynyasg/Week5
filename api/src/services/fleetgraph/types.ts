import type {
  FleetGraphActionType,
  FleetGraphChatStatus,
  FleetGraphFindingKind,
  FleetGraphFindingSeverity,
  FleetGraphMode,
  FleetGraphRunStatus,
} from '@ship/shared';

export interface FleetGraphRequestContext {
  userId: string;
  workspaceId: string;
  workspaceRole?: string | null;
  isSuperAdmin?: boolean;
}

export interface FleetGraphRun {
  id: string | null;
  threadId: string;
  startedAt: number;
}

export interface FleetGraphRunInput {
  workspaceId: string;
  userId?: string | null;
  mode: FleetGraphMode;
  triggerType: string;
  triggerId?: string | null;
  threadId: string;
  metadata?: Record<string, unknown>;
}

export interface FleetGraphRunCompletionInput {
  run: FleetGraphRun;
  status: FleetGraphRunStatus;
  usage?: FleetGraphUsageInput;
  metadata?: Record<string, unknown>;
  langsmithTraceUrl?: string | null;
  error?: string | null;
}

export interface FleetGraphUsageInput {
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
  usage?: Record<string, unknown> | null;
}

export interface FleetGraphTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface FleetGraphCostEstimate extends FleetGraphTokenUsage {
  provider: string | null;
  model: string | null;
  inputCostUsd: number;
  outputCostUsd: number;
  estimatedCostUsd: number | null;
}

export interface FleetGraphRecordRef {
  id: string;
  documentType: string;
  title: string;
  url: string;
  properties: Record<string, unknown>;
  createdBy?: string | null;
  updatedAt?: string | null;
}

export interface FleetGraphIssueRef extends FleetGraphRecordRef {
  documentType: 'issue';
  state: string | null;
  assigneeId: string | null;
  priority: string | null;
}

export interface FleetGraphContext {
  workspaceId: string;
  userId: string;
  workspaceAdminUserIds: string[];
  routePath?: string | null;
  currentDocument?: FleetGraphRecordRef | null;
  program?: FleetGraphRecordRef | null;
  project?: FleetGraphRecordRef | null;
  week?: FleetGraphRecordRef | null;
  weekPlan?: FleetGraphRecordRef | null;
  issues: FleetGraphIssueRef[];
  now: string;
}

export interface FleetGraphEvidenceRef {
  sourceType: 'document' | 'issue' | 'project' | 'program' | 'week' | 'timeline' | 'file';
  sourceId: string;
  title: string;
  excerpt: string;
  url?: string;
}

export interface FleetGraphActionProposalCandidate {
  proposedAction: FleetGraphActionType;
  targetDocumentId: string | null;
  payload: Record<string, unknown>;
  reason: string;
}

export interface FleetGraphFindingCandidate {
  key: string;
  title: string;
  severity: FleetGraphFindingSeverity;
  kind: FleetGraphFindingKind;
  confidence: number;
  summary: string;
  rationale: string;
  targetDocumentId: string | null;
  targetDocumentType: string | null;
  ownerUserId: string | null;
  evidence: FleetGraphEvidenceRef[];
  actionProposal?: FleetGraphActionProposalCandidate;
}

export interface FleetGraphAudience {
  userIds: string[];
  reason: 'owner' | 'accountable' | 'admin_fallback' | 'requester';
}

export interface FleetGraphHumanInterrupt {
  kind: 'action_proposal';
  proposal: FleetGraphActionProposalCandidate;
  finding: FleetGraphFindingCandidate;
}

export interface FleetGraphState {
  context: FleetGraphContext;
  message?: string;
  findings: FleetGraphFindingCandidate[];
  proposals: FleetGraphActionProposalCandidate[];
  answer?: {
    status: FleetGraphChatStatus;
    content: string;
    citations: FleetGraphEvidenceRef[];
  };
  interrupt?: FleetGraphHumanInterrupt;
  decision?: {
    status: 'approved' | 'rejected';
    note?: string;
  };
}

export interface FleetGraphRunResult {
  status: 'completed' | 'interrupted' | 'failed';
  state: FleetGraphState;
  error?: string;
}

export interface FleetGraphQueueEvent {
  id: string;
  workspaceId: string;
  sourceEventType: string;
  sourceDocumentId: string | null;
  payload: Record<string, unknown>;
  status: 'queued' | 'processing' | 'completed' | 'retrying' | 'failed';
  idempotencyKey: string;
  attemptCount: number;
  createdAt: string;
}

export interface FleetGraphDeliveryPayload {
  findingId: string;
  deliveryId: string;
  severity: string;
  title: string;
  targetLabel: string | null;
  actionRequired: boolean;
}
