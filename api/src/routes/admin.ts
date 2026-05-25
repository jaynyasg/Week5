import { Router, Request, Response } from 'express';
import type { Router as RouterType } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../db/client.js';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import { ERROR_CODES, HTTP_STATUS } from '@ship/shared';
import { logAuditEvent } from '../services/audit.js';

const router: RouterType = Router();

const SECURITY_PROBE_CRON_JOB_NAME = 'ship-security-probe';
const DEMO_PROGRAM_TITLE = 'Treasury Modernization Demo';
const DEMO_PROJECT_TITLE = 'Public Submission Launch Demo';

type DemoDocumentType = 'program' | 'project' | 'sprint' | 'issue';
type DemoAuxDocumentType = 'person' | 'weekly_plan' | 'weekly_retro';

interface DemoDocumentSeed {
  key: string;
  type: DemoDocumentType;
  title: string;
  properties: Record<string, unknown>;
  content?: Record<string, unknown>;
  baseline: {
    plannedStart: string | null;
    plannedEnd: string | null;
    status: string | null;
  };
  startedAt?: string | null;
  completedAt?: string | null;
  ticketNumber?: number | null;
}

interface DemoDocumentRecord extends DemoDocumentSeed {
  id: string;
}

interface DemoAuxDocumentSeed {
  key: string;
  type: DemoAuxDocumentType;
  title: string;
  properties: Record<string, unknown>;
  content: Record<string, unknown>;
}

interface DemoAuxDocumentRecord extends DemoAuxDocumentSeed {
  id: string;
}

function getSecurityProbeRenderConfig() {
  const apiKey = process.env.RENDER_API_KEY ?? process.env.RENDER_API_TOKEN;
  const cronJobId = process.env.RENDER_SECURITY_PROBE_CRON_JOB_ID ?? process.env.RENDER_SECURITY_PROBE_SERVICE_ID;

  return {
    apiKey,
    cronJobId,
    configured: Boolean(apiKey && cronJobId),
    apiKeyConfigured: Boolean(apiKey),
    cronJobIdConfigured: Boolean(cronJobId),
    missingEnvVars: [
      !apiKey ? 'RENDER_API_KEY' : null,
      !cronJobId ? 'RENDER_SECURITY_PROBE_CRON_JOB_ID' : null,
    ].filter((value): value is string => value !== null),
  };
}

function securityProbeStatusPayload() {
  const config = getSecurityProbeRenderConfig();

  return {
    cronJobName: SECURITY_PROBE_CRON_JOB_NAME,
    configured: config.configured,
    renderApiKeyConfigured: config.apiKeyConfigured,
    cronJobIdConfigured: config.cronJobIdConfigured,
    missingEnvVars: config.missingEnvVars,
  };
}

async function readRenderResponse(response: globalThis.Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

function dateOnlyFromOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateTimeFromOffset(days: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function shiftDateOnly(value: string | null, days: number): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function demoContent(title: string, summary: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: title }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: summary }],
      },
    ],
  };
}

function demoListContent(title: string, sections: Array<{ heading: string; items: string[] }>) {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: title }],
      },
      ...sections.flatMap(section => [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: section.heading }],
        },
        {
          type: 'bulletList',
          content: section.items.map(item => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
          })),
        },
      ]),
    ],
  };
}

function withDemoProperties(key: string, properties: Record<string, unknown>): Record<string, unknown> {
  return {
    ...properties,
    demo_seed_key: key,
    created_via: 'demo_timeline_seed',
  };
}

function createDemoSeeds(nextTicketNumber: number): DemoDocumentSeed[] {
  const programStart = dateOnlyFromOffset(-12);
  const programEnd = dateOnlyFromOffset(24);
  const projectStart = dateOnlyFromOffset(-10);
  const projectEnd = dateOnlyFromOffset(21);

  const seeds: DemoDocumentSeed[] = [
    {
      key: 'program',
      type: 'program',
      title: DEMO_PROGRAM_TITLE,
      properties: {
        status: 'active',
        color: '#2563eb',
        planned_start_date: programStart,
        planned_end_date: programEnd,
        plan: 'Demonstration program for timeline planning, dependency health, and baseline variance.',
      },
      baseline: {
        plannedStart: shiftDateOnly(programStart, -2),
        plannedEnd: shiftDateOnly(programEnd, -3),
        status: 'active',
      },
    },
    {
      key: 'project',
      type: 'project',
      title: DEMO_PROJECT_TITLE,
      properties: {
        status: 'active',
        color: '#0ea5e9',
        impact: 5,
        confidence: 4,
        ease: 3,
        planned_start_date: projectStart,
        planned_end_date: projectEnd,
        plan: 'Launch the public submission target with deployment evidence, probe coverage, and reviewer-ready demo data.',
      },
      content: demoListContent(DEMO_PROJECT_TITLE, [
        {
          heading: 'Launch Goal',
          items: [
            'Deploy the public Render submission target and keep API, React, and WebSocket traffic on one origin.',
            'Capture security probe evidence with authenticated WebSocket and input validation checks.',
            'Prepare a reviewer-ready timeline with blocked items, dependencies, weeks, issues, and baseline variance.',
          ],
        },
        {
          heading: 'Demo Talking Points',
          items: [
            'Timeline shows three blocked launch items and four dependency links.',
            'Weeks shows one reviewer lead with plan and retro status across the launch window.',
            'Ask Ship can answer questions about blocked work using live project context.',
          ],
        },
      ]),
      baseline: {
        plannedStart: shiftDateOnly(projectStart, -2),
        plannedEnd: shiftDateOnly(projectEnd, -4),
        status: 'planned',
      },
    },
    {
      key: 'week-foundations',
      type: 'sprint',
      title: 'Launch Week 1 - Foundations',
      properties: {
        sprint_number: 1,
        status: 'completed',
        planned_start_date: dateOnlyFromOffset(-10),
        planned_end_date: dateOnlyFromOffset(-4),
        plan: 'Render deployment, shared schema fixes, and baseline documentation.',
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-12),
        plannedEnd: dateOnlyFromOffset(-6),
        status: 'active',
      },
    },
    {
      key: 'week-risk',
      type: 'sprint',
      title: 'Launch Week 2 - Risk Burn-down',
      properties: {
        sprint_number: 2,
        status: 'active',
        planned_start_date: dateOnlyFromOffset(-3),
        planned_end_date: dateOnlyFromOffset(3),
        plan: 'Security probe evidence, timeline demo data, and public URL verification.',
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-5),
        plannedEnd: dateOnlyFromOffset(1),
        status: 'upcoming',
      },
    },
    {
      key: 'week-review',
      type: 'sprint',
      title: 'Launch Week 3 - Reviewer Readiness',
      properties: {
        sprint_number: 3,
        status: 'upcoming',
        planned_start_date: dateOnlyFromOffset(4),
        planned_end_date: dateOnlyFromOffset(10),
        plan: 'Submission packet, walkthrough, and final review loop.',
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(2),
        plannedEnd: dateOnlyFromOffset(8),
        status: 'upcoming',
      },
    },
    {
      key: 'issue-render',
      type: 'issue',
      title: 'Prepare Render deployment blueprint',
      ticketNumber: nextTicketNumber,
      startedAt: dateTimeFromOffset(-10),
      completedAt: dateTimeFromOffset(-7),
      properties: {
        state: 'done',
        priority: 'high',
        planned_start_date: dateOnlyFromOffset(-10),
        planned_end_date: dateOnlyFromOffset(-7),
        completed_at: dateTimeFromOffset(-7),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-11),
        plannedEnd: dateOnlyFromOffset(-8),
        status: 'in_progress',
      },
    },
    {
      key: 'issue-timeline-fix',
      type: 'issue',
      title: 'Fix timeline dependency migration',
      ticketNumber: nextTicketNumber + 1,
      startedAt: dateTimeFromOffset(-6),
      completedAt: dateTimeFromOffset(-4),
      properties: {
        state: 'done',
        priority: 'high',
        planned_start_date: dateOnlyFromOffset(-6),
        planned_end_date: dateOnlyFromOffset(-4),
        completed_at: dateTimeFromOffset(-4),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-6),
        plannedEnd: dateOnlyFromOffset(-5),
        status: 'todo',
      },
    },
    {
      key: 'issue-render-api-key',
      type: 'issue',
      title: 'Configure Render security probe credentials',
      ticketNumber: nextTicketNumber + 2,
      startedAt: dateTimeFromOffset(-2),
      properties: {
        state: 'in_progress',
        priority: 'critical',
        planned_start_date: dateOnlyFromOffset(-2),
        planned_end_date: dateOnlyFromOffset(-1),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-3),
        plannedEnd: dateOnlyFromOffset(-2),
        status: 'todo',
      },
    },
    {
      key: 'issue-probe-evidence',
      type: 'issue',
      title: 'Run security probe evidence review',
      ticketNumber: nextTicketNumber + 3,
      properties: {
        state: 'todo',
        priority: 'critical',
        planned_start_date: dateOnlyFromOffset(0),
        planned_end_date: dateOnlyFromOffset(1),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(-1),
        plannedEnd: dateOnlyFromOffset(0),
        status: 'backlog',
      },
    },
    {
      key: 'issue-demo-data',
      type: 'issue',
      title: 'Seed reviewer timeline demo data',
      ticketNumber: nextTicketNumber + 4,
      startedAt: dateTimeFromOffset(-1),
      completedAt: dateTimeFromOffset(0),
      properties: {
        state: 'done',
        priority: 'medium',
        planned_start_date: dateOnlyFromOffset(-1),
        planned_end_date: dateOnlyFromOffset(1),
        completed_at: dateTimeFromOffset(0),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(0),
        plannedEnd: dateOnlyFromOffset(2),
        status: 'todo',
      },
    },
    {
      key: 'issue-submission',
      type: 'issue',
      title: 'Finalize submission packet',
      ticketNumber: nextTicketNumber + 5,
      properties: {
        state: 'todo',
        priority: 'high',
        planned_start_date: dateOnlyFromOffset(4),
        planned_end_date: dateOnlyFromOffset(7),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(2),
        plannedEnd: dateOnlyFromOffset(5),
        status: 'backlog',
      },
    },
    {
      key: 'issue-walkthrough',
      type: 'issue',
      title: 'Reviewer walkthrough rehearsal',
      ticketNumber: nextTicketNumber + 6,
      properties: {
        state: 'todo',
        priority: 'medium',
        planned_start_date: dateOnlyFromOffset(8),
        planned_end_date: dateOnlyFromOffset(10),
      },
      baseline: {
        plannedStart: dateOnlyFromOffset(6),
        plannedEnd: dateOnlyFromOffset(8),
        status: 'backlog',
      },
    },
  ];

  return seeds;
}

