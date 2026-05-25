import type {
  FleetGraphActionType,
  FleetGraphFindingKind,
} from '@ship/shared';
import type { FleetGraphRunResult } from './types.js';

export interface FleetGraphEvalCase {
  id: string;
  expectedStatus: FleetGraphRunResult['status'];
  minFindings?: number;
  expectedFindingKinds?: FleetGraphFindingKind[];
  expectedProposalActions?: FleetGraphActionType[];
  requiredAnswerTerms?: string[];
  expectedCitationTitles?: string[];
}

export interface FleetGraphEvalCaseResult {
  id: string;
  passed: boolean;
  score: number;
  checks: {
    status: boolean;
    findingCount: boolean;
    findingKinds: boolean;
    proposalActions: boolean;
    answerTerms: boolean;
    citationTitles: boolean;
  };
  missingFindingKinds: FleetGraphFindingKind[];
  missingProposalActions: FleetGraphActionType[];
  missingAnswerTerms: string[];
  missingCitationTitles: string[];
}

export interface FleetGraphEvalReport {
  total: number;
  passed: number;
  score: number;
  cases: FleetGraphEvalCaseResult[];
}

export function evaluateFleetGraphRuns(
  cases: FleetGraphEvalCase[],
  results: Record<string, FleetGraphRunResult>,
): FleetGraphEvalReport {
  const evaluatedCases = cases.map((testCase) => evaluateFleetGraphRun(testCase, results[testCase.id]));
  const passed = evaluatedCases.filter((result) => result.passed).length;
  const score = evaluatedCases.length === 0
    ? 0
    : Number((evaluatedCases.reduce((sum, result) => sum + result.score, 0) / evaluatedCases.length).toFixed(3));

  return {
    total: evaluatedCases.length,
    passed,
    score,
    cases: evaluatedCases,
  };
}

export function evaluateFleetGraphRun(
  testCase: FleetGraphEvalCase,
  result: FleetGraphRunResult | undefined,
): FleetGraphEvalCaseResult {
  const findings = result?.state.findings ?? [];
  const proposals = result?.state.proposals ?? [];
  const answer = result?.state.answer?.content.toLowerCase() ?? '';
  const citationTitles = new Set((result?.state.answer?.citations ?? []).map((citation) => citation.title.toLowerCase()));

  const expectedFindingKinds = testCase.expectedFindingKinds ?? [];
  const expectedProposalActions = testCase.expectedProposalActions ?? [];
  const requiredAnswerTerms = testCase.requiredAnswerTerms ?? [];
  const expectedCitationTitles = testCase.expectedCitationTitles ?? [];

  const actualFindingKinds = new Set(findings.map((finding) => finding.kind));
  const actualProposalActions = new Set(proposals.map((proposal) => proposal.proposedAction));

  const missingFindingKinds = expectedFindingKinds.filter((kind) => !actualFindingKinds.has(kind));
  const missingProposalActions = expectedProposalActions.filter((action) => !actualProposalActions.has(action));
  const missingAnswerTerms = requiredAnswerTerms.filter((term) => !answer.includes(term.toLowerCase()));
  const missingCitationTitles = expectedCitationTitles.filter((title) => !citationTitles.has(title.toLowerCase()));

  const checks = {
    status: result?.status === testCase.expectedStatus,
    findingCount: findings.length >= (testCase.minFindings ?? 0),
    findingKinds: missingFindingKinds.length === 0,
    proposalActions: missingProposalActions.length === 0,
    answerTerms: missingAnswerTerms.length === 0,
    citationTitles: missingCitationTitles.length === 0,
  };

  const score = Object.values(checks).filter(Boolean).length / Object.keys(checks).length;

  return {
    id: testCase.id,
    passed: score === 1,
    score: Number(score.toFixed(3)),
    checks,
    missingFindingKinds,
    missingProposalActions,
    missingAnswerTerms,
    missingCitationTitles,
  };
}
