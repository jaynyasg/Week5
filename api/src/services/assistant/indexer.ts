import { createHash } from 'crypto';
import { pool } from '../../db/client.js';
import { invalidateDocumentCache } from '../../collaboration/index.js';
import { ASSISTANT_LIMITS } from './config.js';
import { AssistantEmbeddingError, generateAssistantEmbedding } from './embeddings.js';
import { extractTextFromFile, isSupportedAssistantFile } from './extractors.js';
import { safeRecordAssistantTraceEvent } from './tracing.js';

interface FileRow {
  id: string;
  workspace_id: string;
  document_id: string | null;
  uploaded_by: string | null;
  filename: string;
  mime_type: string;
  size_bytes: string | number;
}

export async function indexUploadedFileForAssistant(input: {
  fileId: string;
  workspaceId: string;
  buffer: Buffer;
}): Promise<void> {
  const file = await getFile(input.fileId, input.workspaceId);
  if (!file) return;

  try {
    await deleteFileChunks(file.id, file.workspace_id);

    if (!isSupportedAssistantFile(file.filename, file.mime_type)) {
      await updateIndexStatus(file.id, file.workspace_id, 'unsupported', 'File type is not supported for Ask Ship indexing');
      return;
    }

    if (input.buffer.byteLength > ASSISTANT_LIMITS.maxExtractionBytes) {
      await updateIndexStatus(file.id, file.workspace_id, 'failed', `File exceeds Ask Ship extraction limit of ${ASSISTANT_LIMITS.maxExtractionBytes} bytes`);
      return;
    }

    await updateIndexStatus(file.id, file.workspace_id, 'indexing', null);
    const extractionStartedAt = Date.now();
    const extracted = await extractTextFromFile({
      buffer: input.buffer,
      mimeType: file.mime_type,
      filename: file.filename,
    });
    await safeRecordAssistantTraceEvent({
      workspaceId: file.workspace_id,
      userId: file.uploaded_by,
      eventType: 'extraction',
      eventName: 'file_text_extracted',
      fileId: file.id,
      documentId: file.document_id,
      durationMs: Date.now() - extractionStartedAt,
      metadata: {
        filename: file.filename,
        mimeType: file.mime_type,
        supported: extracted.supported,
        extractedChars: extracted.text.length,
      },
    });

    if (!extracted.supported) {
      await updateIndexStatus(file.id, file.workspace_id, 'unsupported', extracted.reason ?? 'Unsupported file type');
      return;
    }

    const text = normalizeText(extracted.text);
    if (!text) {
      await updateIndexStatus(file.id, file.workspace_id, 'failed', 'No indexable text was extracted');
      return;
    }

    const chunks = chunkText(text);
    const chunkEmbeddings = await embedChunks(file, chunks);
    const contentHash = createHash('sha256').update(text).digest('hex');
    for (const [index, chunk] of chunks.entries()) {
      const embedding = chunkEmbeddings[index] ?? null;
      await pool.query(
        `INSERT INTO assistant_search_chunks
          (workspace_id, source_type, source_id, document_id, file_id, chunk_index, title, text, metadata,
           embedding, embedding_model, embedding_dimensions, embedding_created_at)
         VALUES ($1, 'file', $2, $3, $2, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $8::double precision[] IS NULL THEN NULL ELSE now() END)
         ON CONFLICT (workspace_id, source_type, source_id, chunk_index)
         DO UPDATE SET
           document_id = EXCLUDED.document_id,
           file_id = EXCLUDED.file_id,
           title = EXCLUDED.title,
           text = EXCLUDED.text,
           metadata = EXCLUDED.metadata,
           embedding = EXCLUDED.embedding,
           embedding_model = EXCLUDED.embedding_model,
           embedding_dimensions = EXCLUDED.embedding_dimensions,
           embedding_created_at = EXCLUDED.embedding_created_at,
           updated_at = now()`,
        [
          file.workspace_id,
          file.id,
          file.document_id,
          index,
          file.filename,
          chunk,
          JSON.stringify({
            mime_type: file.mime_type,
            filename: file.filename,
            content_hash: contentHash,
          }),
          embedding?.embedding ?? null,
          embedding?.model ?? null,
          embedding?.dimensions ?? null,
        ],
      );
    }

    await updateAssistantUploadDocumentContent(file, chunks);
    await updateIndexStatus(file.id, file.workspace_id, 'indexed', null);
  } catch (error) {
    await updateIndexStatus(
      file.id,
      file.workspace_id,
      'failed',
      error instanceof Error ? error.message.slice(0, 500) : 'File indexing failed',
    );
  }
}

