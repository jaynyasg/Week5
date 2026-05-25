import { useEffect } from 'react';
import type { AssistantRouteContext } from '@ship/shared';
import { useAssistant } from '@/hooks/useAssistant';
import { cn } from '@/lib/cn';
import { AssistantComposer } from './AssistantComposer';
import { AssistantMessages } from './AssistantMessages';
import { AssistantUpload } from './AssistantUpload';
import { FleetGraphPanel } from './fleetgraph/FleetGraphPanel';

export type AssistantPanelMode = 'ask' | 'fleetgraph';

interface AskShipPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: AssistantRouteContext;
  mode: AssistantPanelMode;
  onModeChange: (mode: AssistantPanelMode) => void;
  fleetGraphUnreadCount?: number;
  onFleetGraphUnreadCountChange?: (count: number) => void;
}

export function AskShipPanel({
  open,
  onOpenChange,
  context,
  mode,
  onModeChange,
  fleetGraphUnreadCount = 0,
  onFleetGraphUnreadCountChange,
}: AskShipPanelProps) {
  const assistant = useAssistant(context);
  const unavailable = !assistant.statusLoading && assistant.status?.available === false;
  const disabled = assistant.sending || unavailable || assistant.statusLoading;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-border bg-background shadow-2xl"
      role="dialog"
      aria-label="Ask Ship"
      aria-modal="false"
    >
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Assistant</h2>
          <p className="text-xs text-muted">{mode === 'ask' ? statusText(assistant.statusLoading, assistant.status?.available) : 'FleetGraph'}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/50 hover:text-foreground"
          aria-label="Close Ask Ship"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex border-b border-border p-2" role="tablist" aria-label="Assistant mode">
        <TabButton active={mode === 'ask'} onClick={() => onModeChange('ask')}>
          Ask Ship
        </TabButton>
        <TabButton active={mode === 'fleetgraph'} onClick={() => onModeChange('fleetgraph')} badgeCount={fleetGraphUnreadCount}>
          FleetGraph
        </TabButton>
      </div>

      {mode === 'ask' ? (
        <>
          {unavailable && (
            <div className="m-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
              Ask Ship is unavailable.
              {assistant.status?.missingConfiguration.length ? (
                <span className="block text-xs text-yellow-100/80">
                  Missing {assistant.status.missingConfiguration.join(', ')}
                </span>
              ) : null}
            </div>
          )}

          {assistant.sendError && (
            <div className="m-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              Ask Ship could not complete that request.
            </div>
          )}

          <div className={cn('flex min-h-0 flex-1 flex-col', assistant.messages.length === 0 && 'justify-end')}>
            <AssistantMessages messages={assistant.messages} sending={assistant.sending} />
            {assistant.status?.uploadIndexing.enabled ? (
              <AssistantUpload documentId={context?.documentId} disabled={disabled} />
            ) : null}
            <AssistantComposer
              disabled={disabled}
              maxLength={assistant.status?.limits.maxMessageChars}
              onSend={assistant.send}
            />
          </div>
        </>
      ) : (
        <FleetGraphPanel
          context={context}
          onUnreadCountChange={onFleetGraphUnreadCountChange}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  badgeCount = 0,
  children,
  onClick,
}: {
  active: boolean;
  badgeCount?: number;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative min-h-8 flex-1 rounded-md px-3 text-sm font-medium transition-colors',
        active ? 'bg-border text-foreground' : 'text-muted hover:bg-border/50 hover:text-foreground',
      )}
    >
      {children}
      {badgeCount > 0 ? (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] text-white">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      ) : null}
    </button>
  );
}

function statusText(loading: boolean, available?: boolean): string {
  if (loading) return 'Checking availability';
  if (available) return 'Ready';
  return 'Unavailable';
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
