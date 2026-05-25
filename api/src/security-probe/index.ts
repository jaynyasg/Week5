import type { SecurityFinding, SecurityProbeConfig, SecurityProbeReport } from './types.js';
import { buildSecurityProbeReport } from './reporter.js';
import { runAuthSessionProbes } from './probes/auth.js';
import { runWebSocketProbes } from './probes/websocket.js';
import { runInputSanitizationProbes } from './probes/input.js';
import { runDependencyCveProbe } from './probes/dependencies.js';
import { runManualReviewCollectors } from './probes/manual-review.js';

async function runProbePhase(
  name: string,
  action: () => Promise<SecurityFinding[]>
): Promise<SecurityFinding[]> {
  const startedAt = Date.now();
  console.log(`[security-probe] ${new Date().toISOString()} starting ${name}`);

  try {
    const findings = await action();
    console.log(
      `[security-probe] ${new Date().toISOString()} completed ${name} in ${Date.now() - startedAt}ms`
    );
    return findings;
  } catch (error) {
    console.error(
      `[security-probe] ${new Date().toISOString()} failed ${name} after ${Date.now() - startedAt}ms`
    );
    throw error;
  }
}

export async function runSecurityProbe(config: SecurityProbeConfig): Promise<SecurityProbeReport> {
  const findings: SecurityFinding[] = [
    {
      id: 'tool-runnable',
      metric: 'security_probe_tool',
      surface: 'tool',
      status: 'pass',
      severity: 'info',
      title: 'Security probe command executed',
      description: 'The Category 8 security probe CLI started and produced a report artifact.',
      reproduction: [
        'Run the documented security audit command from the repository root.',
        'Confirm JSON and Markdown reports are written to the configured output directory.',
      ],
      evidence: {
        mode: config.mode,
        webUrl: config.webUrl,
        apiUrl: config.apiUrl,
        reportName: config.reportName,
      },
    },
  ];

  findings.push(...await runProbePhase('auth/session probes', () => runAuthSessionProbes(config)));
  findings.push(...await runProbePhase('input sanitization probes', () => runInputSanitizationProbes(config)));
  findings.push(...await runProbePhase('dependency CVE probe', () => runDependencyCveProbe(config)));
  findings.push(...await runProbePhase('manual review collectors', () => runManualReviewCollectors(config)));
  findings.push(...await runProbePhase('WebSocket probes', () => runWebSocketProbes(config)));

  return buildSecurityProbeReport(config, findings);
}
