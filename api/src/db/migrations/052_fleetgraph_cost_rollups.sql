-- FleetGraph monthly cost rollups.
-- Retention can prune old per-run rows while preserving long-lived spend totals.

CREATE TABLE IF NOT EXISTS fleetgraph_monthly_cost_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('proactive', 'chat', 'manual')),
  provider TEXT NOT NULL DEFAULT 'unknown',
  model TEXT NOT NULL DEFAULT 'unknown',
  run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, month, mode, provider, model)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_cost_rollups_workspace_month
  ON fleetgraph_monthly_cost_rollups(workspace_id, month DESC);