function buildDemoBaseline(
  scope: { id: string; type: 'project' | 'program'; title: string },
  records: DemoDocumentRecord[],
  capturedBy: string
) {
  const rows = records
    .filter(record => scope.type === 'program' || record.type !== 'program')
    .map(record => ({
      id: record.id,
      title: record.title,
      document_type: record.type,
      planned_start: record.baseline.plannedStart,
      planned_end: record.baseline.plannedEnd,
      status: record.baseline.status,
    }));

  const plannedStarts = rows.map(row => row.planned_start).filter((value): value is string => Boolean(value)).sort();
  const plannedEnds = rows.map(row => row.planned_end).filter((value): value is string => Boolean(value)).sort();

  return {
    captured_at: dateTimeFromOffset(-1),
    captured_by: capturedBy,
    scope,
    rows,
    summary: {
      total_rows: rows.length,
      dependency_count: 4,
      blocked_count: 0,
      overdue_count: 0,
      at_risk_count: 0,
      critical_path_count: 0,
      planned_start: plannedStarts[0] ?? null,
      planned_end: plannedEnds[plannedEnds.length - 1] ?? null,
    },
  };
}

async function upsertDemoDocument(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  seed: DemoDocumentSeed
): Promise<{ record: DemoDocumentRecord; created: boolean }> {
  const properties = withDemoProperties(seed.key, seed.properties);
  const content = seed.content ?? demoContent(seed.title, 'Demo data for the Ship timeline view.');

  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM documents
     WHERE workspace_id = $1
       AND document_type = $2
       AND archived_at IS NULL
       AND deleted_at IS NULL
       AND (
         properties->>'demo_seed_key' = $3
         OR title = $4
       )
     ORDER BY
       CASE WHEN properties->>'demo_seed_key' = $3 THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1`,
    [workspaceId, seed.type, seed.key, seed.title]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE documents
       SET title = $1,
           properties = COALESCE(properties, '{}'::jsonb) || $2::jsonb,
           content = $3,
           started_at = $4,
           completed_at = $5,
           ticket_number = COALESCE(ticket_number, $6),
           visibility = 'workspace',
           updated_at = NOW()
       WHERE id = $7`,
      [
        seed.title,
        JSON.stringify(properties),
        JSON.stringify(content),
        seed.startedAt ?? null,
        seed.completedAt ?? null,
        seed.ticketNumber ?? null,
        existing.rows[0].id,
      ]
    );

    return {
      record: { ...seed, properties, id: existing.rows[0].id },
      created: false,
    };
  }

  const result = await client.query(
    `INSERT INTO documents (
       workspace_id,
       document_type,
       title,
       properties,
       created_by,
       content,
       started_at,
       completed_at,
       ticket_number
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      workspaceId,
      seed.type,
      seed.title,
      JSON.stringify(properties),
      userId,
      JSON.stringify(content),
      seed.startedAt ?? null,
      seed.completedAt ?? null,
      seed.ticketNumber ?? null,
    ]
  );

  return {
    record: { ...seed, properties, id: result.rows[0].id },
    created: true,
  };
}

async function upsertDemoAuxDocument(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  seed: DemoAuxDocumentSeed,
  options: { matchByTitle?: boolean } = {}
): Promise<{ record: DemoAuxDocumentRecord; created: boolean }> {
  const properties = withDemoProperties(seed.key, seed.properties);
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM documents
     WHERE workspace_id = $1
       AND document_type = $2
       AND archived_at IS NULL
       AND deleted_at IS NULL
       AND (
         properties->>'demo_seed_key' = $3
         OR ($4::boolean AND title = $5)
       )
     ORDER BY
       CASE WHEN properties->>'demo_seed_key' = $3 THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1`,
    [workspaceId, seed.type, seed.key, Boolean(options.matchByTitle), seed.title]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE documents
       SET title = $1,
           properties = COALESCE(properties, '{}'::jsonb) || $2::jsonb,
           content = $3,
           visibility = 'workspace',
           updated_at = NOW()
       WHERE id = $4`,
      [seed.title, JSON.stringify(properties), JSON.stringify(seed.content), existing.rows[0].id]
    );

    return {
      record: { ...seed, properties, id: existing.rows[0].id },
      created: false,
    };
  }

  const result = await client.query(
    `INSERT INTO documents (
       workspace_id,
       document_type,
       title,
       properties,
       created_by,
       content,
       visibility
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'workspace')
     RETURNING id`,
    [
      workspaceId,
      seed.type,
      seed.title,
      JSON.stringify(properties),
      userId,
      JSON.stringify(seed.content),
    ]
  );

  return {
    record: { ...seed, properties, id: result.rows[0].id },
    created: true,
  };
}

async function addDemoAssociation(
  client: PoolClient,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint' | 'depends_on',
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, relationshipType, JSON.stringify(metadata)]
  );
}

async function refreshDemoWeekAllocations(
  client: PoolClient,
  weeks: DemoDocumentRecord[],
  projectId: string,
  personId: string
): Promise<void> {
  for (const week of weeks) {
    await client.query(
      `UPDATE documents
       SET properties = COALESCE(properties, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          project_id: projectId,
          assignee_ids: [personId],
        }),
        week.id,
      ]
    );
  }
}

