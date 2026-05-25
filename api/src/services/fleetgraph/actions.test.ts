import { describe, expect, it } from 'vitest';
import {
  applyHumanDecision,
  collectActionProposalCandidates,
  createHumanApprovalInterrupt,
} from './actions.js';
import type { FleetGraphFindingCandidate } from './types.js';

describe('FleetGraph action proposals', () => {
  it('collects action proposal candidates without inventing side effects', () => {
    const findings = [findingCandidate()];

    expect(collectActionProposalCandidates(findings)).toEqual([findings[0]!.actionProposal]);
  });

  it('creates an interrupt payload only for proposal-backed findings', () => {
    const finding = findingCandidate();

    expect(createHumanApprovalInterrupt(finding)).toMatchObject({
      kind: 'action_proposal',
      proposal: finding.actionProposal,
      finding,
    });
    expect(createHumanApprovalInterrupt({ ...finding, actionProposal: undefined })).toBeNull();
  });

  it('records human decisions in proposal payloads for resume handling', () => {
    const proposal = findingCandidate().actionProposal!;

    expect(applyHumanDecision(proposal, { status: 'rejected', note: 'Already handled' })).toMatchObject({
      payload: {
        reason: 'approved_plan_changed',
        decision: {
          status: 'rejected',
          note: 'Already handled',
        },
      },
    });
  });
});

function findingCandidate(): FleetGraphFindingCandidate {
  return {
    key: 'approved-plan-changed:plan-1',
    title: 'Approved plan changed',
    severity: 'medium',
    kind: 'scope_drift',
    confidence: 0.9,
    summary: 'Plan changed after approval.',
    rationale: 'Needs re-review.',
    targetDocumentId: 'plan-1',
    targetDocumentType: 'weekly_plan',
    ownerUserId: 'owner-1',
    evidence: [],
    actionProposal: {
      proposedAction: 'request_update',
      targetDocumentId: 'plan-1',
      payload: {
        reason: 'approved_plan_changed',
      },
      reason: 'Ask for re-review.',
    },
  };
}
