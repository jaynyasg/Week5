import { describe, expect, it } from 'vitest';
import { toDeliveryPayload } from './deliveries.js';

describe('FleetGraph deliveries', () => {
  it('keeps realtime payloads small and action-focused', () => {
    expect(toDeliveryPayload({
      deliveryId: 'delivery-1',
      findingDocumentId: 'finding-1',
      finding: {
        key: 'risk-1',
        title: 'Approved plan changed',
        severity: 'medium',
        kind: 'scope_drift',
        confidence: 0.9,
        summary: 'Plan changed.',
        rationale: 'Needs re-review.',
        targetDocumentId: 'plan-1',
        targetDocumentType: 'weekly_plan',
        ownerUserId: 'owner-1',
        evidence: [{
          sourceType: 'document',
          sourceId: 'plan-1',
          title: 'Week Plan',
          excerpt: 'Approved plan changed.',
        }],
        actionProposal: {
          proposedAction: 'request_update',
          targetDocumentId: 'plan-1',
          payload: {},
          reason: 'Needs re-review.',
        },
      },
    })).toEqual({
      findingId: 'finding-1',
      deliveryId: 'delivery-1',
      severity: 'medium',
      title: 'Approved plan changed',
      targetLabel: 'Week Plan',
      actionRequired: true,
      toast: true,
      badge: true,
    });
  });

  it('applies user notification preferences to realtime payloads', () => {
    expect(toDeliveryPayload({
      deliveryId: 'delivery-1',
      findingDocumentId: 'finding-1',
      preferences: {
        toastMinSeverity: 'critical',
        toastActionRequired: false,
        showUnreadBadge: false,
        updatedAt: '2026-05-25T12:00:00.000Z',
      },
      finding: {
        key: 'risk-1',
        title: 'Approved plan changed',
        severity: 'high',
        kind: 'scope_drift',
        confidence: 0.9,
        summary: 'Plan changed.',
        rationale: 'Needs re-review.',
        targetDocumentId: 'plan-1',
        targetDocumentType: 'weekly_plan',
        ownerUserId: 'owner-1',
        evidence: [],
        actionProposal: {
          proposedAction: 'request_update',
          targetDocumentId: 'plan-1',
          payload: {},
          reason: 'Needs re-review.',
        },
      },
    })).toMatchObject({
      actionRequired: true,
      toast: false,
      badge: false,
    });
  });
});
