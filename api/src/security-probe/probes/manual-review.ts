import { SecurityProbeHttpClient, type ProbeHttpResponse } from '../http-client.js';
import type { SecurityFinding, SecurityProbeConfig } from '../types.js';

interface ManualReviewClient {
  request(pathOrUrl: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    csrf?: boolean;
  }): Promise<ProbeHttpResponse>;
}

interface HeaderProbeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  error?: string;
}

const SECRET_PATTERNS = [
  /DATABASE_URL\s*=/i,
  /SESSION_SECRET\s*=/i,
  /AWS_SECRET_ACCESS_KEY/i,
  /PRIVATE KEY/i,
  /password\s*[:=]\s*['"]?[^'"\s]+/i,
] as const;

export async function runManualReviewCollectors(
  config: SecurityProbeConfig,
  client: ManualReviewClient = new SecurityProbeHttpClient(config)
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  findings.push(await probeCors(config, client));
  findings.push(...await probeCsp(config));
  findings.push(await probeSecretExposure(config));
  findings.push(rateLimitCoverageFinding());
  findings.push(await probeVerboseErrors(client));

  return findings;
}

async function probeCors(config: SecurityProbeConfig, client: ManualReviewClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://ship-security-probe.invalid',
        'access-control-request-method': 'GET',
      },
    });

    return classifyCorsHeaders(response.headers, response.status);
  } catch (error) {
    return unavailableFinding('cors-csp-cors', 'CORS preflight header probe', 'cors_csp_misconfiguration', error, {
      apiUrl: config.apiUrl,
    });
  }
}

export function classifyCorsHeaders(headers: Record<string, string>, status: number): SecurityFinding {
  const allowOrigin = headers['access-control-allow-origin'];
  const allowCredentials = headers['access-control-allow-credentials'];
  const reflectedUntrusted = allowOrigin === 'https://ship-security-probe.invalid';
  const wildcardWithCredentials = allowOrigin === '*' && allowCredentials === 'true';
  const finding = reflectedUntrusted || wildcardWithCredentials;

  return {
    id: 'cors-csp-cors',
    metric: 'cors_csp_misconfiguration',
    surface: 'cors_csp',
    status: finding ? 'finding' : 'pass',
    severity: finding ? 'high' : 'info',
    title: finding ? 'CORS allows untrusted credentialed origin' : 'CORS did not allow untrusted credentialed origin',
    description: 'The probe sent an untrusted Origin preflight and inspected CORS response headers.',
    reproduction: [
      'Send OPTIONS /api/auth/me with Origin: https://ship-security-probe.invalid.',
      'Inspect Access-Control-Allow-Origin and Access-Control-Allow-Credentials.',
    ],
    evidence: { status, allowOrigin, allowCredentials },
    recommendation: finding
      ? 'Use an explicit trusted origin allowlist when credentials are enabled.'
      : undefined,
  };
}

async function probeCsp(config: SecurityProbeConfig): Promise<SecurityFinding[]> {
  const [apiResponse, webResponse] = await Promise.all([
    fetchHeaderTarget(new URL('/health', `${config.apiUrl}/`).toString(), config.limits.requestTimeoutMs),
    fetchHeaderTarget(config.webUrl, config.limits.requestTimeoutMs),
  ]);

  return [
    classifyCspHeaders('cors-csp-api-csp', 'API Content Security Policy header', apiResponse, false),
    classifyCspHeaders(
      'cors-csp-web-csp',
      'Web Content Security Policy header',
      webResponse,
      config.mode === 'local' && /localhost|127\.0\.0\.1/.test(config.webUrl)
    ),
  ];
}

export function classifyCspHeaders(
  id: string,
  title: string,
  response: HeaderProbeResponse,
  tolerateMissingForLocalDev: boolean
): SecurityFinding {
  if (response.status === 0 || response.error) {
    return {
      id,
      metric: 'cors_csp_misconfiguration',
      surface: 'cors_csp',
      status: 'not_run_target_unavailable',
      severity: 'info',
      title: `${title} unavailable`,
      description: 'The target did not respond to the Content Security Policy header probe.',
      reproduction: [`GET ${response.url}.`, 'Inspect the Content-Security-Policy response header.'],
      evidence: {
        status: response.status,
        error: response.error,
      },
      recommendation: 'Start the target app or verify the configured URL, then rerun the probe.',
    };
  }

  const csp = response.headers['content-security-policy'];
  const missing = !csp;
  const hasUnsafeInline = typeof csp === 'string' && csp.includes("'unsafe-inline'");
  const localDevTolerated = missing && tolerateMissingForLocalDev;
  const status = missing && !localDevTolerated ? 'finding' : 'pass';

  return {
    id,
    metric: 'cors_csp_misconfiguration',
    surface: 'cors_csp',
    status,
    severity: missing && !localDevTolerated ? 'medium' : 'info',
    title: missing
      ? localDevTolerated
        ? `${title} missing on local dev target (tolerated)`
        : `${title} missing`
      : `${title} present`,
    description: missing && !localDevTolerated
      ? 'The target response did not include a Content-Security-Policy header.'
      : localDevTolerated
        ? 'The local Vite development target did not include a Content-Security-Policy header; deployed targets are still treated as findings.'
      : 'The target response included a Content-Security-Policy header.',
    reproduction: [`GET ${response.url}.`, 'Inspect the Content-Security-Policy response header.'],
    evidence: {
      status: response.status,
      csp,
      hasUnsafeInline,
      localDevTolerated,
      error: response.error,
    },
    recommendation: missing && !localDevTolerated
      ? 'Set a Content-Security-Policy header on deployed web/API responses.'
      : undefined,
  };
}

