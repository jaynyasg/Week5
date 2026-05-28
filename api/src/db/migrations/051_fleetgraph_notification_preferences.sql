-- Per-user FleetGraph notification rules.
-- Findings remain durable and delivered even when a user suppresses badges or toasts.

CREATE TABLE IF NOT EXISTS fleetgraph_notification_preferences (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  toast_min_severity TEXT NOT NULL DEFAULT 'high'
    CHECK (toast_min_severity IN ('off', 'info', 'low', 'medium', 'high', 'critical')),
  toast_action_required BOOLEAN NOT NULL DEFAULT true,
  show_unread_badge BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fleetgraph_notification_preferences_user
  ON fleetgraph_notification_preferences(user_id, workspace_id);
