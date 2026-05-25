-- FleetGraph foundation.
-- Findings remain documents; these tables track graph execution, delivery, and HITL proposals.

ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding';

CREATE TABLE IF NOT EXISTS fleetgraph_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_event_type TEXT NOT NULL,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'retrying', 'failed')),
  idempotency_key TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_event_queue_ready
  ON fleetgraph_event_queue(available_at, created_at)
  WHERE status IN ('queued', 'retrying');

CREATE INDEX IF NOT EXISTS idx_fleetgraph_event_queue_workspace_created
  ON fleetgraph_event_queue(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_event_queue_source_document
  ON fleetgraph_event_queue(source_document_id)
  WHERE source_document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS fleetgraph_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('proactive', 'chat', 'manual')),
  trigger_type TEXT NOT NULL,
  trigger_id UUID,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'completed', 'failed', 'interrupted', 'cancelled')),
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_usd NUMERIC(12, 6),
  langsmith_trace_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_runs_workspace_created
  ON fleetgraph_runs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_runs_thread
  ON fleetgraph_runs(thread_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_runs_status
  ON fleetgraph_runs(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS fleetgraph_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unread'
    CHECK (status IN ('unread', 'read', 'dismissed', 'snoozed')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (finding_document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_deliveries_user_status
  ON fleetgraph_deliveries(user_id, status, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_deliveries_finding
  ON fleetgraph_deliveries(finding_document_id);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_deliveries_workspace_status
  ON fleetgraph_deliveries(workspace_id, status, delivered_at DESC);

CREATE TABLE IF NOT EXISTS fleetgraph_action_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  finding_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  run_id UUID REFERENCES fleetgraph_runs(id) ON DELETE SET NULL,
  proposed_action TEXT NOT NULL,
  target_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'failed')),
  requested_by_actor TEXT NOT NULL DEFAULT 'fleetgraph',
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_proposals_status
  ON fleetgraph_action_proposals(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_proposals_finding_status
  ON fleetgraph_action_proposals(finding_document_id, status)
  WHERE finding_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_proposals_run
  ON fleetgraph_action_proposals(run_id, created_at DESC)
  WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fleetgraph_action_proposals_target
  ON fleetgraph_action_proposals(target_document_id, created_at DESC)
  WHERE target_document_id IS NOT NULL;
