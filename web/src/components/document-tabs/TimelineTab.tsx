import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { DocumentTabProps } from '@/lib/document-tabs';

type TimelineScopeType = 'project' | 'program';
type TimelineDocumentType = 'program' | 'project' | 'sprint' | 'issue';

interface TimelineDependencyEdge {
  source_id: string;
  target_id: string;
  relationship_type: 'depends_on';
  source_in_scope: boolean;
  target_in_scope: boolean;
  source_title?: string;
  target_title?: string;
  source_document_type?: TimelineDocumentType;
  target_document_type?: TimelineDocumentType;
  target_status?: string | null;
  is_blocking: boolean;
}

interface TimelineRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  status: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  program_ids: string[];
  project_ids: string[];
  sprint_ids: string[];
  dependency_ids: string[];
  blocker_ids: string[];
  blocks_ids: string[];
  blocked: boolean;
  overdue: boolean;
  at_risk: boolean;
  critical_path: boolean;
  critical_path_order: number | null;
  sprint_number?: number | null;
}

interface TimelineResponse {
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  generated_at: string;
  rows: TimelineRow[];
  dependencies: TimelineDependencyEdge[];
  summary: {
    total_rows: number;
    dependency_count: number;
    blocked_count: number;
    overdue_count: number;
    at_risk_count: number;
    critical_path_count: number;
  };
}

interface TimelineBaselineSnapshot {
  captured_at: string;
  captured_by: string;
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  rows: Array<{
    id: string;
    title: string;
    document_type: TimelineDocumentType;
    planned_start: string | null;
    planned_end: string | null;
    status: string | null;
  }>;
  summary: {
    total_rows: number;
    dependency_count: number;
    blocked_count: number;
    overdue_count: number;
    at_risk_count: number;
    critical_path_count: number;
    planned_start: string | null;
    planned_end: string | null;
  };
}

interface TimelineVarianceRow {
  id: string;
  title: string;
  document_type: TimelineDocumentType;
  current_planned_start: string | null;
  current_planned_end: string | null;
  current_status: string | null;
  baseline_planned_start: string | null;
  baseline_planned_end: string | null;
  baseline_status: string | null;
  start_variance_days: number | null;
  end_variance_days: number | null;
  status_changed: boolean;
  missing_from_baseline: boolean;
  missing_from_current: boolean;
  blocked: boolean;
  overdue: boolean;
  at_risk: boolean;
}

interface TimelineVarianceResponse {
  scope: {
    id: string;
    type: TimelineScopeType;
    title: string;
  };
  generated_at: string;
  baseline: TimelineBaselineSnapshot | null;
  rows: TimelineVarianceRow[];
  summary: {
    total_rows: number;
    current_rows: number;
    baseline_rows: number;
    missing_from_baseline_count: number;
    missing_from_current_count: number;
    start_variance_count: number;
    end_variance_count: number;
    status_changed_count: number;
    delayed_count: number;
    improved_count: number;
    total_end_variance_days: number;
    average_end_variance_days: number | null;
  };
}

