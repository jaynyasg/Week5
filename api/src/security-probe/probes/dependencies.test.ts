import { describe, expect, it } from 'vitest';
import { parseDependencyAudit, runDependencyCveProbe } from './dependencies.js';
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

describe('dependency CVE probe', () => {
  it('parses clean pnpm audit output', () => {
    const summary = parseDependencyAudit(
      JSON.stringify({ metadata: { vulnerabilities: { critical: 0, high: 0 } } }),
      0
    );

    expect(summary?.counts).toEqual({ critical: 0, high: 0 });
    expect(summary?.advisories).toEqual([]);
  });

  it('parses high and critical advisories', () => {
    const summary = parseDependencyAudit(
      JSON.stringify({
        metadata: { vulnerabilities: { critical: 1, high: 1 } },
        advisories: {
          '1': {
            module_name: 'example-critical',
            severity: 'critical',
            title: 'Critical issue',
            vulnerable_versions: '<1.0.0',
            patched_versions: '>=1.0.0',
            url: 'https://example.gov/advisory',
            findings: [{ paths: ['api>example-critical'] }],
          },
          '2': {
            module_name: 'example-low',
            severity: 'low',
            title: 'Low issue',
          },
        },
      }),
      1
    );

    expect(summary?.counts).toEqual({ critical: 1, high: 1 });
    expect(summary?.advisories).toHaveLength(1);
    expect(summary?.advisories[0]).toMatchObject({
      packageName: 'example-critical',
      severity: 'critical',
      paths: ['api>example-critical'],
    });
  });

  it('returns undefined for non-JSON output', () => {
    expect(parseDependencyAudit('not json', 1)).toBeUndefined();
  });

  it('returns a finding when high/critical advisories are present', async () => {
    const findings = await runDependencyCveProbe(testConfig(), () => ({
      status: 1,
      stdout: JSON.stringify({
        metadata: { vulnerabilities: { critical: 0, high: 1 } },
        vulnerabilities: {
          qs: {
            severity: 'high',
            range: '<6.0.0',
            via: [{ title: 'Prototype pollution', url: 'https://example.gov/qs' }],
            nodes: ['node_modules/qs'],
          },
        },
      }),
      stderr: '',
    }));

    expect(findings[0]?.status).toBe('finding');
    expect(findings[0]?.severity).toBe('high');
  });

  it('marks unparsable audit output inconclusive', async () => {
    const findings = await runDependencyCveProbe(testConfig(), () => ({
      status: 1,
      stdout: '',
      stderr: 'network unavailable',
    }));

    expect(findings[0]?.status).toBe('inconclusive');
  });
});
