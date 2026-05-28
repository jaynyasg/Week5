import { useEffect } from 'react';
import type {
  AssistantRouteContext,
  FleetGraphNotificationPreferences,
  FleetGraphNotificationPreferencesUpdateRequest,
  FleetGraphToastMinSeverity,
} from '@ship/shared';
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

      <FleetGraphNotificationControls
        preferences={fleetGraph.notificationPreferences}
        loading={fleetGraph.notificationPreferencesLoading}
        updating={fleetGraph.updatingNotificationPreferences}
        error={fleetGraph.notificationPreferencesUpdateError}
        onChange={fleetGraph.updateNotificationPreferences}
      />

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

const TOAST_THRESHOLD_OPTIONS: Array<{ value: FleetGraphToastMinSeverity; label: string }> = [
  { value: 'high', label: 'High+' },
  { value: 'critical', label: 'Critical' },
  { value: 'medium', label: 'Medium+' },
  { value: 'low', label: 'Low+' },
  { value: 'info', label: 'All' },
  { value: 'off', label: 'Off' },
];

const DEFAULT_NOTIFICATION_PREFERENCES: FleetGraphNotificationPreferences = {
  toastMinSeverity: 'high',
  toastActionRequired: true,
  showUnreadBadge: true,
  updatedAt: null,
};

interface FleetGraphNotificationControlsProps {
  preferences?: FleetGraphNotificationPreferences;
  loading: boolean;
  updating: boolean;
  error: Error | null;
  onChange: (preferences: FleetGraphNotificationPreferencesUpdateRequest) => void;
}

function FleetGraphNotificationControls({
  preferences,
  loading,
  updating,
  error,
  onChange,
}: FleetGraphNotificationControlsProps) {
  const current = preferences ?? DEFAULT_NOTIFICATION_PREFERENCES;
  const disabled = loading || updating;

  return (
    <div className="border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="text-xs font-medium text-muted">Notifications</div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Toasts
          <select
            aria-label="FleetGraph toast threshold"
            value={current.toastMinSeverity}
            disabled={disabled}
            onChange={(event) => onChange({
              toastMinSeverity: event.target.value as FleetGraphToastMinSeverity,
            })}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {TOAST_THRESHOLD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={current.toastActionRequired}
            disabled={disabled}
            onChange={(event) => onChange({ toastActionRequired: event.target.checked })}
            className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          Toast action-required findings
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={current.showUnreadBadge}
            disabled={disabled}
            onChange={(event) => onChange({ showUnreadBadge: event.target.checked })}
            className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
          />
          Show unread badge
        </label>
        {updating ? <span className="text-xs text-muted">Saving...</span> : null}
      </div>
      {error ? (
        <div role="alert" className="mt-2 text-xs text-red-200">
          FleetGraph notification rules could not save.
        </div>
      ) : null}
    </div>
  );
}
