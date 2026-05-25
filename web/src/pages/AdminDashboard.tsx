import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { api, Workspace, AuditLog, UserInfo, SecurityProbeStatus } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'workspaces' | 'users' | 'audit' | 'operations';

const VALID_TABS: Tab[] = ['workspaces', 'users', 'audit', 'operations'];

interface WorkspaceWithCount extends Workspace {
  memberCount: number;
}

interface UserWithWorkspaces extends UserInfo {
  workspaces: Array<{ id: string; name: string; role: 'admin' | 'member' }>;
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { user, isSuperAdmin, impersonating, endImpersonation } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive active tab from URL query params
  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'workspaces';

  const handleTabChange = useCallback((tab: Tab) => {
    setSearchParams({ tab }, { replace: true });
  }, [setSearchParams]);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithCount[]>([]);
  const [users, setUsers] = useState<UserWithWorkspaces[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [securityProbeStatus, setSecurityProbeStatus] = useState<SecurityProbeStatus | null>(null);
  const [triggeringProbe, setTriggeringProbe] = useState(false);
  const [probeMessage, setProbeMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [seedingTimelineDemo, setSeedingTimelineDemo] = useState(false);
  const [demoMessage, setDemoMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate('/docs');
      return;
    }
    let cancelled = false;
    Promise.all([
      api.admin.listWorkspaces(showArchived),
      api.admin.listUsers(),
      api.admin.getAuditLogs({ limit: 50 }),
      api.admin.getSecurityProbeStatus(),
    ]).then(([wsRes, usersRes, logsRes, probeRes]) => {
      if (cancelled) return;
      if (wsRes.success && wsRes.data) setWorkspaces(wsRes.data.workspaces);
      if (usersRes.success && usersRes.data) setUsers(usersRes.data.users);
      if (logsRes.success && logsRes.data) setAuditLogs(logsRes.data.logs);
      if (probeRes.success && probeRes.data) setSecurityProbeStatus(probeRes.data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, navigate, showArchived]);

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setCreating(true);
    const res = await api.admin.createWorkspace({ name: newWorkspaceName.trim() });
    if (res.success && res.data) {
      const { workspace } = res.data;
      setWorkspaces(prev => [...prev, { ...workspace, memberCount: 0 }]);
      setNewWorkspaceName('');
    }
    setCreating(false);
  }

  async function handleArchiveWorkspace(workspaceId: string) {
    if (!confirm('Are you sure you want to archive this workspace? Users will no longer be able to access it.')) return;

    const res = await api.admin.archiveWorkspace(workspaceId);
    if (res.success) {
      setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
    }
  }

  async function handleToggleSuperAdmin(userId: string, currentValue: boolean) {
    const res = await api.admin.toggleSuperAdmin(userId, !currentValue);
    if (res.success && res.data) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isSuperAdmin: res.data!.isSuperAdmin } : u));
    }
  }

  async function handleImpersonate(userId: string) {
    const res = await api.admin.startImpersonation(userId);
    if (res.success) {
      // Reload page to get new session context
      window.location.href = '/docs';
    }
  }

  function handleExportAuditLogs() {
    window.open(api.admin.exportAuditLogs(), '_blank');
  }

  async function handleTriggerSecurityProbe() {
    setTriggeringProbe(true);
    setProbeMessage(null);

    try {
      const res = await api.admin.triggerSecurityProbe();
      if (res.success && res.data) {
        setProbeMessage({
          tone: 'success',
          text: `${res.data.cronJobName} accepted the manual run.`,
        });
      } else {
        setProbeMessage({
          tone: 'error',
          text: res.error?.message || 'Security probe trigger failed.',
        });
      }

      const status = await api.admin.getSecurityProbeStatus();
      if (status.success && status.data) setSecurityProbeStatus(status.data);
    } catch (error) {
      setProbeMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Security probe trigger failed.',
      });
    } finally {
      setTriggeringProbe(false);
    }
  }

  async function handleSeedTimelineDemo() {
    setSeedingTimelineDemo(true);
    setDemoMessage(null);

    try {
      const res = await api.admin.seedTimelineDemo();
      if (res.success && res.data) {
        setDemoMessage({
          tone: 'success',
          text: res.data.created ? 'Timeline demo data created.' : 'Timeline demo data refreshed.',
        });
        navigate(res.data.timelineUrl);
      } else {
        setDemoMessage({
          tone: 'error',
          text: res.error?.message || 'Timeline demo seed failed.',
        });
      }
    } catch (error) {
      setDemoMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Timeline demo seed failed.',
      });
    } finally {
      setSeedingTimelineDemo(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Impersonation banner */}
      {impersonating && (
        <div className="bg-yellow-500 text-black px-4 py-2 flex items-center justify-between">
          <span>You are impersonating <strong>{impersonating.userName}</strong></span>
          <button
            onClick={endImpersonation}
            className="px-3 py-1 bg-yellow-700 text-white rounded hover:bg-yellow-800 transition-colors"
          >
            End Session
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/docs')}
            className="text-muted hover:text-foreground transition-colors"
          >
            <BackIcon />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted">{user?.email}</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex px-6">
          <TabButton active={activeTab === 'workspaces'} onClick={() => handleTabChange('workspaces')}>
            Workspaces
          </TabButton>
          <TabButton active={activeTab === 'users'} onClick={() => handleTabChange('users')}>
            Users
          </TabButton>
          <TabButton active={activeTab === 'audit'} onClick={() => handleTabChange('audit')}>
            Audit Logs
          </TabButton>
          <TabButton active={activeTab === 'operations'} onClick={() => handleTabChange('operations')}>
            Operations
          </TabButton>
        </nav>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted">Loading...</div>
          </div>
        ) : (
          <>
            {activeTab === 'workspaces' && (
              <WorkspacesTab
                workspaces={workspaces}
                showArchived={showArchived}
                setShowArchived={setShowArchived}
                newWorkspaceName={newWorkspaceName}
                setNewWorkspaceName={setNewWorkspaceName}
                creating={creating}
                onCreateWorkspace={handleCreateWorkspace}
                onArchiveWorkspace={handleArchiveWorkspace}
              />
            )}
            {activeTab === 'users' && (
              <UsersTab
                users={users}
                currentUserId={user?.id}
                onToggleSuperAdmin={handleToggleSuperAdmin}
                onImpersonate={handleImpersonate}
              />
            )}
            {activeTab === 'audit' && (
              <AuditLogsTab
                auditLogs={auditLogs}
                onExport={handleExportAuditLogs}
              />
            )}
            {activeTab === 'operations' && (
              <OperationsTab
                securityProbeStatus={securityProbeStatus}
                triggeringProbe={triggeringProbe}
                probeMessage={probeMessage}
                onTriggerSecurityProbe={handleTriggerSecurityProbe}
                seedingTimelineDemo={seedingTimelineDemo}
                demoMessage={demoMessage}
                onSeedTimelineDemo={handleSeedTimelineDemo}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-accent text-foreground'
          : 'border-transparent text-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}

function WorkspacesTab({
  workspaces,
  showArchived,
  setShowArchived,
  newWorkspaceName,
  setNewWorkspaceName,
  creating,
  onCreateWorkspace,
  onArchiveWorkspace,
}: {
  workspaces: WorkspaceWithCount[];
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  newWorkspaceName: string;
  setNewWorkspaceName: (v: string) => void;
  creating: boolean;
  onCreateWorkspace: (e: React.FormEvent) => void;
  onArchiveWorkspace: (id: string) => void;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    onCreateWorkspace(e);
    setShowCreateForm(false);
  }

  return (
    <div className="space-y-4">
      {/* Header with filter and create button */}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="rounded border-border"
          />
          Show archived workspaces
        </label>

        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            <PlusIcon />
            New Workspace
          </button>
        )}
      </div>

      {/* Collapsible create form */}
      {showCreateForm && (
        <form onSubmit={handleSubmit} className="flex items-center gap-3 p-3 bg-border/20 rounded-lg">
          <input
            type="text"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            placeholder="Workspace name"
            className="flex-1 max-w-sm px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={creating || !newWorkspaceName.trim()}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(false);
              setNewWorkspaceName('');
            }}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Workspaces list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-border/30">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Members</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Created</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {workspaces.map((ws) => (
              <tr key={ws.id}>
                <td className="px-4 py-3 text-sm font-medium">
                  <Link
                    to={`/admin/workspaces/${ws.id}`}
                    className="text-accent hover:underline"
                  >
                    {ws.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-muted">{ws.memberCount}</td>
                <td className="px-4 py-3 text-sm">
                  {ws.archivedAt ? (
                    <span className="text-yellow-500">Archived</span>
                  ) : (
                    <span className="text-green-500">Active</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted">
                  {new Date(ws.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {!ws.archivedAt && (
                    <button
                      onClick={() => onArchiveWorkspace(ws.id)}
                      className="text-sm text-red-500 hover:text-red-400 transition-colors"
                    >
                      Archive
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab({
  users,
  currentUserId,
  onToggleSuperAdmin,
  onImpersonate,
}: {
  users: UserWithWorkspaces[];
  currentUserId?: string;
  onToggleSuperAdmin: (userId: string, current: boolean) => void;
  onImpersonate: (userId: string) => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-border/30">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted">Name</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted">Email</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted">Workspaces</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted">Super Admin</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-muted">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 text-sm text-foreground font-medium">{u.name}</td>
              <td className="px-4 py-3 text-sm text-muted">{u.email}</td>
              <td className="px-4 py-3 text-sm text-muted">
                {u.workspaces.map(w => w.name).join(', ') || 'None'}
              </td>
              <td className="px-4 py-3 text-sm">
                <button
                  onClick={() => onToggleSuperAdmin(u.id, u.isSuperAdmin)}
                  disabled={u.id === currentUserId}
                  className={cn(
                    'px-2 py-1 rounded text-xs font-medium transition-colors',
                    u.isSuperAdmin
                      ? 'bg-accent text-white'
                      : 'bg-border text-muted hover:bg-border/80',
                    u.id === currentUserId && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {u.isSuperAdmin ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                {u.id !== currentUserId && (
                  <button
                    onClick={() => onImpersonate(u.id)}
                    className="text-sm text-accent hover:text-accent/80 transition-colors"
                  >
                    Impersonate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogsTab({
  auditLogs,
  onExport,
}: {
  auditLogs: AuditLog[];
  onExport: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={onExport}
          className="px-4 py-2 bg-border text-foreground rounded-md hover:bg-border/80 transition-colors text-sm"
        >
          Export CSV
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-border/30">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Time</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Actor</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Action</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Resource</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {log.actorName || log.actorEmail}
                  {log.impersonatingUserId && (
                    <span className="ml-1 text-yellow-500">(impersonating)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted">{log.action}</td>
                <td className="px-4 py-3 text-sm text-muted">
                  {log.resourceType ? `${log.resourceType}:${log.resourceId?.slice(0, 8)}...` : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperationsTab({
  securityProbeStatus,
  triggeringProbe,
  probeMessage,
  onTriggerSecurityProbe,
  seedingTimelineDemo,
  demoMessage,
  onSeedTimelineDemo,
}: {
  securityProbeStatus: SecurityProbeStatus | null;
  triggeringProbe: boolean;
  probeMessage: { tone: 'success' | 'error'; text: string } | null;
  onTriggerSecurityProbe: () => void;
  seedingTimelineDemo: boolean;
  demoMessage: { tone: 'success' | 'error'; text: string } | null;
  onSeedTimelineDemo: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Security Probe</h2>
            <div className="mt-1 text-xs text-muted">{securityProbeStatus?.cronJobName || 'ship-security-probe'}</div>
          </div>
          <StatusPill ready={Boolean(securityProbeStatus?.configured)} />
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <ConfigRow label="Render API key" ready={Boolean(securityProbeStatus?.renderApiKeyConfigured)} />
            <ConfigRow label="Cron job ID" ready={Boolean(securityProbeStatus?.cronJobIdConfigured)} />
          </div>

          {securityProbeStatus && !securityProbeStatus.configured && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Missing {securityProbeStatus.missingEnvVars.join(', ')}
            </div>
          )}

          {probeMessage && <OperationMessage tone={probeMessage.tone} text={probeMessage.text} />}

          <button
            type="button"
            onClick={onTriggerSecurityProbe}
            disabled={triggeringProbe || !securityProbeStatus?.configured}
            className="rounded-md border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {triggeringProbe ? 'Triggering...' : 'Trigger Run'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Timeline Demo</h2>
          <div className="mt-1 text-xs text-muted">Current workspace</div>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <DemoMetric label="Weeks" value="3" />
            <DemoMetric label="Issues" value="7" />
            <DemoMetric label="Links" value="4" />
          </div>

          {demoMessage && <OperationMessage tone={demoMessage.tone} text={demoMessage.text} />}

          <button
            type="button"
            onClick={onSeedTimelineDemo}
            disabled={seedingTimelineDemo}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {seedingTimelineDemo ? 'Seeding...' : 'Seed Timeline Demo'}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        ready
          ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
          : 'bg-amber-500/15 text-amber-200 ring-amber-500/30'
      )}
    >
      {ready ? 'Configured' : 'Setup needed'}
    </span>
  );
}

function ConfigRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn('mt-1 text-sm font-medium', ready ? 'text-emerald-300' : 'text-amber-200')}>
        {ready ? 'Set' : 'Missing'}
      </div>
    </div>
  );
}

function DemoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function OperationMessage({ tone, text }: { tone: 'success' | 'error'; text: string }) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'success'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/30 bg-red-500/10 text-red-300'
      )}
    >
      {text}
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
    </svg>
  );
}