function weeklyDemoContent(title: string, items: string[]) {
  return demoListContent(title, [
    {
      heading: title.includes('Retro') ? 'What I delivered this week' : 'What I plan to accomplish this week',
      items,
    },
  ]);
}

async function seedDemoWeeklyDocs(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  project: DemoDocumentRecord,
  weeks: DemoDocumentRecord[]
): Promise<{ records: DemoAuxDocumentRecord[]; createdCount: number }> {
  const personResult = await upsertDemoAuxDocument(
    client,
    workspaceId,
    userId,
    {
      key: 'person-reviewer-demo-lead',
      type: 'person',
      title: 'Reviewer Demo Lead',
      properties: {
        email: 'reviewer-demo-lead@example.com',
        capacity_hours: 32,
        skills: ['deployment', 'security review', 'documentation'],
      },
      content: demoContent('Reviewer Demo Lead', 'Demo owner for public submission launch readiness.'),
    },
    { matchByTitle: true }
  );

  await refreshDemoWeekAllocations(client, weeks, project.id, personResult.record.id);

  const weeklySeeds: DemoAuxDocumentSeed[] = [
    {
      key: 'weekly-plan-foundations',
      type: 'weekly_plan',
      title: 'Week 1 Plan',
      properties: {
        person_id: personResult.record.id,
        week_number: 1,
        project_id: project.id,
        submitted_at: dateTimeFromOffset(-11),
      },
      content: weeklyDemoContent('Week 1 Plan', [
        'Prepare Render Blueprint and verify the combined API and web deployment starts cleanly.',
        'Document the deployment decision and update the submission packet.',
        'Confirm initial timeline rows load for project and program scopes.',
      ]),
    },
    {
      key: 'weekly-retro-foundations',
      type: 'weekly_retro',
      title: 'Week 1 Retro',
      properties: {
        person_id: personResult.record.id,
        week_number: 1,
        project_id: project.id,
        submitted_at: dateTimeFromOffset(-4),
      },
      content: weeklyDemoContent('Week 1 Retro', [
        'Render Blueprint deployed successfully with the web service and managed PostgreSQL database.',
        'Deployment documentation now explains why Render was selected over the deferred AWS plan.',
        'Timeline migration issue was closed after dependency associations were restored.',
      ]),
    },
    {
      key: 'weekly-plan-risk',
      type: 'weekly_plan',
      title: 'Week 2 Plan',
      properties: {
        person_id: personResult.record.id,
        week_number: 2,
        project_id: project.id,
        submitted_at: dateTimeFromOffset(-3),
      },
      content: weeklyDemoContent('Week 2 Plan', [
        'Configure the Render security probe credentials and trigger path.',
        'Run the security probe with authenticated checks and capture report evidence.',
        'Seed reviewer demo data for the timeline, weeks, issues, and assistant walkthrough.',
      ]),
    },
    {
      key: 'weekly-retro-risk',
      type: 'weekly_retro',
      title: 'Week 2 Retro',
      properties: {
        person_id: personResult.record.id,
        week_number: 2,
        project_id: project.id,
        submitted_at: dateTimeFromOffset(0),
      },
      content: weeklyDemoContent('Week 2 Retro', [
        'Security probe trigger is available from the Operations dashboard.',
        'Authenticated WebSocket checks passed and the report is visible in Render logs.',
        'Timeline demo data now includes blockers, dependencies, and baseline variance.',
      ]),
    },
    {
      key: 'weekly-plan-review',
      type: 'weekly_plan',
      title: 'Week 3 Plan',
      properties: {
        person_id: personResult.record.id,
        week_number: 3,
        project_id: project.id,
        submitted_at: dateTimeFromOffset(4),
      },
      content: weeklyDemoContent('Week 3 Plan', [
        'Finalize the submission packet and public URL verification evidence.',
        'Rehearse the reviewer walkthrough with Ask Ship, Timeline, Weeks, Issues, and Retro.',
        'Resolve the remaining blocked launch items before the final demo recording.',
      ]),
    },
  ];

  const records: DemoAuxDocumentRecord[] = [personResult.record];
  let createdCount = personResult.created ? 1 : 0;

  for (const seed of weeklySeeds) {
    const result = await upsertDemoAuxDocument(client, workspaceId, userId, seed);
    records.push(result.record);
    if (result.created) createdCount += 1;

    await addDemoAssociation(client, result.record.id, project.id, 'project', { created_via: 'demo_timeline_seed' });
    const week = weeks.find(candidate => candidate.properties.sprint_number === seed.properties.week_number);
    if (week) {
      await addDemoAssociation(client, result.record.id, week.id, 'sprint', { created_via: 'demo_timeline_seed' });
    }
  }

  return { records, createdCount };
}

