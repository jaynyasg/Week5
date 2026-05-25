import type {
  FleetGraphAudience,
  FleetGraphContext,
  FleetGraphFindingCandidate,
} from './types.js';

export function resolveFleetGraphAudience(
  finding: FleetGraphFindingCandidate,
  context: FleetGraphContext,
): FleetGraphAudience {
  if (finding.ownerUserId) {
    return {
      userIds: [finding.ownerUserId],
      reason: 'owner',
    };
  }

  const accountableId = readString(context.project?.properties.accountable_id)
    ?? readString(context.program?.properties.accountable_id);
  if (accountableId) {
    return {
      userIds: [accountableId],
      reason: 'accountable',
    };
  }

  if (context.workspaceAdminUserIds.length > 0) {
    return {
      userIds: context.workspaceAdminUserIds,
      reason: 'admin_fallback',
    };
  }

  return {
    userIds: isUuid(context.userId) ? [context.userId] : [],
    reason: 'requester',
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
