import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SecurityProbeConfig,
  SecurityProbeCredentialConfig,
  SecurityProbeMode,
} from './types.js';

const DEFAULT_LOCAL_WEB_URL = 'http://localhost:5173';
const DEFAULT_LOCAL_API_URL = 'http://localhost:3000';
const DEFAULT_EMAIL = 'dev@ship.local';
const DEFAULT_PASSWORD = 'admin123';

export class SecurityProbeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityProbeConfigError';
  }
}

interface ParsedArgs {
  values: Record<string, string>;
  flags: Set<string>;
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

function parseArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current?.startsWith('--')) {
      continue;
    }

    const raw = current.slice(2);
    const equalsIndex = raw.indexOf('=');
    if (equalsIndex >= 0) {
      values[raw.slice(0, equalsIndex)] = raw.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      values[raw] = next;
      index += 1;
      continue;
    }

    flags.add(raw);
  }

  return { values, flags };
}

function normalizeUrl(value: string, optionName: string): string {
  try {
    const url = new URL(value);
    return url.toString().replace(/\/$/, '');
  } catch {
    throw new SecurityProbeConfigError(`${optionName} must be a valid URL.`);
  }
}

function positiveInteger(value: string | undefined, fallback: number, optionName: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SecurityProbeConfigError(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function credentialFromSources(
  values: Record<string, string>,
  env: NodeJS.ProcessEnv,
  emailKey: string,
  passwordKey: string,
  fallbackEmail?: string,
  fallbackPassword?: string
): SecurityProbeCredentialConfig | undefined {
  const cliEmail = values[emailKey];
  const cliPassword = values[passwordKey];
  if (cliEmail || cliPassword) {
    if (!cliEmail || !cliPassword) {
      throw new SecurityProbeConfigError(`--${emailKey} and --${passwordKey} must be provided together.`);
    }
    return { email: cliEmail, password: cliPassword, source: 'cli' };
  }

  const envEmailKey = emailKey === 'email' ? 'SHIP_SECURITY_EMAIL' : 'SHIP_SECURITY_ALT_EMAIL';
  const envPasswordKey = passwordKey === 'password' ? 'SHIP_SECURITY_PASSWORD' : 'SHIP_SECURITY_ALT_PASSWORD';
  const envEmail = env[envEmailKey];
  const envPassword = env[envPasswordKey];
  if (envEmail || envPassword) {
    if (!envEmail || !envPassword) {
      throw new SecurityProbeConfigError(`${envEmailKey} and ${envPasswordKey} must be provided together.`);
    }
    return { email: envEmail, password: envPassword, source: 'env' };
  }

  if (fallbackEmail && fallbackPassword) {
    return { email: fallbackEmail, password: fallbackPassword, source: 'default' };
  }

  return undefined;
}

export function parseSecurityProbeConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): SecurityProbeConfig {
  const { values, flags } = parseArgs(argv);
  const modeValue = values.mode || env.SHIP_SECURITY_MODE || 'local';
  if (modeValue !== 'local' && modeValue !== 'remote') {
    throw new SecurityProbeConfigError('--mode must be local or remote.');
  }

  const mode = modeValue as SecurityProbeMode;
  const webUrl = normalizeUrl(
    values['web-url'] || env.SHIP_SECURITY_WEB_URL || DEFAULT_LOCAL_WEB_URL,
    '--web-url'
  );
  const apiUrl = normalizeUrl(
    values['api-url'] || env.SHIP_SECURITY_API_URL || DEFAULT_LOCAL_API_URL,
    '--api-url'
  );

  if (mode === 'remote' && !values['web-url'] && !env.SHIP_SECURITY_WEB_URL) {
    throw new SecurityProbeConfigError('Remote mode requires --web-url or SHIP_SECURITY_WEB_URL.');
  }

  if (mode === 'remote' && !values['api-url'] && !env.SHIP_SECURITY_API_URL) {
    throw new SecurityProbeConfigError('Remote mode requires --api-url or SHIP_SECURITY_API_URL.');
  }

  const credential = credentialFromSources(
    values,
    env,
    'email',
    'password',
    DEFAULT_EMAIL,
    DEFAULT_PASSWORD
  );

  if (!credential) {
    throw new SecurityProbeConfigError('Primary credentials could not be resolved.');
  }

  const secondaryCredential = credentialFromSources(values, env, 'alt-email', 'alt-password');
  const outDir = resolve(repoRoot(), values['out-dir'] || env.SHIP_SECURITY_OUT_DIR || 'eval/results');
  const reportName = values['report-name'] || env.SHIP_SECURITY_REPORT_NAME || 'security-audit-baseline';
  const startedAt = new Date().toISOString();

  return {
    mode,
    webUrl,
    apiUrl,
    outDir,
    reportName,
    runId: values['run-id'] || env.SHIP_SECURITY_RUN_ID || randomUUID(),
    startedAt,
    nonInteractive: flags.has('non-interactive') || booleanValue(env.SHIP_SECURITY_NON_INTERACTIVE, false),
    credential,
    secondaryCredential,
    limits: {
      requestTimeoutMs: positiveInteger(values['request-timeout-ms'], 10_000, '--request-timeout-ms'),
      maxWebSocketPayloadBytes: positiveInteger(
        values['max-websocket-payload-bytes'],
        10 * 1024 * 1024 + 1,
        '--max-websocket-payload-bytes'
      ),
      allowOversizedWebSocketProbe: !flags.has('skip-oversized-websocket-probe'),
      maxInvalidLoginAttempts: positiveInteger(
        values['max-invalid-login-attempts'],
        3,
        '--max-invalid-login-attempts'
      ),
      maxRateLimitProbeRequests: positiveInteger(
        values['max-rate-limit-probe-requests'],
        8,
        '--max-rate-limit-probe-requests'
      ),
    },
  };
}

export async function ensureReportDirectory(config: SecurityProbeConfig): Promise<void> {
  await mkdir(config.outDir, { recursive: true });
}