async function seedTimelineDemo(workspaceId: string, userId: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const ticketResult = await client.query(
      `SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_ticket_number
       FROM documents
       WHERE workspace_id = $1
         AND document_type = 'issue'`,
      [workspaceId]
    );
    const nextTicketNumber = Number(ticketResult.rows[0]?.next_ticket_number ?? 1);
    const records = new Map<string, DemoDocumentRecord>();
    let createdCount = 0;

    for (const seed of createDemoSeeds(nextTicketNumber)) {
      const result = await upsertDemoDocument(client, workspaceId, userId, seed);
      records.set(seed.key, result.record);
      if (result.created) createdCount += 1;
    }

    const program = records.get('program')!;
    const project = records.get('project')!;
    const weeks = ['week-foundations', 'week-risk', 'week-review'].map(key => records.get(key)!);
    const issues = [
      'issue-render',
      'issue-timeline-fix',
      'issue-render-api-key',
      'issue-probe-evidence',
      'issue-demo-data',
      'issue-submission',
      'issue-walkthrough',
    ].map(key => records.get(key)!);

    await addDemoAssociation(client, project.id, program.id, 'program', { created_via: 'demo_timeline_seed' });
    for (const week of weeks) {
      await addDemoAssociation(client, week.id, project.id, 'project', { created_via: 'demo_timeline_seed' });
      await addDemoAssociation(client, week.id, program.id, 'program', { created_via: 'demo_timeline_seed' });
    }

    const weekByIssue = new Map<string, DemoDocumentRecord>([
      ['issue-render', weeks[0]!],
      ['issue-timeline-fix', weeks[0]!],
      ['issue-render-api-key', weeks[1]!],
      ['issue-probe-evidence', weeks[1]!],
      ['issue-demo-data', weeks[1]!],
      ['issue-submission', weeks[2]!],
      ['issue-walkthrough', weeks[2]!],
    ]);

    for (const issue of issues) {
      await addDemoAssociation(client, issue.id, project.id, 'project', { created_via: 'demo_timeline_seed' });
      await addDemoAssociation(client, issue.id, program.id, 'program', { created_via: 'demo_timeline_seed' });
      await addDemoAssociation(client, issue.id, weekByIssue.get(issue.key)!.id, 'sprint', { created_via: 'demo_timeline_seed' });
    }

    await addDemoAssociation(client, records.get('issue-probe-evidence')!.id, records.get('issue-render-api-key')!.id, 'depends_on');
    await addDemoAssociation(client, records.get('issue-submission')!.id, records.get('issue-probe-evidence')!.id, 'depends_on');
    await addDemoAssociation(client, records.get('issue-walkthrough')!.id, records.get('issue-submission')!.id, 'depends_on');
    await addDemoAssociation(client, records.get('issue-demo-data')!.id, records.get('issue-timeline-fix')!.id, 'depends_on');

    const weeklyDocs = await seedDemoWeeklyDocs(client, workspaceId, userId, project, weeks);
    createdCount += weeklyDocs.createdCount;

    const allRecords = Array.from(records.values());
    const projectBaseline = buildDemoBaseline(
      { id: project.id, type: 'project', title: project.title },
      allRecords,
      userId
    );
    const programBaseline = buildDemoBaseline(
      { id: program.id, type: 'program', title: program.title },
      allRecords,
      userId
    );

    await client.query(
      `UPDATE documents
       SET properties = jsonb_set(properties, '{timeline_baseline}', $1::jsonb, true),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(projectBaseline), project.id]
    );
    await client.query(
      `UPDATE documents
       SET properties = jsonb_set(properties, '{timeline_baseline}', $1::jsonb, true),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(programBaseline), program.id]
    );

    await client.query('COMMIT');

    return {
      created: createdCount > 0,
      projectId: project.id,
      programId: program.id,
      timelineUrl: `/documents/${project.id}/timeline`,
      refreshed: true,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// All admin routes require super-admin
router.use(authMiddleware, superAdminMiddleware);

// GET /api/admin/security-probe - Render security probe trigger configuration
router.get('/security-probe', async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: securityProbeStatusPayload(),
  });
});

// POST /api/admin/security-probe/trigger - Trigger the Render cron job from inside Ship
router.post('/security-probe/trigger', async (req: Request, res: Response): Promise<void> => {
  const config = getSecurityProbeRenderConfig();

  if (!config.configured || !config.apiKey || !config.cronJobId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Security probe trigger is not configured. Missing: ${config.missingEnvVars.join(', ')}`,
      },
    });
    return;
  }

  try {
    const response = await fetch(`https://api.render.com/v1/cron-jobs/${encodeURIComponent(config.cronJobId)}/runs`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
    const responseBody = await readRenderResponse(response);

    if (!response.ok) {
      console.error('Render security probe trigger failed:', {
        status: response.status,
        body: responseBody,
      });
      res.status(502).json({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Render did not accept the security probe trigger request',
        },
      });
      return;
    }

    await logAuditEvent({
      workspaceId: req.workspaceId,
      actorUserId: req.userId!,
      action: 'security_probe.trigger',
      resourceType: 'render_cron_job',
      details: {
        cronJobName: SECURITY_PROBE_CRON_JOB_NAME,
        cronJobId: config.cronJobId,
      },
      req,
    });

    res.status(202).json({
      success: true,
      data: {
        triggered: true,
        cronJobName: SECURITY_PROBE_CRON_JOB_NAME,
        cronJobId: config.cronJobId,
        renderResponse: responseBody,
      },
    });
  } catch (error) {
    console.error('Trigger security probe error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to trigger security probe',
      },
    });
  }
});

// POST /api/admin/demo/timeline - Seed a reviewer-friendly timeline demo in the current workspace
router.post('/demo/timeline', async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;

  if (!workspaceId) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Select a workspace before seeding timeline demo data',
      },
    });
    return;
  }

  try {
    const demo = await seedTimelineDemo(workspaceId, req.userId!);

    await logAuditEvent({
      workspaceId,
      actorUserId: req.userId!,
      action: 'demo.timeline_seed',
      resourceType: 'project',
      resourceId: demo.projectId,
      details: {
        created: demo.created,
        programId: demo.programId,
      },
      req,
    });

    res.status(demo.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK).json({
      success: true,
      data: demo,
    });
  } catch (error) {
    console.error('Seed timeline demo error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to seed timeline demo data',
      },
    });
  }
});

// GET /api/admin/workspaces - List all workspaces (including archived)
router.get('/workspaces', async (req: Request, res: Response): Promise<void> => {
  const { includeArchived } = req.query;

  try {
    let query = `SELECT w.id, w.name, w.sprint_start_date, w.archived_at, w.created_at, w.updated_at,
                        (SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.workspace_id = w.id) as member_count
                 FROM workspaces w`;

    if (includeArchived !== 'true') {
      query += ' WHERE w.archived_at IS NULL';
    }

    query += ' ORDER BY w.name';

    const result = await pool.query(query);

    const workspaces = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      sprintStartDate: row.sprint_start_date,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      memberCount: parseInt(row.member_count),
    }));

    res.json({
      success: true,
      data: { workspaces },
    });
  } catch (error) {
    console.error('Admin list workspaces error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to list workspaces',
      },
    });
  }
});

// POST /api/admin/workspaces - Create workspace
router.post('/workspaces', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Workspace name is required',
      },
    });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO workspaces (name)
       VALUES ($1)
       RETURNING id, name, sprint_start_date, archived_at, created_at, updated_at`,
      [name.trim()]
    );

    const workspace = result.rows[0];

    // Create "Welcome to Ship" document for new workspaces
    const welcomeContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Welcome to Ship' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ship is your workspace for managing projects, sprints, and issues. Here are some things you can do:' },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create wiki pages to document your team\'s knowledge' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create projects to organize your work' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create issues and assign them to sprints' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Collaborate in real-time with your team' }] }],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Feel free to edit or delete this page. Happy shipping!' }],
        },
      ],
    };

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, content, created_by)
       VALUES ($1, 'wiki', 'Welcome to Ship', $2, $3)`,
      [workspace.id, JSON.stringify(welcomeContent), req.userId]
    );

    await logAuditEvent({
      workspaceId: workspace.id,
      actorUserId: req.userId!,
      action: 'workspace.create',
      resourceType: 'workspace',
      resourceId: workspace.id,
      details: { name },
      req,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          sprintStartDate: workspace.sprint_start_date,
          archivedAt: workspace.archived_at,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
      },
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to create workspace',
      },
    });
  }
});

