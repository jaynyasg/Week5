-- Re-run the uploaded Doc body backfill for any blank assistant-upload docs.
--
-- Migration 045 populated blank uploaded-doc shells from already-indexed chunks.
-- It was intentionally one-shot, so rows that remained blank after that deploy
-- need a new migration version. This stays conservative: only blank
-- assistant_upload wiki docs are touched, preserving any user-authored content.

WITH blank_uploaded_docs AS (
  SELECT d.id AS document_id,
         d.workspace_id,
         COALESCE(
           NULLIF(d.properties->>'file_id', ''),
           f.id::text
         ) AS file_id
  FROM documents d
  LEFT JOIN files f
    ON f.document_id = d.id
   AND f.workspace_id = d.workspace_id
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
     OR c.file_id::text = b.file_id
     OR c.source_id::text = b.file_id
   )
  WHERE b.file_id IS NOT NULL
    AND btrim(c.text) <> ''
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
