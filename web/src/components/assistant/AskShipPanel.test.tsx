import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistant } from '@/hooks/useAssistant';
import { AskShipPanel } from './AskShipPanel';

vi.mock('@/hooks/useAssistant', () => ({
  useAssistant: vi.fn(),
}));

vi.mock('./fleetgraph/FleetGraphPanel', () => ({
  FleetGraphPanel: () => <div>FleetGraph drawer body</div>,
}));

const useAssistantMock = vi.mocked(useAssistant);

describe('AskShipPanel', () => {
  beforeEach(() => {
    useAssistantMock.mockReturnValue(assistantState());
  });

  it('uses the existing drawer surface as a full-width mobile FleetGraph panel', () => {
    render(
      <AskShipPanel
        open
        onOpenChange={() => {}}
        mode="fleetgraph"
        onModeChange={() => {}}
        fleetGraphUnreadCount={2}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Ask Ship' });
    expect(dialog).toHaveClass('w-full');
    expect(dialog).toHaveClass('sm:max-w-[420px]');
    expect(dialog).not.toHaveClass('max-w-[420px]');

    const tablist = within(dialog).getByRole('tablist', { name: 'Assistant mode' });
    expect(tablist).toHaveClass('shrink-0');
    expect(within(tablist).getByRole('tab', { name: /FleetGraph/ })).toHaveAttribute('aria-selected', 'true');
  });
});

function assistantState(): ReturnType<typeof useAssistant> {
  return {
    status: {
      enabled: true,
      available: true,
      provider: 'mock',
      model: 'mock-assistant',
      missingConfiguration: [],
      limits: {
        maxMessageChars: 4000,
        maxHistoryMessages: 12,
        maxContextChunks: 8,
      },
      uploadIndexing: {
        enabled: false,
        supportedMimeTypes: [],
        maxExtractionBytes: 0,
        statuses: [],
      },
    },
    statusLoading: false,
    statusError: null,
    messages: [],
    send: vi.fn(),
    sending: false,
    sendError: null,
    reset: vi.fn(),
  };
}
