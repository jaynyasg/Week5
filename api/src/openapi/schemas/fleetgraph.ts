import { z, registry } from '../registry.js';

const FleetGraphProviderSchema = z.enum(['openai', 'bedrock', 'mock', 'unconfigured']).openapi('FleetGraphProvider');
const FleetGraphModeSchema = z.enum(['proactive', 'chat', 'manual']).openapi('FleetGraphMode');
const FleetGraphRunStatusSchema = z.enum(['started', 'completed', 'failed', 'interrupted', 'cancelled']).openapi('FleetGraphRunStatus');
const FleetGraphFindingStatusSchema = z.enum(['open', 'acknowledged', 'resolved', 'dismissed']).openapi('FleetGraphFindingStatus');
const FleetGraphFindingSeveritySchema = z.enum(['info', 'low', 'medium', 'high', 'critical']).openapi('FleetGraphFindingSeverity');
const FleetGraphFindingKindSchema = z.enum([
  'dependency_risk',
  'stale_commitment',
  'missing_update',
  'scope_drift',
  'planning_gap',
  'delivery_conflict',
  'other',
]).openapi('FleetGraphFindingKind');
const FleetGraphDeliveryStatusSchema = z.enum(['unread', 'read', 'dismissed', 'snoozed']).openapi('FleetGraphDeliveryStatus');
const FleetGraphActionProposalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'failed'])
  .openapi('FleetGraphActionProposalStatus');
const FleetGraphActionTypeSchema = z.enum([
  'create_issue',
  'update_document',
  'create_association',
  'notify_owner',
  'request_update',
]).openapi('FleetGraphActionType');
const FleetGraphChatStatusSchema = z.enum([
  'answered',
  'no_context',
  'unavailable',
  'rate_limited',
  'interrupted',
  'error',
]).openapi('FleetGraphChatStatus');
const FleetGraphErrorCodeSchema = z.enum([
  'FLEETGRAPH_UNAVAILABLE',
  'MESSAGE_REQUIRED',
  'MESSAGE_TOO_LONG',
  'RATE_LIMITED',
  'MODEL_ERROR',
  'GRAPH_ERROR',
  'CHECKPOINT_REQUIRED',
  'PROPOSAL_NOT_FOUND',
]).openapi('FleetGraphErrorCode');
const FleetGraphSourceTypeSchema = z.enum(['document', 'project', 'program', 'issue', 'week', 'timeline', 'file'])
  .openapi('FleetGraphSourceType');

const FleetGraphStatusSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  provider: FleetGraphProviderSchema,
  model: z.string().nullable(),
  missingConfiguration: z.array(z.string()),
  proactive: z.object({
    enabled: z.boolean(),
    sweepIntervalMs: z.number(),
    maxEventsPerSweep: z.number(),
  }),
  limits: z.object({
    maxMessageChars: z.number(),
    maxHistoryMessages: z.number(),
    maxFindingsPerRun: z.number(),
  }),
  observability: z.object({
    tracesEnabled: z.boolean(),
    missingConfiguration: z.array(z.string()),
  }),
}).openapi('FleetGraphStatus');

const FleetGraphRouteContextSchema = z.object({
  path: z.string().optional(),
  documentId: z.string().uuid().optional(),
  documentType: z.string().optional(),
  projectId: z.string().uuid().optional(),
}).openapi('FleetGraphRouteContext');

const FleetGraphChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).optional(),
  context: FleetGraphRouteContextSchema.optional(),
  findingId: z.string().uuid().optional(),
}).openapi('FleetGraphChatRequest');

const FleetGraphFindingsQuerySchema = z.object({
  documentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
}).openapi('FleetGraphFindingsQuery');

const FleetGraphEvidenceSchema = z.object({
  sourceType: FleetGraphSourceTypeSchema,
  sourceId: z.string(),
  title: z.string(),
  excerpt: z.string(),
  url: z.string().optional(),
}).openapi('FleetGraphEvidence');

const FleetGraphCitationSchema = z.object({
  id: z.string(),
  sourceType: FleetGraphSourceTypeSchema,
  sourceId: z.string(),
  title: z.string(),
  url: z.string(),
  excerpt: z.string(),
}).openapi('FleetGraphCitation');

