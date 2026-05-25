import { describe, expect, it } from 'vitest';
import {
  classifySafeMessageHandling,
  classifyUnauthenticatedWebSocket,
  type WebSocketAttemptResult,
} from './websocket.js';

function attempt(overrides: Partial<WebSocketAttemptResult>): WebSocketAttemptResult {
  return {
    url: 'ws://localhost:3000/events',
    opened: false,
    messages: [],
    ...overrides,
  };
}

describe('websocket probe classification', () => {
  it('flags unauthenticated WebSocket opens as high severity', () => {
    const finding = classifyUnauthenticatedWebSocket(
      'ws-test',
      'Unauthenticated socket',
      attempt({ opened: true })
    );

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('high');
  });

  it('passes unauthenticated WebSocket 401/403 rejection', () => {
    const finding = classifyUnauthenticatedWebSocket(
      'ws-test',
      'Unauthenticated socket',
      attempt({ opened: false, httpStatus: 401 })
    );

    expect(finding.status).toBe('pass');
  });

  it('passes malformed messages when the socket stays open', () => {
    const finding = classifySafeMessageHandling('ws-test', 'Malformed message', {
      sentBytes: 9,
      stillOpen: true,
      messages: [],
    });

    expect(finding.status).toBe('pass');
  });

  it('treats controlled policy closes as safe handling', () => {
    const finding = classifySafeMessageHandling('ws-test', 'Malformed message', {
      sentBytes: 9,
      stillOpen: false,
      closeCode: 1008,
      closeReason: 'Rate limit exceeded',
      messages: [],
    });

    expect(finding.status).toBe('pass');
  });
});
