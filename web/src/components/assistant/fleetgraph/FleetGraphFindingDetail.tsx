import type { FleetGraphFindingDetail as FleetGraphFindingDetailType, FleetGraphRunSummary } from '@ship/shared';
import { FleetGraphActionProposal } from './FleetGraphActionProposal';
import { FleetGraphRunDetails } from './FleetGraphRunDetails';

interface FleetGraphFindingDetailProps {
  finding?: FleetGraphFindingDetailType;
  loading: boolean;
  run?: FleetGraphRunSummary;
  runLoading: boolean;
  updatingDelivery: boolean;
  decidingAction: boolean;
  decisionError: unknown;
  onBack: () => void;
  onDeliveryUpdate: (status: 'read' | 'dismissed' | 'snoozed', snoozedUntil?: string) => void;
  onDecision: FleetGraphActionProposalProps['onDecision'];
}

type FleetGraphActionProposalProps = Parameters<typeof FleetGraphActionProposal>[0];

export function FleetGraphFindingDetail({
  finding,
  loading,
  run,
  runLoading,
  updatingDelivery,
  decidingAction,
  decisionError,
  onBack,
  onDeliveryUpdate,
  onDecision,
}: FleetGraphFindingDetailProps) {
  if (loading) {
    return <div className="px-4 py-3 text-sm text-muted">Loading finding...</div>;
  }

  if (!finding) {
    return <div className="px-4 py-3 text-sm text-muted">Select a FleetGraph finding.</div>;
  }

  return (
    <article className="flex flex-col gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center text-sm text-accent hover:underline"
      >
        Back
      </button>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">{finding.title}</h3>
          <span className="rounded bg-border px-1.5 py-0.5 text-[11px] uppercase text-muted">{finding.severity}</span>
        </div>
        <p className="mt-1 text-sm leading-6 text-muted">{finding.summary}</p>
      </div>
      <section>
        <h4 className="text-xs font-semibold uppercase text-muted">Rationale</h4>
        <p className="mt-1 text-sm leading-6 text-foreground">{finding.rationale}</p>
      </section>
      {finding.evidence.length ? (
        <section>
          <h4 className="text-xs font-semibold uppercase text-muted">Evidence</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {finding.evidence.map((item) => (
              <li key={`${item.sourceType}-${item.sourceId}`} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="text-sm font-medium text-foreground">{item.title}</div>
                <p className="mt-1 text-xs leading-5 text-muted">{item.excerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {finding.proposals.length ? (
        <div className="flex flex-col gap-2">
          {finding.proposals.map((proposal) => (
            <FleetGraphActionProposal
              key={proposal.id}
              proposal={proposal}
              deciding={decidingAction}
              error={decisionError}
              onDecision={onDecision}
            />
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={updatingDelivery}
          onClick={() => onDeliveryUpdate('snoozed', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())}
          className="min-h-9 flex-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-border/50 disabled:cursor-not-allowed disabled:text-muted"
        >
          Snooze
        </button>
        <button
          type="button"
          disabled={updatingDelivery}
          onClick={() => onDeliveryUpdate('dismissed')}
          className="min-h-9 flex-1 rounded-md border border-border px-3 text-sm text-foreground hover:bg-border/50 disabled:cursor-not-allowed disabled:text-muted"
        >
          Dismiss
        </button>
      </div>
      <FleetGraphRunDetails run={run} loading={runLoading} />
    </article>
  );
}
