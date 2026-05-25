import { spawnSync } from 'node:child_process';
import type { SecurityFinding, SecurityProbeConfig } from '../types.js';

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  signal?: NodeJS.Signals | null;
  error?: string;
}

type CommandRunner = (command: string, args: string[], options: { cwd: string; timeoutMs: number }) => CommandResult;

interface DependencyAdvisory {
  packageName: string;
  severity: string;
  title: string;
  vulnerableRange?: string;
  patchedRange?: string;
  url?: string;
  paths: string[];
}

interface DependencyAuditSummary {
  counts: {
    critical: number;
    high: number;
  };
  advisories: DependencyAdvisory[];
  rawExitStatus: number | null;
}

export async function runDependencyCveProbe(
  config: SecurityProbeConfig,
  runner: CommandRunner = defaultCommandRunner
): Promise<SecurityFinding[]> {
  const timeoutMs = dependencyAuditTimeoutMs(config);
  const result = runner('pnpm', ['audit', '--json'], { cwd: process.cwd(), timeoutMs });
  const parsed = parseDependencyAudit(result.stdout, result.status);

  if (!parsed) {
    return [
      {
        id: 'dependency-audit-json',
        metric: 'high_critical_cves',
        surface: 'dependency_cve',
        status: 'inconclusive',
        severity: 'info',
        title: 'Dependency audit output could not be parsed',
        description: 'The probe ran pnpm audit --json but did not receive parseable JSON.',
        reproduction: ['Run pnpm audit --json from the repository root.'],
        evidence: {
          status: result.status,
          stderr: truncate(result.stderr),
          stdout: truncate(result.stdout),
          signal: result.signal,
          error: result.error,
          timeoutMs,
        },
        recommendation: 'Verify registry connectivity and rerun the dependency audit.',
      },
    ];
  }

  const highCriticalCount = parsed.counts.critical + parsed.counts.high;
  return [
    {
      id: 'dependency-high-critical-cves',
      metric: 'high_critical_cves',
      surface: 'dependency_cve',
      status: highCriticalCount > 0 ? 'finding' : 'pass',
      severity: parsed.counts.critical > 0 ? 'critical' : highCriticalCount > 0 ? 'high' : 'info',
      title: highCriticalCount > 0
        ? 'High or critical dependency CVEs found'
        : 'No high or critical dependency CVEs found',
      description: 'The probe parsed pnpm audit JSON and counted high/critical advisories.',
      reproduction: ['Run pnpm audit --json from the repository root.'],
      evidence: {
        counts: parsed.counts,
        advisories: parsed.advisories,
        rawExitStatus: parsed.rawExitStatus,
        timeoutMs,
      },
      recommendation: highCriticalCount > 0
        ? 'Upgrade, override, or remove vulnerable dependency paths and rerun the audit.'
        : undefined,
    },
  ];
}

function dependencyAuditTimeoutMs(config: SecurityProbeConfig): number {
  return Math.max(30_000, Math.min(120_000, config.limits.requestTimeoutMs * 12));
}

export function parseDependencyAudit(rawOutput: string, rawExitStatus: number | null): DependencyAuditSummary | undefined {
  if (!rawOutput.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return undefined;
  }

  if (!isObject(parsed)) {
    return undefined;
  }

  const counts = {
    critical: Number(nestedValue(parsed, ['metadata', 'vulnerabilities', 'critical']) || 0),
    high: Number(nestedValue(parsed, ['metadata', 'vulnerabilities', 'high']) || 0),
  };

  const advisories = extractAdvisories(parsed).filter((advisory) =>
    advisory.severity === 'critical' || advisory.severity === 'high'
  );

  return { counts, advisories, rawExitStatus };
}

function extractAdvisories(parsed: Record<string, unknown>): DependencyAdvisory[] {
  const advisoriesValue = parsed.advisories;
  if (isObject(advisoriesValue)) {
    return Object.values(advisoriesValue)
      .filter(isObject)
      .map((advisory) => ({
        packageName: stringValue(advisory.module_name) || stringValue(advisory.name) || '(unknown)',
        severity: stringValue(advisory.severity) || 'unknown',
        title: stringValue(advisory.title) || stringValue(advisory.overview) || '(untitled advisory)',
        vulnerableRange: stringValue(advisory.vulnerable_versions),
        patchedRange: stringValue(advisory.patched_versions),
        url: stringValue(advisory.url),
        paths: extractFindingPaths(advisory.findings),
      }));
  }

  const vulnerabilitiesValue = parsed.vulnerabilities;
  if (isObject(vulnerabilitiesValue)) {
    return Object.entries(vulnerabilitiesValue)
      .flatMap(([packageName, value]) => {
        if (!isObject(value)) {
          return [];
        }

        const via = Array.isArray(value.via) ? value.via : [];
        const advisoryVia = via.find(isObject);
        return [{
          packageName,
          severity: stringValue(value.severity) || 'unknown',
          title: isObject(advisoryVia)
            ? stringValue(advisoryVia.title) || `${packageName} vulnerability`
            : `${packageName} vulnerability`,
          vulnerableRange: stringValue(value.range),
          patchedRange: stringValue(value.fixAvailable),
          url: isObject(advisoryVia) ? stringValue(advisoryVia.url) : undefined,
          paths: Array.isArray(value.nodes) ? value.nodes.filter(isString) : [],
        }];
      });
  }

  return [];
}

function extractFindingPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .flatMap((finding) => {
      const paths = finding.paths;
      return Array.isArray(paths) ? paths.filter(isString) : [];
    });
}

function defaultCommandRunner(command: string, args: string[], options: { cwd: string; timeoutMs: number }): CommandResult {
  const result = process.platform === 'win32'
    ? spawnSync([command, ...args].map(quoteWindowsShellSegment).join(' '), {
        cwd: options.cwd,
        encoding: 'utf8',
        shell: true,
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
      })
    : spawnSync(command, args, {
        cwd: options.cwd,
        encoding: 'utf8',
        timeout: options.timeoutMs,
        killSignal: 'SIGTERM',
      });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    signal: result.signal,
    error: result.error?.message,
  };
}

function quoteWindowsShellSegment(segment: string): string {
  return /^[a-zA-Z0-9_@./:-]+$/.test(segment) ? segment : `"${segment.replace(/"/g, '\\"')}"`;
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!isObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function truncate(value: string, maxLength = 1_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
