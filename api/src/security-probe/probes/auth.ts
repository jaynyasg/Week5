import { SecurityProbeHttpClient, type LoginProbeResult, type ProbeHttpResponse } from '../http-client.js';
import type { SecurityFinding, SecurityProbeConfig, SecurityProbeCredentialConfig } from '../types.js';

interface AuthProbeClient {
  request(pathOrUrl: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    csrf?: boolean;
  }): Promise<ProbeHttpResponse>;
  login(credential?: SecurityProbeCredentialConfig): Promise<LoginProbeResult>;
}

interface AuthProbeClients {
  unauthenticated?: AuthProbeClient;
  primary?: AuthProbeClient;
  secondary?: AuthProbeClient;
}

const PROTECTED_ROUTE_CHECKS = [
  { id: 'documents-list', method: 'GET', path: '/api/documents' },
  {
    id: 'documents-create',
    method: 'POST',
    path: '/api/documents',
    body: { title: 'ship-security-probe-unauth', document_type: 'wiki' },
  },
  { id: 'auth-me', method: 'GET', path: '/api/auth/me' },
  { id: 'admin-workspaces', method: 'GET', path: '/api/admin/workspaces' },
] as const;

export async function runAuthSessionProbes(
  config: SecurityProbeConfig,
  clients: AuthProbeClients = {}
): Promise<SecurityFinding[]> {
  const unauthenticated = clients.unauthenticated || new SecurityProbeHttpClient(config);
  const primary = clients.primary || new SecurityProbeHttpClient(config);
  const findings: SecurityFinding[] = [];

  for (const check of PROTECTED_ROUTE_CHECKS) {
    findings.push(await probeUnauthenticatedRoute(unauthenticated, check));
  }

  findings.push(await probeMalformedSession(unauthenticated));
  findings.push(await probeMalformedBearer(unauthenticated));

  const loginFindingAndResult = await probeLogin(config, primary, config.credential);
  findings.push(loginFindingAndResult.finding);

  if (loginFindingAndResult.result?.success) {
    findings.push(...classifySessionCookieFlags(config, loginFindingAndResult.result));
    findings.push(await probeMissingCsrf(primary));
  } else {
    findings.push(credentialsRequiredFinding('auth-missing-csrf', 'Missing CSRF enforcement check requires login.'));
  }

  findings.push(...(await probeSecondaryRoleBoundary(config, clients.secondary)));

  return findings;
}

async function probeUnauthenticatedRoute(
  client: AuthProbeClient,
  check: typeof PROTECTED_ROUTE_CHECKS[number]
): Promise<SecurityFinding> {
  try {
    const response = await client.request(check.path, {
      method: check.method,
      body: 'body' in check ? check.body : undefined,
    });

    return classifyProtectedRouteResponse(
      `auth-unauth-${check.id}`,
      `Unauthenticated ${check.method} ${check.path}`,
      response
    );
  } catch (error) {
    return targetUnavailableFinding(
      `auth-unauth-${check.id}`,
      `Unauthenticated ${check.method} ${check.path}`,
      error
    );
  }
}

export function classifyProtectedRouteResponse(
  id: string,
  title: string,
  response: ProbeHttpResponse
): SecurityFinding {
  const allowedDeniedStatuses = [401, 403, 404, 429];
  if (response.status >= 200 && response.status < 300) {
    return {
      id,
      metric: 'auth_session_vulnerabilities',
      surface: 'auth_session',
      status: 'finding',
      severity: 'high',
      title: `${title} allowed access`,
      description: 'A protected route returned a success status without an authenticated session.',
      reproduction: [`Request ${response.url} without a session cookie or bearer token.`],
      evidence: { status: response.status, body: truncate(response.bodyText) },
      recommendation: 'Require auth middleware before returning protected route data.',
    };
  }

  if (response.status >= 500) {
    return {
      id,
      metric: 'auth_session_vulnerabilities',
      surface: 'auth_session',
      status: 'finding',
      severity: 'medium',
      title: `${title} returned server error`,
      description: 'A protected route errored when accessed without authentication instead of denying safely.',
      reproduction: [`Request ${response.url} without a session cookie or bearer token.`],
      evidence: { status: response.status, body: truncate(response.bodyText) },
      recommendation: 'Return a controlled 401 or 403 response for unauthenticated access.',
    };
  }

  return {
    id,
    metric: 'auth_session_vulnerabilities',
    surface: 'auth_session',
    status: allowedDeniedStatuses.includes(response.status) ? 'pass' : 'inconclusive',
    severity: 'info',
    title: `${title} denied unauthenticated access`,
    description: 'The protected route did not return protected data without authentication.',
    reproduction: [`Request ${response.url} without a session cookie or bearer token.`],
    evidence: { status: response.status, body: truncate(response.bodyText) },
  };
}