// PATCH /api/admin/workspaces/:id - Update workspace
router.patch('/workspaces/:id', async (req: Request, res: Response): Promise<void> => {
  const workspaceId = String(req.params.id); // Always defined from route
  const { name, sprintStartDate } = req.body;

  // At least one field must be provided
  if (!name && !sprintStartDate) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'At least one field (name or sprintStartDate) is required',
      },
    });
    return;
  }

  // Validate name if provided
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Workspace name must be a non-empty string',
      },
    });
    return;
  }

  // Validate sprintStartDate if provided (should be YYYY-MM-DD format)
  if (sprintStartDate !== undefined) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(sprintStartDate)) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'sprintStartDate must be in YYYY-MM-DD format',
        },
      });
      return;
    }
  }

  try {
    // Build dynamic update query
    const updates: string[] = [];
    const values: string[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }
    if (sprintStartDate) {
      updates.push(`sprint_start_date = $${paramIndex++}`);
      values.push(sprintStartDate);
    }
    updates.push('updated_at = NOW()');
    values.push(workspaceId);

    const result = await pool.query(
      `UPDATE workspaces
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, name, sprint_start_date, archived_at, created_at, updated_at`,
      values
    );

    if (!result.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    const workspace = result.rows[0];

    await logAuditEvent({
      workspaceId,
      actorUserId: req.userId!,
      action: 'workspace.update',
      resourceType: 'workspace',
      resourceId: workspaceId,
      details: { name, sprintStartDate },
      req,
    });

    res.json({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          sprintStartDate: workspace.sprint_start_date,
          archivedAt: workspace.archived_at,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
      },
    });
  } catch (error) {
    console.error('Update workspace error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to update workspace',
      },
    });
  }
});

// POST /api/admin/workspaces/:id/archive - Archive workspace
router.post('/workspaces/:id/archive', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const result = await pool.query(
      `UPDATE workspaces
       SET archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND archived_at IS NULL
       RETURNING id`,
      [id]
    );

    if (!result.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found or already archived',
        },
      });
      return;
    }

    // Invalidate all sessions for this workspace
    await pool.query('DELETE FROM sessions WHERE workspace_id = $1', [id]);

    await logAuditEvent({
      workspaceId: id,
      actorUserId: req.userId!,
      action: 'workspace.archive',
      resourceType: 'workspace',
      resourceId: id,
      req,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Archive workspace error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to archive workspace',
      },
    });
  }
});

// GET /api/admin/users - List all users
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.is_super_admin, u.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', wm.workspace_id,
                    'name', w.name,
                    'role', wm.role
                  )
                ) FILTER (WHERE wm.id IS NOT NULL),
                '[]'
              ) as workspaces
       FROM users u
       LEFT JOIN workspace_memberships wm ON u.id = wm.user_id
       LEFT JOIN workspaces w ON wm.workspace_id = w.id AND w.archived_at IS NULL
       GROUP BY u.id
       ORDER BY u.name`
    );

    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
      isSuperAdmin: row.is_super_admin,
      createdAt: row.created_at,
      workspaces: row.workspaces,
    }));

    res.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to list users',
      },
    });
  }
});

// GET /api/admin/users/search - Search users by email (for adding to workspace)
router.get('/users/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, workspaceId } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      res.json({
        success: true,
        data: { users: [] },
      });
      return;
    }

    const searchTerm = `%${q.toLowerCase()}%`;

    // If workspaceId provided, exclude users already in that workspace
    let query: string;
    let params: (string | null)[];

    if (workspaceId && typeof workspaceId === 'string') {
      query = `
        SELECT u.id, u.email, u.name
        FROM users u
        WHERE LOWER(u.email) LIKE $1
        AND NOT EXISTS (
          SELECT 1 FROM workspace_memberships wm
          WHERE wm.user_id = u.id AND wm.workspace_id = $2
        )
        ORDER BY u.email
        LIMIT 10
      `;
      params = [searchTerm, workspaceId];
    } else {
      query = `
        SELECT u.id, u.email, u.name
        FROM users u
        WHERE LOWER(u.email) LIKE $1
        ORDER BY u.email
        LIMIT 10
      `;
      params = [searchTerm];
    }

    const result = await pool.query(query, params);

    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name,
    }));

    res.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to search users',
      },
    });
  }
});

// PATCH /api/admin/users/:id/super-admin - Toggle super-admin status
router.patch('/users/:id/super-admin', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { isSuperAdmin } = req.body;

  if (typeof isSuperAdmin !== 'boolean') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'isSuperAdmin must be a boolean',
      },
    });
    return;
  }

  // Prevent removing your own super-admin status
  if (id === req.userId && !isSuperAdmin) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Cannot remove your own super-admin status',
      },
    });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE users
       SET is_super_admin = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, is_super_admin`,
      [isSuperAdmin, id]
    );

    if (!result.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        },
      });
      return;
    }

    await logAuditEvent({
      actorUserId: req.userId!,
      action: 'user.super_admin_toggle',
      resourceType: 'user',
      resourceId: id,
      details: { isSuperAdmin },
      req,
    });

    res.json({
      success: true,
      data: { isSuperAdmin: result.rows[0].is_super_admin },
    });
  } catch (error) {
    console.error('Toggle super-admin error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to update user',
      },
    });
  }
});

// GET /api/admin/audit-logs - Global audit logs
router.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
  const { limit = '100', offset = '0', workspaceId, userId, action } = req.query;

  try {
    let query = `
      SELECT al.id, al.workspace_id, al.action, al.resource_type, al.resource_id, al.details,
             al.ip_address, al.user_agent, al.created_at,
             u.email as actor_email, u.name as actor_name,
             iu.email as impersonating_email,
             w.name as workspace_name
      FROM audit_logs al
      JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN users iu ON al.impersonating_user_id = iu.id
      LEFT JOIN workspaces w ON al.workspace_id = w.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (workspaceId) {
      query += ` AND al.workspace_id = $${paramIndex}`;
      params.push(workspaceId as string);
      paramIndex++;
    }

    if (userId) {
      query += ` AND al.actor_user_id = $${paramIndex}`;
      params.push(userId as string);
      paramIndex++;
    }

    if (action) {
      query += ` AND al.action = $${paramIndex}`;
      params.push(action as string);
      paramIndex++;
    }

    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await pool.query(query, params);

    const logs = result.rows.map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      actorEmail: row.actor_email,
      actorName: row.actor_name,
      impersonatingEmail: row.impersonating_email,
    }));

    res.json({
      success: true,
      data: { logs },
    });
  } catch (error) {
    console.error('Get global audit logs error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to get audit logs',
      },
    });
  }
});

// GET /api/admin/audit-logs/export - Export audit logs as CSV
router.get('/audit-logs/export', async (req: Request, res: Response): Promise<void> => {
  const { workspaceId, startDate, endDate } = req.query;

  try {
    let query = `
      SELECT al.created_at, w.name as workspace_name, u.email as actor_email,
             iu.email as impersonating_email, al.action, al.resource_type,
             al.resource_id, al.details, al.ip_address
      FROM audit_logs al
      JOIN users u ON al.actor_user_id = u.id
      LEFT JOIN users iu ON al.impersonating_user_id = iu.id
      LEFT JOIN workspaces w ON al.workspace_id = w.id
      WHERE 1=1
    `;
    const params: (string | Date)[] = [];
    let paramIndex = 1;

    if (workspaceId) {
      query += ` AND al.workspace_id = $${paramIndex}`;
      params.push(workspaceId as string);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND al.created_at >= $${paramIndex}`;
      params.push(new Date(startDate as string));
      paramIndex++;
    }

    if (endDate) {
      query += ` AND al.created_at <= $${paramIndex}`;
      params.push(new Date(endDate as string));
      paramIndex++;
    }

    query += ' ORDER BY al.created_at DESC';

    const result = await pool.query(query, params);

    // Generate CSV
    const headers = ['Timestamp', 'Workspace', 'Actor', 'Impersonating', 'Action', 'Resource Type', 'Resource ID', 'Details', 'IP Address'];
    const rows = result.rows.map(row => [
      row.created_at.toISOString(),
      row.workspace_name || '',
      row.actor_email,
      row.impersonating_email || '',
      row.action,
      row.resource_type || '',
      row.resource_id || '',
      row.details ? JSON.stringify(row.details) : '',
      row.ip_address || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export audit logs error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to export audit logs',
      },
    });
  }
});

