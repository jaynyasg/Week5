import { pool } from '../../db/client.js';
import type {
  FleetGraphActionProposalCandidate,
  FleetGraphContext,
  FleetGraphFindingCandidate,
} from './types.js';

let findingDocumentTypeReady: Promise<void> | null = null;

export async function persistFleetGraphFinding(input: {
  context: FleetGraphContext;
  candidate: FleetGraphFindingCandidate;
  runId?: string | null;
}): Promise<string> {
  await ensureFleetGraphFindingDocumentType();

  const properties = {
    status: 'open',
    severity: input.candidate.severity,
    kind: input.candidate.kind,
    confidence: input.candidate.confidence,
    summary: input.candidate.summary,
    rationale: input.candidate.rationale,
    target_document_id: input.candidate.targetDocumentId,
    target_document_type: input.candidate.targetDocumentType,
    owner_user_id: input.candidate.ownerUserId,
    run_id: input.runId ?? null,
    evidence: input.candidate.evidence,
    first_detected_at: input.context.now,
    last_observed_at: input.context.now,
    fleetgraph_key: input.candidate.key,
  };
  const serializedProperties = JSON.stringify(properties);

  const updated = await updateExistingFleetGraphFinding({
    workspaceId: input.context.workspaceId,
    key: input.candidate.key,
    title: input.candidate.title,
    properties: serializedProperties,
  });
  if (updated) {
    await persistFindingAssociations(input.context, updated);
    return updated;
  }

  let findingDocumentId: string;
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, visibility)
       VALUES ($1, 'fleetgraph_finding', $2, $3, $4, 'workspace')
       RETURNING id`,
      [
        input.context.workspaceId,
        input.candidate.title,
        serializedProperties,
        toNullableUuid(input.context.userId),
      ],
    );
    findingDocumentId = result.rows[0]!.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const recovered = await updateExistingFleetGraphFinding({
      workspaceId: input.context.workspaceId,
      key: input.candidate.key,
      title: input.candidate.title,
      properties: serializedProperties,
    });
    if (!recovered) throw error;
    findingDocumentId = recovered;
  }

  await persistFindingAssociations(input.context, findingDocumentId);
  return findingDocumentId;
}

function toNullableUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function persistFleetGraphFindings(input: {
  context: FleetGraphContext;
  candidates: FleetGraphFindingCandidate[];
  runId?: string | null;
}): Promise<string[]> {
  const ids: string[] = [];
  for (const candidate of input.candidates) {
    ids.push(await persistFleetGraphFinding({
      context: input.context,
      candidate,
      runId: input.runId,
    }));
  }
  return ids;
}

export async function persistFleetGraphActionProposal(input: {
  context: FleetGraphContext;
  proposal: FleetGraphActionProposalCandidate;
  findingDocumentId: string;
  runId?: string | null;
}): Promise<string> {
  const payload = JSON.stringify(input.proposal.payload);
  const existing = await pool.query<{ id: string }>(
    `SELECT id
     FROM fleetgraph_action_proposals
     WHERE workspace_id = $1
       AND finding_document_id = $2
       AND proposed_action = $3
       AND target_document_id IS NOT DISTINCT FROM $4::uuid
       AND payload = $5::jsonb
       AND status = 'pending'
     LIMIT 1`,
    [
      input.context.workspaceId,
      input.findingDocumentId,
      input.proposal.proposedAction,
      input.proposal.targetDocumentId,
      payload,
    ],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO fleetgraph_action_proposals (
       workspace_id, finding_document_id, run_id, proposed_action, target_document_id, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.context.workspaceId,
      input.findingDocumentId,
      input.runId ?? null,
      input.proposal.proposedAction,
      input.proposal.targetDocumentId,
      payload,
    ],
  );

  return result.rows[0]!.id;
}

async function persistFindingAssociations(
  context: FleetGraphContext,
  findingDocumentId: string,
): Promise<void> {
  const associations = [
    context.program ? { id: context.program.id, type: 'program' } : null,
    context.project ? { id: context.project.id, type: 'project' } : null,
    context.week ? { id: context.week.id, type: 'sprint' } : null,
  ].filter((association): association is { id: string; type: 'program' | 'project' | 'sprint' } => Boolean(association));

  for (const association of associations) {
    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
      [findingDocumentId, association.id, association.type],
    );
  }
}

async function ensureFleetGraphFindingDocumentType(): Promise<void> {
  findingDocumentTypeReady ??= pool.query(
    "ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'fleetgraph_finding'",
  ).then(() => undefined);
  return findingDocumentTypeReady;
}

async function updateExistingFleetGraphFinding(input: {
  workspaceId: string;
  key: string;
  title: string;
  properties: string;
}): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `UPDATE documents
     SET title = $3,
         properties = documents.properties
           || jsonb_build_object(
             'summary', $4::jsonb->>'summary',
             'rationale', $4::jsonb->>'rationale',
             'run_id', $4::jsonb->'run_id',
             'evidence', $4::jsonb->'evidence',
             'last_observed_at', $4::jsonb->>'last_observed_at'
           ),
         updated_at = now()
     WHERE id = (
       SELECT id
       FROM documents
       WHERE workspace_id = $1
         AND document_type::text = 'fleetgraph_finding'
         AND properties->>'fleetgraph_key' = $2
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1
     )
     RETURNING id`,
    [input.workspaceId, input.key, input.title, input.properties],
  );

  return result.rows[0]?.id ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === '23505';
}
