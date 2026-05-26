import { Annotation, Command, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import { applyHumanDecision, collectActionProposalCandidates, createHumanApprovalInterrupt } from './actions.js';
import { recordToEvidence } from './context.js';
import { detectFleetGraphFindings } from './detectors.js';
import type { FleetGraphRunnableConfig } from './tracing.js';
import type {
  FleetGraphActionProposalCandidate,
  FleetGraphContext,
  FleetGraphFindingCandidate,
  FleetGraphHumanInterrupt,
  FleetGraphRunResult,
  FleetGraphState,
} from './types.js';

type FleetGraphDecision = NonNullable<FleetGraphState['decision']>;
type FleetGraphAnswer = FleetGraphState['answer'];
type FleetGraphGraphOutput = Partial<FleetGraphState> & {
  __interrupt__?: Array<{ value?: FleetGraphHumanInterrupt }>;
};

const FleetGraphAnnotation = Annotation.Root({
  context: Annotation<FleetGraphContext>(),
  message: Annotation<string | undefined>(),
  findings: Annotation<FleetGraphFindingCandidate[]>(),
  proposals: Annotation<FleetGraphActionProposalCandidate[]>(),
  answer: Annotation<FleetGraphAnswer | undefined>(),
  interrupt: Annotation<FleetGraphHumanInterrupt | undefined>(),
  decision: Annotation<FleetGraphDecision | undefined>(),
});

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

export async function runFleetGraphWorkflow(input: {
  context: FleetGraphContext;
  config: FleetGraphRunnableConfig;
  checkpointer: unknown;
  message?: string;
  decision?: FleetGraphDecision;
}): Promise<FleetGraphRunResult> {
  try {
    const graph = compileFleetGraphWorkflow(input.checkpointer);
    const output = input.decision
      ? await graph.invoke(new Command({ resume: input.decision }), input.config)
      : await graph.invoke(initialGraphState(input), input.config);
    const state = normalizeGraphState(output as FleetGraphGraphOutput, input);
    const interruptPayload = readInterruptPayload(output as FleetGraphGraphOutput);

    if (interruptPayload && !input.decision) {
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

function compileFleetGraphWorkflow(checkpointer: unknown) {
  return new StateGraph(FleetGraphAnnotation)
    .addNode('detect', detectNode)
    .addNode('approval_gate', approvalGateNode)
    .addEdge(START, 'detect')
    .addEdge('detect', 'approval_gate')
    .addEdge('approval_gate', END)
    .compile({ checkpointer: checkpointer as never });
}

function detectNode(state: typeof FleetGraphAnnotation.State): Partial<typeof FleetGraphAnnotation.State> {
  const findings = detectFleetGraphFindings(state.context);
  return {
    findings,
    proposals: collectActionProposalCandidates(findings),
    answer: state.message ? answerFromContext(state.context, state.message) : undefined,
  };
}

function approvalGateNode(state: typeof FleetGraphAnnotation.State): Partial<typeof FleetGraphAnnotation.State> {
  if (state.decision && state.proposals[0]) {
    return {
      proposals: [applyHumanDecision(state.proposals[0], state.decision), ...state.proposals.slice(1)],
      decision: state.decision,
    };
  }

  const firstProposalFinding = state.findings.find((finding) => finding.actionProposal);
  const interruptPayload = firstProposalFinding ? createHumanApprovalInterrupt(firstProposalFinding) : null;
  if (!interruptPayload) return {};

  const decision = interruptForActionProposal(interruptPayload);
  return {
    interrupt: interruptPayload,
    decision,
    proposals: [
      applyHumanDecision(interruptPayload.proposal, decision),
      ...state.proposals.filter((proposal) => proposal !== interruptPayload.proposal),
    ],
  };
}

function initialGraphState(input: {
  context: FleetGraphContext;
  message?: string;
  decision?: FleetGraphDecision;
}): FleetGraphState {
  return {
    context: input.context,
    message: input.message,
    findings: [],
    proposals: [],
    decision: input.decision,
  };
}

function normalizeGraphState(
  output: FleetGraphGraphOutput,
  input: {
    context: FleetGraphContext;
    message?: string;
    decision?: FleetGraphDecision;
  },
): FleetGraphState {
  return {
    context: output.context ?? input.context,
    message: output.message ?? input.message,
    findings: output.findings ?? [],
    proposals: output.proposals ?? [],
    answer: output.answer,
    interrupt: output.interrupt,
    decision: output.decision ?? input.decision,
  };
}

function readInterruptPayload(output: FleetGraphGraphOutput): FleetGraphHumanInterrupt | undefined {
  return output.__interrupt__?.find((item) => item.value)?.value;
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
