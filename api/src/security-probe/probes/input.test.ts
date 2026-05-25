import { describe, expect, it } from 'vitest';
import {
  classifyInputResponse,
  classifyRejectedLongInput,
  runInputSanitizationProbes,
} from './input.js';
import type { ProbeHttpResponse } from '../http-client.js';
import type { SecurityProbeConfig } from '../types.js';

function testConfig(): SecurityProbeConfig {
  return {
    mode: 'local',
    webUrl: 'http://localhost:5173',
    apiUrl: 'http://localhost:3000',
    outDir: 'eval/results',
    reportName: 'security-audit-baseline',
    runId: 'test-run',
    startedAt: '2026-05-21T00:00:00.000Z',
    nonInteractive: true,
    credential: {
      email: 'dev@ship.local',
      password: 'admin123',
      source: 'default',
    },
    limits: {
      requestTimeoutMs: 10_000,
      maxWebSocketPayloadBytes: 10 * 1024 * 1024 + 1,
      allowOversizedWebSocketProbe: true,
      maxInvalidLoginAttempts: 3,
      maxRateLimitProbeRequests: 8,
    },
  };
}

function response(
  status: number,
  bodyText: string,
  contentType = 'application/json'
): ProbeHttpResponse {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    json = undefined;
  }

  return {
    url: 'http://localhost:3000/api/probe',
    status,
    ok: status >= 200 && status < 300,
    headers: { 'content-type': contentType },
    setCookie: [],
    bodyText,
    json,
  };
}

class FakeInputClient {
  public cleanupCount = 0;

  constructor(
    private readonly responses: ProbeHttpResponse[],
    private readonly loginSuccess = false
  ) {}

  addCleanup(): void {
    this.cleanupCount += 1;
  }

  async request(): Promise<ProbeHttpResponse> {
    return this.responses.shift() || response(404, '{}');
  }

  async login(): Promise<{ success: boolean; status: number }> {
    return { success: this.loginSuccess, status: this.loginSuccess ? 200 : 401 };
  }
}

describe('input sanitization probes', () => {
  it('flags HTML reflection as high severity', () => {
    const finding = classifyInputResponse({
      id: 'input-test',
      title: 'HTML reflection',
      response: response(400, '<script>alert(1)</script>', 'text/html'),
      payloads: ['<script>alert(1)</script>'],
      successIsFinding: false,
      reproduction: ['Request payload.'],
    });

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('high');
  });

  it('passes rejected adversarial JSON input', () => {
    const finding = classifyInputResponse({
      id: 'input-test',
      title: 'Rejected JSON input',
      response: response(400, '{"error":"Invalid input"}'),
      payloads: ['<script>alert(1)</script>'],
      successIsFinding: true,
      reproduction: ['Request payload.'],
    });

    expect(finding.status).toBe('pass');
  });

  it('flags overlong input accepted by an API', () => {
    const finding = classifyRejectedLongInput('input-long', 'Long input', response(201, '{}'), 255);

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('medium');
  });

  it('marks authenticated write probes credentials-required when login fails', async () => {
    const findings = await runInputSanitizationProbes(testConfig(), new FakeInputClient([
      response(401, '{"error":"Invalid email or password"}'),
      response(404, '{"error":"Program not found"}'),
    ]));

    expect(findings.some((finding) => finding.status === 'not_run_credentials_required')).toBe(true);
  });

  it('tracks cleanup for successful authenticated writes', async () => {
    const client = new FakeInputClient([
      response(401, '{"error":"Invalid email or password"}'),
      response(404, '{"error":"Program not found"}'),
      response(201, '{"id":"doc-1"}'),
      response(200, '{"id":"doc-1","title":"safe"}'),
      response(201, '{"id":"comment-1"}'),
      response(400, '{"error":"Invalid input"}'),
      response(201, '{"id":"issue-1"}'),
    ], true);

    await runInputSanitizationProbes(testConfig(), client);

    expect(client.cleanupCount).toBeGreaterThanOrEqual(3);
  });
});