interface TimelineScale {
  start: Date;
  end: Date;
  totalDays: number;
  ticks: Date[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const TYPE_LABELS: Record<TimelineDocumentType, string> = {
  program: 'Program',
  project: 'Project',
  sprint: 'Week',
  issue: 'Issue',
};

const TYPE_STYLES: Record<TimelineDocumentType, string> = {
  program: 'bg-slate-500',
  project: 'bg-sky-500',
  sprint: 'bg-emerald-500',
  issue: 'bg-indigo-500',
};

const STATUS_STYLES: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  blocked: 'bg-red-500/15 text-red-300 ring-red-500/30',
  overdue: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  at_risk: 'bg-amber-500/15 text-amber-200 ring-amber-500/30',
  clear: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const generatedFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  const startDate = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDate = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((endDate - startDate) / DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildScale(rows: TimelineRow[]): TimelineScale {
  const dates = rows
    .flatMap(row => [
      parseDateOnly(row.planned_start),
      parseDateOnly(row.planned_end),
      parseDateOnly(row.actual_start),
      parseDateOnly(row.actual_end),
    ])
    .filter((date): date is Date => date !== null);

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let start = dates.length > 0 ? new Date(Math.min(...dates.map(date => date.getTime()))) : addDays(todayUtc, -7);
  let end = dates.length > 0 ? new Date(Math.max(...dates.map(date => date.getTime()))) : addDays(todayUtc, 21);

  start = addDays(start, -3);
  end = addDays(end, 3);

  if (end <= start) {
    end = addDays(start, 7);
  }

  const totalDays = Math.max(1, daysBetween(start, end) + 1);
  const tickTarget = clamp(Math.ceil(totalDays / 10), 3, 8);
  const tickStep = Math.max(1, Math.ceil(totalDays / (tickTarget - 1)));
  const ticks: Date[] = [];

  for (let offset = 0; offset < totalDays; offset += tickStep) {
    ticks.push(addDays(start, offset));
  }

  const lastTick = ticks[ticks.length - 1];
  if (!lastTick || lastTick.getTime() !== end.getTime()) {
    ticks.push(end);
  }

  return { start, end, totalDays, ticks };
}

function getSpanStyle(
  scale: TimelineScale,
  startValue: string | null,
  endValue: string | null
): { left: string; width: string } {
  const startDate = parseDateOnly(startValue) ?? scale.start;
  const parsedEndDate = parseDateOnly(endValue) ?? startDate;
  const endDate = parsedEndDate < startDate ? startDate : parsedEndDate;
  const offset = clamp(daysBetween(scale.start, startDate), 0, scale.totalDays - 1);
  const duration = clamp(daysBetween(startDate, endDate) + 1, 1, scale.totalDays - offset);

  return {
    left: `${(offset / scale.totalDays) * 100}%`,
    width: `${(duration / scale.totalDays) * 100}%`,
  };
}

function getTickLeft(scale: TimelineScale, tick: Date): string {
  return `${(daysBetween(scale.start, tick) / scale.totalDays) * 100}%`;
}

function formatDate(value: string | null): string {
  const date = parseDateOnly(value);
  return date ? dateFormatter.format(date) : 'No date';
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'No planned dates';
  if (start && end) return `${formatDate(start)} to ${formatDate(end)}`;
  return formatDate(start ?? end);
}

function formatStatus(status: string | null): string {
  if (!status) return 'No status';
  return status.replaceAll('_', ' ');
}

function formatSignedDays(value: number | null): string | null {
  if (value === null) return null;
  if (value === 0) return '0d';
  return `${value > 0 ? '+' : ''}${value}d`;
}

function getVarianceTone(value: number | null): string {
  if (value === null || value === 0) return 'text-muted';
  return value > 0 ? 'text-orange-300' : 'text-emerald-300';
}

function getRowBadges(row: TimelineRow): Array<{ label: string; style: string }> {
  const badges: Array<{ label: string; style: string }> = [];
  if (row.critical_path) {
    badges.push({
      label: row.critical_path_order ? `Critical ${row.critical_path_order}` : 'Critical',
      style: STATUS_STYLES.critical,
    });
  }
  if (row.blocked) badges.push({ label: 'Blocked', style: STATUS_STYLES.blocked });
  else if (row.overdue) badges.push({ label: 'Overdue', style: STATUS_STYLES.overdue });
  else if (row.at_risk) badges.push({ label: 'At risk', style: STATUS_STYLES.at_risk });
  else badges.push({ label: 'Clear', style: STATUS_STYLES.clear });
  return badges;
}

function getBarStyle(row: TimelineRow): string {
  if (row.blocked) return 'bg-red-500';
  if (row.overdue) return 'bg-orange-500';
  if (row.at_risk) return 'bg-amber-500';
  return TYPE_STYLES[row.document_type];
}

function getScopeType(documentType: string): TimelineScopeType {
  return documentType === 'program' ? 'program' : 'project';
}

function getTimelineEndpoint(scopeType: TimelineScopeType, documentId: string): string {
  return scopeType === 'program'
    ? `/api/programs/${documentId}/timeline`
    : `/api/projects/${documentId}/timeline`;
}

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'blocked' | 'overdue' | 'risk' | 'critical';
}) {
  const toneClass = {
    default: 'border-border bg-surface',
    critical: 'border-rose-500/30 bg-rose-500/10',
    blocked: 'border-red-500/30 bg-red-500/10',
    overdue: 'border-orange-500/30 bg-orange-500/10',
    risk: 'border-amber-500/30 bg-amber-500/10',
  }[tone];

  return (
    <div className={cn('min-h-16 rounded-md border px-3 py-2', toneClass)}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function BaselineSummary({
  variance,
  isLoading,
  error,
}: {
  variance: TimelineVarianceResponse | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
        Loading baseline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        Baseline variance unavailable.
      </div>
    );
  }

  if (!variance?.baseline) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
        No baseline captured. Current timeline rows are ready to baseline.
      </div>
    );
  }