async function probeSecretExposure(config: SecurityProbeConfig): Promise<SecurityFinding> {
  const targets = [
    new URL('/.env', `${config.webUrl}/`).toString(),
    new URL('/.env', `${config.apiUrl}/`).toString(),
    new URL('/api/.env', `${config.apiUrl}/`).toString(),
    new URL('/config.json', `${config.webUrl}/`).toString(),
  ];

  const responses = await Promise.all(
    targets.map((target) => fetchHeaderTarget(target, config.limits.requestTimeoutMs))
  );

  const exposures = responses
    .filter((response) => response.status >= 200 && response.status < 300)
    .map((response) => ({
      url: response.url,
      status: response.status,
      matchedPatterns: matchingSecretPatterns(response.bodyText),
      bodySample: truncate(response.bodyText, 200),
    }))
    .filter((exposure) => exposure.matchedPatterns.length > 0);

  return {
    id: 'secrets-common-paths',
    metric: 'secrets_exposure_risk',
    surface: 'secrets',
    status: exposures.length > 0 ? 'finding' : 'pass',
    severity: exposures.length > 0 ? 'critical' : 'info',
    title: exposures.length > 0 ? 'Secret-like values exposed on common paths' : 'No secret-like values on common paths',
    description: 'The probe requested common accidental exposure paths and searched for secret-like values.',
    reproduction: targets.map((target) => `GET ${target}.`),
    evidence: {
      checked: responses.map((response) => ({ url: response.url, status: response.status, error: response.error })),
      exposures,
    },
    recommendation: exposures.length > 0
      ? 'Remove exposed secret files, rotate affected credentials, and block common config paths.'
      : undefined,
  };
}

function rateLimitCoverageFinding(): SecurityFinding {
  return {
    id: 'rate-limit-coverage-review',
    metric: 'rate_limiting_absent',
    surface: 'rate_limiting',
    status: 'pass',
    severity: 'info',
    title: 'API and WebSocket rate limiting coverage present by code review',
    description: 'Manual review found global API, login, WebSocket connection, and WebSocket message limiters wired in application code.',
    reproduction: [
      'Review api/src/app.ts for loginLimiter and apiLimiter.',
      'Review api/src/collaboration/index.ts for connection and message rate limits.',
    ],
    evidence: {
      apiLimiter: 'api/src/app.ts app.use(/api/, apiLimiter)',
      loginLimiter: 'api/src/app.ts app.use(/api/auth/login, loginLimiter)',
      websocketLimits: 'api/src/collaboration/index.ts RATE_LIMIT',
      absentEndpoints: [],
    },
  };
}

async function probeVerboseErrors(client: ManualReviewClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"bad-json"',
    });

    return classifyVerboseErrorResponse(response);
  } catch (error) {
    return unavailableFinding('verbose-error-malformed-json', 'Verbose error malformed JSON probe', 'verbose_error_leakage', error);
  }
}

export function classifyVerboseErrorResponse(response: ProbeHttpResponse): SecurityFinding {
  const leakagePatterns = [
    /at\s+.+\(.+:\d+:\d+\)/,
    /node_modules/i,
    /SELECT\s+.+\s+FROM/i,
    /C:\\Users\\/i,
    /\/home\/.+\//i,
    /JSON\s+at\s+position\s+\d+/i,
    /line\s+\d+\s+column\s+\d+/i,
    /DATABASE_URL|SESSION_SECRET|AWS_SECRET_ACCESS_KEY/i,
  ];
  const leaks = leakagePatterns.filter((pattern) => pattern.test(response.bodyText)).map((pattern) => pattern.source);

  return {
    id: 'verbose-error-malformed-json',
    metric: 'verbose_error_leakage',
    surface: 'verbose_errors',
    status: leaks.length > 0 ? 'finding' : 'pass',
    severity: leaks.length > 0 ? 'medium' : 'info',
    title: leaks.length > 0 ? 'Verbose error details leaked' : 'Malformed JSON did not leak verbose internals',
    description: 'The probe sent malformed JSON and inspected the response for stack traces, SQL, paths, or secret names.',
    reproduction: ['POST malformed JSON to /api/auth/login.'],
    evidence: {
      status: response.status,
      leaks,
      body: truncate(response.bodyText),
    },
    recommendation: leaks.length > 0
      ? 'Return generic parse errors and log internal details server-side only.'
      : undefined,
  };
}

export function matchingSecretPatterns(value: string): string[] {
  return SECRET_PATTERNS
    .filter((pattern) => pattern.test(value))
    .map((pattern) => pattern.source);
}

async function fetchHeaderTarget(url: string, timeoutMs: number): Promise<HeaderProbeResponse> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/html, application/json, text/plain;q=0.9, */*;q=0.8' },
    });
    const bodyText = await response.text();
    return {
      url,
      status: response.status,
      headers: headersToRecord(response.headers),
      bodyText,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      headers: {},
      bodyText: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function unavailableFinding(
  id: string,
  title: string,
  metric: 'cors_csp_misconfiguration' | 'verbose_error_leakage',
  error: unknown,
  evidence: Record<string, unknown> = {}
): SecurityFinding {
  return {
    id,
    metric,
    surface: metric === 'cors_csp_misconfiguration' ? 'cors_csp' : 'verbose_errors',
    status: 'not_run_target_unavailable',
    severity: 'info',
    title,
    description: 'The target did not respond to the manual-review collector.',
    reproduction: ['Start the target app or verify the configured URL, then rerun the probe.'],
    evidence: { ...evidence, error: error instanceof Error ? error.message : String(error) },
  };
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