// POST /api/admin/impersonate/:userId - Start impersonation
router.post('/impersonate/:userId', async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.params.userId);

  try {
    // Get target user
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        },
      });
      return;
    }

    // Store impersonation in session (we'll update session table to track this)
    // For now, return impersonation data that frontend can track
    await logAuditEvent({
      actorUserId: req.userId!,
      action: 'impersonation.start',
      resourceType: 'user',
      resourceId: userId,
      details: { targetEmail: userResult.rows[0].email },
      req,
    });

    res.json({
      success: true,
      data: {
        impersonating: {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          name: userResult.rows[0].name,
        },
      },
    });
  } catch (error) {
    console.error('Start impersonation error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to start impersonation',
      },
    });
  }
});

// DELETE /api/admin/impersonate - End impersonation
router.delete('/impersonate', async (req: Request, res: Response): Promise<void> => {
  try {
    await logAuditEvent({
      actorUserId: req.userId!,
      action: 'impersonation.end',
      req,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('End impersonation error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to end impersonation',
      },
    });
  }
});

// ============================================================================
// Workspace Member Management
// ============================================================================

// GET /api/admin/workspaces/:id - Get workspace details
router.get('/workspaces/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const result = await pool.query(
      `SELECT id, name, sprint_start_date, archived_at, created_at, updated_at
       FROM workspaces WHERE id = $1`,
      [id]
    );

    if (!result.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    const workspace = result.rows[0];

    res.json({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          sprintStartDate: workspace.sprint_start_date,
          archivedAt: workspace.archived_at,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
      },
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to get workspace',
      },
    });
  }
});

// GET /api/admin/workspaces/:id/members - List workspace members
router.get('/workspaces/:id/members', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id FROM workspaces WHERE id = $1', [id]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    const result = await pool.query(
      `SELECT wm.user_id, wm.role, u.email, u.name
       FROM workspace_memberships wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1
       ORDER BY u.name`,
      [id]
    );

    const members = result.rows.map(row => ({
      userId: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
    }));

    res.json({
      success: true,
      data: { members },
    });
  } catch (error) {
    console.error('List workspace members error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to list workspace members',
      },
    });
  }
});

// GET /api/admin/workspaces/:id/invites - List pending invites
router.get('/workspaces/:id/invites', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id FROM workspaces WHERE id = $1', [id]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    const result = await pool.query(
      `SELECT id, email, role, token, created_at
       FROM workspace_invites
       WHERE workspace_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [id]
    );

    const invites = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      role: row.role,
      token: row.token,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      data: { invites },
    });
  } catch (error) {
    console.error('List workspace invites error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to list workspace invites',
      },
    });
  }
});

// POST /api/admin/workspaces/:id/invites - Create invite
// Email is always required (it's the login identifier)
// x509SubjectDn is optional - for PIV certificate matching when cert doesn't contain email
router.post('/workspaces/:id/invites', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { email, x509SubjectDn, role = 'member' } = req.body;

  // Email is always required
  if (!email) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Email is required',
      },
    });
    return;
  }

  // Validate email format
  if (typeof email !== 'string') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Email must be a string',
      },
    });
    return;
  }
  const emailLower = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailLower)) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid email format',
      },
    });
    return;
  }

  if (role !== 'admin' && role !== 'member') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Role must be admin or member',
      },
    });
    return;
  }

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id, name FROM workspaces WHERE id = $1', [id]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    // Check if user is already a member (by email or subject DN)
    const memberCheck = await pool.query(
      `SELECT wm.id FROM workspace_memberships wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1
         AND (($2::TEXT IS NOT NULL AND LOWER(u.email) = $2)
              OR ($3::TEXT IS NOT NULL AND u.x509_subject_dn = $3))`,
      [id, emailLower, x509SubjectDn || null]
    );
    if (memberCheck.rows[0]) {
      res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        error: {
          code: ERROR_CODES.ALREADY_EXISTS,
          message: 'User is already a member of this workspace',
        },
      });
      return;
    }

    // Check for existing pending invite (by email or subject DN)
    const inviteCheck = await pool.query(
      `SELECT id FROM workspace_invites
       WHERE workspace_id = $1
         AND used_at IS NULL
         AND expires_at > NOW()
         AND (($2::TEXT IS NOT NULL AND LOWER(email) = $2)
              OR ($3::TEXT IS NOT NULL AND x509_subject_dn = $3))`,
      [id, emailLower, x509SubjectDn || null]
    );
    if (inviteCheck.rows[0]) {
      res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        error: {
          code: ERROR_CODES.ALREADY_EXISTS,
          message: 'Invitation already pending for this identity',
        },
      });
      return;
    }

    // Generate unique invite token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const result = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, email, x509_subject_dn, role, token, expires_at, invited_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, x509_subject_dn, role, token, created_at`,
      [id, emailLower, x509SubjectDn || null, role, token, expiresAt, req.userId]
    );

    const invite = result.rows[0];

    await logAuditEvent({
      workspaceId: id,
      actorUserId: req.userId!,
      action: 'workspace.invite_create',
      resourceType: 'workspace_invite',
      resourceId: invite.id,
      details: { email: emailLower, x509SubjectDn: x509SubjectDn || null, role },
      req,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        invite: {
          id: invite.id,
          email: invite.email,
          x509SubjectDn: invite.x509_subject_dn,
          role: invite.role,
          token: invite.token, // null for PIV-only invites
          createdAt: invite.created_at,
        },
      },
    });
  } catch (error) {
    console.error('Create workspace invite error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to create workspace invite',
      },
    });
  }
});

