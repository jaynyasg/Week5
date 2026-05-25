import { interrupt } from '@langchain/langgraph';
import { applyHumanDecision, collectActionProposalCandidates, createHumanApprovalInterrupt } from './actions.js';
import { recordToEvidence } from './context.js';
import { detectFleetGraphFindings } from './detectors.js';
import type {
  FleetGraphContext,
  FleetGraphHumanInterrupt,
  FleetGraphRunResult,
  FleetGraphState,
} from './types.js';

export function runFleetGraphState(input: {
  context: FleetGraphContext;
  message?: string;
  decision?: { status: 'approved' | 'rejected'; note?: string };
}): FleetGraphRunResult {
  try {
    const findings = detectFleetGraphFindings(input.context);
    const proposals = collectActionProposalCandidates(findings);
    const firstProposalFinding = findings.find((finding) => finding.actionProposal);
    const interruptPayload = firstProposalFinding ? createHumanApprovalInterrupt(firstProposalFinding) : null;

    const state: FleetGraphState = {
      context: input.context,
      message: input.message,
      findings,
      proposals,
      answer: input.message ? answerFromContext(input.context, input.message) : undefined,
      decision: input.decision,
    };

    if (input.decision && proposals[0]) {
      state.proposals = [applyHumanDecision(proposals[0], input.decision), ...proposals.slice(1)];
      return {
        status: 'completed',
        state,
      };
    }

    if (interruptPayload) {
      state.interrupt = interruptPayload;
      return {
        status: 'interrupted',
        state,
      };
    }

    return {
      status: 'completed',
      state,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      state: {
        context: input.context,
        message: input.message,
        findings: [],
        proposals: [],
      },
    };
  }
}

export function interruptForActionProposal(
  payload: FleetGraphHumanInterrupt,
): { status: 'approved' | 'rejected'; note?: string } {
  return interrupt(payload);
}

function answerFromContext(context: FleetGraphContext, message: string): FleetGraphState['answer'] {
  const citations = [
    context.currentDocument ? recordToEvidence(context.currentDocument, 'Current document for this FleetGraph request.') : null,
    context.project ? recordToEvidence(context.project, 'Current project context.') : null,
    context.week ? recordToEvidence(context.week, 'Current week context.') : null,
    ...context.issues.slice(0, 3).map((issue) => recordToEvidence(issue, `Issue state: ${issue.state ?? 'unknown'}.`)),
  ].filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

  if (citations.length === 0) {
    return {
      status: 'no_context',
      content: 'I could not find enough Ship context to answer that FleetGraph question yet.',
      citations: [],
    };
  }

  const target = context.project ?? context.week ?? context.currentDocument;
  const activeIssueCount = context.issues.filter((issue) => issue.state && !['done', 'cancelled'].includes(issue.state)).length;
  const projectLabel = target ? ` for ${target.title}` : '';

  return {
    status: 'answered',
    content: `FleetGraph checked ${citations.length} Ship records${projectLabel}. ${activeIssueCount} active issue${activeIssueCount === 1 ? '' : 's'} are in scope for: ${message}`,
    citations,
  };
}