const FleetGraphSourceCountsSchema = z.object({
  documents: z.number(),
  projects: z.number(),
  programs: z.number(),
  issues: z.number(),
  weeks: z.number(),
  timeline: z.number(),
  files: z.number(),
  total: z.number(),
}).openapi('FleetGraphSourceCounts');

const FleetGraphFindingSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: FleetGraphFindingStatusSchema,
  severity: FleetGraphFindingSeveritySchema,
  kind: FleetGraphFindingKindSchema,
  confidence: z.number(),
  summary: z.string(),
  targetDocumentId: z.string().uuid().nullable(),
  targetDocumentType: z.string().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi('FleetGraphFindingSummary');

const FleetGraphDeliverySchema = z.object({
  id: z.string().uuid(),
  findingDocumentId: z.string().uuid(),
  userId: z.string().uuid(),
  status: FleetGraphDeliveryStatusSchema,
  deliveredAt: z.string(),
  readAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  snoozedUntil: z.string().nullable(),
}).openapi('FleetGraphDelivery');

const FleetGraphActionProposalSchema = z.object({
  id: z.string().uuid(),
  findingDocumentId: z.string().uuid().nullable(),
  runId: z.string().uuid().nullable(),
  proposedAction: z.union([FleetGraphActionTypeSchema, z.string()]),
  targetDocumentId: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  status: FleetGraphActionProposalStatusSchema,
  requestedByActor: z.string(),
  decidedByUserId: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi('FleetGraphActionProposal');

const FleetGraphFindingDetailSchema = FleetGraphFindingSummarySchema.extend({
  rationale: z.string(),
  evidence: z.array(FleetGraphEvidenceSchema),
  proposals: z.array(FleetGraphActionProposalSchema),
  runId: z.string().uuid().nullable(),
  firstDetectedAt: z.string(),
  lastObservedAt: z.string(),
  resolvedAt: z.string().nullable(),
  dismissedReason: z.string().nullable(),
}).openapi('FleetGraphFindingDetail');

const FleetGraphChatResponseSchema = z.object({
  status: FleetGraphChatStatusSchema,
  message: z.object({
    id: z.string(),
    role: z.literal('assistant'),
    content: z.string(),
    createdAt: z.string(),
  }),
  findings: z.array(FleetGraphFindingSummarySchema),
  proposals: z.array(FleetGraphActionProposalSchema),
  citations: z.array(FleetGraphCitationSchema),
  sourceCounts: FleetGraphSourceCountsSchema,
  runId: z.string().uuid().optional(),
  traceId: z.string().optional(),
  error: z.object({
    code: FleetGraphErrorCodeSchema,
    message: z.string(),
  }).optional(),
}).openapi('FleetGraphChatResponse');

const FleetGraphFindingsResponseSchema = z.object({
  findings: z.array(FleetGraphFindingSummarySchema),
  deliveries: z.array(FleetGraphDeliverySchema),
}).openapi('FleetGraphFindingsResponse');

const FleetGraphRunSummarySchema = z.object({
  id: z.string().uuid(),
  mode: FleetGraphModeSchema,
  triggerType: z.string(),
  triggerId: z.string().nullable(),
  threadId: z.string(),
  status: FleetGraphRunStatusSchema,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  estimatedCostUsd: z.number().nullable(),
  langsmithTraceUrl: z.string().nullable(),
  metadata: z.record(z.unknown()),
  error: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
}).openapi('FleetGraphRunSummary');

const FleetGraphDeliveryUpdateRequestSchema = z.object({
  status: z.enum(['read', 'dismissed', 'snoozed']),
  snoozedUntil: z.string().datetime().optional(),
}).openapi('FleetGraphDeliveryUpdateRequest');

const FleetGraphActionDecisionRequestSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().max(1000).optional(),
}).openapi('FleetGraphActionDecisionRequest');

const FleetGraphActionDecisionResponseSchema = z.object({
  ok: z.boolean(),
  proposal: FleetGraphActionProposalSchema,
}).openapi('FleetGraphActionDecisionResponse');

