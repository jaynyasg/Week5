import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type {
  FleetGraphActionProposal,
  FleetGraphChatResponse,
  FleetGraphErrorCode,
  FleetGraphFindingProperties,
  FleetGraphFindingSummary,
  AssistantCitation,
  AssistantSourceCounts,
} from '@ship/shared';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../db/client.js';
import { getFleetGraphStatus, FLEETGRAPH_LIMITS } from '../services/fleetgraph/config.js';
import { runFleetGraph } from '../services/fleetgraph/runner.js';
import type { FleetGraphEvidenceRef } from '../services/fleetgraph/types.js';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

const uuidSchema = z.string().uuid();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(FLEETGRAPH_LIMITS.maxMessageChars),
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
  findingId: z.string().uuid().optional(),
});

const deliveryUpdateSchema = z.object({
  status: z.enum(['read', 'dismissed', 'snoozed']),
  snoozedUntil: z.string().datetime().optional(),
}).refine((value) => value.status !== 'snoozed' || Boolean(value.snoozedUntil), {
  message: 'snoozedUntil is required when status is snoozed',
  path: ['snoozedUntil'],
});

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(1000).optional(),
});

router.get('/status', authMiddleware, async (_req: Request, res: Response) => {
  res.json(getFleetGraphStatus());
});

router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big');
    res.status(400).json(fleetGraphResponse(
      'error',
      tooLong
        ? `FleetGraph questions are limited to ${FLEETGRAPH_LIMITS.maxMessageChars} characters.`
        : 'FleetGraph needs a question before it can help.',
      {
        code: tooLong ? 'MESSAGE_TOO_LONG' : 'MESSAGE_REQUIRED',
        message: tooLong
          ? `message must be ${FLEETGRAPH_LIMITS.maxMessageChars} characters or fewer`
          : 'message is required',
      },
    ));
    return;
  }

  const status = getFleetGraphStatus();
  if (!status.available) {
    res.status(503).json(fleetGraphResponse('unavailable', 'FleetGraph is not configured yet.', {
      code: 'FLEETGRAPH_UNAVAILABLE',
      message: status.missingConfiguration.join(', ') || 'FleetGraph unavailable',
    }));
    return;
  }

  const result = await runFleetGraph({
    workspaceId: req.workspaceId!,
    userId: req.userId!,
    mode: 'chat',
    triggerType: 'chat',
    triggerId: parsed.data.findingId ?? parsed.data.context?.documentId ?? parsed.data.context?.projectId ?? null,
    routeContext: parsed.data.context,
    message: parsed.data.message,
  });

  if (result.status === 'failed') {
    res.status(500).json(fleetGraphResponse('error', 'FleetGraph hit an internal error.', {
      code: 'GRAPH_ERROR',
      message: result.error ?? 'graph failed',
    }));
    return;
  }

  const answer = result.state.answer;
  res.json({
    status: result.status === 'interrupted' ? 'interrupted' : answer?.status ?? 'answered',
    message: {
      id: randomUUID(),
      role: 'assistant',
      content: answer?.content ?? 'FleetGraph completed without an answer.',
      createdAt: new Date().toISOString(),
    },
    findings: result.state.findings.map((finding) => ({
      id: finding.key,
      title: finding.title,
      status: 'open',
      severity: finding.severity,
      kind: finding.kind,
      confidence: finding.confidence,
      summary: finding.summary,
      targetDocumentId: finding.targetDocumentId,
      targetDocumentType: finding.targetDocumentType,
      ownerUserId: finding.ownerUserId,
      createdAt: result.state.context.now,
      updatedAt: result.state.context.now,
    })),
    proposals: [],
    citations: toCitations(answer?.citations ?? []),
    sourceCounts: sourceCounts(answer?.citations ?? []),
    runId: result.runId ?? undefined,
  } satisfies FleetGraphChatResponse);
});

