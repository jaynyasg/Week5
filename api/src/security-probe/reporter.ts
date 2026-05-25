import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AUDIT_METRIC_DEFINITIONS,
  type AuditMetricKey,
  type AuditMatrixRow,
  type FindingSeverity,
  type FindingStatus,
  type SecurityFinding,
  type SecurityProbeConfig,
  type SecurityProbeReport,
} from './types.js';
import { ensureReportDirectory } from './config.js';

const FINDING_STATUSES: FindingStatus[] = [
  'pass',
  'finding',
  'inconclusive',
  'error',
  'not_run_credentials_required',
  'not_run_secondary_credentials_required',
  'not_run_target_unavailable',
  'not_run_safety_limit',
];

const FINDING_SEVERITIES: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

function emptyCountMap<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function buildSecurityProbeReport(
  config: SecurityProbeConfig,
  findings: SecurityFinding[],
  finishedAt = new Date().toISOString()
): SecurityProbeReport {
  const findingsByStatus = emptyCountMap(FINDING_STATUSES);
  const findingsBySeverity = emptyCountMap(FINDING_SEVERITIES);

  for (const finding of findings) {
    findingsByStatus[finding.status] += 1;
    findingsBySeverity[finding.severity] += 1;
  }

  const reportWithoutMatrix: Omit<SecurityProbeReport, 'auditMatrix'> = {
    schemaVersion: 1,
    run: {
      id: config.runId,
      startedAt: config.startedAt,
      finishedAt,
      mode: config.mode,
      webUrl: config.webUrl,
      apiUrl: config.apiUrl,
      reportName: config.reportName,
      nonInteractive: config.nonInteractive,
    },
    credentials: {
      defaultAttempted: config.credential.source === 'default',
      primaryEmail: config.credential.email,
      primarySource: config.credential.source,
      secondaryProvided: Boolean(config.secondaryCredential),
    },
    summary: {
      totalFindings: findings.filter((finding) => finding.status === 'finding').length,
      findingsByStatus,
      findingsBySeverity,
    },
    findings,
  };

  return {
    ...reportWithoutMatrix,
    auditMatrix: buildAuditMatrix(findings),
  };
}

export function buildAuditMatrix(findings: SecurityFinding[]): AuditMatrixRow[] {
  return AUDIT_METRIC_DEFINITIONS.map((definition) => ({
    metric: definition.label,
    baseline: summarizeMetric(definition.key, findings),
    source: definition.source,
  }));
}

function summarizeMetric(metric: AuditMetricKey, findings: SecurityFinding[]): string {
  if (metric === 'security_probe_tool') {
    const toolFinding = findings.find((finding) => finding.metric === metric);
    return toolFinding?.status === 'pass' ? 'Runnable (Yes)' : 'Runnable (No)';
  }

  const metricFindings = findings.filter((finding) => finding.metric === metric);
  if (metricFindings.length === 0) {
    return 'Not run yet';
  }

  const verifiedFindings = metricFindings.filter((finding) => finding.status === 'finding');
  if (verifiedFindings.length > 0) {
    return verifiedFindings
      .map((finding) => `${finding.severity.toUpperCase()}: ${finding.title}`)
      .join('; ');
  }

  const blocked = metricFindings.filter((finding) => finding.status.startsWith('not_run'));
  if (blocked.length === metricFindings.length) {
    return blocked.map((finding) => `${finding.status}: ${finding.title}`).join('; ');
  }

  const inconclusive = metricFindings.filter((finding) => finding.status === 'inconclusive');
  if (inconclusive.length > 0) {
    return inconclusive.map((finding) => `Inconclusive: ${finding.title}`).join('; ');
  }

  return 'No verified vulnerabilities found';
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function renderEvidence(evidence: Record<string, unknown>): string {
  const entries = Object.entries(evidence);
  if (entries.length === 0) {
    return '_No evidence captured._';
  }

  return entries
    .map(([key, value]) => `  - ${key}: \`${JSON.stringify(value)}\``)
    .join('\n');
}

export function renderMarkdownReport(report: SecurityProbeReport): string {
  const lines: string[] = [
    `# Ship Security Audit Report`,
    '',
    `- Run ID: \`${report.run.id}\``,
    `- Mode: \`${report.run.mode}\``,
    `- Web URL: \`${report.run.webUrl}\``,
    `- API URL: \`${report.run.apiUrl}\``,
    `- Started: \`${report.run.startedAt}\``,
    `- Finished: \`${report.run.finishedAt}\``,
    `- Non-interactive: \`${report.run.nonInteractive}\``,
    '',
    '## Audit Deliverable Matrix',
    '',
    '| Metric | Your Baseline | Source |',
    '| --- | --- | --- |',
    ...report.auditMatrix.map(
      (row) =>
        `| ${escapeMarkdownTableCell(row.metric)} | ${escapeMarkdownTableCell(row.baseline)} | ${escapeMarkdownTableCell(row.source)} |`
    ),
    '',
    '## Summary',
    '',
    `- Verified findings: ${report.summary.totalFindings}`,
    `- Status counts: \`${JSON.stringify(report.summary.findingsByStatus)}\``,
    `- Severity counts: \`${JSON.stringify(report.summary.findingsBySeverity)}\``,
    '',
    '## Findings',
    '',
  ];

  if (report.findings.length === 0) {
    lines.push('_No findings recorded._');
    return `${lines.join('\n')}\n`;
  }

  for (const finding of report.findings) {
    lines.push(
      `### ${finding.id}: ${finding.title}`,
      '',
      `- Metric: \`${finding.metric}\``,
      `- Surface: \`${finding.surface}\``,
      `- Status: \`${finding.status}\``,
      `- Severity: \`${finding.severity}\``,
      '',
      finding.description,
      '',
      '**Reproduction Steps**',
      '',
      ...finding.reproduction.map((step, index) => `${index + 1}. ${step}`),
      '',
      '**Evidence**',
      '',
      renderEvidence(finding.evidence),
      ''
    );

    if (finding.recommendation) {
      lines.push('**Recommendation**', '', finding.recommendation, '');
    }
  }

  return `${lines.join('\n')}\n`;
}

export async function writeSecurityProbeReports(
  config: SecurityProbeConfig,
  report: SecurityProbeReport
): Promise<{ jsonPath: string; markdownPath: string }> {
  await ensureReportDirectory(config);

  const jsonPath = join(config.outDir, `${config.reportName}.json`);
  const markdownPath = join(config.outDir, `${config.reportName}.md`);

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderMarkdownReport(report), 'utf8');

  return { jsonPath, markdownPath };
}
