import { describe, expect, it } from 'vitest';
import { buildSecurityProbeReport, renderMarkdownReport } from './reporter.js';
import type { SecurityFinding, SecurityProbeConfig } from './types.js';

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

describe('security probe reporter', () => {
  it('renders the exact audit deliverable metric rows', () => {
    const report = buildSecurityProbeReport(testConfig(), [], '2026-05-21T00:00:01.000Z');
    const metricNames = report.auditMatrix.map((row) => row.metric);

    expect(metricNames).toEqual([
      'Security probe tool',
      'Auth/session vulnerabilities found',
      'WebSocket validation failures',
      'Input sanitization failures',
      'High/Critical CVEs in dependencies',
      'CORS/CSP misconfiguration',
      'Secrets exposure risk',
      'Rate limiting absent on endpoints',
      'Verbose error leakage',
    ]);
  });

  it('summarizes verified findings with severity', () => {
    const findings: SecurityFinding[] = [
      {
        id: 'auth-001',
        metric: 'auth_session_vulnerabilities',
        surface: 'auth_session',
        status: 'finding',
        severity: 'high',
        title: 'Protected endpoint allowed unauthenticated access',
        description: 'A representative protected endpoint returned success without a session.',
        reproduction: ['Request the endpoint without cookies.'],
        evidence: { status: 200 },
      },
    ];

    const report = buildSecurityProbeReport(testConfig(), findings, '2026-05-21T00:00:01.000Z');
    const authRow = report.auditMatrix.find((row) => row.metric === 'Auth/session vulnerabilities found');

    expect(authRow?.baseline).toBe('HIGH: Protected endpoint allowed unauthenticated access');
    expect(report.summary.totalFindings).toBe(1);
  });

  it('writes a Markdown report with matrix and reproduction steps', () => {
    const findings: SecurityFinding[] = [
      {
        id: 'ws-001',
        metric: 'websocket_validation_failures',
        surface: 'websocket',
        status: 'inconclusive',
        severity: 'medium',
        title: 'Unexpected WebSocket close code',
        description: 'The server closed the connection with an undocumented code.',
        reproduction: ['Open the events WebSocket.', 'Send malformed JSON.'],
        evidence: { closeCode: 4000 },
      },
    ];

    const markdown = renderMarkdownReport(
      buildSecurityProbeReport(testConfig(), findings, '2026-05-21T00:00:01.000Z')
    );

    expect(markdown).toContain('| Security probe tool | Runnable (No) |');
    expect(markdown).toContain('| WebSocket validation failures | Inconclusive: Unexpected WebSocket close code |');
    expect(markdown).toContain('1. Open the events WebSocket.');
  });
});