  const capturedAt = generatedFormatter.format(new Date(variance.baseline.captured_at));
  const averageVariance = formatSignedDays(
    variance.summary.average_end_variance_days === null
      ? null
      : Math.round(variance.summary.average_end_variance_days)
  );

  return (
    <div className="mt-3 rounded-md border border-border bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">Baseline captured {capturedAt}</div>
          <div className="text-xs text-muted">
            {variance.summary.baseline_rows} baseline rows, {variance.summary.current_rows} current rows
          </div>
        </div>
        {averageVariance ? (
          <div className={cn('text-sm font-semibold', getVarianceTone(variance.summary.average_end_variance_days))}>
            Avg end {averageVariance}
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded border border-border px-2 py-1.5">
          <span className="text-muted">Delayed</span>
          <span className="ml-2 font-semibold text-orange-300">{variance.summary.delayed_count}</span>
        </div>
        <div className="rounded border border-border px-2 py-1.5">
          <span className="text-muted">Improved</span>
          <span className="ml-2 font-semibold text-emerald-300">{variance.summary.improved_count}</span>
        </div>
        <div className="rounded border border-border px-2 py-1.5">
          <span className="text-muted">Changed</span>
          <span className="ml-2 font-semibold text-foreground">{variance.summary.status_changed_count}</span>
        </div>
        <div className="rounded border border-border px-2 py-1.5">
          <span className="text-muted">New</span>
          <span className="ml-2 font-semibold text-foreground">{variance.summary.missing_from_baseline_count}</span>
        </div>
        <div className="rounded border border-border px-2 py-1.5">
          <span className="text-muted">Removed</span>
          <span className="ml-2 font-semibold text-foreground">{variance.summary.missing_from_current_count}</span>
        </div>
      </div>
    </div>
  );
}

function TimelineLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex items-center gap-2 text-muted">
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading timeline...
      </div>
    </div>
  );
}

function TimelineEmpty({ scopeType }: { scopeType: TimelineScopeType }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted">
      <div className="mb-3 text-sm font-medium text-foreground">No timeline rows</div>
      <div className="max-w-md text-sm">
        Add weeks, issues, or dependency links to this {scopeType} to populate the timeline.
      </div>
    </div>
  );
}

