import type {
  FleetGraphActionProposalCandidate,
  FleetGraphFindingCandidate,
  FleetGraphHumanInterrupt,
} from './types.js';

export function collectActionProposalCandidates(
  findings: FleetGraphFindingCandidate[],
): FleetGraphActionProposalCandidate[] {
  return findings
    .map((finding) => finding.actionProposal)
    .filter((proposal): proposal is FleetGraphActionProposalCandidate => Boolean(proposal));
}

export function createHumanApprovalInterrupt(
  finding: FleetGraphFindingCandidate,
): FleetGraphHumanInterrupt | null {
  if (!finding.actionProposal) return null;
  return {
    kind: 'action_proposal',
    proposal: finding.actionProposal,
    finding,
  };
}

export function applyHumanDecision(
  proposal: FleetGraphActionProposalCandidate,
  decision: { status: 'approved' | 'rejected'; note?: string },
): FleetGraphActionProposalCandidate {
  return {
    ...proposal,
    payload: {
      ...proposal.payload,
      decision,
    },
  };
}
