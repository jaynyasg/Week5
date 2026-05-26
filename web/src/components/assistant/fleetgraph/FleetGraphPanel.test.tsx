import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FleetGraphFindingDetail, FleetGraphFindingSummary, FleetGraphRunSummary } from '@ship/shared';
import { useFleetGraph } from '@/hooks/useFleetGraph';
import { FleetGraphPanel } from './FleetGraphPanel';

vi.mock('@/hooks/useFleetGraph', () => ({
  useFleetGraph: vi.fn(),
}));

const useFleetGraphMock = vi.mocked(useFleetGraph);

describe('FleetGraphPanel', () => {
  afterEach(() => {
    useFleetGraphMock.mockReset();
    vi.useRealTimers();
  });

  it('renders delivered findings and reports unread count', async () => {
    const onUnreadCountChange = vi.fn();
    const selectFinding = vi.fn();
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      findings: [findingSummary],
      deliveryByFindingId: new Map([[findingSummary.id, {
        id: 'delivery-1',
        findingDocumentId: findingSummary.id,
        userId: 'user-1',
        status: 'unread',
        deliveredAt: '2026-05-25T12:00:00.000Z',
        readAt: null,
        dismissedAt: null,
        snoozedUntil: null,
      }]]),
      unreadCount: 1,
      selectFinding,
    }));

    render(<FleetGraphPanel onUnreadCountChange={onUnreadCountChange} />);

    const row = screen.getByRole('button', { name: /Week plan needs approval/ });
    expect(row).toBeInTheDocument();
    expect(row).toHaveAccessibleName(/unread high FleetGraph finding/i);
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenCalledWith(1));

    fireEvent.click(row);
    expect(selectFinding).toHaveBeenCalledWith(findingSummary);
  });

  it('renders selected finding action proposals and sends decisions', () => {
    const decideAction = vi.fn();
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFinding: findingDetail,
      decideAction,
    }));

    render(<FleetGraphPanel />);

    expect(screen.getByText('request update')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(decideAction).toHaveBeenCalledWith('proposal-1', {
      status: 'approved',
      note: undefined,
    });
  });

  it('renders empty, error, and unavailable inbox states', () => {
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      findingsLoading: true,
    }));
    const { rerender } = render(<FleetGraphPanel />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Loading FleetGraph findings.');

    useFleetGraphMock.mockReturnValue(fleetGraphState());
    rerender(<FleetGraphPanel />);

    expect(screen.getByRole('status')).toHaveTextContent('No FleetGraph findings.');

    useFleetGraphMock.mockReturnValue(fleetGraphState({
      findingsError: new Error('network'),
    }));
    rerender(<FleetGraphPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('FleetGraph findings could not load.');

    useFleetGraphMock.mockReturnValue(fleetGraphState({
      status: {
        ...fleetGraphState().status!,
        available: false,
        missingConfiguration: ['OPENAI_API_KEY'],
      },
    }));
    rerender(<FleetGraphPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('FleetGraph is unavailable.');
    expect(screen.getByText('Missing OPENAI_API_KEY')).toBeInTheDocument();
    expect(screen.getByLabelText('FleetGraph message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send FleetGraph message' })).toBeDisabled();

    useFleetGraphMock.mockReturnValue(fleetGraphState({
      sendError: new Error('failed'),
    }));
    rerender(<FleetGraphPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('FleetGraph could not complete that request.');
  });

  it('renders selected finding loading and empty detail states', () => {
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFindingLoading: true,
    }));
    const { rerender } = render(<FleetGraphPanel />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading finding...');

    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFinding: undefined,
      selectedFindingLoading: false,
    }));
    rerender(<FleetGraphPanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Select a FleetGraph finding.');
  });

  it('snoozes, dismisses, and labels missing trace details for a selected finding', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00.000Z'));
    const updateSelectedDelivery = vi.fn();
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFinding: findingDetail,
      selectedRun: runSummary,
      updateSelectedDelivery,
    }));

    render(<FleetGraphPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }));
    expect(updateSelectedDelivery).toHaveBeenCalledWith(
      'snoozed',
      '2026-05-26T12:00:00.000Z',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(updateSelectedDelivery).toHaveBeenCalledWith('dismissed');
    expect(screen.getByText('No LangSmith trace recorded.')).toBeInTheDocument();
  });

  it('shows missing evidence and submits rejected action decisions with notes', () => {
    const decideAction = vi.fn();
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFinding: {
        ...findingDetail,
        evidence: [],
      },
      decisionError: new Error('denied'),
      decideAction,
    }));

    render(<FleetGraphPanel />);

    expect(screen.getByText('No evidence attached.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Action update failed.');

    fireEvent.change(screen.getByLabelText('FleetGraph action decision note'), {
      target: { value: 'Needs more context' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(decideAction).toHaveBeenCalledWith('proposal-1', {
      status: 'rejected',
      note: 'Needs more context',
    });
  });

  it('renders a LangSmith trace link when run metadata includes one', () => {
    useFleetGraphMock.mockReturnValue(fleetGraphState({
      selectedFindingId: findingSummary.id,
      selectedFinding: findingDetail,
      selectedRun: {
        ...runSummary,
        langsmithTraceUrl: 'https://smith.langchain.com/public/trace-1/r',
      },
    }));

    render(<FleetGraphPanel />);

    fireEvent.click(screen.getByText('Run details'));
    expect(screen.getByRole('link', { name: 'LangSmith trace' })).toHaveAttribute(
      'href',
      'https://smith.langchain.com/public/trace-1/r',
    );
  });
});