function DependencyList({
  dependencies,
  rowsById,
}: {
  dependencies: TimelineDependencyEdge[];
  rowsById: Map<string, TimelineRow>;
}) {
  if (dependencies.length === 0) {
    return (
      <div className="border-t border-border px-4 py-4 text-sm text-muted">
        No dependency edges in this scope.
      </div>
    );
  }

  return (
    <div className="border-t border-border px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Dependencies</h3>
        <span className="text-xs text-muted">{dependencies.length} edge{dependencies.length === 1 ? '' : 's'}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_120px] gap-3 border-b border-border pb-2 text-xs font-medium uppercase tracking-wide text-muted">
            <div>Work item</div>
            <div>Depends on</div>
            <div>Status</div>
          </div>
          <div className="divide-y divide-border">
            {dependencies.map(edge => {
              const source = rowsById.get(edge.source_id);
              const target = rowsById.get(edge.target_id);
              const sourceTitle = source?.title ?? edge.source_title ?? 'Outside scope';
              const targetTitle = target?.title ?? edge.target_title ?? 'Outside scope';

              return (
                <div
                  key={`${edge.source_id}:${edge.target_id}`}
                  className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_120px] gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{sourceTitle}</div>
                    <div className="text-xs text-muted">
                      {edge.source_document_type ? TYPE_LABELS[edge.source_document_type] : 'Document'}
                      {edge.source_in_scope ? '' : ' outside scope'}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{targetTitle}</div>
                    <div className="text-xs text-muted">
                      {edge.target_document_type ? TYPE_LABELS[edge.target_document_type] : 'Document'}
                      {edge.target_in_scope ? '' : ' outside scope'}
                    </div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                        edge.is_blocking ? STATUS_STYLES.blocked : STATUS_STYLES.clear
                      )}
                    >
                      {edge.is_blocking ? 'Blocking' : 'Clear'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TimelineTab({ documentId, document }: DocumentTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scopeType = getScopeType(document.document_type);
  const endpoint = getTimelineEndpoint(scopeType, documentId);
  const baselineEndpoint = `${endpoint}/baseline`;

  const { data, isLoading, error, refetch, isFetching } = useQuery<TimelineResponse>({
    queryKey: ['timeline', scopeType, documentId],
    queryFn: async () => {
      const response = await apiGet(endpoint);
      if (!response.ok) {
        throw new Error('Failed to load timeline');
      }
      return response.json();
    },
  });

  const baselineQuery = useQuery<TimelineVarianceResponse>({
    queryKey: ['timeline-baseline', scopeType, documentId],
    queryFn: async () => {
      const response = await apiGet(baselineEndpoint);
      if (!response.ok) {
        throw new Error('Failed to load baseline variance');
      }
      return response.json();
    },
  });

  const captureBaselineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiPost(baselineEndpoint);
      if (!response.ok) {
        throw new Error('Failed to capture baseline');
      }
      return response.json() as Promise<TimelineVarianceResponse>;
    },
    onSuccess: (variance) => {
      queryClient.setQueryData(['timeline-baseline', scopeType, documentId], variance);
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
    },
  });

  const scale = useMemo(() => buildScale(data?.rows ?? []), [data?.rows]);
  const rowsById = useMemo(() => {
    return new Map((data?.rows ?? []).map(row => [row.id, row]));
  }, [data?.rows]);
  const varianceById = useMemo(() => {
    return new Map((baselineQuery.data?.rows ?? []).map(row => [row.id, row]));
  }, [baselineQuery.data?.rows]);

  if (isLoading) return <TimelineLoading />;

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <div className="text-sm font-medium text-red-300">Timeline failed to load</div>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.rows.length === 0) {
    return <TimelineEmpty scopeType={scopeType} />;
  }

  const generatedAt = generatedFormatter.format(new Date(data.generated_at));

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="border-b border-border px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">Timeline</h2>
            <div className="mt-1 text-xs text-muted">
              {data.scope.title} - generated {generatedAt}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => captureBaselineMutation.mutate()}
              disabled={captureBaselineMutation.isPending}
              className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {captureBaselineMutation.isPending ? 'Capturing...' : 'Capture Baseline'}
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <SummaryMetric label="Rows" value={data.summary.total_rows} />
          <SummaryMetric label="Dependencies" value={data.summary.dependency_count} />
          <SummaryMetric label="Critical" value={data.summary.critical_path_count} tone="critical" />
          <SummaryMetric label="Blocked" value={data.summary.blocked_count} tone="blocked" />
          <SummaryMetric label="Overdue" value={data.summary.overdue_count} tone="overdue" />
          <SummaryMetric label="At risk" value={data.summary.at_risk_count} tone="risk" />
        </div>

        <BaselineSummary
          variance={baselineQuery.data}
          isLoading={baselineQuery.isLoading}
          error={baselineQuery.error ?? captureBaselineMutation.error}
        />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px]">
          <div className="sticky top-0 z-10 grid grid-cols-[280px_minmax(420px,1fr)_190px] gap-3 border-b border-border bg-background/95 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted backdrop-blur">
            <div>Item</div>
            <div className="relative h-7">
              {scale.ticks.map(tick => (
                <div
                  key={tick.toISOString()}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: getTickLeft(scale, tick) }}
                >
                  {dateFormatter.format(tick)}
                </div>
              ))}
            </div>
            <div>Health</div>
          </div>

          <div className="divide-y divide-border">
            {data.rows.map(row => {
              const plannedStart = row.planned_start ?? row.actual_start;
              const plannedEnd = row.planned_end ?? row.actual_end;
              const hasAnyDates = Boolean(plannedStart || plannedEnd);
              const plannedStyle = getSpanStyle(scale, plannedStart, plannedEnd);
              const actualStyle = getSpanStyle(scale, row.actual_start, row.actual_end);
              const badges = getRowBadges(row);
              const variance = varianceById.get(row.id);
              const endVarianceLabel = formatSignedDays(variance?.end_variance_days ?? null);
              const rowSummary = [
                TYPE_LABELS[row.document_type],
                formatStatus(row.status),
                formatDateRange(row.planned_start, row.planned_end),
                row.critical_path ? 'critical path' : null,
                row.blocked ? `${row.blocker_ids.length} blocker${row.blocker_ids.length === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(', ');

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => navigate(`/documents/${row.id}`)}
                  className="grid w-full grid-cols-[280px_minmax(420px,1fr)_190px] gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/5 focus:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent/50"
                  aria-label={`Open ${row.title}. ${rowSummary}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', TYPE_STYLES[row.document_type])} />
                      <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span>{TYPE_LABELS[row.document_type]}</span>
                      {row.sprint_number ? <span>Week {row.sprint_number}</span> : null}
                      <span>{formatStatus(row.status)}</span>
                    </div>
                  </div>

                  <div className="relative h-12 rounded-md border border-border bg-muted/10">
                    {scale.ticks.map(tick => (
                      <span
                        key={tick.toISOString()}
                        className="absolute top-0 h-full border-l border-border/70"
                        style={{ left: getTickLeft(scale, tick) }}
                        aria-hidden="true"
                      />
                    ))}

                    {hasAnyDates ? (
                      <>
                        <span
                          className={cn(
                            'absolute top-3 h-5 rounded-sm shadow-sm',
                            getBarStyle(row),
                            row.critical_path && 'ring-2 ring-rose-200 ring-offset-1 ring-offset-background'
                          )}
                          style={plannedStyle}
                        />
                        {(row.actual_start || row.actual_end) ? (
                          <span
                            className="absolute bottom-2 h-1.5 rounded-sm bg-white/75"
                            style={actualStyle}
                          />
                        ) : null}
                      </>
                    ) : (
                      <span className="absolute left-3 top-3 rounded-sm border border-dashed border-border px-2 py-0.5 text-xs text-muted">
                        No dates
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      {badges.map(badge => (
                        <span
                          key={badge.label}
                          className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1', badge.style)}
                        >
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {row.blocker_ids.length > 0 ? `${row.blocker_ids.length} blocker${row.blocker_ids.length === 1 ? '' : 's'}` : 'No blockers'}
                      {row.blocks_ids.length > 0 ? `, blocks ${row.blocks_ids.length}` : ''}
                    </div>
                    {variance && baselineQuery.data?.baseline ? (
                      <div className={cn('mt-1 text-xs', getVarianceTone(variance.end_variance_days))}>
                        End {endVarianceLabel ?? 'no change'} vs baseline
                        {variance.status_changed ? `, was ${formatStatus(variance.baseline_status)}` : ''}
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <DependencyList dependencies={data.dependencies} rowsById={rowsById} />
    </div>
  );
}
