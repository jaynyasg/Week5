-- Add canonical dependency edges for Phase 04A timeline planning.
-- A row means: document_id depends on related_id.

ALTER TYPE relationship_type ADD VALUE IF NOT EXISTS 'depends_on';