router.get('/findings', authMiddleware, async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT fd.id as delivery_id,
            fd.status as delivery_status,
            fd.delivered_at,
            fd.read_at,
            fd.dismissed_at,
            fd.snoozed_until,
            d.id,
            d.title,
            d.properties,
            d.created_at,
            d.updated_at
     FROM fleetgraph_deliveries fd
     JOIN documents d ON d.id = fd.finding_document_id
     WHERE fd.workspace_id = $1
       AND fd.user_id = $2
       AND d.document_type = 'fleetgraph_finding'
     ORDER BY fd.delivered_at DESC
     LIMIT 50`,
    [req.workspaceId, req.userId],
  );

  res.json({
    findings: result.rows.map((row) => findingSummary(row)),
    deliveries: result.rows.map((row) => ({
      id: row.delivery_id,
      findingDocumentId: row.id,
      userId: req.userId!,
      status: row.delivery_status,
      deliveredAt: toIsoString(row.delivered_at),
      readAt: row.read_at ? toIsoString(row.read_at) : null,
      dismissedAt: row.dismissed_at ? toIsoString(row.dismissed_at) : null,
      snoozedUntil: row.snoozed_until ? toIsoString(row.snoozed_until) : null,
    })),
  });
});

router.get('/findings/:id', authMiddleware, async (req: Request, res: Response) => {
  const findingId = parseUuidParam(req, res);
  if (!findingId) return;

  const finding = await getVisibleFinding(findingId, req.workspaceId!, req.userId!, isAdmin(req));
  if (!finding) {
    res.status(404).json({ error: 'FleetGraph finding not found' });
    return;
  }

  const properties = finding.properties ?? {};
  const proposals = await getFindingActionProposals(finding.id, req.workspaceId!);
  res.json({
    ...findingSummary(finding),
    rationale: properties.rationale ?? '',
    evidence: properties.evidence ?? [],
    proposals,
    runId: properties.run_id ?? null,
    firstDetectedAt: properties.first_detected_at ?? toIsoString(finding.created_at),
    lastObservedAt: properties.last_observed_at ?? toIsoString(finding.updated_at),
    resolvedAt: properties.resolved_at ?? null,
    dismissedReason: properties.dismissed_reason ?? null,
  });
});

router.patch('/deliveries/:id', authMiddleware, async (req: Request, res: Response) => {
  const deliveryId = parseUuidParam(req, res);
  if (!deliveryId) return;

  const parsed = deliveryUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid delivery update' });
    return;
  }

  const result = await pool.query(
    `UPDATE fleetgraph_deliveries
     SET status = $1,
         read_at = CASE WHEN $1 = 'read' THEN now() ELSE read_at END,
         dismissed_at = CASE WHEN $1 = 'dismissed' THEN now() ELSE dismissed_at END,
         snoozed_until = CASE WHEN $1 = 'snoozed' THEN $2::timestamptz ELSE snoozed_until END,
         updated_at = now()
     WHERE id = $3
       AND workspace_id = $4
       AND user_id = $5
     RETURNING *`,
    [parsed.data.status, parsed.data.snoozedUntil ?? null, deliveryId, req.workspaceId, req.userId],
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'FleetGraph delivery not found' });
    return;
  }

  res.json({ ok: true });
});

router.get('/runs/:id', authMiddleware, async (req: Request, res: Response) => {
  const runId = parseUuidParam(req, res);
  if (!runId) return;

  const result = await pool.query(
    `SELECT *
     FROM fleetgraph_runs
     WHERE id = $1
       AND workspace_id = $2
       AND ($3::boolean OR user_id = $4)
     LIMIT 1`,
    [runId, req.workspaceId, isAdmin(req), req.userId],
  );

  const row = result.rows[0];
  if (!row) {
    res.status(404).json({ error: 'FleetGraph run not found' });
    return;
  }

  res.json({
    id: row.id,
    mode: row.mode,
    triggerType: row.trigger_type,
    triggerId: row.trigger_id,
    threadId: row.thread_id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    estimatedCostUsd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
    langsmithTraceUrl: row.langsmith_trace_url,
    metadata: row.metadata ?? {},
    error: row.error,
    createdAt: toIsoString(row.created_at),
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
  });
});

router.post('/actions/:id/decision', authMiddleware, async (req: Request, res: Response) => {
  const proposalId = parseUuidParam(req, res);
  if (!proposalId) return;

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid action decision' });
    return;
  }

  const result = await pool.query(
    `UPDATE fleetgraph_action_proposals
     SET status = $1,
         decided_by_user_id = $2,
         decided_at = now(),
         decision_note = $3,
         updated_at = now()
     WHERE id = $4
       AND workspace_id = $5
       AND status = 'pending'
       AND (
         $6::boolean
         OR EXISTS (
           SELECT 1
           FROM fleetgraph_deliveries fd
           WHERE fd.workspace_id = fleetgraph_action_proposals.workspace_id
             AND fd.finding_document_id = fleetgraph_action_proposals.finding_document_id
             AND fd.user_id = $2
         )
       )
     RETURNING *`,
    [parsed.data.status, req.userId, parsed.data.note ?? null, proposalId, req.workspaceId, isAdmin(req)],
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: 'FleetGraph action proposal not found' });
    return;
  }

  res.json({ ok: true, proposal: actionProposalSummary(result.rows[0]) });
});

async function getVisibleFinding(
  findingId: string,
  workspaceId: string,
  userId: string,
  admin: boolean,
) {
  const result = await pool.query(
    `SELECT d.*
     FROM documents d
     LEFT JOIN fleetgraph_deliveries fd ON fd.finding_document_id = d.id
     WHERE d.id = $1
       AND d.workspace_id = $2
       AND d.document_type = 'fleetgraph_finding'
       AND ($3::boolean OR fd.user_id = $4)
     LIMIT 1`,
    [findingId, workspaceId, admin, userId],
  );
  return result.rows[0] ?? null;
}

async function getFindingActionProposals(
  findingId: string,
  workspaceId: string,
): Promise<FleetGraphActionProposal[]> {
  const result = await pool.query<ActionProposalRow>(
    `SELECT *
     FROM fleetgraph_action_proposals
     WHERE finding_document_id = $1
       AND workspace_id = $2
     ORDER BY created_at DESC`,
    [findingId, workspaceId],
  );
  return result.rows.map(actionProposalSummary);
}

function parseUuidParam(req: Request, res: Response, name = 'id'): string | null {
  const parsed = uuidSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    res.status(400).json({ error: `Invalid ${name}` });
    return null;
  }
  return parsed.data;
}

function fleetGraphResponse(
  status: FleetGraphChatResponse['status'],
  content: string,
  error?: { code: FleetGraphErrorCode; message: string },
): FleetGraphChatResponse {
  return {
    status,
    message: {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    },
    findings: [],
    proposals: [],
    citations: [],
    sourceCounts: emptySourceCounts(),
    error,
  };
}

function findingSummary(row: FindingRow): FleetGraphFindingSummary {
  const properties = row.properties ?? {};
  return {
    id: row.id,
    title: row.title,
    status: properties.status ?? 'open',
    severity: properties.severity ?? 'medium',
    kind: properties.kind ?? 'other',
    confidence: Number(properties.confidence ?? 0),
    summary: properties.summary ?? '',
    targetDocumentId: properties.target_document_id ?? null,
    targetDocumentType: properties.target_document_type ?? null,
    ownerUserId: properties.owner_user_id ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function actionProposalSummary(row: ActionProposalRow): FleetGraphActionProposal {
  return {
    id: row.id,
    findingDocumentId: row.finding_document_id,
    runId: row.run_id,
    proposedAction: row.proposed_action,
    targetDocumentId: row.target_document_id,
    payload: row.payload ?? {},
    status: row.status,
    requestedByActor: row.requested_by_actor,
    decidedByUserId: row.decided_by_user_id,
    decidedAt: row.decided_at ? toIsoString(row.decided_at) : null,
    decisionNote: row.decision_note,
    error: row.error,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toCitations(evidence: FleetGraphEvidenceRef[]): AssistantCitation[] {
  return evidence.map((item, index) => ({
    id: `F${index + 1}`,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    url: item.url ?? `/documents/${item.sourceId}`,
    excerpt: item.excerpt,
  }));
}

function sourceCounts(evidence: FleetGraphEvidenceRef[]): AssistantSourceCounts {
  const counts = emptySourceCounts();
  for (const item of evidence) {
    if (item.sourceType === 'document') counts.documents++;
    if (item.sourceType === 'project') counts.projects++;
    if (item.sourceType === 'program') counts.programs++;
    if (item.sourceType === 'issue') counts.issues++;
    if (item.sourceType === 'week') counts.weeks++;
    if (item.sourceType === 'timeline') counts.timeline++;
    if (item.sourceType === 'file') counts.files++;
    counts.total++;
  }
  return counts;
}

function emptySourceCounts(): AssistantSourceCounts {
  return {
    documents: 0,
    projects: 0,
    programs: 0,
    issues: 0,
    weeks: 0,
    timeline: 0,
    files: 0,
    total: 0,
  };
}

function isAdmin(req: Request): boolean {
  return Boolean(req.isSuperAdmin || req.workspaceRole === 'admin');
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

interface FindingRow {
  id: string;
  title: string;
  properties: Partial<FleetGraphFindingProperties> | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ActionProposalRow {
  id: string;
  finding_document_id: string | null;
  run_id: string | null;
  proposed_action: string;
  target_document_id: string | null;
  payload: Record<string, unknown> | null;
  status: FleetGraphActionProposal['status'];
  requested_by_actor: string;
  decided_by_user_id: string | null;
  decided_at: Date | string | null;
  decision_note: string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export default router;
