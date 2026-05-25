-- Migration 038: ShipShape Phase 2 query performance indexes
-- Supports weeks list ORDER BY sprint_number and documents list ORDER BY position

CREATE INDEX IF NOT EXISTS idx_documents_sprint_number
  ON documents (((properties->>'sprint_number')::int))
  WHERE document_type = 'sprint' AND archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_sort
  ON documents (workspace_id, position, created_at)
  WHERE archived_at IS NULL AND deleted_at IS NULL;
