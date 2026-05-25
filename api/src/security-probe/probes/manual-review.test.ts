import { describe, expect, it } from 'vitest';
import {
  classifyCorsHeaders,
  classifyCspHeaders,
  classifyVerboseErrorResponse,
  matchingSecretPatterns,
} from './manual-review.js';
import type { ProbeHttpResponse } from '../http-client.js';

function headerResponse(headers: Record<string, string>, bodyText = '') {
  return {
    url: 'https://ship.example.gov',
    status: 200,
    headers,
    bodyText,
  };
}

function probeResponse(status: number, bodyText: string): ProbeHttpResponse {
  return {
    url: 'http://localhost:3000/api/auth/login',
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': 'application/json' },
    setCookie: [],
    bodyText,
    json: undefined,
  };
}

describe('manual-review collectors', () => {
  it('flags reflected untrusted CORS origins with credentials', () => {
    const finding = classifyCorsHeaders({
      'access-control-allow-origin': 'https://ship-security-probe.invalid',
      'access-control-allow-credentials': 'true',
    }, 204);

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('high');
  });

  it('passes CORS responses that do not allow the untrusted origin', () => {
    const finding = classifyCorsHeaders({}, 204);

    expect(finding.status).toBe('pass');
  });

  it('flags missing deployed CSP but tolerates local dev missing CSP as pass', () => {
    const deployed = classifyCspHeaders('csp', 'CSP', headerResponse({}), false);
    const local = classifyCspHeaders('csp', 'CSP', headerResponse({}), true);

    expect(deployed.status).toBe('finding');
    expect(local.status).toBe('pass');
    expect(local.evidence.localDevTolerated).toBe(true);
  });

  it('marks unavailable CSP targets as target unavailable', () => {
    const finding = classifyCspHeaders('csp', 'CSP', {
      url: 'https://ship.example.gov',
      status: 0,
      headers: {},
      bodyText: '',
      error: 'fetch failed',
    }, false);

    expect(finding.status).toBe('not_run_target_unavailable');
  });

  it('detects secret-like content', () => {
    expect(matchingSecretPatterns('DATABASE_URL=postgres://example')).toHaveLength(1);
  });

  it('flags verbose stack traces in error responses', () => {
    const finding = classifyVerboseErrorResponse(
      probeResponse(400, 'SyntaxError\n at parse (C:\\Users\\jay\\ship\\api\\src\\app.ts:1:2)')
    );

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('medium');
  });

  it('flags parser location details in malformed JSON responses', () => {
    const finding = classifyVerboseErrorResponse(
      probeResponse(400, '{"error":{"message":"Expected colon in JSON at position 11 (line 1 column 12)"}}')
    );

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('medium');
  });
});
