-- Second idempotent repair for deployments where the application reached upload
-- code before assistant upload migrations were applied.

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assistant_indexing_status TEXT DEFAULT 'not_indexed',
  ADD COLUMN IF NOT EXISTS assistant_indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assistant_index_error TEXT;

UPDATE files
SET assistant_indexing_status = 'not_indexed'
WHERE assistant_indexing_status IS NULL;

ALTER TABLE files
  ALTER COLUMN assistant_indexing_status SET DEFAULT 'not_indexed',
  ALTER COLUMN assistant_indexing_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'files'::regclass
      AND conname = 'files_assistant_indexing_status_check'
  ) THEN
    ALTER TABLE files
      ADD CONSTRAINT files_assistant_indexing_status_check
      CHECK (assistant_indexing_status IN ('not_indexed', 'indexing', 'indexed', 'unsupported', 'failed'));
  END IF;
END $$;

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

ALTER TABLE assistant_search_chunks
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_files_document_id
  ON files(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_assistant_indexing_status
  ON files(workspace_id, assistant_indexing_status);

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_workspace
  ON assistant_search_chunks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_document
  ON assistant_search_chunks(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_file
  ON assistant_search_chunks(file_id)
  WHERE file_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_search_chunks_source_unique
  ON assistant_search_chunks(workspace_id, source_type, source_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_vector
  ON assistant_search_chunks USING GIN(search_vector);
