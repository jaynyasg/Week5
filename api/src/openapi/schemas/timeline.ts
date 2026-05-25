/**
 * Timeline schemas - Microsoft Project-inspired read model
 */

import { z, registry } from '../registry.js';
import { UuidSchema, DateSchema, DateTimeSchema } from './common.js';

export const TimelineScopeTypeSchema = z.enum(['project', 'program']).openapi({
  description: 'Timeline scope type',
});

export const TimelineDocumentTypeSchema = z.enum(['program', 'project', 'sprint', 'issue']).openapi({
  description: 'Document types that can appear as timeline rows',
});

export const TimelineDependencyEdgeSchema = z.object({
  source_id: UuidSchema,
  target_id: UuidSchema,
  relationship_type: z.literal('depends_on'),
  source_in_scope: z.boolean(),
  target_in_scope: z.boolean(),
  source_title: z.string().optional(),
  target_title: z.string().optional(),
  source_document_type: TimelineDocumentTypeSchema.optional(),
  target_document_type: TimelineDocumentTypeSchema.optional(),
  target_status: z.string().nullable().optional(),
  is_blocking: z.boolean(),
}).openapi('TimelineDependencyEdge');

registry.register('TimelineDependencyEdge', TimelineDependencyEdgeSchema);

export const TimelineRowSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  document_type: TimelineDocumentTypeSchema,
  status: z.string().nullable(),
  planned_start: DateSchema.nullable(),
  planned_end: DateSchema.nullable(),
  actual_start: DateSchema.nullable(),
  actual_end: DateSchema.nullable(),
  program_ids: z.array(UuidSchema),
  project_ids: z.array(UuidSchema),
  sprint_ids: z.array(UuidSchema),
  dependency_ids: z.array(UuidSchema),
  blocker_ids: z.array(UuidSchema),
  blocks_ids: z.array(UuidSchema),
  blocked: z.boolean(),
  overdue: z.boolean(),
  at_risk: z.boolean(),
  critical_path: z.boolean(),
  critical_path_order: z.number().int().positive().nullable(),
  sprint_number: z.number().int().positive().nullable().optional(),
}).openapi('TimelineRow');

registry.register('TimelineRow', TimelineRowSchema);

export const TimelineResponseSchema = z.object({
  scope: z.object({
    id: UuidSchema,
    type: TimelineScopeTypeSchema,
    title: z.string(),
  }),
  generated_at: DateTimeSchema,
  rows: z.array(TimelineRowSchema),
  dependencies: z.array(TimelineDependencyEdgeSchema),
  summary: z.object({
    total_rows: z.number().int(),
    dependency_count: z.number().int(),
    blocked_count: z.number().int(),
    overdue_count: z.number().int(),
    at_risk_count: z.number().int(),
    critical_path_count: z.number().int(),
  }),
}).openapi('TimelineResponse');

registry.register('TimelineResponse', TimelineResponseSchema);

export const TimelineBaselineRowSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  document_type: TimelineDocumentTypeSchema,
  planned_start: DateSchema.nullable(),
  planned_end: DateSchema.nullable(),
  status: z.string().nullable(),
}).openapi('TimelineBaselineRow');

registry.register('TimelineBaselineRow', TimelineBaselineRowSchema);

export const TimelineBaselineSnapshotSchema = z.object({
  captured_at: DateTimeSchema,
  captured_by: UuidSchema,
  scope: z.object({
    id: UuidSchema,
    type: TimelineScopeTypeSchema,
    title: z.string(),
  }),
  rows: z.array(TimelineBaselineRowSchema),
  summary: z.object({
    total_rows: z.number().int(),
    dependency_count: z.number().int(),
    blocked_count: z.number().int(),
    overdue_count: z.number().int(),
    at_risk_count: z.number().int(),
    critical_path_count: z.number().int(),
    planned_start: DateSchema.nullable(),
    planned_end: DateSchema.nullable(),
  }),
}).openapi('TimelineBaselineSnapshot');

registry.register('TimelineBaselineSnapshot', TimelineBaselineSnapshotSchema);

