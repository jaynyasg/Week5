import { Router, Request, Response } from 'express';
import express from 'express';
import { pool } from '../db/client.js';
import { ensureAssistantUploadSchema } from '../db/assistant-upload-schema.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { authMiddleware } from '../middleware/auth.js';
import { getVisibilityContext, VISIBILITY_FILTER_SQL } from '../middleware/visibility.js';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  getFileAssistantIndexStatus,
  indexUploadedFileForAssistant,
  markFileAssistantIndexFailed,
} from '../services/assistant/indexer.js';
import { isSupportedAssistantFile } from '../services/assistant/extractors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Local uploads directory. Render can opt into this for demo uploads with SHIP_UPLOAD_STORAGE=local.
const UPLOADS_DIR = process.env.SHIP_UPLOADS_DIR || join(__dirname, '../../uploads');

// S3 configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Max file size: 1GB (1073741824 bytes)
const MAX_FILE_SIZE = 1073741824;

// Presigned URL expiration: 15 minutes
const PRESIGNED_URL_EXPIRES_IN = 15 * 60;

// Initialize S3 client (only when bucket is configured)
let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return s3Client;
}

// UUID validation regex - prevents path traversal by ensuring ID is valid UUID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string | string[] | undefined): id is string {
  if (!id || Array.isArray(id)) return false;
  return UUID_REGEX.test(id);
}

type RouterType = ReturnType<typeof Router>;
export const filesRouter: RouterType = Router();

// Validation schemas
const uploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE, {
    message: `File size exceeds maximum allowed (${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB)`,
  }),
  documentId: z.string().uuid().nullable().optional(),
});

const confirmUploadSchema = z.object({
  createDocument: z.boolean().optional(),
});

/**
 * Blocked file extensions for security (executables and scripts)
 * We allow ANY file type EXCEPT these dangerous extensions.
 * Check by extension, not MIME type (MIME types are unreliable and can be spoofed).
 */
const BLOCKED_EXTENSIONS = new Set([
  // Windows executables
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  // Windows scripts
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  // Windows system files
  '.dll', '.sys', '.drv', '.cpl', '.ocx',
  // Windows shortcuts and config
  '.lnk', '.inf', '.reg', '.msc',
  // macOS executables
  '.app', '.dmg', '.pkg',
  // Linux executables and packages
  '.sh', '.bash', '.deb', '.rpm', '.run',
  // Cross-platform
  '.jar', '.ps1', '.psm1', '.psd1',
]);

function isAllowedFile(filename: string): boolean {
  // Check extension against blocklist (allow everything except dangerous types)
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return !BLOCKED_EXTENSIONS.has(ext);
}

// POST /api/files/upload - Get presigned URL for upload
// For local dev: returns a mock upload URL
// For production: would return S3 presigned URL
filesRouter.post('/upload', authMiddleware, async (req: Request, res: Response) => {
  try {
    const validation = uploadRequestSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ error: 'Invalid request', details: validation.error.errors });
      return;
    }

    const { filename, mimeType, sizeBytes, documentId } = validation.data;
    const workspaceId = req.workspaceId;
    const userId = req.userId;

    if (!workspaceId || !userId) {
      res.status(400).json({ error: 'Select a workspace before uploading files' });
      return;
    }

    // Validate file type
    if (!isAllowedFile(filename)) {
      res.status(400).json({ error: 'File type not allowed' });
      return;
    }

    if (documentId && !(await canAssociateFileWithDocument(
      documentId,
      workspaceId,
      userId,
      req.workspaceRole,
      req.isSuperAdmin,
    ))) {
      res.status(403).json({ error: 'Document not found or inaccessible' });
      return;
    }

    // Generate unique S3 key / local path
    const fileId = randomUUID();
    const ext = filename.slice(filename.lastIndexOf('.'));
    const s3Key = `${workspaceId}/${fileId}${ext}`;

    const assistantIndexingStatus = isSupportedAssistantFile(filename, mimeType) ? 'not_indexed' : 'unsupported';

    // Build the storage URL before creating the DB row so misconfigured storage
    // does not leave an orphaned pending file record.
    const uploadUrl = shouldUseLocalUploads()
      ? `/api/files/${fileId}/local-upload`
      : await generateS3PresignedUrl(s3Key, mimeType, sizeBytes);

    await ensureAssistantUploadSchema();

    // Create file record with 'pending' status
    const result = await pool.query(
      `INSERT INTO files
        (id, workspace_id, uploaded_by, filename, mime_type, size_bytes, s3_key, status, document_id, assistant_indexing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
       RETURNING id, assistant_indexing_status`,
      [fileId, workspaceId, userId, filename, mimeType, sizeBytes, s3Key, documentId ?? null, assistantIndexingStatus]
    );

    res.json({
      fileId: result.rows[0].id,
      uploadUrl,
      s3Key,
      assistantIndexingStatus: result.rows[0].assistant_indexing_status,
    });
  } catch (error) {
    console.error('Error creating upload:', error);
    res.status(500).json({ error: createUploadErrorMessage(error) });
  }
});

