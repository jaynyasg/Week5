import { useEffect, useState } from 'react';
import type {
  AssistantRouteContext,
  FleetGraphDetectorSetting,
  FleetGraphDetectorUpdateRequest,
  FleetGraphNotificationPreferences,
  FleetGraphNotificationPreferencesUpdateRequest,
  FleetGraphOpsResponse,
  FleetGraphReplayScenario,
  FleetGraphReplayScenarioCreateRequest,
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
  const [view, setView] = useState<FleetGraphPanelView>('findings');
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

      <FleetGraphPanelTabs
        view={view}
        onChange={setView}
        unreadCount={fleetGraph.unreadCount}
      />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(120px,0.6fr)]">
        <div className="min-h-0 overflow-y-auto border-b border-border">
          {view === 'findings' ? (
            fleetGraph.selectedFindingId ? (
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
            )
          ) : null}

          {view === 'ops' ? (
            <FleetGraphOpsDashboard
              ops={fleetGraph.ops}
              loading={fleetGraph.opsLoading}
              error={fleetGraph.opsError}
              onRefresh={fleetGraph.refresh}
            />
          ) : null}

          {view === 'detectors' ? (
            <FleetGraphDetectorTuning
              detectors={fleetGraph.detectors}
              loading={fleetGraph.detectorsLoading}
              error={fleetGraph.detectorsError}
              updating={fleetGraph.updatingDetector}
              updateError={fleetGraph.detectorUpdateError}
              onUpdate={fleetGraph.updateDetector}
            />
          ) : null}

          {view === 'replay' ? (
            <FleetGraphReplayHarness
              context={context}
              scenarios={fleetGraph.replayScenarios}
              loading={fleetGraph.replayScenariosLoading}
              error={fleetGraph.replayScenariosError}
              creating={fleetGraph.creatingReplayScenario}
              running={fleetGraph.runningReplayScenario}
              createError={fleetGraph.replayScenarioCreateError}
              runError={fleetGraph.replayRunError}
              onCreate={fleetGraph.createReplayScenario}
              onRun={fleetGraph.runReplayScenario}
            />
          ) : null}
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

type FleetGraphPanelView = 'findings' | 'ops' | 'detectors' | 'replay';

const FLEETGRAPH_PANEL_TABS: Array<{ id: FleetGraphPanelView; label: string }> = [
  { id: 'findings', label: 'Findings' },
  { id: 'ops', label: 'Ops' },
  { id: 'detectors', label: 'Tuning' },
  { id: 'replay', label: 'Replay' },
];

