import { recordToEvidence } from './context.js';
import type {
  FleetGraphContext,
  FleetGraphFindingCandidate,
  FleetGraphIssueRef,
  FleetGraphRecordRef,
} from './types.js';

const STALE_ISSUE_DAYS = 7;
const WORKLOAD_IMBALANCE_MIN_ACTIVE_ISSUES = 4;
const WORKLOAD_IMBALANCE_MIN_ESTIMATED_HOURS = 24;
const WORKLOAD_IMBALANCE_RATIO = 2;

export function detectFleetGraphFindings(context: FleetGraphContext): FleetGraphFindingCandidate[] {
  return [
    detectMissingApprovedWeekPlan(context),
    detectChangedApprovedWeekPlan(context),
    detectMissingOwnership(context),
    detectStaleIssue(context),
    detectProjectChurn(context),
    detectOverdueMilestone(context),
    detectWorkloadImbalance(context),
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

export function detectOverdueMilestone(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const target = context.project ?? context.week;
  if (!target) return null;

  const status = readString(target.properties.status)
    ?? readString(target.properties.project_status)
    ?? readString(target.properties.sprint_status);
  if (status && isClosedStatus(status)) return null;

  const dueDate = readMilestoneDate(target);
  if (!dueDate) return null;

  const now = new Date(context.now);
  if (Number.isNaN(now.getTime()) || dueDate >= startOfDay(now)) return null;

  const daysLate = Math.max(1, daysBetween(dueDate, now));
  const ownerUserId = readString(target.properties.owner_id)
    ?? readString(target.properties.accountable_id);

  return {
    key: `overdue-milestone:${target.id}:${dueDate.toISOString().slice(0, 10)}`,
    title: `Milestone overdue: ${target.title}`,
    severity: daysLate >= 7 ? 'high' : 'medium',
    kind: 'stale_commitment',
    confidence: 0.82,
    summary: `${target.title} is ${daysLate} day${daysLate === 1 ? '' : 's'} past its target date.`,
    rationale: 'FleetGraph raises this when an active project or week has a target date in the past and has not been closed.',
    targetDocumentId: target.id,
    targetDocumentType: target.documentType,
    ownerUserId,
    evidence: [
      recordToEvidence(target, `Target date ${dueDate.toISOString().slice(0, 10)} is overdue by ${daysLate} day${daysLate === 1 ? '' : 's'}.`),
    ],
  };
}

export function detectWorkloadImbalance(context: FleetGraphContext): FleetGraphFindingCandidate | null {
  const activeIssues = context.issues.filter((issue) => !isClosedStatus(issue.state));
  const assigneeLoads = new Map<string, { issues: FleetGraphIssueRef[]; estimatedHours: number }>();

  for (const issue of activeIssues) {
    if (!issue.assigneeId) continue;
    const load = assigneeLoads.get(issue.assigneeId) ?? { issues: [], estimatedHours: 0 };
    load.issues.push(issue);
    load.estimatedHours += readIssueEstimate(issue);
    assigneeLoads.set(issue.assigneeId, load);
  }

  const rankedLoads = [...assigneeLoads.entries()]
    .map(([assigneeId, load]) => ({ assigneeId, ...load }))
    .sort((left, right) => right.estimatedHours - left.estimatedHours || right.issues.length - left.issues.length);
  const topLoad = rankedLoads[0];
  if (!topLoad) return null;

  const otherLoads = rankedLoads.slice(1);
  const comparisonLoad = otherLoads[0]?.estimatedHours ?? 0;
  const isLargeEnough = topLoad.issues.length >= WORKLOAD_IMBALANCE_MIN_ACTIVE_ISSUES
    || topLoad.estimatedHours >= WORKLOAD_IMBALANCE_MIN_ESTIMATED_HOURS;
  const isImbalanced = comparisonLoad === 0
    ? topLoad.issues.length >= WORKLOAD_IMBALANCE_MIN_ACTIVE_ISSUES
    : topLoad.estimatedHours >= comparisonLoad * WORKLOAD_IMBALANCE_RATIO;
  if (!isLargeEnough || !isImbalanced) return null;

  const fallbackIssue = topLoad.issues[0];
  if (!fallbackIssue) return null;
  const target = context.project ?? context.week ?? fallbackIssue;
  const estimatedLabel = Number.isInteger(topLoad.estimatedHours)
    ? String(topLoad.estimatedHours)
    : topLoad.estimatedHours.toFixed(1);

  return {
    key: `workload-imbalance:${target.id}:${topLoad.assigneeId}`,
    title: `Workload imbalance: ${topLoad.assigneeId}`,
    severity: topLoad.estimatedHours >= 40 || topLoad.issues.length >= 6 ? 'high' : 'medium',
    kind: 'delivery_conflict',
    confidence: 0.76,
    summary: `${topLoad.assigneeId} owns ${topLoad.issues.length} active issue${topLoad.issues.length === 1 ? '' : 's'} totaling about ${estimatedLabel} hours.`,
    rationale: 'FleetGraph compares open issue ownership and estimated effort so an overloaded owner can be reviewed before delivery slips.',
    targetDocumentId: target.id,
    targetDocumentType: target.documentType,
    ownerUserId: topLoad.assigneeId,
    evidence: [
      recordToEvidence(target, `Highest assigned load is ${topLoad.issues.length} active issue${topLoad.issues.length === 1 ? '' : 's'} totaling about ${estimatedLabel} hours.`),
      ...topLoad.issues.slice(0, 3).map((issue) => {
        const estimate = readIssueEstimate(issue);
        return recordToEvidence(issue, `Assigned issue contributing ${estimate} estimated hour${estimate === 1 ? '' : 's'}.`);
      }),
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
  if (!issue.state || isClosedStatus(issue.state)) return false;
  if (!issue.updatedAt) return false;
  const ageMs = new Date(nowIso).getTime() - new Date(issue.updatedAt).getTime();
  return ageMs >= STALE_ISSUE_DAYS * 24 * 60 * 60 * 1000;
}

function isClosedStatus(status: unknown): boolean {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return ['done', 'completed', 'complete', 'cancelled', 'canceled', 'archived', 'resolved', 'closed'].includes(normalized);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readIssueEstimate(issue: FleetGraphIssueRef): number {
  return readNumber(issue.properties.estimate_hours)
    ?? readNumber(issue.properties.estimated_hours)
    ?? readNumber(issue.properties.estimate)
    ?? readNumber(issue.properties.points)
    ?? 1;
}

function readMilestoneDate(record: FleetGraphRecordRef): Date | null {
  return readDate(record.properties.target_date)
    ?? readDate(record.properties.due_date)
    ?? readDate(record.properties.planned_end_date)
    ?? readDate(record.properties.end_date);
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start: Date, end: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / dayMs);
}