async function probeMalformedSession(client: AuthProbeClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/auth/me', {
      headers: { cookie: 'session_id=ship-security-probe-invalid-session' },
    });

    return classifyProtectedRouteResponse('auth-malformed-session', 'Malformed session cookie', response);
  } catch (error) {
    return targetUnavailableFinding('auth-malformed-session', 'Malformed session cookie', error);
  }
}

async function probeMalformedBearer(client: AuthProbeClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/auth/me', {
      headers: { authorization: 'Bearer ship_security_probe_invalid_token' },
    });

    return classifyProtectedRouteResponse('auth-malformed-bearer', 'Malformed bearer token', response);
  } catch (error) {
    return targetUnavailableFinding('auth-malformed-bearer', 'Malformed bearer token', error);
  }
}

async function probeLogin(
  config: SecurityProbeConfig,
  client: AuthProbeClient,
  credential: SecurityProbeCredentialConfig
): Promise<{ finding: SecurityFinding; result?: LoginProbeResult }> {
  try {
    const result = await client.login(credential);
    const remoteDefaultAccepted = config.mode === 'remote' && credential.source === 'default' && result.success;

    return {
      result,
      finding: {
        id: 'auth-login-primary',
        metric: 'auth_session_vulnerabilities',
        surface: 'auth_session',
        status: remoteDefaultAccepted ? 'finding' : result.success ? 'pass' : 'not_run_credentials_required',
        severity: remoteDefaultAccepted ? 'critical' : 'info',
        title: remoteDefaultAccepted
          ? 'Default seeded credentials accepted on remote target'
          : result.success
            ? 'Primary credentials authenticated'
            : 'Primary credentials failed',
        description: remoteDefaultAccepted
          ? 'The remote target accepted the seeded dev credential pair.'
          : 'The probe attempted the primary credential pair to unlock authenticated checks.',
        reproduction: ['Fetch CSRF token.', `POST /api/auth/login as ${credential.email}.`],
        evidence: {
          status: result.status,
          success: result.success,
          credentialSource: credential.source,
          userId: result.userId,
          workspaceId: result.workspaceId,
        },
        recommendation: remoteDefaultAccepted
          ? 'Disable seeded development credentials in remote and production environments.'
          : undefined,
      },
    };
  } catch (error) {
    return {
      finding: targetUnavailableFinding('auth-login-primary', 'Primary credential login', error),
    };
  }
}

export function classifySessionCookieFlags(
  config: SecurityProbeConfig,
  loginResult: LoginProbeResult
): SecurityFinding[] {
  const flags = loginResult.cookieFlags;
  const findings: SecurityFinding[] = [];
  const hasHttpOnly = flags.httponly === true;
  const sameSite = typeof flags.samesite === 'string' ? flags.samesite.toLowerCase() : '';
  const hasSecure = flags.secure === true;
  const requiresSecure = config.apiUrl.startsWith('https://');

  findings.push(cookieFlagFinding('auth-cookie-httponly', 'Session cookie HttpOnly flag', hasHttpOnly, 'high', {
    expected: true,
    actual: flags.httponly,
  }));

  findings.push(cookieFlagFinding('auth-cookie-samesite', 'Session cookie SameSite=Strict flag', sameSite === 'strict', 'medium', {
    expected: 'Strict',
    actual: flags.samesite,
  }));

  findings.push(cookieFlagFinding(
    'auth-cookie-secure',
    'Session cookie Secure flag on HTTPS targets',
    requiresSecure ? hasSecure : true,
    'high',
    {
      required: requiresSecure,
      actual: flags.secure,
    }
  ));

  return findings;
}

function cookieFlagFinding(
  id: string,
  title: string,
  passed: boolean,
  failedSeverity: 'high' | 'medium',
  evidence: Record<string, unknown>
): SecurityFinding {
  return {
    id,
    metric: 'auth_session_vulnerabilities',
    surface: 'auth_session',
    status: passed ? 'pass' : 'finding',
    severity: passed ? 'info' : failedSeverity,
    title: passed ? `${title} present` : `${title} missing`,
    description: passed
      ? 'The session cookie includes the expected hardening attribute.'
      : 'The session cookie is missing an expected hardening attribute.',
    reproduction: ['Log in with valid credentials.', 'Inspect the Set-Cookie attributes for session_id.'],
    evidence,
    recommendation: passed ? undefined : 'Set the expected hardening attribute when issuing session cookies.',
  };
}

