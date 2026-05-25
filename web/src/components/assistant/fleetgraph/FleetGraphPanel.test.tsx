import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FleetGraphFindingDetail, FleetGraphFindingSummary } from '@ship/shared';
import { useFleetGraph } from '@/hooks/useFleetGraph';
import { FleetGraphPanel } from './FleetGraphPanel';

vi.mock('@/hooks/useFleetGraph', () => ({
  useFleetGraph: vi.fn(),
}));

const useFleetGraphMock = vi.mocked(useFleetGraph);

describe('FleetGraphPanel', () => {
  afterEach(() => {
    useFleetGraphMock.mockReset();
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

    expect(screen.getByRole('button', { name: /Week plan needs approval/ })).toBeInTheDocument();
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenCalledWith(1));

    fireEvent.click(screen.getByRole('button', { name: /Week plan needs approval/ }));
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
