import { useState } from 'react';
import type { FleetGraphActionDecisionRequest, FleetGraphActionProposal as FleetGraphActionProposalType } from '@ship/shared';
import { cn } from '@/lib/cn';

interface FleetGraphActionProposalProps {
  proposal: FleetGraphActionProposalType;
  deciding: boolean;
  error: unknown;
  onDecision: (id: string, decision: FleetGraphActionDecisionRequest) => void;
}

export function FleetGraphActionProposal({ proposal, deciding, error, onDecision }: FleetGraphActionProposalProps) {
  const [note, setNote] = useState('');
  const pending = proposal.status === 'pending';

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">{actionLabel(proposal.proposedAction)}</h4>
        <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[11px] uppercase', statusTone(proposal.status))}>
          {proposal.status}
        </span>
      </div>
      {proposal.targetDocumentId ? (
        <p className="mt-1 truncate text-xs text-muted">Target {proposal.targetDocumentId}</p>
      ) : null}
      <pre className="mt-2 max-h-24 overflow-auto rounded border border-border bg-background p-2 text-xs text-muted">
        {JSON.stringify(proposal.payload, null, 2)}
      </pre>
      {pending ? (
        <>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="mt-2 min-h-10 w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
            placeholder="Decision note"
            aria-label="FleetGraph action decision note"
            maxLength={1000}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={deciding}
              onClick={() => onDecision(proposal.id, { status: 'approved', note: note || undefined })}
              className="min-h-11 flex-1 rounded-md bg-accent px-3 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted sm:min-h-9"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={deciding}
              onClick={() => onDecision(proposal.id, { status: 'rejected', note: note || undefined })}
              className="min-h-11 flex-1 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-border/50 disabled:cursor-not-allowed disabled:text-muted sm:min-h-9"
            >
              Reject
            </button>
          </div>
        </>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-200">Action update failed.</p> : null}
    </section>
  );
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

function statusTone(status: FleetGraphActionProposalType['status']): string {
  if (status === 'approved') return 'bg-green-500/15 text-green-200';
  if (status === 'rejected' || status === 'failed') return 'bg-red-500/15 text-red-200';
  return 'bg-yellow-500/15 text-yellow-100';
}
