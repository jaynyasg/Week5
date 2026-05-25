-- Populate the TipTap body for uploaded Docs entries from their indexed text.
-- Only blank assistant-upload documents are touched so user edits are preserved.

WITH uploaded_doc_chunks AS (
  SELECT d.id AS document_id,
         string_agg(c.text, E'\n\n' ORDER BY c.chunk_index) AS extracted_text
  FROM documents d
  JOIN files f
    ON f.document_id = d.id
   AND f.workspace_id = d.workspace_id
  JOIN assistant_search_chunks c
    ON c.workspace_id = f.workspace_id
   AND c.source_type = 'file'
   AND c.source_id = f.id
  WHERE d.document_type = 'wiki'
    AND d.properties->>'source' = 'assistant_upload'
    AND (
      d.content IS NULL
      OR d.content = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
      OR d.content = '{"type":"doc","content":[{"type":"paragraph","content":[]}]}'::jsonb
      OR d.content = '{"type":"doc","content":[]}'::jsonb
    )
  GROUP BY d.id
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
