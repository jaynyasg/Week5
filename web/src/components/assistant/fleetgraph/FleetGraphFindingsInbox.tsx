import type { FleetGraphDelivery, FleetGraphFindingSummary } from '@ship/shared';
import { cn } from '@/lib/cn';

interface FleetGraphFindingsInboxProps {
  findings: FleetGraphFindingSummary[];
  deliveryByFindingId: Map<string, FleetGraphDelivery>;
  loading: boolean;
  error: unknown;
  selectedFindingId: string | null;
  onSelect: (finding: FleetGraphFindingSummary) => void;
}

export function FleetGraphFindingsInbox({
  findings,
  deliveryByFindingId,
  loading,
  error,
  selectedFindingId,
  onSelect,
}: FleetGraphFindingsInboxProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[72px] rounded-md border border-border bg-card/70" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="px-4 py-3 text-sm text-red-200">FleetGraph findings could not load.</div>;
  }

  if (findings.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted">No FleetGraph findings.</div>;
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      {findings.map((finding) => {
        const delivery = deliveryByFindingId.get(finding.id);
        const unread = delivery?.status === 'unread';
        const selected = selectedFindingId === finding.id;
        return (
          <button
            key={finding.id}
            type="button"
            onClick={() => onSelect(finding)}
            className={cn(
              'min-h-[72px] rounded-md border px-3 py-2 text-left transition-colors',
              selected ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/60',
            )}
            aria-pressed={selected}
          >
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', unread ? severityDot(finding.severity) : 'bg-muted/40')} />
              <span className="truncate text-sm font-medium text-foreground">{finding.title}</span>
              <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[11px] uppercase', severityTone(finding.severity))}>
                {finding.severity}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{finding.summary}</p>
          </button>
        );
      })}
    </div>
  );
}

function severityDot(severity: FleetGraphFindingSummary['severity']): string {
  if (severity === 'critical' || severity === 'high') return 'bg-red-400';
  if (severity === 'medium') return 'bg-yellow-300';
  return 'bg-accent';
}

function severityTone(severity: FleetGraphFindingSummary['severity']): string {
  if (severity === 'critical' || severity === 'high') return 'bg-red-500/15 text-red-200';
  if (severity === 'medium') return 'bg-yellow-500/15 text-yellow-100';
  return 'bg-accent/15 text-accent';
}