// Raw body parser for file uploads (1GB limit for local development)
const rawBodyParser = express.raw({
  type: '*/*',
  limit: '1gb',
});

// POST /api/files/:id/local-upload - Local development upload endpoint
// In production, files upload directly to S3
// SECURITY: UUID validation prevents path traversal attacks
filesRouter.post('/:id/local-upload', rawBodyParser, authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    // SECURITY: Validate UUID format to prevent path traversal
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const workspaceId = req.workspaceId;

    // Verify file record exists and belongs to user's workspace
    const fileResult = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND workspace_id = $2 AND status = 'pending'`,
      [fileId, workspaceId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: 'File not found or already uploaded' });
      return;
    }

    const file = fileResult.rows[0];

    // Get raw body as buffer - handle various input types
    let buffer: Buffer;
    if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else if (req.body instanceof Uint8Array) {
      buffer = Buffer.from(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      // Handle ArrayBuffer or typed array wrapped in object
      const data = req.body.data || req.body;
      if (Array.isArray(data)) {
        buffer = Buffer.from(data);
      } else {
        buffer = Buffer.from(JSON.stringify(req.body));
      }
    } else if (typeof req.body === 'string') {
      buffer = Buffer.from(req.body, 'base64');
    } else {
      res.status(400).json({ error: 'Invalid file data format' });
      return;
    }

    if (buffer.length === 0) {
      res.status(400).json({ error: 'No file data received' });
      return;
    }

    // Ensure uploads directory exists
    const filePath = join(UPLOADS_DIR, file.s3_key);
    await mkdir(dirname(filePath), { recursive: true });

    // Write file
    await writeFile(filePath, buffer);

    // Update file status
    const cdnUrl = `/api/files/${fileId}/serve`;
    await pool.query(
      `UPDATE files SET status = 'uploaded', cdn_url = $1, updated_at = NOW() WHERE id = $2`,
      [cdnUrl, fileId]
    );

    const fileForIndexing = await ensureDocumentForUploadedFile(
      file,
      workspaceId!,
      req.userId!,
      req.query.createDocument === '1',
    );
    await indexUploadedFileWithoutFailingUpload(fileForIndexing, workspaceId!, buffer);
    const indexStatus = await getFileAssistantIndexStatus(fileId, workspaceId!);

    res.json({
      success: true,
      assistantIndexingStatus: indexStatus?.assistant_indexing_status ?? file.assistant_indexing_status,
      documentId: indexStatus?.document_id ?? fileForIndexing.document_id ?? null,
    });
  } catch (error) {
    console.error('Error uploading file locally:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// POST /api/files/:id/confirm - Confirm upload complete (for S3 direct uploads)
// SECURITY: UUID validation prevents path traversal attacks
filesRouter.post('/:id/confirm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    // SECURITY: Validate UUID format to prevent path traversal
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const workspaceId = req.workspaceId;

    // Verify file record exists and belongs to user's workspace
    const fileResult = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND workspace_id = $2`,
      [fileId, workspaceId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = fileResult.rows[0];

    // For production: verify file exists in S3
    // For local dev: file was already saved in local-upload

    // Generate CDN URL
    let cdnUrl: string;
    if (shouldUseLocalUploads()) {
      cdnUrl = `/api/files/${fileId}/serve`;
    } else {
      const cdnDomain = process.env.CDN_DOMAIN;
      if (!cdnDomain) {
        throw new Error('CDN_DOMAIN environment variable is required in production');
      }
      cdnUrl = `https://${cdnDomain}/${file.s3_key}`;
    }

    // Update file status
    await pool.query(
      `UPDATE files SET status = 'uploaded', cdn_url = $1, updated_at = NOW() WHERE id = $2`,
      [cdnUrl, fileId]
    );

    const confirmOptions = confirmUploadSchema.safeParse(req.body);
    const fileForIndexing = await ensureDocumentForUploadedFile(
      file,
      workspaceId!,
      req.userId!,
      confirmOptions.success ? confirmOptions.data.createDocument === true : false,
    );
    await indexUploadedFileWithoutFailingUpload(fileForIndexing, workspaceId!);
    const indexStatus = await getFileAssistantIndexStatus(fileId, workspaceId!);

    res.json({
      fileId,
      cdnUrl,
      status: 'uploaded',
      assistantIndexingStatus: indexStatus?.assistant_indexing_status ?? file.assistant_indexing_status,
      documentId: indexStatus?.document_id ?? fileForIndexing.document_id ?? null,
    });
  } catch (error) {
    console.error('Error confirming upload:', error);
    res.status(500).json({ error: 'Failed to confirm upload' });
  }
});