// DELETE /api/admin/workspaces/:workspaceId/invites/:inviteId - Revoke invite
router.delete('/workspaces/:workspaceId/invites/:inviteId', async (req: Request, res: Response): Promise<void> => {
  const workspaceId = String(req.params.workspaceId);
  const inviteId = String(req.params.inviteId);

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    // Delete the invite
    const result = await pool.query(
      `DELETE FROM workspace_invites
       WHERE id = $1 AND workspace_id = $2 AND used_at IS NULL
       RETURNING id, email`,
      [inviteId, workspaceId]
    );

    if (!result.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Invite not found or already accepted',
        },
      });
      return;
    }

    // Archive the pending person document associated with this invite
    await pool.query(
      `UPDATE documents SET archived_at = NOW()
       WHERE workspace_id = $1
         AND document_type = 'person'
         AND properties->>'invite_id' = $2`,
      [workspaceId, inviteId]
    );

    await logAuditEvent({
      workspaceId,
      actorUserId: req.userId!,
      action: 'workspace.invite_revoke',
      resourceType: 'workspace_invite',
      resourceId: inviteId,
      details: { email: result.rows[0].email },
      req,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke workspace invite error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to revoke workspace invite',
      },
    });
  }
});

// POST /api/admin/workspaces/:id/members - Add existing user directly to workspace
router.post('/workspaces/:id/members', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { userId, role = 'member' } = req.body;

  try {
    // Validate role
    if (role !== 'admin' && role !== 'member') {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Role must be admin or member',
        },
      });
      return;
    }

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'userId is required',
        },
      });
      return;
    }

    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id, name FROM workspaces WHERE id = $1', [id]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    // Check user exists
    const userResult = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
    if (!userResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        },
      });
      return;
    }

    // Check if user is already a member
    const existingMember = await pool.query(
      'SELECT id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (existingMember.rows[0]) {
      res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        error: {
          code: ERROR_CODES.ALREADY_EXISTS,
          message: 'User is already a member of this workspace',
        },
      });
      return;
    }

    // Create the membership
    const membershipResult = await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       RETURNING id, created_at`,
      [id, userId, role]
    );

    // Create Person document for this user in this workspace (links via properties.user_id)
    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'person', $2, $3, $4)`,
      [id, userResult.rows[0].name, JSON.stringify({ user_id: userId, email: userResult.rows[0].email }), req.userId]
    );

    // Audit log
    await logAuditEvent({
      workspaceId: id,
      actorUserId: req.userId!,
      action: 'workspace.member_add',
      resourceType: 'workspace_membership',
      resourceId: membershipResult.rows[0].id,
      details: {
        addedUserId: userId,
        addedUserEmail: userResult.rows[0].email,
        role,
      },
      req,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        member: {
          userId: userResult.rows[0].id,
          email: userResult.rows[0].email,
          name: userResult.rows[0].name,
          role,
        },
      },
    });
  } catch (error) {
    console.error('Add workspace member error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to add workspace member',
      },
    });
  }
});

// PATCH /api/admin/workspaces/:workspaceId/members/:userId - Update member role
router.patch('/workspaces/:workspaceId/members/:userId', async (req: Request, res: Response): Promise<void> => {
  const workspaceId = String(req.params.workspaceId);
  const userId = String(req.params.userId);
  const { role } = req.body;

  if (role !== 'admin' && role !== 'member') {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Role must be admin or member',
      },
    });
    return;
  }

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    // Check membership exists and get current role
    const memberResult = await pool.query(
      `SELECT wm.role, u.email FROM workspace_memberships wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [workspaceId, userId]
    );

    if (!memberResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Member not found',
        },
      });
      return;
    }

    const oldRole = memberResult.rows[0].role;

    // If demoting from admin, check there's at least one other admin
    if (oldRole === 'admin' && role === 'member') {
      const adminCount = await pool.query(
        `SELECT COUNT(*) FROM workspace_memberships
         WHERE workspace_id = $1 AND role = 'admin'`,
        [workspaceId]
      );
      if (parseInt(adminCount.rows[0].count) <= 1) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Workspace must have at least one admin',
          },
        });
        return;
      }
    }

    // Update role
    await pool.query(
      `UPDATE workspace_memberships SET role = $1, updated_at = NOW()
       WHERE workspace_id = $2 AND user_id = $3`,
      [role, workspaceId, userId]
    );

    await logAuditEvent({
      workspaceId,
      actorUserId: req.userId!,
      action: 'workspace.member_role_update',
      resourceType: 'workspace_membership',
      resourceId: userId,
      details: { email: memberResult.rows[0].email, oldRole, newRole: role },
      req,
    });

    res.json({
      success: true,
      data: { role },
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to update member role',
      },
    });
  }
});

// DELETE /api/admin/workspaces/:workspaceId/members/:userId - Remove member
router.delete('/workspaces/:workspaceId/members/:userId', async (req: Request, res: Response): Promise<void> => {
  const workspaceId = String(req.params.workspaceId);
  const userId = String(req.params.userId);

  try {
    // Check workspace exists
    const workspaceResult = await pool.query('SELECT id FROM workspaces WHERE id = $1', [workspaceId]);
    if (!workspaceResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Workspace not found',
        },
      });
      return;
    }

    // Check membership exists and get role
    const memberResult = await pool.query(
      `SELECT wm.role, u.email FROM workspace_memberships wm
       JOIN users u ON wm.user_id = u.id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [workspaceId, userId]
    );

    if (!memberResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Member not found',
        },
      });
      return;
    }

    // If removing an admin, check there's at least one other admin
    if (memberResult.rows[0].role === 'admin') {
      const adminCount = await pool.query(
        `SELECT COUNT(*) FROM workspace_memberships
         WHERE workspace_id = $1 AND role = 'admin'`,
        [workspaceId]
      );
      if (parseInt(adminCount.rows[0].count) <= 1) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Workspace must have at least one admin',
          },
        });
        return;
      }
    }

    // Clear assignee fields for this user's assigned documents (assignee_id is in properties JSONB)
    await pool.query(
      `UPDATE documents SET properties = properties - 'assignee_id', updated_at = NOW()
       WHERE workspace_id = $1 AND properties->>'assignee_id' = $2`,
      [workspaceId, userId]
    );

    // Delete the membership
    await pool.query(
      `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );

    // Delete sessions for this workspace
    await pool.query(
      `DELETE FROM sessions WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId]
    );

    await logAuditEvent({
      workspaceId,
      actorUserId: req.userId!,
      action: 'workspace.member_remove',
      resourceType: 'workspace_membership',
      resourceId: userId,
      details: { email: memberResult.rows[0].email, role: memberResult.rows[0].role },
      req,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to remove member',
      },
    });
  }
});

