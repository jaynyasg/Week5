ALTER TABLE files
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assistant_indexing_status TEXT NOT NULL DEFAULT 'not_indexed'
    CHECK (assistant_indexing_status IN ('not_indexed', 'indexing', 'indexed', 'unsupported', 'failed')),
  ADD COLUMN IF NOT EXISTS assistant_indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assistant_index_error TEXT;

CREATE INDEX IF NOT EXISTS idx_files_document_id
  ON files(document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_assistant_indexing_status
  ON files(workspace_id, assistant_indexing_status);
