/**
 * Document schemas - Base document type and document-type-specific properties
 */

import { z, registry } from '../registry.js';
import { UuidSchema, DateTimeSchema } from './common.js';

// ============== Document Types ==============

export const DocumentTypeSchema = z.enum([
  'wiki',
  'issue',
  'program',
  'project',
  'sprint',
  'person',
  'weekly_plan',
  'weekly_retro',
  'standup',
  'weekly_review',
]).openapi({
  description: 'Type of document',
});

registry.register('DocumentType', DocumentTypeSchema);

// ============== Base Document ==============

export const BaseDocumentSchema = z.object({
  id: UuidSchema.openapi({ description: 'Document ID' }),
  title: z.string().openapi({ description: 'Document title' }),
  document_type: DocumentTypeSchema,
  content: z.record(z.unknown()).nullable().openapi({
    description: 'TipTap JSON content',
  }),
  properties: z.record(z.unknown()).openapi({
    description: 'Type-specific properties (see individual document type schemas)',
  }),
  parent_id: UuidSchema.nullable().optional().openapi({
    description: 'Parent document ID for hierarchical wiki pages',
  }),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
  archived_at: DateTimeSchema.nullable().optional(),
  deleted_at: DateTimeSchema.nullable().optional(),
  created_by: UuidSchema.optional().openapi({ description: 'User ID who created this document' }),
}).openapi('Document');

registry.register('Document', BaseDocumentSchema);

// ============== Document List Item (lighter response) ==============

export const DocumentListItemSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  document_type: DocumentTypeSchema,
  parent_id: UuidSchema.nullable().optional(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
}).openapi('DocumentListItem');

registry.register('DocumentListItem', DocumentListItemSchema);

export const DocumentListPaginationSchema = z.object({
  limit: z.number().int().min(1).max(500).openapi({
    description: 'Maximum number of documents requested',
  }),
  offset: z.number().int().min(0).openapi({
    description: 'Number of matching documents skipped',
  }),
  page: z.number().int().min(1).optional().openapi({
    description: 'Current 1-based page when page-style pagination is used',
  }),
  per_page: z.number().int().min(1).max(500).optional().openapi({
    description: 'Requested page size when page-style pagination is used',
  }),
  returned: z.number().int().min(0).openapi({
    description: 'Number of documents returned in this page',
  }),
  has_more: z.boolean().openapi({
    description: 'Whether more matching documents are available after this page',
  }),
  total: z.number().int().min(0).optional().openapi({
    description: 'Total matching documents when include_total=true',
  }),
  total_count: z.number().int().min(0).optional().openapi({
    description: 'Total matching documents when page-style pagination includes count metadata',
  }),
}).openapi('DocumentListPagination');

registry.register('DocumentListPagination', DocumentListPaginationSchema);

export const PaginatedDocumentListSchema = z.object({
  items: z.array(DocumentListItemSchema),
  pagination: DocumentListPaginationSchema,
}).openapi('PaginatedDocumentList');

registry.register('PaginatedDocumentList', PaginatedDocumentListSchema);

// ============== Create/Update Document ==============

export const CreateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional().default('Untitled').openapi({
    description: 'Document title. Defaults to "Untitled".',
  }),
  document_type: DocumentTypeSchema,
  content: z.record(z.unknown()).optional().openapi({
    description: 'TipTap JSON content',
  }),
  properties: z.record(z.unknown()).optional().openapi({
    description: 'Type-specific properties',
  }),
  parent_id: UuidSchema.nullable().optional().openapi({
    description: 'Parent document ID (for hierarchical wikis)',
  }),
  visibility: z.enum(['private', 'workspace']).optional().default('workspace').openapi({
    description: 'Document visibility scope',
  }),
}).openapi('CreateDocument');

registry.register('CreateDocument', CreateDocumentSchema);

export const UpdateDocumentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.record(z.unknown()).optional(),
  properties: z.record(z.unknown()).optional(),
  parent_id: UuidSchema.nullable().optional(),
  visibility: z.enum(['private', 'workspace']).optional(),
}).openapi('UpdateDocument');

registry.register('UpdateDocument', UpdateDocumentSchema);

// ============== Register Document Endpoints ==============

registry.registerPath({
  method: 'get',
  path: '/documents',
  tags: ['Documents'],
  summary: 'List documents',
  description: 'List documents with optional filtering by type and parent. Supplying limit enables offset pagination; supplying page or per_page enables page-style pagination with total_count by default.',
  request: {
    query: z.object({
      type: DocumentTypeSchema.optional().openapi({
        description: 'Filter by document type',
      }),
      parent_id: UuidSchema.optional().openapi({
        description: 'Filter by parent document ID',
      }),
      limit: z.coerce.number().int().min(1).max(500).optional().openapi({
        description: 'Maximum number of documents to return. Enables the paginated response shape, or acts as page size when page is supplied.',
      }),
      offset: z.coerce.number().int().min(0).optional().openapi({
        description: 'Number of matching documents to skip. Requires limit.',
      }),
      page: z.coerce.number().int().min(1).optional().openapi({
        description: '1-based page number. Enables page-style pagination and defaults per_page to 50.',
      }),
      per_page: z.coerce.number().int().min(1).max(500).optional().openapi({
        description: 'Page size for page-style pagination. Enables page-style pagination and defaults page to 1.',
      }),
      include_total: z.enum(['true', 'false']).optional().openapi({
        description: 'Include total matching count in pagination metadata. Requires limit unless page or per_page is supplied.',
      }),
    }),
  },
  responses: {
    200: {
      description: 'List of documents. Returns an array by default, or a paginated object when limit, page, or per_page is supplied.',
      content: {
        'application/json': {
          schema: z.union([z.array(DocumentListItemSchema), PaginatedDocumentListSchema]),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Get document by ID',
  description: 'Retrieve a single document with full content and properties.',
  request: {
    params: z.object({
      id: UuidSchema.openapi({ description: 'Document ID' }),
    }),
  },
  responses: {
    200: {
      description: 'Document details',
      content: {
        'application/json': {
          schema: BaseDocumentSchema,
        },
      },
    },
    404: {
      description: 'Document not found',
      content: {
        'application/json': {
          schema: z.object({ error: z.literal('Document not found') }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/documents',
  tags: ['Documents'],
  summary: 'Create document',
  description: 'Create a new document of any type.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateDocumentSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Created document',
      content: {
        'application/json': {
          schema: BaseDocumentSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
      content: {
        'application/json': {
          schema: z.object({
            error: z.string(),
            details: z.array(z.object({
              path: z.array(z.union([z.string(), z.number()])),
              message: z.string(),
            })).optional(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Update document',
  description: 'Update document title, content, or properties.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
    body: {
      content: {
        'application/json': {
          schema: UpdateDocumentSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Updated document',
      content: {
        'application/json': {
          schema: BaseDocumentSchema,
        },
      },
    },
    404: {
      description: 'Document not found',
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/documents/{id}',
  tags: ['Documents'],
  summary: 'Delete document',
  description: 'Soft-delete a document. Can be restored later.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    204: {
      description: 'Document deleted',
    },
    404: {
      description: 'Document not found',
    },
  },
});
