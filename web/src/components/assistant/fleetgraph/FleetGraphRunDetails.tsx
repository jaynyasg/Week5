import type { FleetGraphRunSummary } from '@ship/shared';

interface FleetGraphRunDetailsProps {
  run?: FleetGraphRunSummary;
  loading: boolean;
}

export function FleetGraphRunDetails({ run, loading }: FleetGraphRunDetailsProps) {
  if (loading) {
    return <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted">Loading run...</div>;
  }

  if (!run) return null;

  return (
    <details className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted">
      <summary className="cursor-pointer text-sm font-medium text-foreground">Run details</summary>
      <dl className="mt-2 grid grid-cols-[92px_1fr] gap-x-2 gap-y-1">
        <dt>Status</dt>
        <dd className="text-foreground">{run.status}</dd>
        <dt>Mode</dt>
        <dd className="text-foreground">{run.mode}</dd>
        <dt>Model</dt>
        <dd className="text-foreground">{run.model ?? 'unknown'}</dd>
        <dt>Cost</dt>
        <dd className="text-foreground">{run.estimatedCostUsd === null ? 'unknown' : `$${run.estimatedCostUsd.toFixed(4)}`}</dd>
      </dl>
      {run.langsmithTraceUrl ? (
        <a
          href={run.langsmithTraceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-accent hover:underline"
        >
          LangSmith trace
        </a>
      ) : null}
    </details>
  );
}
