import { describe, expect, it } from 'vitest';
import {
  SecurityProbeHttpClient,
  splitSetCookieHeader,
  type ProbeHttpResponse,
} from './http-client.js';
import type { SecurityProbeConfig } from './types.js';

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

function testHeaders(headers: Record<string, string> = {}): Headers {
  const entries = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );

  return {
    get: (key: string) => entries.get(key.toLowerCase()) || null,
    forEach: (callback: (value: string, key: string) => void) => {
      entries.forEach((value, key) => callback(value, key));
    },
    getSetCookie: () => {
      const value = entries.get('set-cookie');
      return value ? splitSetCookieHeader(value) : [];
    },
  } as unknown as Headers;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status || 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: testHeaders({
      'content-type': 'application/json',
      ...init.headers,
    }),
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status || 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: testHeaders({
      'content-type': 'text/plain',
      ...init.headers,
    }),
    text: async () => body,
  } as Response;
}

describe('SecurityProbeHttpClient', () => {
  it('splits combined Set-Cookie headers with Expires commas', () => {
    const header =
      'connect.sid=s%3Aabc; Path=/; Expires=Thu, 21 May 2026 22:00:00 GMT; HttpOnly, session_id=xyz; Path=/; HttpOnly; SameSite=Strict';

    expect(splitSetCookieHeader(header)).toEqual([
      'connect.sid=s%3Aabc; Path=/; Expires=Thu, 21 May 2026 22:00:00 GMT; HttpOnly',
      'session_id=xyz; Path=/; HttpOnly; SameSite=Strict',
    ]);
  });

  it('fetches CSRF token, logs in, and captures session cookie flags', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init || {} });

      if (String(url).endsWith('/api/csrf-token')) {
        return jsonResponse(
          { token: 'csrf-token' },
          {
            headers: {
              'set-cookie': 'connect.sid=session; Path=/; HttpOnly; SameSite=Strict',
            },
          }
        );
      }

      return jsonResponse(
        {
          success: true,
          data: {
            user: { id: 'user-1' },
            currentWorkspace: { id: 'workspace-1' },
          },
        },
        {
          headers: {
            'set-cookie': 'session_id=session-id; Path=/; HttpOnly; SameSite=Strict; Max-Age=900',
          },
        }
      );
    }) as typeof fetch;

    const client = new SecurityProbeHttpClient(testConfig(), fetchImpl);
    const result = await client.login();

    expect(result.success).toBe(true);
    expect(result.userId).toBe('user-1');
    expect(result.workspaceId).toBe('workspace-1');
    expect(result.cookieFlags).toMatchObject({
      httponly: true,
      samesite: 'Strict',
    });
    expect(requests[1]?.init.headers).toMatchObject({
      'x-csrf-token': 'csrf-token',
      cookie: 'connect.sid=session',
    });
    expect(client.cookieHeader).toContain('session_id=session-id');
  });

  it('runs cleanup items in reverse order', async () => {
    const paths: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      paths.push(String(url));
      if (String(url).endsWith('/api/csrf-token')) {
        return jsonResponse({ token: 'csrf-token' });
      }
      return jsonResponse({ success: true });
    }) as typeof fetch;

    const client = new SecurityProbeHttpClient(testConfig(), fetchImpl);
    client.addCleanup({ id: 'doc', description: 'Delete probe doc', method: 'DELETE', path: '/api/documents/doc-1' });
    client.addCleanup({
      id: 'comment',
      description: 'Delete probe comment',
      method: 'DELETE',
      path: '/api/comments/comment-1',
    });

    const results = await client.runCleanup();

    const cleanupPaths = paths.filter((path) => !path.endsWith('/api/csrf-token'));
    expect(cleanupPaths[0]).toBe('http://localhost:3000/api/comments/comment-1');
    expect(cleanupPaths[1]).toBe('http://localhost:3000/api/documents/doc-1');
    expect(results.every((result) => result.status === 'success')).toBe(true);
  });

  it('normalizes non-JSON responses', async () => {
    const fetchImpl = (async () => textResponse('not json', { status: 418 })) as typeof fetch;

    const client = new SecurityProbeHttpClient(testConfig(), fetchImpl);
    const response: ProbeHttpResponse = await client.request('/health');

    expect(response.status).toBe(418);
    expect(response.bodyText).toBe('not json');
    expect(response.json).toBeUndefined();
  });
});
