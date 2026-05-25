-- Existing standalone Ask Ship uploads were indexed as files before uploads
-- created Docs entries. Backfill workspace wiki documents for those files.

WITH eligible_files AS (
  SELECT f.id,
         f.workspace_id,
         f.uploaded_by,
         f.filename,
         f.mime_type,
         f.size_bytes,
         f.created_at
  FROM files f
  WHERE f.status = 'uploaded'
    AND f.document_id IS NULL
    AND f.assistant_indexing_status = 'indexed'
    AND (
      f.mime_type LIKE 'text/%'
      OR lower(f.filename) LIKE '%.txt'
      OR lower(f.filename) LIKE '%.md'
      OR lower(f.filename) LIKE '%.csv'
      OR f.mime_type = 'application/pdf'
      OR lower(f.filename) LIKE '%.pdf'
      OR f.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      OR lower(f.filename) LIKE '%.docx'
    )
),
created_documents AS (
  INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility, created_at, updated_at)
  SELECT workspace_id,
         'wiki',
         filename,
         '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
         jsonb_build_object(
           'source', 'assistant_upload',
           'file_id', id,
           'filename', filename,
           'mime_type', mime_type,
           'size_bytes', size_bytes
         ),
         uploaded_by,
         'workspace',
         created_at,
         now()
  FROM eligible_files
  RETURNING id, properties
),
linked_files AS (
  UPDATE files f
  SET document_id = d.id,
      updated_at = now()
  FROM created_documents d
  WHERE f.id = (d.properties->>'file_id')::uuid
  RETURNING f.id AS file_id, f.document_id
)
UPDATE assistant_search_chunks c
SET document_id = lf.document_id,
    updated_at = now()
FROM linked_files lf
WHERE c.source_type = 'file'
  AND c.source_id = lf.file_id
  AND c.document_id IS NULL;