// GET /api/files/:id/serve - Serve file (local development only)
// SECURITY: requireAuth added to prevent unauthenticated file access
// SECURITY: UUID validation prevents path traversal attacks
filesRouter.get('/:id/serve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    // SECURITY: Validate UUID format to prevent path traversal
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const workspaceId = req.workspaceId;

    // Get file record - SECURITY: Verify file belongs to user's workspace
    const fileResult = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND workspace_id = $2 AND status = 'uploaded'`,
      [fileId, workspaceId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = fileResult.rows[0];
    if (!shouldUseLocalUploads()) {
      res.redirect(file.cdn_url);
      return;
    }

    const filePath = join(UPLOADS_DIR, file.s3_key);

    // Set content type and serve file
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// GET /api/files/:id - Get file metadata
// SECURITY: UUID validation prevents path traversal attacks
filesRouter.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    // SECURITY: Validate UUID format to prevent path traversal
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const workspaceId = req.workspaceId;

    const result = await pool.query(
      `SELECT id, filename, mime_type, size_bytes, cdn_url, status, document_id,
              assistant_indexing_status, assistant_indexed_at, assistant_index_error, created_at
       FROM files WHERE id = $1 AND workspace_id = $2`,
      [fileId, workspaceId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// GET /api/files/:id/assistant-index - Get Ask Ship indexing status for a file
filesRouter.get('/:id/assistant-index', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const status = await getFileAssistantIndexStatus(fileId, req.workspaceId!);
    if (!status) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting file assistant index status:', error);
    res.status(500).json({ error: 'Failed to get file assistant index status' });
  }
});

// POST /api/files/:id/reindex - Rebuild Ask Ship chunks for an uploaded file
filesRouter.post('/:id/reindex', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const fileResult = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND workspace_id = $2 AND status = 'uploaded'`,
      [fileId, req.workspaceId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const buffer = await loadUploadedFileBuffer(fileResult.rows[0]);
    await indexUploadedFileForAssistant({ fileId, workspaceId: req.workspaceId!, buffer });
    const status = await getFileAssistantIndexStatus(fileId, req.workspaceId!);

    res.json(status);
  } catch (error) {
    console.error('Error reindexing file for assistant:', error);
    res.status(500).json({ error: 'Failed to reindex file' });
  }
});

