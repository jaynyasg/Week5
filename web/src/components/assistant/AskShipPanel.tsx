import { useEffect } from 'react';
import type { AssistantRouteContext } from '@ship/shared';
import { useAssistant } from '@/hooks/useAssistant';
import { cn } from '@/lib/cn';
import { AssistantComposer } from './AssistantComposer';
import { AssistantMessages } from './AssistantMessages';
import { AssistantUpload } from './AssistantUpload';

interface AskShipPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: AssistantRouteContext;
}

export function AskShipPanel({ open, onOpenChange, context }: AskShipPanelProps) {
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
          <h2 className="text-sm font-semibold text-foreground">Ask Ship</h2>
          <p className="text-xs text-muted">{statusText(assistant.statusLoading, assistant.status?.available)}</p>
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
    </div>
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
