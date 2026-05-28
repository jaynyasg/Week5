import { pool } from './client.js';

let schemaRepairPromise: Promise<void> | null = null;

export function ensureAssistantUploadSchema(): Promise<void> {
  schemaRepairPromise ??= repairAssistantUploadSchema().catch((error) => {
    schemaRepairPromise = null;
    throw error;
  });

  return schemaRepairPromise;
}

async function repairAssistantUploadSchema(): Promise<void> {
  await pool.query(`
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
    AS $function$
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
    $function$;

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
  `);

  await backfillBlankAssistantUploadDocumentBodies();
  await backfillFleetGraphFindingChunks();
}

async function backfillBlankAssistantUploadDocumentBodies(): Promise<void> {
  await pool.query(`
    WITH blank_uploaded_docs AS (
      SELECT d.id AS document_id,
             d.workspace_id,
             NULLIF(d.properties->>'file_id', '') AS file_id
      FROM documents d
      WHERE d.document_type = 'wiki'
        AND d.properties->>'source' = 'assistant_upload'
        AND (
          d.content IS NULL
          OR d.content = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
          OR d.content = '{"type":"doc","content":[{"type":"paragraph","content":[]}]}'::jsonb
          OR d.content = '{"type":"doc","content":[]}'::jsonb
        )
    ),
    uploaded_doc_chunks AS (
      SELECT b.document_id,
             string_agg(c.text, E'\n\n' ORDER BY c.chunk_index) AS extracted_text
      FROM blank_uploaded_docs b
      JOIN assistant_search_chunks c
        ON c.workspace_id = b.workspace_id
       AND c.source_type = 'file'
       AND (
         c.document_id = b.document_id
         OR (
           b.file_id IS NOT NULL
           AND (
             c.file_id::text = b.file_id
             OR c.source_id::text = b.file_id
           )
         )
       )
      WHERE btrim(c.text) <> ''
      GROUP BY b.document_id
    ),
    paragraphs AS (
      SELECT document_id,
             ordinality,
             btrim(paragraph_text) AS paragraph_text
      FROM uploaded_doc_chunks,
           regexp_split_to_table(extracted_text, E'\n\\s*\n') WITH ORDINALITY AS split(paragraph_text, ordinality)
      WHERE btrim(paragraph_text) <> ''
    ),
    document_content AS (
      SELECT document_id,
             jsonb_build_object(
               'type', 'doc',
               'content', jsonb_agg(
                 jsonb_build_object(
                   'type', 'paragraph',
                   'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', paragraph_text))
                 )
                 ORDER BY ordinality
               )
             ) AS content
      FROM paragraphs
      GROUP BY document_id
    )
    UPDATE documents d
    SET content = dc.content,
        yjs_state = NULL,
        updated_at = now()
    FROM document_content dc
    WHERE d.id = dc.document_id;
  `);
}

async function backfillFleetGraphFindingChunks(): Promise<void> {
  await pool.query(`
    WITH fleetgraph_findings AS (
      SELECT d.id,
             d.workspace_id,
             d.title,
             btrim(concat_ws(E'\n',
               'FleetGraph risk analysis.',
               'Topics: risk, at risk, blocked, overdue, stale work, planning gap, ownership gap, action required.',
               'Finding title: ' || d.title,
               'Status: ' || NULLIF(d.properties->>'status', ''),
               'Severity: ' || NULLIF(d.properties->>'severity', ''),
               'Kind: ' || NULLIF(d.properties->>'kind', ''),
               'Confidence: ' || NULLIF(d.properties->>'confidence', ''),
               'Summary: ' || NULLIF(d.properties->>'summary', ''),
               'Rationale: ' || NULLIF(d.properties->>'rationale', ''),
               'Target document ID: ' || NULLIF(d.properties->>'target_document_id', ''),
               'Target document type: ' || NULLIF(d.properties->>'target_document_type', ''),
               'Owner user ID: ' || NULLIF(d.properties->>'owner_user_id', ''),
               'FleetGraph run ID: ' || NULLIF(d.properties->>'run_id', ''),
               'First detected at: ' || NULLIF(d.properties->>'first_detected_at', ''),
               'Last observed at: ' || NULLIF(d.properties->>'last_observed_at', ''),
               (
                 SELECT CASE
                   WHEN COUNT(*) > 0 THEN 'Evidence:' || E'\n' || string_agg(
                     concat_ws(' ',
                       evidence.ordinality::text || '.',
                       evidence.item->>'sourceType',
                       evidence.item->>'title',
                       evidence.item->>'excerpt',
                       evidence.item->>'url'
                     ),
                     E'\n'
                     ORDER BY evidence.ordinality
                   )
                   ELSE NULL
                 END
                 FROM jsonb_array_elements(
                   CASE
                     WHEN jsonb_typeof(COALESCE(d.properties, '{}'::jsonb)->'evidence') = 'array'
                     THEN COALESCE(d.properties, '{}'::jsonb)->'evidence'
                     ELSE '[]'::jsonb
                   END
                 ) WITH ORDINALITY AS evidence(item, ordinality)
               )
             )) AS text
      FROM documents d
      WHERE d.document_type::text = 'fleetgraph_finding'
        AND d.archived_at IS NULL
        AND d.deleted_at IS NULL
    )
    INSERT INTO assistant_search_chunks (
      workspace_id, source_type, source_id, document_id, chunk_index, title, text, metadata
    )
    SELECT workspace_id,
           'document',
           id,
           id,
           0,
           title,
           text,
           jsonb_build_object(
             'document_type', 'fleetgraph_finding',
             'indexed_for', 'ask_ship',
             'backfilled', true
           )
    FROM fleetgraph_findings
    WHERE text <> ''
    ON CONFLICT (workspace_id, source_type, source_id, chunk_index)
    DO UPDATE SET
      document_id = EXCLUDED.document_id,
      title = EXCLUDED.title,
      text = EXCLUDED.text,
      metadata = assistant_search_chunks.metadata || EXCLUDED.metadata,
      updated_at = now();
  `);
}
