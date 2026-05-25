import type {
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
