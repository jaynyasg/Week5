import { z, registry } from '../registry.js';

const AssistantProviderSchema = z.enum(['openai', 'bedrock', 'mock', 'unconfigured']).openapi('AssistantProvider');
const AssistantSourceTypeSchema = z.enum(['document', 'project', 'program', 'issue', 'week', 'timeline', 'file']).openapi('AssistantSourceType');
const AssistantChatStatusSchema = z.enum(['answered', 'no_context', 'unavailable', 'rate_limited', 'error']).openapi('AssistantChatStatus');
const AssistantTraceEventTypeSchema = z.enum([
  'retrieval',
  'rerank',
  'tool',
  'model',
  'extraction',
  'embedding',
  'eval',
]).openapi('AssistantTraceEventType');
const AssistantErrorCodeSchema = z.enum([
  'ASSISTANT_UNAVAILABLE',
  'MESSAGE_REQUIRED',
  'MESSAGE_TOO_LONG',
  'RATE_LIMITED',
  'MODEL_ERROR',
  'RETRIEVAL_ERROR',
]).openapi('AssistantErrorCode');

const AssistantStatusSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  provider: AssistantProviderSchema,
  model: z.string().nullable(),
  missingConfiguration: z.array(z.string()),
  embeddings: z.object({
    enabled: z.boolean(),
    provider: z.enum(['openai', 'mock', 'disabled']),
    model: z.string().nullable(),
    dimensions: z.number(),
    missingConfiguration: z.array(z.string()),
  }).optional(),
  observability: z.object({
    tracesEnabled: z.boolean(),
  }).optional(),
  uploadIndexing: z.object({
    enabled: z.boolean(),
    supportedMimeTypes: z.array(z.string()),
    maxExtractionBytes: z.number(),
    statuses: z.array(z.enum(['not_indexed', 'indexing', 'indexed', 'unsupported', 'failed'])),
  }),
  limits: z.object({
    maxMessageChars: z.number(),
    maxHistoryMessages: z.number(),
    maxContextChunks: z.number(),
  }),
}).openapi('AssistantStatus');

const AssistantChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  context: z.object({
    path: z.string().optional(),
    documentId: z.string().uuid().optional(),
    documentType: z.string().optional(),
    projectId: z.string().uuid().optional(),
  }).optional(),
  filters: z.object({
    sourceTypes: z.array(AssistantSourceTypeSchema).optional(),
  }).optional(),
}).openapi('AssistantChatRequest');

const AssistantCitationSchema = z.object({
  id: z.string(),
  sourceType: AssistantSourceTypeSchema,
  sourceId: z.string(),
  title: z.string(),
  url: z.string(),
  excerpt: z.string(),
}).openapi('AssistantCitation');

const AssistantChatResponseSchema = z.object({
  status: AssistantChatStatusSchema,
  message: z.object({
    id: z.string(),
    role: z.literal('assistant'),
    content: z.string(),
    createdAt: z.string(),
  }),
  citations: z.array(AssistantCitationSchema),
  sourceCounts: z.object({
    documents: z.number(),
    projects: z.number(),
    programs: z.number(),
    issues: z.number(),
    weeks: z.number(),
    timeline: z.number(),
    files: z.number(),
    total: z.number(),
  }),
  traceId: z.string().optional(),
  error: z.object({
    code: AssistantErrorCodeSchema,
    message: z.string(),
  }).optional(),
}).openapi('AssistantChatResponse');

const AssistantTraceResponseSchema = z.object({
  run: z.object({
    traceId: z.string(),
    status: z.union([AssistantChatStatusSchema, z.literal('started')]),
    provider: z.union([AssistantProviderSchema, z.string()]).nullable(),
    model: z.string().nullable(),
    totalSources: z.number(),
    citationsCount: z.number(),
    durationMs: z.number().nullable(),
    metadata: z.record(z.unknown()),
    error: z.string().nullable(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
  }),
  events: z.array(z.object({
    id: z.string().uuid(),
    eventType: z.union([AssistantTraceEventTypeSchema, z.string()]),
    eventName: z.string(),
    sourceType: z.string().nullable(),
    sourceId: z.string().nullable(),
    documentId: z.string().nullable(),
    fileId: z.string().nullable(),
    durationMs: z.number().nullable(),
    metadata: z.record(z.unknown()),
    error: z.string().nullable(),
    createdAt: z.string(),
  })),
}).openapi('AssistantTraceResponse');

registry.register('AssistantStatus', AssistantStatusSchema);
registry.register('AssistantChatRequest', AssistantChatRequestSchema);
registry.register('AssistantChatResponse', AssistantChatResponseSchema);
registry.register('AssistantTraceResponse', AssistantTraceResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/assistant/status',
  tags: ['Assistant'],
  summary: 'Check Ask Ship assistant availability',
  description: 'Returns whether Ask Ship is enabled and has server-side model configuration.',
  responses: {
    200: {
      description: 'Ask Ship availability and indexing status',
      content: { 'application/json': { schema: AssistantStatusSchema } },
    },
    401: {
      description: 'Authentication required',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/assistant/chat',
  tags: ['Assistant'],
  summary: 'Ask Ship a workspace-scoped question',
  description: 'Submits a non-streaming assistant question. Responses include citations when retrieved Ship context is used.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AssistantChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Assistant response',
      content: { 'application/json': { schema: AssistantChatResponseSchema } },
    },
    400: {
      description: 'Invalid assistant request',
      content: { 'application/json': { schema: AssistantChatResponseSchema } },
    },
    401: {
      description: 'Authentication required',
    },
    429: {
      description: 'Assistant rate limit exceeded',
    },
    503: {
      description: 'Assistant model provider is not configured or unavailable',
      content: { 'application/json': { schema: AssistantChatResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/assistant/traces/{traceId}',
  tags: ['Assistant'],
  summary: 'Inspect an Ask Ship trace',
  description: 'Returns trace events for a completed Ask Ship request. Members can inspect their own traces; workspace admins can inspect workspace traces.',
  request: {
    params: z.object({
      traceId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Assistant run and trace events',
      content: { 'application/json': { schema: AssistantTraceResponseSchema } },
    },
    401: {
      description: 'Authentication required',
    },
    404: {
      description: 'Trace not found or not visible to the caller',
    },
  },
});