registry.register('FleetGraphStatus', FleetGraphStatusSchema);
registry.register('FleetGraphChatRequest', FleetGraphChatRequestSchema);
registry.register('FleetGraphFindingsQuery', FleetGraphFindingsQuerySchema);
registry.register('FleetGraphChatResponse', FleetGraphChatResponseSchema);
registry.register('FleetGraphFindingsResponse', FleetGraphFindingsResponseSchema);
registry.register('FleetGraphFindingDetail', FleetGraphFindingDetailSchema);
registry.register('FleetGraphRunSummary', FleetGraphRunSummarySchema);
registry.register('FleetGraphDeliveryUpdateRequest', FleetGraphDeliveryUpdateRequestSchema);
registry.register('FleetGraphActionDecisionRequest', FleetGraphActionDecisionRequestSchema);
registry.register('FleetGraphActionDecisionResponse', FleetGraphActionDecisionResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/status',
  tags: ['FleetGraph'],
  summary: 'Check FleetGraph availability',
  description: 'Returns whether FleetGraph is enabled and has server-side model, checkpoint, and trace configuration.',
  responses: {
    200: {
      description: 'FleetGraph availability and limits',
      content: { 'application/json': { schema: FleetGraphStatusSchema } },
    },
    401: { description: 'Authentication required' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/chat',
  tags: ['FleetGraph'],
  summary: 'Ask FleetGraph a workspace-scoped question',
  description: 'Runs FleetGraph on demand and returns a non-streaming answer with findings, proposals, citations, and run metadata.',
  request: {
    body: {
      content: { 'application/json': { schema: FleetGraphChatRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'FleetGraph response',
      content: { 'application/json': { schema: FleetGraphChatResponseSchema } },
    },
    400: {
      description: 'Invalid FleetGraph request',
      content: { 'application/json': { schema: FleetGraphChatResponseSchema } },
    },
    401: { description: 'Authentication required' },
    429: { description: 'FleetGraph rate limit exceeded' },
    503: {
      description: 'FleetGraph provider or checkpoint configuration is unavailable',
      content: { 'application/json': { schema: FleetGraphChatResponseSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/findings',
  tags: ['FleetGraph'],
  summary: 'List delivered FleetGraph findings',
  description: 'Returns FleetGraph findings delivered to the current user and their delivery state. Optional route-context query parameters narrow results to a current document or project.',
  request: {
    query: FleetGraphFindingsQuerySchema,
  },
  responses: {
    200: {
      description: 'Delivered findings',
      content: { 'application/json': { schema: FleetGraphFindingsResponseSchema } },
    },
    401: { description: 'Authentication required' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/findings/{id}',
  tags: ['FleetGraph'],
  summary: 'Get a FleetGraph finding',
  description: 'Returns finding detail when the caller owns a delivery for it, or is a workspace admin.',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Finding detail',
      content: { 'application/json': { schema: FleetGraphFindingDetailSchema } },
    },
    400: { description: 'Invalid finding ID' },
    401: { description: 'Authentication required' },
    404: { description: 'Finding not found or not visible to the caller' },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/fleetgraph/deliveries/{id}',
  tags: ['FleetGraph'],
  summary: 'Update FleetGraph delivery state',
  description: 'Marks an owned delivery read, dismissed, or snoozed.',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: FleetGraphDeliveryUpdateRequestSchema } },
    },
  },
  responses: {
    200: { description: 'Delivery updated' },
    400: { description: 'Invalid delivery update' },
    401: { description: 'Authentication required' },
    404: { description: 'Delivery not found for the caller' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/fleetgraph/runs/{id}',
  tags: ['FleetGraph'],
  summary: 'Inspect a FleetGraph run',
  description: 'Returns run metadata for the caller-owned run; workspace admins can inspect workspace runs.',
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'FleetGraph run metadata',
      content: { 'application/json': { schema: FleetGraphRunSummarySchema } },
    },
    400: { description: 'Invalid run ID' },
    401: { description: 'Authentication required' },
    404: { description: 'Run not found or not visible to the caller' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/fleetgraph/actions/{id}/decision',
  tags: ['FleetGraph'],
  summary: 'Approve or reject a FleetGraph action proposal',
  description: 'Records an authenticated human decision for a pending proposal visible to the caller.',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: {
      content: { 'application/json': { schema: FleetGraphActionDecisionRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'Action decision recorded',
      content: { 'application/json': { schema: FleetGraphActionDecisionResponseSchema } },
    },
    400: { description: 'Invalid action decision' },
    401: { description: 'Authentication required' },
    404: { description: 'Action proposal not found or not visible to the caller' },
  },
});
