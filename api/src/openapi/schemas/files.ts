/**
 * File upload schemas - Presigned URL-based file uploads to S3
 */

import { z, registry } from '../registry.js';
import { UuidSchema, DateTimeSchema } from './common.js';

// ============== File Upload ==============

export const UploadRequestSchema = z.object({
  filename: z.string().min(1).max(255).openapi({
    description: 'Original filename',
    example: 'screenshot.png',
  }),
  mimeType: z.string().min(1).max(100).openapi({
    description: 'MIME type of the file',
    example: 'image/png',
  }),
  sizeBytes: z.number().int().positive().max(1073741824).openapi({
    description: 'File size in bytes (max 1GB)',
    example: 1024000,
  }),
  documentId: UuidSchema.nullable().optional().openapi({
    description: 'Document to associate with the uploaded file for Ask Ship indexing',
  }),
}).openapi('UploadRequest');

registry.register('UploadRequest', UploadRequestSchema);

const AssistantIndexingStatusSchema = z.enum([
  'not_indexed',
  'indexing',
  'indexed',
  'unsupported',
  'failed',
]).openapi('AssistantIndexingStatus');

registry.register('AssistantIndexingStatus', AssistantIndexingStatusSchema);

export const UploadResponseSchema = z.object({
  uploadUrl: z.string().openapi({
    description: 'Presigned URL or local upload endpoint for the file',
  }),
  fileId: UuidSchema.openapi({
    description: 'File ID to use when referencing this file',
  }),
  s3Key: z.string().openapi({
    description: 'Storage key for the uploaded file',
  }),
  assistantIndexingStatus: AssistantIndexingStatusSchema.optional().openapi({
    description: 'Ask Ship indexing status for supported documentation files',
  }),
}).openapi('UploadResponse');

registry.register('UploadResponse', UploadResponseSchema);

export const FileMetadataSchema = z.object({
  id: UuidSchema,
  filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  document_id: UuidSchema.nullable().openapi({
    description: 'Document this file is attached to',
  }),
  cdn_url: z.string().nullable(),
  status: z.enum(['pending', 'uploaded', 'failed']),
  assistant_indexing_status: AssistantIndexingStatusSchema,
  assistant_indexed_at: DateTimeSchema.nullable(),
  assistant_index_error: z.string().nullable(),
  created_at: DateTimeSchema,
}).openapi('FileMetadata');

registry.register('FileMetadata', FileMetadataSchema);

export const FileAssistantIndexStatusSchema = z.object({
  id: UuidSchema,
  assistant_indexing_status: AssistantIndexingStatusSchema,
  assistant_indexed_at: DateTimeSchema.nullable(),
  assistant_index_error: z.string().nullable(),
  document_id: UuidSchema.nullable(),
}).openapi('FileAssistantIndexStatus');

registry.register('FileAssistantIndexStatus', FileAssistantIndexStatusSchema);

// ============== Register File Endpoints ==============

registry.registerPath({
  method: 'post',
  path: '/files/upload',
  tags: ['Files'],
  summary: 'Get presigned upload URL',
  description: 'Request a presigned URL to upload a file. Upload the file via PUT to the returned URL.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UploadRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Upload URL and file metadata',
      content: {
        'application/json': {
          schema: UploadResponseSchema,
        },
      },
    },
    400: {
      description: 'Invalid request or blocked file type',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            blockedExtensions: z.array(z.string()).optional(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/files/{fileId}/assistant-index',
  tags: ['Files'],
  summary: 'Get Ask Ship indexing status',
  request: {
    params: z.object({
      fileId: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'File indexing status',
      content: {
        'application/json': {
          schema: FileAssistantIndexStatusSchema,
        },
      },
    },
    404: {
      description: 'File not found',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/files/{fileId}/reindex',
  tags: ['Files'],
  summary: 'Rebuild Ask Ship file index',
  request: {
    params: z.object({
      fileId: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'File indexing status after reindex',
      content: {
        'application/json': {
          schema: FileAssistantIndexStatusSchema,
        },
      },
    },
    404: {
      description: 'File not found',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/files/{fileId}/attach',
  tags: ['Files'],
  summary: 'Attach file to document',
  description: 'Associate an uploaded file with a document.',
  request: {
    params: z.object({
      fileId: UuidSchema,
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            documentId: UuidSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'File attached',
      content: {
        'application/json': {
          schema: FileMetadataSchema,
        },
      },
    },
    404: {
      description: 'File or document not found',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/files/{fileId}',
  tags: ['Files'],
  summary: 'Get file metadata',
  request: {
    params: z.object({
      fileId: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'File metadata',
      content: {
        'application/json': {
          schema: FileMetadataSchema,
        },
      },
    },
    404: {
      description: 'File not found',
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/files/{fileId}',
  tags: ['Files'],
  summary: 'Delete file',
  description: 'Delete a file. Only the uploader or an admin can delete.',
  request: {
    params: z.object({
      fileId: UuidSchema,
    }),
  },
  responses: {
    204: {
      description: 'File deleted',
    },
    403: {
      description: 'Forbidden - not the uploader or admin',
    },
    404: {
      description: 'File not found',
    },
  },
});
