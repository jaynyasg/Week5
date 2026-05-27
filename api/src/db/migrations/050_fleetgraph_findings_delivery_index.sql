-- Keep FleetGraph inbox reads bounded by the signed-in user's deliveries.
-- The public findings route orders by delivered_at after filtering workspace/user.

CREATE INDEX IF NOT EXISTS idx_fleetgraph_deliveries_workspace_user_delivered
  ON fleetgraph_deliveries(workspace_id, user_id, delivered_at DESC);
