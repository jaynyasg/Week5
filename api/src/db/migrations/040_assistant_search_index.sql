-- Derived search chunks for Ask Ship.
-- Source tables remain authoritative; these rows are disposable and can be regenerated.

CREATE TABLE IF NOT EXISTS assistant_search_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('document', 'project', 'program', 'issue', 'week', 'timeline', 'file')),
  source_id UUID NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(text, ''))
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_workspace
  ON assistant_search_chunks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_document
  ON assistant_search_chunks(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_file
  ON assistant_search_chunks(file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_vector
  ON assistant_search_chunks USING GIN(search_vector);
