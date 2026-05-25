import { recordToEvidence } from './context.js';
import type {
  FleetGraphContext,
  FleetGraphFindingCandidate,
  FleetGraphIssueRef,
  FleetGraphRecordRef,
} from './types.js';

const STALE_ISSUE_DAYS = 7;

export function detectFleetGraphFindings(context: FleetGraphContext): FleetGraphFindingCandidate[] {
  return [
    detectMissingApprovedWeekPlan(context),
    detectChangedApprovedWeekPlan(context),
    detectMissingOwnership(context),
    detectStaleIssue(context),
    detectProjectChurn(context),
  ].filter((candidate): candidate is FleetGraphFindingCandidate => Boolean(candidate));
}

export function detectMissingApprovedWeekPlan(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const week = context.week;
  if (!week || !isActiveWeek(week, context.now)) return null;

  const approvalStatus = readString(context.weekPlan?.properties.approval_status)
    ?? readString(context.weekPlan?.properties.plan_approval);
  if (approvalStatus === 'approved') return null;

  const ownerUserId = readString(week.properties.owner_id) ?? readString(context.project?.properties.owner_id);
  return {
    key: `missing-approved-plan:${week.id}`,
    title: `Week plan needs approval: ${week.title}`,
    severity: 'high',
    kind: 'planning_gap',
    confidence: 0.92,
    summary: 'The active week does not have an approved plan.',
    rationale: 'FleetGraph only surfaces this when the week is active and no approved weekly plan is linked.',
    targetDocumentId: week.id,
    targetDocumentType: 'sprint',
    ownerUserId,
    evidence: [
      recordToEvidence(week, 'Active week found without an approved weekly plan.'),
      ...(context.weekPlan ? [recordToEvidence(context.weekPlan, `Plan approval status is ${approvalStatus ?? 'missing'}.`)] : []),
    ],
  };
}

export function detectChangedApprovedWeekPlan(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const plan = context.weekPlan;
  if (!plan) return null;

  const approvalStatus = readString(plan.properties.approval_status)
    ?? readString(plan.properties.plan_approval);
  if (approvalStatus !== 'approved') return null;

  const approvedAt = readDate(plan.properties.approved_at);
  const updatedAt = plan.updatedAt ? new Date(plan.updatedAt) : null;
  const changedFlag = plan.properties.changed_after_approval === true
    || plan.properties.content_changed_after_approval === true;
  const changedAfterApproval = Boolean(approvedAt && updatedAt && updatedAt > approvedAt);
  if (!changedFlag && !changedAfterApproval) return null;

  return {
    key: `approved-plan-changed:${plan.id}`,
    title: `Approved plan changed: ${plan.title}`,
    severity: 'medium',
    kind: 'scope_drift',
    confidence: 0.88,
    summary: 'An approved week plan appears to have changed after approval.',
    rationale: 'Approved plans should be re-reviewed when the plan content changes after approval.',
    targetDocumentId: plan.id,
    targetDocumentType: 'weekly_plan',
    ownerUserId: readString(plan.properties.owner_id) ?? readString(context.week?.properties.owner_id),
    evidence: [recordToEvidence(plan, 'Approved plan changed after approval.')],
    actionProposal: {
      proposedAction: 'request_update',
      targetDocumentId: plan.id,
      payload: {
        reason: 'approved_plan_changed',
        currentApprovalStatus: approvalStatus,
      },
      reason: 'Request a human re-review instead of directly mutating approval state.',
    },
  };
}

export function detectMissingOwnership(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const target = context.project ?? context.program;
  if (!target) return null;

  const missingOwner = !readString(target.properties.owner_id);
  const missingAccountable = !readString(target.properties.accountable_id);
  if (!missingOwner && !missingAccountable) return null;

  return {
    key: `missing-ownership:${target.id}`,
    title: `Ownership incomplete: ${target.title}`,
    severity: 'medium',
    kind: 'planning_gap',
    confidence: 0.84,
    summary: 'A project or program is missing owner/accountable metadata.',
    rationale: 'FleetGraph cannot route risk confidently without owner and accountable roles.',
    targetDocumentId: target.id,
    targetDocumentType: target.documentType,
    ownerUserId: readString(target.properties.owner_id),
    evidence: [recordToEvidence(target, `Missing ${missingOwner && missingAccountable ? 'owner and accountable' : missingOwner ? 'owner' : 'accountable'} metadata.`)],
  };
}

export function detectStaleIssue(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const staleIssue = context.issues.find((issue) => isIssueStale(issue, context.now));
  if (!staleIssue) return null;

  return {
    key: `stale-issue:${staleIssue.id}`,
    title: `Issue may be stale: ${staleIssue.title}`,
    severity: staleIssue.priority === 'urgent' || staleIssue.priority === 'high' ? 'high' : 'medium',
    kind: 'stale_commitment',
    confidence: 0.8,
    summary: 'An active issue has not been updated recently.',
    rationale: `The issue is still ${staleIssue.state ?? 'active'} and has not changed in at least ${STALE_ISSUE_DAYS} days.`,
    targetDocumentId: staleIssue.id,
    targetDocumentType: 'issue',
    ownerUserId: staleIssue.assigneeId,
    evidence: [recordToEvidence(staleIssue, `Issue state is ${staleIssue.state ?? 'unknown'} with no recent update.`)],
  };
}

export function detectProjectChurn(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const project = context.project;
  if (!project) return null;

  const staleIssues = context.issues.filter((issue) => isIssueStale(issue, context.now));
  if (staleIssues.length < 3) return null;

  return {
    key: `project-churn:${project.id}`,
    title: `Project issue churn risk: ${project.title}`,
    severity: 'high',
    kind: 'dependency_risk',
    confidence: 0.78,
    summary: 'Multiple active issues are stale in the same project.',
    rationale: 'Three or more stale issues in one project is enough signal to ask a human to inspect execution risk.',
    targetDocumentId: project.id,
    targetDocumentType: 'project',
    ownerUserId: readString(project.properties.owner_id),
    evidence: [
      recordToEvidence(project, `${staleIssues.length} stale active issues are associated with this project.`),
      ...staleIssues.slice(0, 3).map((issue) => recordToEvidence(issue, `Stale issue: ${issue.title}`)),
    ],
  };
}

function isActiveWeek(week: FleetGraphRecordRef, nowIso: string): boolean {
  const explicitStatus = readString(week.properties.sprint_status) ?? readString(week.properties.status);
  if (explicitStatus === 'active') return true;
  if (explicitStatus === 'completed' || explicitStatus === 'cancelled') return false;

  const start = readDate(week.properties.start_date);
  const end = readDate(week.properties.end_date);
  if (!start || !end) return false;

  const now = new Date(nowIso);
  return start <= now && now <= end;
}

function isIssueStale(issue: FleetGraphIssueRef, nowIso: string): boolean {
  if (!issue.state || ['done', 'cancelled'].includes(issue.state)) return false;
  if (!issue.updatedAt) return false;
  const ageMs = new Date(nowIso).getTime() - new Date(issue.updatedAt).getTime();
  return ageMs >= STALE_ISSUE_DAYS * 24 * 60 * 60 * 1000;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