export const TimelineVarianceRowSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  document_type: TimelineDocumentTypeSchema,
  current_planned_start: DateSchema.nullable(),
  current_planned_end: DateSchema.nullable(),
  current_status: z.string().nullable(),
  baseline_planned_start: DateSchema.nullable(),
  baseline_planned_end: DateSchema.nullable(),
  baseline_status: z.string().nullable(),
  start_variance_days: z.number().int().nullable(),
  end_variance_days: z.number().int().nullable(),
  status_changed: z.boolean(),
  missing_from_baseline: z.boolean(),
  missing_from_current: z.boolean(),
  blocked: z.boolean(),
  overdue: z.boolean(),
  at_risk: z.boolean(),
}).openapi('TimelineVarianceRow');

registry.register('TimelineVarianceRow', TimelineVarianceRowSchema);

export const TimelineVarianceResponseSchema = z.object({
  scope: z.object({
    id: UuidSchema,
    type: TimelineScopeTypeSchema,
    title: z.string(),
  }),
  generated_at: DateTimeSchema,
  baseline: TimelineBaselineSnapshotSchema.nullable(),
  rows: z.array(TimelineVarianceRowSchema),
  summary: z.object({
    total_rows: z.number().int(),
    current_rows: z.number().int(),
    baseline_rows: z.number().int(),
    missing_from_baseline_count: z.number().int(),
    missing_from_current_count: z.number().int(),
    start_variance_count: z.number().int(),
    end_variance_count: z.number().int(),
    status_changed_count: z.number().int(),
    delayed_count: z.number().int(),
    improved_count: z.number().int(),
    total_end_variance_days: z.number().int(),
    average_end_variance_days: z.number().nullable(),
  }),
}).openapi('TimelineVarianceResponse');

registry.register('TimelineVarianceResponse', TimelineVarianceResponseSchema);

registry.registerPath({
  method: 'get',
  path: '/projects/{id}/timeline',
  tags: ['Projects'],
  summary: 'Get project timeline',
  description: 'Returns a bounded timeline read model for a project, including related weeks, issues, dependency edges, and blocked/at-risk flags.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'Project timeline',
      content: {
        'application/json': {
          schema: TimelineResponseSchema,
        },
      },
    },
    404: {
      description: 'Project not found',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/projects/{id}/timeline/baseline',
  tags: ['Projects'],
  summary: 'Get project timeline baseline variance',
  description: 'Returns the current project timeline compared against the captured baseline stored on the project document.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'Project timeline baseline variance',
      content: {
        'application/json': {
          schema: TimelineVarianceResponseSchema,
        },
      },
    },
    404: {
      description: 'Project not found',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/projects/{id}/timeline/baseline',
  tags: ['Projects'],
  summary: 'Capture project timeline baseline',
  description: 'Stores the current project timeline rows as the project baseline and returns variance against the captured snapshot.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    201: {
      description: 'Captured project timeline baseline',
      content: {
        'application/json': {
          schema: TimelineVarianceResponseSchema,
        },
      },
    },
    404: {
      description: 'Project not found',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/programs/{id}/timeline',
  tags: ['Programs'],
  summary: 'Get program timeline',
  description: 'Returns a bounded timeline read model for a program, including related projects, weeks, issues, dependency edges, and blocked/at-risk flags.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'Program timeline',
      content: {
        'application/json': {
          schema: TimelineResponseSchema,
        },
      },
    },
    404: {
      description: 'Program not found',
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/programs/{id}/timeline/baseline',
  tags: ['Programs'],
  summary: 'Get program timeline baseline variance',
  description: 'Returns the current program timeline compared against the captured baseline stored on the program document.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    200: {
      description: 'Program timeline baseline variance',
      content: {
        'application/json': {
          schema: TimelineVarianceResponseSchema,
        },
      },
    },
    404: {
      description: 'Program not found',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/programs/{id}/timeline/baseline',
  tags: ['Programs'],
  summary: 'Capture program timeline baseline',
  description: 'Stores the current program timeline rows as the program baseline and returns variance against the captured snapshot.',
  request: {
    params: z.object({
      id: UuidSchema,
    }),
  },
  responses: {
    201: {
      description: 'Captured program timeline baseline',
      content: {
        'application/json': {
          schema: TimelineVarianceResponseSchema,
        },
      },
    },
    404: {
      description: 'Program not found',
    },
  },
});
