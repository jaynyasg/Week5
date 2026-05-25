/**
 * Super-admin operation schemas
 */

import { z, registry } from '../registry.js';
import { UuidSchema } from './common.js';

export const AdminApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
}).openapi('AdminApiError');

registry.register('AdminApiError', AdminApiErrorSchema);

export const SecurityProbeStatusSchema = z.object({
  cronJobName: z.string(),
  configured: z.boolean(),
  renderApiKeyConfigured: z.boolean(),
  cronJobIdConfigured: z.boolean(),
  missingEnvVars: z.array(z.string()),
}).openapi('SecurityProbeStatus');

registry.register('SecurityProbeStatus', SecurityProbeStatusSchema);

export const SecurityProbeStatusResponseSchema = z.object({
  success: z.literal(true),
  data: SecurityProbeStatusSchema,
}).openapi('SecurityProbeStatusResponse');

registry.register('SecurityProbeStatusResponse', SecurityProbeStatusResponseSchema);

export const SecurityProbeTriggerResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    triggered: z.boolean(),
    cronJobName: z.string(),
    cronJobId: z.string(),
    renderResponse: z.union([z.record(z.unknown()), z.string(), z.null()]),
  }),
}).openapi('SecurityProbeTriggerResponse');

registry.register('SecurityProbeTriggerResponse', SecurityProbeTriggerResponseSchema);

export const TimelineDemoSeedResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    created: z.boolean(),
    projectId: UuidSchema,
    programId: UuidSchema.nullable(),
    timelineUrl: z.string(),
  }),
}).openapi('TimelineDemoSeedResponse');

registry.register('TimelineDemoSeedResponse', TimelineDemoSeedResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/admin/security-probe',
  tags: ['Admin'],
  summary: 'Get security probe trigger status',
  description: 'Returns whether the Render cron job trigger is configured for the in-app super-admin operation.',
  responses: {
    200: {
      description: 'Security probe trigger configuration status',
      content: {
        'application/json': {
          schema: SecurityProbeStatusResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/security-probe/trigger',
  tags: ['Admin'],
  summary: 'Trigger security probe',
  description: 'Triggers the Render security probe cron job. Requires super-admin session authentication.',
  responses: {
    202: {
      description: 'Render accepted the cron job run request',
      content: {
        'application/json': {
          schema: SecurityProbeTriggerResponseSchema,
        },
      },
    },
    400: {
      description: 'Render trigger environment variables are missing',
      content: {
        'application/json': {
          schema: AdminApiErrorSchema,
        },
      },
    },
    502: {
      description: 'Render did not accept the trigger request',
      content: {
        'application/json': {
          schema: AdminApiErrorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/demo/timeline',
  tags: ['Admin'],
  summary: 'Seed timeline demo data',
  description: 'Creates an idempotent program, project, weeks, issues, dependencies, and baselines in the current workspace for timeline demonstrations.',
  responses: {
    200: {
      description: 'Timeline demo data already existed',
      content: {
        'application/json': {
          schema: TimelineDemoSeedResponseSchema,
        },
      },
    },
    201: {
      description: 'Timeline demo data created',
      content: {
        'application/json': {
          schema: TimelineDemoSeedResponseSchema,
        },
      },
    },
  },
});