async function updateAssistantUploadDocumentContent(file: FileRow, chunks: string[]): Promise<void> {
  if (!file.document_id || chunks.length === 0) return;

  const content = buildDocumentContentFromChunks(chunks);
  const result = await pool.query(
    `UPDATE documents
     SET content = $1,
         yjs_state = NULL,
         updated_at = now()
     WHERE id = $2
       AND workspace_id = $3
       AND document_type = 'wiki'
       AND properties->>'source' = 'assistant_upload'
       AND properties->>'file_id' = $4
     RETURNING id`,
    [JSON.stringify(content), file.document_id, file.workspace_id, file.id],
  );

  if (result.rows.length > 0) {
    invalidateDocumentCache(file.document_id);
  }
}

function buildDocumentContentFromChunks(chunks: string[]) {
  const paragraphs = chunks
    .flatMap(chunk => chunk.split(/\n{2,}/))
    .map(paragraph => paragraph.trim())
    .filter(Boolean);

  return {
    type: 'doc',
    content: paragraphs.length > 0
      ? paragraphs.map(paragraph => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph }],
      }))
      : [{ type: 'paragraph' }],
  };
}

export async function markFileAssistantIndexFailed(
  fileId: string,
  workspaceId: string,
  error: unknown,
): Promise<void> {
  await updateIndexStatus(
    fileId,
    workspaceId,
    'failed',
    error instanceof Error ? error.message.slice(0, 500) : 'File indexing failed',
  );
}

export async function getFileAssistantIndexStatus(fileId: string, workspaceId: string) {
  const result = await pool.query(
    `SELECT id,
            assistant_indexing_status,
            assistant_indexed_at,
            assistant_index_error,
            document_id
     FROM files
     WHERE id = $1 AND workspace_id = $2`,
    [fileId, workspaceId],
  );

  return result.rows[0] ?? null;
}

async function getFile(fileId: string, workspaceId: string): Promise<FileRow | null> {
  const result = await pool.query<FileRow>(
    `SELECT id, workspace_id, document_id, uploaded_by, filename, mime_type, size_bytes
     FROM files
     WHERE id = $1 AND workspace_id = $2`,
    [fileId, workspaceId],
  );

  return result.rows[0] ?? null;
}

async function embedChunks(file: FileRow, chunks: string[]) {
  const results: Array<Awaited<ReturnType<typeof generateAssistantEmbedding>> | null> = [];
  const startedAt = Date.now();
  let embeddedCount = 0;

  for (const chunk of chunks) {
    try {
      const embedding = await generateAssistantEmbedding(`${file.filename}\n\n${chunk}`);
      results.push(embedding);
      if (embedding) embeddedCount++;
    } catch (error) {
      await safeRecordAssistantTraceEvent({
        workspaceId: file.workspace_id,
        userId: file.uploaded_by,
        eventType: 'embedding',
        eventName: 'file_chunk_embedding_failed',
        fileId: file.id,
        documentId: file.document_id,
        durationMs: Date.now() - startedAt,
        metadata: {
          filename: file.filename,
          providerError: error instanceof AssistantEmbeddingError,
          completedChunks: embeddedCount,
          totalChunks: chunks.length,
        },
        error: error instanceof Error ? error.message.slice(0, 500) : 'File chunk embedding failed',
      });
      return results;
    }
  }

  if (embeddedCount > 0) {
    await safeRecordAssistantTraceEvent({
      workspaceId: file.workspace_id,
      userId: file.uploaded_by,
      eventType: 'embedding',
      eventName: 'file_chunks_embedded',
      fileId: file.id,
      documentId: file.document_id,
      durationMs: Date.now() - startedAt,
      metadata: {
        filename: file.filename,
        chunkCount: chunks.length,
        embeddedCount,
        model: results.find(Boolean)?.model,
        dimensions: results.find(Boolean)?.dimensions,
      },
    });
  }

  return results;
}

async function deleteFileChunks(fileId: string, workspaceId: string): Promise<void> {
  await pool.query(
    `DELETE FROM assistant_search_chunks
     WHERE workspace_id = $1 AND source_type = 'file' AND source_id = $2`,
    [workspaceId, fileId],
  );
}

async function updateIndexStatus(
  fileId: string,
  workspaceId: string,
  status: 'not_indexed' | 'indexing' | 'indexed' | 'unsupported' | 'failed',
  error: string | null,
): Promise<void> {
  await pool.query(
    `UPDATE files
     SET assistant_indexing_status = $1,
         assistant_indexed_at = CASE WHEN $1 = 'indexed' THEN now() ELSE assistant_indexed_at END,
         assistant_index_error = $2,
         updated_at = now()
     WHERE id = $3 AND workspace_id = $4`,
    [status, error, fileId, workspaceId],
  );
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkText(text: string): string[] {
  const maxChunkChars = 1400;
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChunkChars) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);
    if (paragraph.length <= maxChunkChars) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChunkChars) {
      chunks.push(paragraph.slice(index, index + maxChunkChars));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks.slice(0, ASSISTANT_LIMITS.maxContextChunks * 4);
}
