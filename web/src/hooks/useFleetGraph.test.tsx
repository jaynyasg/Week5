import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFleetGraphFindings,
  getFleetGraphNotificationPreferences,
  getFleetGraphStatus,
  sendFleetGraphMessage,
  updateFleetGraphNotificationPreferences,
} from '@/services/fleetgraph';
import { useFleetGraph } from './useFleetGraph';

vi.mock('@/services/fleetgraph', () => ({
  getFleetGraphStatus: vi.fn(),
  getFleetGraphFindings: vi.fn(),
  getFleetGraphFinding: vi.fn(),
  getFleetGraphRun: vi.fn(),
  getFleetGraphNotificationPreferences: vi.fn(),
  sendFleetGraphMessage: vi.fn(),
  updateFleetGraphDelivery: vi.fn(),
  updateFleetGraphNotificationPreferences: vi.fn(),
  decideFleetGraphAction: vi.fn(),
}));

const getFleetGraphStatusMock = vi.mocked(getFleetGraphStatus);
const getFleetGraphFindingsMock = vi.mocked(getFleetGraphFindings);
const getFleetGraphNotificationPreferencesMock = vi.mocked(getFleetGraphNotificationPreferences);
const sendFleetGraphMessageMock = vi.mocked(sendFleetGraphMessage);
const updateFleetGraphNotificationPreferencesMock = vi.mocked(updateFleetGraphNotificationPreferences);

describe('useFleetGraph', () => {
  beforeEach(() => {
    getFleetGraphNotificationPreferencesMock.mockResolvedValue(notificationPreferences);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads findings and computes unread delivery count', async () => {
    getFleetGraphStatusMock.mockResolvedValue(statusResponse);
    getFleetGraphFindingsMock.mockResolvedValue({
      findings: [findingSummary],
      deliveries: [{
        id: 'delivery-1',
        findingDocumentId: findingSummary.id,
        userId: 'user-1',
        status: 'unread',
        deliveredAt: '2026-05-25T12:00:00.000Z',
        readAt: null,
        dismissedAt: null,
        snoozedUntil: null,
      }],
    });

    const { result } = renderHook(() => useFleetGraph(), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(result.current.findings[0]?.title).toBe('Week plan needs approval');
  });

  it('loads findings with current route context', async () => {
    getFleetGraphStatusMock.mockResolvedValue(statusResponse);
    getFleetGraphFindingsMock.mockResolvedValue({ findings: [], deliveries: [] });

    const context = {
      path: '/documents/11111111-1111-4111-8111-111111111111',
      documentId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
    };
    renderHook(() => useFleetGraph(context), { wrapper: queryWrapper() });

    await waitFor(() => expect(getFleetGraphFindingsMock).toHaveBeenCalledWith(context));
  });

  it('sends chat with route context and appends the assistant response', async () => {
    getFleetGraphStatusMock.mockResolvedValue(statusResponse);
    getFleetGraphFindingsMock.mockResolvedValue({ findings: [], deliveries: [] });
    sendFleetGraphMessageMock.mockResolvedValue({
      status: 'answered',
      message: {
        id: 'message-1',
        role: 'assistant',
        content: 'FleetGraph checked 1 Ship record.',
        createdAt: '2026-05-25T12:00:00.000Z',
      },
      findings: [],
      proposals: [],
      citations: [],
      sourceCounts: {
        documents: 1,
        projects: 0,
        programs: 0,
        issues: 0,
        weeks: 0,
        timeline: 0,
        files: 0,
        total: 1,
      },
    });

    const context = { path: '/documents/doc-1', documentId: 'doc-1' };
    const { result } = renderHook(() => useFleetGraph(context), { wrapper: queryWrapper() });

    act(() => result.current.send('What changed?'));

    await waitFor(() => {
      expect(sendFleetGraphMessageMock.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
        message: 'What changed?',
        context,
      }));
    });
    await waitFor(() => expect(result.current.messages.at(-1)?.content).toBe('FleetGraph checked 1 Ship record.'));
  });

  it('updates notification preferences through the FleetGraph service', async () => {
    getFleetGraphStatusMock.mockResolvedValue(statusResponse);
    getFleetGraphFindingsMock.mockResolvedValue({ findings: [], deliveries: [] });
    updateFleetGraphNotificationPreferencesMock.mockResolvedValue({
      ...notificationPreferences,
      toastMinSeverity: 'medium',
      showUnreadBadge: false,
      updatedAt: '2026-05-25T12:05:00.000Z',
    });

    const { result } = renderHook(() => useFleetGraph(), { wrapper: queryWrapper() });

    await waitFor(() => expect(result.current.notificationPreferences?.toastMinSeverity).toBe('high'));
    act(() => result.current.updateNotificationPreferences({
      toastMinSeverity: 'medium',
      showUnreadBadge: false,
    }));

    await waitFor(() => {
      expect(updateFleetGraphNotificationPreferencesMock).toHaveBeenCalledWith({
        toastMinSeverity: 'medium',
        showUnreadBadge: false,
      });
    });
    await waitFor(() => {
      expect(result.current.notificationPreferences).toMatchObject({
        toastMinSeverity: 'medium',
        showUnreadBadge: false,
      });
    });
  });
});

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const statusResponse = {
  enabled: true,
  available: true,
  provider: 'mock' as const,
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
};

const findingSummary = {
  id: 'finding-1',
  title: 'Week plan needs approval',
  status: 'open' as const,
  severity: 'high' as const,
  kind: 'planning_gap' as const,
  confidence: 0.92,
  summary: 'The active week does not have an approved plan.',
  targetDocumentId: 'doc-1',
  targetDocumentType: 'sprint',
  ownerUserId: 'user-1',
  createdAt: '2026-05-25T12:00:00.000Z',
  updatedAt: '2026-05-25T12:00:00.000Z',
};

const notificationPreferences = {
  toastMinSeverity: 'high' as const,
  toastActionRequired: true,
  showUnreadBadge: true,
  updatedAt: null,
};
