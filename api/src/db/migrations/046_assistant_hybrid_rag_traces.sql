-- Ask Ship hybrid retrieval and trace foundation.
-- Embeddings are stored as float arrays so local PostgreSQL remains usable even
-- when pgvector is unavailable. Render can additionally enable pgvector.

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN undefined_file OR feature_not_supported THEN
    RAISE NOTICE 'pgvector extension is unavailable; assistant embeddings will use float-array scoring';
  END;
END $$;

ALTER TABLE assistant_search_chunks
  ADD COLUMN IF NOT EXISTS embedding DOUBLE PRECISION[],
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER,
  ADD COLUMN IF NOT EXISTS embedding_created_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE 'ALTER TABLE assistant_search_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(1536)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_assistant_search_chunks_embedding_vector
      ON assistant_search_chunks USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION assistant_cosine_similarity(
  left_embedding DOUBLE PRECISION[],
  right_embedding DOUBLE PRECISION[]
)
RETURNS DOUBLE PRECISION
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN array_length(left_embedding, 1) IS NULL
      OR array_length(right_embedding, 1) IS NULL
      OR array_length(left_embedding, 1) <> array_length(right_embedding, 1)
      OR sums.left_norm = 0
      OR sums.right_norm = 0
    THEN NULL
    ELSE sums.dot_product / (sqrt(sums.left_norm) * sqrt(sums.right_norm))
  END
  FROM (
    SELECT
      sum(l.value * r.value) AS dot_product,
      sum(l.value * l.value) AS left_norm,
      sum(r.value * r.value) AS right_norm
    FROM unnest(left_embedding) WITH ORDINALITY AS l(value, index)
    JOIN unnest(right_embedding) WITH ORDINALITY AS r(value, index)
      ON r.index = l.index
  ) AS sums;
$$;

CREATE TABLE IF NOT EXISTS assistant_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  provider TEXT,
  model TEXT,
  total_sources INTEGER NOT NULL DEFAULT 0,
  citations_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_runs_request_id
  ON assistant_runs(request_id);

CREATE INDEX IF NOT EXISTS idx_assistant_runs_workspace_created
  ON assistant_runs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES assistant_runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  duration_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_trace_events_run
  ON assistant_trace_events(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_trace_events_workspace_created
  ON assistant_trace_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_trace_events_file
  ON assistant_trace_events(file_id, created_at DESC)
  WHERE file_id IS NOT NULL;
