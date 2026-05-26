import { useEffect } from 'react';
import type { AssistantRouteContext } from '@ship/shared';
import { useFleetGraph } from '@/hooks/useFleetGraph';
import { cn } from '@/lib/cn';
import { AssistantMessages } from '../AssistantMessages';
import { FleetGraphComposer } from './FleetGraphComposer';
import { FleetGraphFindingDetail } from './FleetGraphFindingDetail';
import { FleetGraphFindingsInbox } from './FleetGraphFindingsInbox';

interface FleetGraphPanelProps {
  context?: AssistantRouteContext;
  onUnreadCountChange?: (count: number) => void;
}

export function FleetGraphPanel({ context, onUnreadCountChange }: FleetGraphPanelProps) {
  const fleetGraph = useFleetGraph(context);
  const unavailable = !fleetGraph.statusLoading && fleetGraph.status?.available === false;
  const disabled = fleetGraph.sending || unavailable || fleetGraph.statusLoading;

  useEffect(() => {
    onUnreadCountChange?.(fleetGraph.unreadCount);
  }, [fleetGraph.unreadCount, onUnreadCountChange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {unavailable ? (
        <div
          role="alert"
          className="m-4 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200"
        >
          FleetGraph is unavailable.
          {fleetGraph.status?.missingConfiguration.length ? (
            <span className="block text-xs text-yellow-100/80">
              Missing {fleetGraph.status.missingConfiguration.join(', ')}
            </span>
          ) : null}
        </div>
      ) : null}

      {fleetGraph.sendError ? (
        <div
          role="alert"
          className="m-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          FleetGraph could not complete that request.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(120px,0.6fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-border">
          {fleetGraph.selectedFindingId ? (
            <FleetGraphFindingDetail
              finding={fleetGraph.selectedFinding}
              loading={fleetGraph.selectedFindingLoading}
              run={fleetGraph.selectedRun}
              runLoading={fleetGraph.selectedRunLoading}
              updatingDelivery={fleetGraph.updatingDelivery}
              decidingAction={fleetGraph.decidingAction}
              decisionError={fleetGraph.decisionError}
              onBack={fleetGraph.clearSelectedFinding}
              onDeliveryUpdate={fleetGraph.updateSelectedDelivery}
              onDecision={fleetGraph.decideAction}
            />
          ) : (
            <FleetGraphFindingsInbox
              findings={fleetGraph.findings}
              deliveryByFindingId={fleetGraph.deliveryByFindingId}
              loading={fleetGraph.findingsLoading}
              error={fleetGraph.findingsError}
              selectedFindingId={fleetGraph.selectedFindingId}
              onSelect={fleetGraph.selectFinding}
            />
          )}
        </div>

        <div className={cn('flex min-h-0 flex-col', fleetGraph.messages.length === 0 && 'justify-end')}>
          <AssistantMessages
            messages={fleetGraph.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
            }))}
            sending={fleetGraph.sending}
          />
        </div>
      </div>

      <FleetGraphComposer
        disabled={disabled}
        maxLength={fleetGraph.status?.limits.maxMessageChars}
        findingId={fleetGraph.selectedFindingId ?? undefined}
        onSend={fleetGraph.send}
      />
    </div>
  );
}