function FleetGraphPanelTabs({
  view,
  unreadCount,
  onChange,
}: {
  view: FleetGraphPanelView;
  unreadCount: number;
  onChange: (view: FleetGraphPanelView) => void;
}) {
  return (
    <div className="border-b border-border px-4 py-2">
      <div className="flex flex-wrap gap-1 rounded-md bg-background/70 p-1">
        {FLEETGRAPH_PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={view === tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'min-h-9 rounded px-3 text-xs font-medium text-muted transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              view === tab.id && 'bg-accent text-accent-foreground',
            )}
          >
            {tab.label}
            {tab.id === 'findings' && unreadCount > 0 ? (
              <span className="ml-1 rounded-full bg-background/40 px-1.5 py-0.5 text-[10px]">
                {unreadCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function FleetGraphOpsDashboard({
  ops,
  loading,
  error,
  onRefresh,
}: {
  ops?: FleetGraphOpsResponse;
  loading: boolean;
  error: Error | null;
  onRefresh: () => void;
}) {
  if (loading) {
    return <div role="status" className="p-4 text-sm text-muted">Loading FleetGraph ops.</div>;
  }

  if (error) {
    return <div role="alert" className="p-4 text-sm text-red-200">FleetGraph ops could not load.</div>;
  }

  if (!ops) {
    return <div role="status" className="p-4 text-sm text-muted">No FleetGraph ops data.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Operations</h3>
          <p className="text-xs text-muted">Generated {formatDateTime(ops.generatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-9 rounded border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/10"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Queue depth" value={formatNumber(queueDepth(ops.queue.counts))} />
        <MetricCell label="24h runs" value={formatNumber(ops.runs.last24h.total)} />
        <MetricCell label="Avg latency" value={formatDuration(ops.runs.last24h.averageLatencyMs)} />
        <MetricCell label="24h cost" value={formatCost(ops.costs.last24h.estimatedCostUsd)} />
        <MetricCell label="Enabled detectors" value={`${ops.detectors.enabled}/${ops.detectors.total}`} />
        <MetricCell label="Pending gates" value={formatNumber(ops.proposals.pending)} />
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-normal text-muted">Detector volume</h4>
        {ops.findings.byDetector.length ? (
          <div className="space-y-1">
            {ops.findings.byDetector.slice(0, 6).map((detector) => (
              <div key={detector.detectorId} className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs">
                <span className="truncate text-foreground">{detector.detectorId}</span>
                <span className="text-muted">{detector.openCount} open / {detector.count} total</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-border px-3 py-2 text-xs text-muted">No findings recorded yet.</div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-normal text-muted">Recent runs</h4>
        {ops.runs.recent.length ? (
          <div className="space-y-1">
            {ops.runs.recent.map((run) => (
              <div key={run.id} className="grid grid-cols-[1fr_auto] gap-2 rounded border border-border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-foreground">{run.triggerType}</div>
                  <div className="truncate text-muted">{formatDateTime(run.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-foreground">{run.status}</div>
                  <div className="text-muted">{formatCost(run.estimatedCostUsd ?? 0)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded border border-border px-3 py-2 text-xs text-muted">No FleetGraph runs yet.</div>
        )}
      </section>
    </div>
  );
}

function FleetGraphDetectorTuning({
  detectors,
  loading,
  error,
  updating,
  updateError,
  onUpdate,
}: {
  detectors: FleetGraphDetectorSetting[];
  loading: boolean;
  error: Error | null;
  updating: boolean;
  updateError: Error | null;
  onUpdate: (id: string, updates: FleetGraphDetectorUpdateRequest) => void;
}) {
  if (loading) {
    return <div role="status" className="p-4 text-sm text-muted">Loading detector tuning.</div>;
  }

  if (error) {
    return <div role="alert" className="p-4 text-sm text-red-200">Detector tuning could not load.</div>;
  }

  return (
    <div className="space-y-3 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Detector Tuning</h3>
      </div>
      {updateError ? (
        <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Detector setting could not save.
        </div>
      ) : null}
      <div className="space-y-2">
        {detectors.map((detector) => (
          <DetectorTuningRow
            key={`${detector.id}:${detector.updatedAt ?? 'default'}`}
            detector={detector}
            updating={updating}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function DetectorTuningRow({
  detector,
  updating,
  onUpdate,
}: {
  detector: FleetGraphDetectorSetting;
  updating: boolean;
  onUpdate: (id: string, updates: FleetGraphDetectorUpdateRequest) => void;
}) {
  const [thresholds, setThresholds] = useState(detector.thresholds);

  const setThreshold = (key: string, value: string) => {
    const parsed = Number(value);
    setThresholds((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : current[key],
    }));
  };

  return (
    <div className="rounded border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={detector.enabled}
                disabled={updating}
                onChange={(event) => onUpdate(detector.id, { enabled: event.target.checked })}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {detector.label}
            </label>
            <span className="rounded bg-muted/10 px-2 py-0.5 text-[10px] uppercase tracking-normal text-muted">
              {detector.noiseDefault}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{detector.description}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Severity
          <select
            aria-label={`${detector.label} severity override`}
            value={detector.severity ?? ''}
            disabled={updating}
            onChange={(event) => onUpdate(detector.id, {
              severity: event.target.value ? event.target.value as FleetGraphDetectorUpdateRequest['severity'] : null,
            })}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Default {detector.defaultSeverity}</option>
            <option value="info">Info</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>

      {Object.keys(thresholds).length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(thresholds).map(([key, value]) => (
            <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted">
              {formatThresholdLabel(key)}
              <input
                aria-label={`${detector.label} ${formatThresholdLabel(key)}`}
                type="number"
                min={0}
                step={key.toLowerCase().includes('ratio') ? 0.1 : 1}
                value={value}
                disabled={updating}
                onChange={(event) => setThreshold(key, event.target.value)}
                className="min-h-9 rounded border border-border bg-background px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              />
            </label>
          ))}
          <button
            type="button"
            disabled={updating}
            onClick={() => onUpdate(detector.id, { thresholds })}
            className="col-span-2 min-h-9 rounded border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save thresholds
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FleetGraphReplayHarness({
  context,
  scenarios,
  loading,
  error,
  creating,
  running,
  createError,
  runError,
  onCreate,
  onRun,
}: {
  context?: AssistantRouteContext;
  scenarios: FleetGraphReplayScenario[];
  loading: boolean;
  error: Error | null;
  creating: boolean;
  running: boolean;
  createError: Error | null;
  runError: Error | null;
  onCreate: (scenario: FleetGraphReplayScenarioCreateRequest) => void;
  onRun: (id: string) => void;
}) {
  const [name, setName] = useState('Current Ship risk replay');
  const [minFindings, setMinFindings] = useState(1);

  if (loading) {
    return <div role="status" className="p-4 text-sm text-muted">Loading replay scenarios.</div>;
  }

  if (error) {
    return <div role="alert" className="p-4 text-sm text-red-200">Replay scenarios could not load.</div>;
  }

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName || creating) return;
    onCreate({
      name: trimmedName,
      description: context?.path ? `Snapshot from ${context.path}` : 'Snapshot from the FleetGraph drawer.',
      routeContext: context ?? {},
      triggerType: 'manual_replay',
      expected: {
        expectedStatus: 'completed',
        minFindings,
      },
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Replay Harness</h3>
      </div>

      {(createError || runError) ? (
        <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          FleetGraph replay action failed.
        </div>
      ) : null}

      <div className="rounded border border-border p-3">
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <label className="min-w-0 text-xs text-muted">
            Scenario name
            <input
              aria-label="FleetGraph replay scenario name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
            />
          </label>
          <label className="text-xs text-muted">
            Findings
            <input
              aria-label="FleetGraph replay minimum findings"
              type="number"
              min={0}
              value={minFindings}
              onChange={(event) => setMinFindings(Math.max(0, Number(event.target.value) || 0))}
              className="mt-1 h-9 w-full rounded border border-border bg-background px-2 text-xs text-foreground"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={creating || !name.trim()}
          onClick={submit}
          className="mt-3 min-h-9 rounded border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save scenario
        </button>
      </div>

      <div className="space-y-2">
        {scenarios.length ? scenarios.map((scenario) => (
          <div key={scenario.id} className="rounded border border-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{scenario.name}</div>
                <div className="truncate text-xs text-muted">{scenario.routeContext.path ?? scenario.triggerType}</div>
              </div>
              <button
                type="button"
                disabled={running}
                onClick={() => onRun(scenario.id)}
                className="min-h-9 rounded border border-border px-3 text-xs font-medium text-foreground hover:bg-muted/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Run
              </button>
            </div>
            <div className="mt-2 text-xs text-muted">
              {scenario.lastRun
                ? `Last run ${scenario.lastRun.status}, score ${Math.round(scenario.lastRun.score * 100)}%`
                : 'Not run yet'}
            </div>
          </div>
        )) : (
          <div className="rounded border border-border px-3 py-2 text-xs text-muted">No replay scenarios saved.</div>
        )}
      </div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-3 py-2">
      <div className="text-[11px] uppercase tracking-normal text-muted">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
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

function queueDepth(counts: FleetGraphOpsResponse['queue']['counts']): number {
  return (counts.queued ?? 0) + (counts.processing ?? 0) + (counts.retrying ?? 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatCost(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

function formatDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatThresholdLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}
