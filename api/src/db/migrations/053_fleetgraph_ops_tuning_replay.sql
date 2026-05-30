-- FleetGraph operations, detector tuning, and replay harness support.
-- Findings remain documents; these tables store workspace-level graph configuration
-- and replayable evaluation snapshots.

CREATE TABLE IF NOT EXISTS fleetgraph_detector_settings (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  detector_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  severity TEXT CHECK (severity IS NULL OR severity IN ('info', 'low', 'medium', 'high', 'critical')),
  thresholds JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, detector_id)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_detector_settings_workspace
  ON fleetgraph_detector_settings(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fleetgraph_replay_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  route_context JSONB NOT NULL DEFAULT '{}',
  trigger_type TEXT NOT NULL DEFAULT 'manual_replay',
  trigger_id UUID,
  message TEXT,
  expected JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_replay_scenarios_workspace
  ON fleetgraph_replay_scenarios(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS fleetgraph_replay_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES fleetgraph_replay_scenarios(id) ON DELETE CASCADE,
  run_id UUID REFERENCES fleetgraph_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'interrupted', 'failed')),
  score NUMERIC(5, 3) NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_replay_runs_scenario
  ON fleetgraph_replay_runs(scenario_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_replay_runs_workspace
  ON fleetgraph_replay_runs(workspace_id, created_at DESC);
