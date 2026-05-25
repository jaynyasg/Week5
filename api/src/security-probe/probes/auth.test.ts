import { describe, expect, it } from 'vitest';
import {
  classifyProtectedRouteResponse,
  classifySessionCookieFlags,
  runAuthSessionProbes,
} from './auth.js';
import type { SecurityProbeConfig } from '../types.js';
import type { LoginProbeResult, ProbeHttpResponse } from '../http-client.js';

function testConfig(overrides: Partial<SecurityProbeConfig> = {}): SecurityProbeConfig {
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
    ...overrides,
  };
}

function response(status: number, body = '{}'): ProbeHttpResponse {
  return {
    url: 'http://localhost:3000/api/documents',
    status,
    ok: status >= 200 && status < 300,
    headers: {},
    setCookie: [],
    bodyText: body,
    json: {},
  };
}

function loginResult(
  success: boolean,
  cookieFlags: Record<string, string | boolean> = {}
): LoginProbeResult {
  return {
    attemptedEmail: 'dev@ship.local',
    status: success ? 200 : 401,
    success,
    userId: success ? 'user-1' : undefined,
    workspaceId: success ? 'workspace-1' : undefined,
    cookieFlags,
    response: response(success ? 200 : 401),
  };
}

class FakeAuthClient {
  constructor(
    private readonly requestStatuses: number[] = [],
    private readonly loginResponse = loginResult(true, {
      httponly: true,
      samesite: 'Strict',
      secure: true,
    })
  ) {}

  async request(): Promise<ProbeHttpResponse> {
    return response(this.requestStatuses.shift() || 403);
  }

  async login(): Promise<LoginProbeResult> {
    return this.loginResponse;
  }
}

describe('auth/session probes', () => {
  it('classifies unauthenticated success as a high finding', () => {
    const finding = classifyProtectedRouteResponse('auth-test', 'Protected route', response(200));

    expect(finding.status).toBe('finding');
    expect(finding.severity).toBe('high');
  });

  it('classifies denied unauthenticated access as pass', () => {
    const finding = classifyProtectedRouteResponse('auth-test', 'Protected route', response(401));

    expect(finding.status).toBe('pass');
  });

  it('requires Secure cookie only for HTTPS targets', () => {
    const localFindings = classifySessionCookieFlags(
      testConfig({ apiUrl: 'http://localhost:3000' }),
      loginResult(true, { httponly: true, samesite: 'Strict' })
    );
    const remoteFindings = classifySessionCookieFlags(
      testConfig({ apiUrl: 'https://api.ship.example.gov' }),
      loginResult(true, { httponly: true, samesite: 'Strict' })
    );

    expect(localFindings.find((finding) => finding.id === 'auth-cookie-secure')?.status).toBe('pass');
    expect(remoteFindings.find((finding) => finding.id === 'auth-cookie-secure')?.status).toBe('finding');
  });

  it('marks secondary role probes as credentials-required when no secondary credentials exist', async () => {
    const findings = await runAuthSessionProbes(testConfig(), {
      unauthenticated: new FakeAuthClient([401, 403, 401, 403, 401, 401]),
      primary: new FakeAuthClient([403]),
    });

    expect(findings.some((finding) => finding.status === 'not_run_secondary_credentials_required')).toBe(true);
  });

  it('flags remote default credentials if accepted', async () => {
    const findings = await runAuthSessionProbes(
      testConfig({
        mode: 'remote',
        webUrl: 'https://ship.example.gov',
        apiUrl: 'https://api.ship.example.gov',
      }),
      {
        unauthenticated: new FakeAuthClient([401, 403, 401, 403, 401, 401]),
        primary: new FakeAuthClient([403]),
      }
    );

    const loginFinding = findings.find((finding) => finding.id === 'auth-login-primary');
    expect(loginFinding?.status).toBe('finding');
    expect(loginFinding?.severity).toBe('critical');
  });
});