async function probeMissingCsrf(client: AuthProbeClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/documents', {
      method: 'POST',
      body: { title: 'ship-security-probe-missing-csrf', document_type: 'wiki' },
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        id: 'auth-missing-csrf',
        metric: 'auth_session_vulnerabilities',
        surface: 'auth_session',
        status: 'finding',
        severity: 'high',
        title: 'State-changing request succeeded without CSRF token',
        description: 'An authenticated state-changing request returned success without an x-csrf-token header.',
        reproduction: [
          'Log in and keep the session cookie.',
          'POST /api/documents without x-csrf-token.',
        ],
        evidence: { status: response.status, body: truncate(response.bodyText) },
        recommendation: 'Apply CSRF protection to all session-authenticated state-changing routes.',
      };
    }

    return {
      id: 'auth-missing-csrf',
      metric: 'auth_session_vulnerabilities',
      surface: 'auth_session',
      status: [401, 403].includes(response.status) ? 'pass' : 'inconclusive',
      severity: 'info',
      title: 'State-changing request without CSRF token rejected',
      description: 'The API did not accept an authenticated state-changing request without a CSRF token.',
      reproduction: ['Log in and POST /api/documents without x-csrf-token.'],
      evidence: { status: response.status, body: truncate(response.bodyText) },
    };
  } catch (error) {
    return targetUnavailableFinding('auth-missing-csrf', 'Missing CSRF enforcement check', error);
  }
}

async function probeSecondaryRoleBoundary(
  config: SecurityProbeConfig,
  secondaryClient?: AuthProbeClient
): Promise<SecurityFinding[]> {
  if (!config.secondaryCredential) {
    return [
      {
        id: 'auth-role-boundary-secondary',
        metric: 'auth_session_vulnerabilities',
        surface: 'auth_session',
        status: 'not_run_secondary_credentials_required',
        severity: 'info',
        title: 'Role-boundary probe requires secondary credentials',
        description: 'No secondary credential pair was provided for privilege-escalation checks.',
        reproduction: [
          'Provide SHIP_SECURITY_ALT_EMAIL and SHIP_SECURITY_ALT_PASSWORD, or --alt-email and --alt-password.',
        ],
        evidence: { secondaryProvided: false },
      },
    ];
  }

  const client = secondaryClient || new SecurityProbeHttpClient(config);
  try {
    const loginResult = await client.login(config.secondaryCredential);
    if (!loginResult.success) {
      return [credentialsRequiredFinding('auth-role-boundary-secondary', 'Secondary credentials failed.')];
    }

    const response = await client.request('/api/admin/workspaces');
    const allowedAdminAccess = response.status >= 200 && response.status < 300;
    return [
      {
        id: 'auth-role-boundary-secondary',
        metric: 'auth_session_vulnerabilities',
        surface: 'auth_session',
        status: allowedAdminAccess ? 'finding' : [401, 403].includes(response.status) ? 'pass' : 'inconclusive',
        severity: allowedAdminAccess ? 'high' : 'info',
        title: allowedAdminAccess
          ? 'Secondary user accessed super-admin endpoint'
          : 'Secondary user denied super-admin endpoint',
        description: 'The probe attempted to access a super-admin route with secondary credentials.',
        reproduction: [
          `Log in as ${config.secondaryCredential.email}.`,
          'GET /api/admin/workspaces.',
        ],
        evidence: { status: response.status, body: truncate(response.bodyText) },
        recommendation: allowedAdminAccess
          ? 'Ensure super-admin middleware is enforced on administrative routes.'
          : undefined,
      },
    ];
  } catch (error) {
    return [targetUnavailableFinding('auth-role-boundary-secondary', 'Secondary role-boundary probe', error)];
  }
}

function credentialsRequiredFinding(id: string, title: string): SecurityFinding {
  return {
    id,
    metric: 'auth_session_vulnerabilities',
    surface: 'auth_session',
    status: 'not_run_credentials_required',
    severity: 'info',
    title,
    description: 'Authenticated probe could not run because usable credentials were unavailable.',
    reproduction: ['Provide valid credentials and rerun the probe.'],
    evidence: {},
  };
}

function targetUnavailableFinding(id: string, title: string, error: unknown): SecurityFinding {
  return {
    id,
    metric: 'auth_session_vulnerabilities',
    surface: 'auth_session',
    status: 'not_run_target_unavailable',
    severity: 'info',
    title,
    description: 'The target did not respond to the auth/session probe.',
    reproduction: ['Start the target app or verify the configured API URL, then rerun the probe.'],
    evidence: { error: error instanceof Error ? error.message : String(error) },
  };
}

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