// GET /api/admin/debug/users - Raw user data for debugging duplicates
router.get('/debug/users', async (req: Request, res: Response): Promise<void> => {
  try {
    // Get all users with raw data
    const usersResult = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.x509_subject_dn,
         u.is_super_admin,
         u.last_auth_provider,
         u.last_workspace_id,
         u.created_at,
         u.updated_at,
         LOWER(u.email) as email_lower,
         (SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.user_id = u.id) as membership_count,
         (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) as session_count
       FROM users u
       ORDER BY LOWER(u.email), u.created_at`
    );

    // Get workspace memberships separately for detail
    const membershipsResult = await pool.query(
      `SELECT
         wm.user_id,
         wm.workspace_id,
         wm.role,
         w.name as workspace_name,
         w.archived_at
       FROM workspace_memberships wm
       JOIN workspaces w ON wm.workspace_id = w.id
       ORDER BY wm.user_id`
    );

    // Group memberships by user
    const membershipsByUser: Record<string, Array<{
      workspaceId: string;
      workspaceName: string;
      role: string;
      archived: boolean;
    }>> = {};

    for (const m of membershipsResult.rows) {
      const userId = m.user_id as string;
      if (!membershipsByUser[userId]) {
        membershipsByUser[userId] = [];
      }
      membershipsByUser[userId]!.push({
        workspaceId: m.workspace_id,
        workspaceName: m.workspace_name,
        role: m.role,
        archived: !!m.archived_at,
      });
    }

    // Identify potential duplicates (same email_lower)
    const emailCounts: Record<string, number> = {};
    for (const u of usersResult.rows) {
      const emailLower = u.email_lower as string;
      emailCounts[emailLower] = (emailCounts[emailLower] ?? 0) + 1;
    }

    const users = usersResult.rows.map(row => ({
      id: row.id,
      email: row.email,
      emailLower: row.email_lower,
      name: row.name,
      x509SubjectDn: row.x509_subject_dn,
      isSuperAdmin: row.is_super_admin,
      lastAuthProvider: row.last_auth_provider,
      lastWorkspaceId: row.last_workspace_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      membershipCount: parseInt(row.membership_count),
      sessionCount: parseInt(row.session_count),
      memberships: membershipsByUser[row.id] || [],
      isDuplicate: (emailCounts[row.email_lower as string] ?? 0) > 1,
    }));

    // Summary stats
    const duplicateEmails = Object.entries(emailCounts)
      .filter(([, count]) => count > 1)
      .map(([email, count]) => ({ email, count }));

    res.json({
      success: true,
      data: {
        users,
        summary: {
          totalUsers: users.length,
          duplicateEmails,
          usersWithNoMemberships: users.filter(u => u.membershipCount === 0).length,
          usersWithNoSessions: users.filter(u => u.sessionCount === 0).length,
        },
      },
    });
  } catch (error) {
    console.error('Debug users error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to get debug user data',
      },
    });
  }
});

// GET /api/admin/debug/orphans - Diagnose orphaned entities (documents with missing associations)
router.get('/debug/orphans', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Dangling associations - pointing to deleted documents
    const danglingResult = await pool.query(`
      SELECT
        da.id AS association_id,
        da.document_id,
        da.related_id,
        da.relationship_type,
        d.title AS document_title,
        d.document_type,
        w.name AS workspace_name
      FROM document_associations da
      JOIN documents d ON da.document_id = d.id
      JOIN workspaces w ON d.workspace_id = w.id
      LEFT JOIN documents d2 ON da.related_id = d2.id
      WHERE d2.id IS NULL
    `);

    // Note: program_id column was dropped by migration 029.
    // This check is now a no-op but we keep the structure for API compatibility.
    const missingProgramAssocResult = { rows: [] };

    // 3. Projects without program association (in junction table)
    const projectsWithoutProgramResult = await pool.query(`
      SELECT
        d.id,
        d.title,
        w.name AS workspace_name,
        d.created_at
      FROM documents d
      JOIN workspaces w ON d.workspace_id = w.id
      WHERE d.document_type = 'project'
        AND d.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM document_associations da
          WHERE da.document_id = d.id AND da.relationship_type = 'program'
        )
      ORDER BY d.created_at DESC
    `);

    // 4. Sprints without project association
    const sprintsWithoutProjectResult = await pool.query(`
      SELECT
        d.id,
        d.title,
        w.name AS workspace_name,
        d.created_at,
        d.properties->>'sprint_status' AS sprint_status
      FROM documents d
      JOIN workspaces w ON d.workspace_id = w.id
      WHERE d.document_type = 'sprint'
        AND d.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM document_associations da
          WHERE da.document_id = d.id AND da.relationship_type = 'project'
        )
      ORDER BY d.created_at DESC
    `);

    // 5. Issues without project association
    const issuesWithoutProjectResult = await pool.query(`
      SELECT
        d.id,
        d.title,
        w.name AS workspace_name,
        d.created_at,
        d.properties->>'state' AS state
      FROM documents d
      JOIN workspaces w ON d.workspace_id = w.id
      WHERE d.document_type = 'issue'
        AND d.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM document_associations da
          WHERE da.document_id = d.id AND da.relationship_type = 'project'
        )
      ORDER BY d.created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: {
        summary: {
          danglingAssociations: danglingResult.rows.length,
          missingProgramAssociations: missingProgramAssocResult.rows.length,
          projectsWithoutProgram: projectsWithoutProgramResult.rows.length,
          sprintsWithoutProject: sprintsWithoutProjectResult.rows.length,
          issuesWithoutProject: issuesWithoutProjectResult.rows.length,
        },
        danglingAssociations: danglingResult.rows,
        missingProgramAssociations: missingProgramAssocResult.rows,
        projectsWithoutProgram: projectsWithoutProgramResult.rows,
        sprintsWithoutProject: sprintsWithoutProjectResult.rows,
        issuesWithoutProject: issuesWithoutProjectResult.rows.slice(0, 50), // Limit for readability
      },
    });
  } catch (error) {
    console.error('Debug orphans error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to diagnose orphans',
      },
    });
  }
});

// POST /api/admin/debug/orphans/fix - Fix orphaned entities by backfilling associations
router.post('/debug/orphans/fix', async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Delete dangling associations
      const deleteDanglingResult = await client.query(`
        DELETE FROM document_associations
        WHERE id IN (
          SELECT da.id
          FROM document_associations da
          LEFT JOIN documents d ON da.related_id = d.id
          WHERE d.id IS NULL
        )
        RETURNING id
      `);

      // Note: program_id column was dropped by migration 029.
      // Backfill from column is no longer possible, but we keep the response structure.
      const backfillProgramResult = { rowCount: 0 };

      await client.query('COMMIT');

      // Log the fix action
      await logAuditEvent({
        actorUserId: req.userId!,
        action: 'admin.fix_orphans',
        details: {
          danglingDeleted: deleteDanglingResult.rowCount,
          programAssociationsBackfilled: backfillProgramResult.rowCount,
        },
        req,
      });

      res.json({
        success: true,
        data: {
          fixed: {
            danglingAssociationsDeleted: deleteDanglingResult.rowCount,
            programAssociationsBackfilled: backfillProgramResult.rowCount,
          },
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Fix orphans error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to fix orphans',
      },
    });
  }
});

// DELETE /api/admin/debug/users/:id - Delete a specific user (for cleanup)
router.delete('/debug/users/:id', async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;

  try {
    // Get user info for audit log
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [id]
    );

    if (!userResult.rows[0]) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'User not found',
        },
      });
      return;
    }

    const targetUser = userResult.rows[0];

    // Prevent deleting yourself
    if (id === req.userId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Cannot delete your own account',
        },
      });
      return;
    }

    // Delete in order: sessions, workspace_memberships, user
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    await logAuditEvent({
      actorUserId: req.userId!,
      action: 'user.delete',
      resourceType: 'user',
      resourceId: id,
      details: { email: targetUser.email, name: targetUser.name },
      req,
    });

    res.json({
      success: true,
      data: { deletedUser: targetUser },
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to delete user',
      },
    });
  }
});

export default router;