// DELETE /api/files/:id - Delete a file
// SECURITY: UUID validation prevents path traversal attacks
filesRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;

    // SECURITY: Validate UUID format to prevent path traversal
    if (!fileId || !isValidUUID(fileId)) {
      res.status(400).json({ error: 'Invalid file ID format' });
      return;
    }

    const workspaceId = req.workspaceId;

    // Get file record
    const fileResult = await pool.query(
      `SELECT * FROM files WHERE id = $1 AND workspace_id = $2`,
      [fileId, workspaceId]
    );

    if (fileResult.rows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = fileResult.rows[0];

    // Delete from storage (local or S3)
    const s3BucketName = getS3BucketName();
    if (!shouldUseLocalUploads() && s3BucketName) {
      const client = getS3Client();
      const command = new DeleteObjectCommand({
        Bucket: s3BucketName,
        Key: file.s3_key,
      });
      await client.send(command);
    } else {
      try {
        const filePath = join(UPLOADS_DIR, file.s3_key);
        await unlink(filePath);
      } catch {
        // File might not exist, ignore error
      }
    }

    // Delete database record
    await pool.query('DELETE FROM files WHERE id = $1', [fileId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * Generate a presigned URL for S3 PUT upload
 * @param s3Key - The S3 object key (path within bucket)
 * @param contentType - The MIME type of the file being uploaded
 * @param sizeBytes - The expected file size in bytes
 * @returns Presigned URL valid for 15 minutes
 */
async function generateS3PresignedUrl(s3Key: string, contentType: string, sizeBytes: number): Promise<string> {
  const s3BucketName = getS3BucketName();
  if (!s3BucketName) {
    throw new Error('S3_UPLOADS_BUCKET environment variable is not configured');
  }

  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: s3BucketName,
    Key: s3Key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGNED_URL_EXPIRES_IN,
  });

  return presignedUrl;
}

function shouldUseLocalUploads(): boolean {
  const storageMode = process.env.SHIP_UPLOAD_STORAGE?.trim().toLowerCase();
  if (storageMode === 's3') return false;
  if (storageMode === 'local') return true;

  return !getS3BucketName() || !process.env.CDN_DOMAIN || process.env.NODE_ENV !== 'production';
}

async function canAssociateFileWithDocument(
  documentId: string,
  workspaceId: string,
  userId: string,
  workspaceRole?: string | null,
  isSuperAdmin = false,
): Promise<boolean> {
  const { isAdmin } = await getVisibilityContext(userId, workspaceId, workspaceRole, isSuperAdmin);
  const result = await pool.query(
    `SELECT d.id
     FROM documents d
     WHERE d.id = $1
       AND d.workspace_id = $2
       AND d.archived_at IS NULL
       AND d.deleted_at IS NULL
       AND ${VISIBILITY_FILTER_SQL('d', '$3', '$4')}
     LIMIT 1`,
    [documentId, workspaceId, userId, isAdmin],
  );

  return result.rows.length > 0;
}

async function loadUploadedFileBuffer(file: { s3_key: string }): Promise<Buffer> {
  if (shouldUseLocalUploads()) {
    return readFile(join(UPLOADS_DIR, file.s3_key));
  }

  const response = await getS3Client().send(new GetObjectCommand({
    Bucket: getS3BucketName(),
    Key: file.s3_key,
  }));

  return s3BodyToBuffer(response.Body);
}

interface UploadedFileRow {
  id: string;
  filename: string;
  mime_type: string;
  s3_key: string;
  document_id?: string | null;
  size_bytes?: string | number;
}

async function ensureDocumentForUploadedFile(
  file: UploadedFileRow,
  workspaceId: string,
  userId: string,
  createDocument: boolean,
): Promise<UploadedFileRow> {
  if (!createDocument || file.document_id || !isSupportedAssistantFile(file.filename, file.mime_type)) {
    return file;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockedFileResult = await client.query<UploadedFileRow>(
      `SELECT id, filename, mime_type, s3_key, document_id, size_bytes
       FROM files
       WHERE id = $1 AND workspace_id = $2
       FOR UPDATE`,
      [file.id, workspaceId],
    );
    const lockedFile = lockedFileResult.rows[0];
    if (!lockedFile) {
      await client.query('COMMIT');
      return file;
    }

    if (lockedFile.document_id) {
      await client.query('COMMIT');
      return { ...file, document_id: lockedFile.document_id };
    }

    const documentResult = await client.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, properties, created_by, visibility)
       VALUES ($1, 'wiki', $2, $3, $4, $5, 'workspace')
       RETURNING id`,
      [
        workspaceId,
        lockedFile.filename,
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        JSON.stringify({
          source: 'assistant_upload',
          file_id: lockedFile.id,
          filename: lockedFile.filename,
          mime_type: lockedFile.mime_type,
          size_bytes: lockedFile.size_bytes,
        }),
        userId,
      ],
    );
    const documentId = documentResult.rows[0].id as string;

    await client.query(
      `UPDATE files
       SET document_id = $1,
           updated_at = NOW()
       WHERE id = $2 AND workspace_id = $3`,
      [documentId, lockedFile.id, workspaceId],
    );

    await client.query('COMMIT');
    return { ...file, document_id: documentId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function indexUploadedFileWithoutFailingUpload(
  file: UploadedFileRow,
  workspaceId: string,
  buffer?: Buffer,
): Promise<void> {
  if (!isSupportedAssistantFile(file.filename, file.mime_type)) return;

  try {
    const indexBuffer = buffer ?? await loadUploadedFileBuffer(file);
    await indexUploadedFileForAssistant({ fileId: file.id, workspaceId, buffer: indexBuffer });
  } catch (error) {
    console.error('Assistant file indexing failed:', {
      fileId: file.id,
      filename: file.filename,
      error,
    });
    await markFileAssistantIndexFailed(file.id, workspaceId, error);
  }
}

async function s3BodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    throw new Error('Uploaded file body was empty');
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof transformable.transformToByteArray === 'function') {
    return Buffer.from(await transformable.transformToByteArray());
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const asyncIterable = body as AsyncIterable<Uint8Array>;
  if (typeof asyncIterable[Symbol.asyncIterator] === 'function') {
    const chunks: Buffer[] = [];
    for await (const chunk of asyncIterable) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error('Unsupported uploaded file body type');
}

function getS3BucketName(): string {
  return process.env.S3_UPLOADS_BUCKET || '';
}

function createUploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

  if (message.includes('S3_UPLOADS_BUCKET')) {
    return 'Upload storage is configured for S3, but S3_UPLOADS_BUCKET is not configured. Set SHIP_UPLOAD_STORAGE=local for Render demo uploads or configure S3.';
  }

  if (code === '42703') {
    return 'Upload database schema is missing file assistant columns. Run database migrations and retry.';
  }

  if (code === '42P01') {
    return 'Upload database schema is missing assistant upload tables. Run database migrations and retry.';
  }

  return 'Failed to create upload';
}