function fleetGraphState(overrides: Partial<ReturnType<typeof useFleetGraph>> = {}): ReturnType<typeof useFleetGraph> {
  return {
    status: {
      enabled: true,
      available: true,
      provider: 'mock',
      model: 'mock-fleetgraph',
      missingConfiguration: [],
      proactive: {
        enabled: true,
        sweepIntervalMs: 60000,
        maxEventsPerSweep: 25,
      },
      limits: {
        maxMessageChars: 4000,
        maxHistoryMessages: 12,
        maxFindingsPerRun: 10,
      },
      observability: {
        tracesEnabled: false,
        missingConfiguration: [],
      },
    },
    statusLoading: false,
    statusError: null,
    findings: [],
    deliveries: [],
    deliveryByFindingId: new Map(),
    findingsLoading: false,
    findingsError: null,
    unreadCount: 0,
    selectedFindingId: null,
    selectedFinding: undefined,
    selectedFindingLoading: false,
    selectedRun: undefined,
    selectedRunLoading: false,
    messages: [],
    send: vi.fn(),
    sending: false,
    sendError: null,
    selectFinding: vi.fn(),
    clearSelectedFinding: vi.fn(),
    updateSelectedDelivery: vi.fn(),
    updatingDelivery: false,
    decideAction: vi.fn(),
    decidingAction: false,
    decisionError: null,
    refresh: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

const findingSummary: FleetGraphFindingSummary = {
  id: 'finding-1',
  title: 'Week plan needs approval',
  status: 'open',
  severity: 'high',
  kind: 'planning_gap',
  confidence: 0.92,
  summary: 'The active week does not have an approved plan.',
  targetDocumentId: 'doc-1',
  targetDocumentType: 'sprint',
  ownerUserId: 'user-1',
  createdAt: '2026-05-25T12:00:00.000Z',
  updatedAt: '2026-05-25T12:00:00.000Z',
};

const findingDetail: FleetGraphFindingDetail = {
  ...findingSummary,
  rationale: 'FleetGraph only surfaces this when the week is active.',
  evidence: [{
    sourceType: 'week',
    sourceId: 'doc-1',
    title: 'Week 5',
    excerpt: 'Active week found without an approved weekly plan.',
  }],
  proposals: [{
    id: 'proposal-1',
    findingDocumentId: 'finding-1',
    runId: 'run-1',
    proposedAction: 'request_update',
    targetDocumentId: 'doc-1',
    payload: { reason: 'approval_needed' },
    status: 'pending',
    requestedByActor: 'fleetgraph',
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    error: null,
    createdAt: '2026-05-25T12:00:00.000Z',
    updatedAt: '2026-05-25T12:00:00.000Z',
  }],
  runId: 'run-1',
  firstDetectedAt: '2026-05-25T12:00:00.000Z',
  lastObservedAt: '2026-05-25T12:00:00.000Z',
  resolvedAt: null,
  dismissedReason: null,
};

const runSummary: FleetGraphRunSummary = {
  id: 'run-1',
  mode: 'proactive',
  triggerType: 'document.updated',
  triggerId: 'doc-1',
  threadId: 'fleetgraph:workspace-1:proactive:doc-1',
  status: 'completed',
  provider: 'mock',
  model: 'mock-fleetgraph',
  inputTokens: 1200,
  outputTokens: 280,
  estimatedCostUsd: 0.000348,
  langsmithTraceUrl: null,
  metadata: { findingCount: 1 },
  error: null,
  createdAt: '2026-05-25T12:00:00.000Z',
  completedAt: '2026-05-25T12:00:03.000Z',
};
