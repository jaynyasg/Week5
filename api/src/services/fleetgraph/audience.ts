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
    userIds: [context.userId],
    reason: 'requester',
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
