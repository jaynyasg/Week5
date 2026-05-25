import { randomUUID } from 'node:crypto';
import { SecurityProbeHttpClient, type ProbeHttpResponse } from '../http-client.js';
import type { SecurityFinding, SecurityProbeConfig, SecurityProbeCredentialConfig } from '../types.js';

interface InputProbeHttpClient {
  addCleanup(item: {
    id: string;
    description: string;
    method: 'DELETE' | 'POST';
    path: string;
    body?: unknown;
  }): void;
  request(pathOrUrl: string, options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    csrf?: boolean;
  }): Promise<ProbeHttpResponse>;
  login(credential?: SecurityProbeCredentialConfig): Promise<{ success: boolean; status: number }>;
}

const XSS_PAYLOAD = '<script>window.__shipSecurityProbeXss=1</script>';
const EVENT_HANDLER_PAYLOAD = '<img src=x onerror="window.__shipSecurityProbeXss=1">';
const SQLI_PAYLOAD = "' OR '1'='1";

export async function runInputSanitizationProbes(
  config: SecurityProbeConfig,
  client: InputProbeHttpClient = new SecurityProbeHttpClient(config)
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  findings.push(await probeLoginPayload(client));
  findings.push(await probePublicFeedbackProgramLookup(client));

  const login = await loginForInputChecks(client, config);
  if (!login.success) {
    findings.push(credentialsRequiredFinding('input-authenticated-write-probes', 'Authenticated input write probes require login.'));
    return findings;
  }

  const documentId = await createProbeDocument(client, config, XSS_PAYLOAD);
  if (documentId) {
    findings.push(await probeStoredDocumentTitle(client, documentId));
    findings.push(await probeCommentContent(client, documentId));
  } else {
    findings.push(credentialsRequiredFinding('input-document-title-xss', 'Document input probes require a writable document.'));
  }

  findings.push(await probeLongDocumentTitle(client));
  findings.push(await probeIssueSqlInjectionString(client, config));

  return findings;
}

async function probeLoginPayload(client: InputProbeHttpClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/api/auth/login', {
      method: 'POST',
      csrf: true,
      body: {
        email: `${XSS_PAYLOAD}@example.gov`,
        password: SQLI_PAYLOAD,
      },
    });

    return classifyInputResponse({
      id: 'input-login-payloads',
      title: 'Login rejects XSS and SQLi-like payloads safely',
      response,
      payloads: [XSS_PAYLOAD, SQLI_PAYLOAD],
      successIsFinding: true,
      reproduction: ['POST /api/auth/login with XSS marker email and SQLi-like password.'],
    });
  } catch (error) {
    return targetUnavailableFinding('input-login-payloads', 'Login input payload probe', error);
  }
}

async function probePublicFeedbackProgramLookup(client: InputProbeHttpClient): Promise<SecurityFinding> {
  const encoded = encodeURIComponent(EVENT_HANDLER_PAYLOAD);
  try {
    const response = await client.request(`/api/feedback/program/${encoded}`);

    return classifyInputResponse({
      id: 'input-public-feedback-program-id',
      title: 'Public feedback program lookup handles malformed ID safely',
      response,
      payloads: [EVENT_HANDLER_PAYLOAD],
      successIsFinding: true,
      reproduction: ['GET /api/feedback/program/<event-handler-payload>.'],
    });
  } catch (error) {
    return targetUnavailableFinding('input-public-feedback-program-id', 'Public feedback malformed ID probe', error);
  }
}

async function loginForInputChecks(
  client: InputProbeHttpClient,
  config: SecurityProbeConfig
): Promise<{ success: boolean; status?: number }> {
  try {
    const result = await client.login(config.credential);
    return { success: result.success, status: result.status };
  } catch {
    return { success: false };
  }
}

async function createProbeDocument(
  client: InputProbeHttpClient,
  config: SecurityProbeConfig,
  title: string
): Promise<string | undefined> {
  try {
    const response = await client.request('/api/documents', {
      method: 'POST',
      csrf: true,
      body: {
        title: `${title} ship-security-probe-${config.runId}`,
        document_type: 'wiki',
        content: { type: 'doc', content: [] },
      },
    });

    const id = extractId(response.json);
    if (response.status >= 200 && response.status < 300 && id) {
      client.addCleanup({
        id: `input-document-${id}`,
        description: 'Delete input sanitization probe document',
        method: 'DELETE',
        path: `/api/documents/${id}`,
      });
      return id;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function probeStoredDocumentTitle(client: InputProbeHttpClient, documentId: string): Promise<SecurityFinding> {
  try {
    const response = await client.request(`/api/documents/${documentId}`);

    return classifyStoredJsonPayload({
      id: 'input-document-title-xss',
      title: 'Document title stores XSS marker as data',
      response,
      payloads: [XSS_PAYLOAD],
      reproduction: ['Create a document with a script-tag title.', 'GET /api/documents/:id.'],
    });
  } catch (error) {
    return targetUnavailableFinding('input-document-title-xss', 'Document title stored XSS probe', error);
  }
}

async function probeCommentContent(client: InputProbeHttpClient, documentId: string): Promise<SecurityFinding> {
  const commentId = randomUUID();
  try {
    const response = await client.request(`/api/documents/${documentId}/comments`, {
      method: 'POST',
      csrf: true,
      body: {
        comment_id: commentId,
        content: EVENT_HANDLER_PAYLOAD,
      },
    });

    if (response.status >= 200 && response.status < 300) {
      client.addCleanup({
        id: `input-comment-${commentId}`,
        description: 'Delete input sanitization probe comment',
        method: 'DELETE',
        path: `/api/comments/${commentId}`,
      });
    }

    return classifyStoredJsonPayload({
      id: 'input-comment-content-xss',
      title: 'Comment content stores event-handler marker as data',
      response,
      payloads: [EVENT_HANDLER_PAYLOAD],
      reproduction: ['Create a comment with an event-handler payload.', 'Inspect the API response JSON.'],
    });
  } catch (error) {
    return targetUnavailableFinding('input-comment-content-xss', 'Comment content XSS probe', error);
  }
}

async function probeLongDocumentTitle(client: InputProbeHttpClient): Promise<SecurityFinding> {
  const longTitle = `ship-security-probe-${'x'.repeat(600)}`;
  try {
    const response = await client.request('/api/documents', {
      method: 'POST',
      csrf: true,
      body: {
        title: longTitle,
        document_type: 'wiki',
      },
    });

    return classifyRejectedLongInput(
      'input-document-title-long',
      'Document title rejects overlong input',
      response,
      255
    );
  } catch (error) {
    return targetUnavailableFinding('input-document-title-long', 'Document title long input probe', error);
  }
}

async function probeIssueSqlInjectionString(
  client: InputProbeHttpClient,
  config: SecurityProbeConfig
): Promise<SecurityFinding> {
  try {
    const title = `ship-security-probe-${config.runId}-${SQLI_PAYLOAD}`;
    const response = await client.request('/api/issues', {
      method: 'POST',
      csrf: true,
      body: { title },
    });

    const id = extractId(response.json);
    if (response.status >= 200 && response.status < 300 && id) {
      client.addCleanup({
        id: `input-issue-${id}`,
        description: 'Delete input sanitization probe issue',
        method: 'DELETE',
        path: `/api/issues/${id}`,
      });
    }

    if (response.status >= 500) {
      return {
        id: 'input-issue-title-sqli',
        metric: 'input_sanitization_failures',
        surface: 'input_sanitization',
        status: 'finding',
        severity: 'high',
        title: 'Issue title SQLi-like payload caused server error',
        description: 'A SQL injection-like title caused a server error.',
        reproduction: ['POST /api/issues with a SQLi-like title string.'],
        evidence: responseEvidence(response, [SQLI_PAYLOAD]),
        recommendation: 'Ensure the route uses parameterized queries and validation for title input.',
      };
    }

    return {
      id: 'input-issue-title-sqli',
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'pass',
      severity: 'info',
      title: 'Issue title SQLi-like payload handled as inert data',
      description: 'The SQL injection-like string did not produce an authentication bypass or server error.',
      reproduction: ['POST /api/issues with a SQLi-like title string.'],
      evidence: responseEvidence(response, [SQLI_PAYLOAD]),
    };
  } catch (error) {
    return targetUnavailableFinding('input-issue-title-sqli', 'Issue title SQLi-like probe', error);
  }
}

interface InputResponseClassification {
  id: string;
  title: string;
  response: ProbeHttpResponse;
  payloads: string[];
  successIsFinding: boolean;
  reproduction: string[];
}

export function classifyInputResponse(input: InputResponseClassification): SecurityFinding {
  const reflectedPayloads = reflectedPayloadsInResponse(input.response, input.payloads);
  if (input.response.status >= 500) {
    return {
      id: input.id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'medium',
      title: `${input.title} returned server error`,
      description: 'An adversarial input caused a server error.',
      reproduction: input.reproduction,
      evidence: responseEvidence(input.response, input.payloads),
      recommendation: 'Validate and safely handle adversarial input without 500 errors.',
    };
  }

  if (input.successIsFinding && input.response.status >= 200 && input.response.status < 300) {
    return {
      id: input.id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'medium',
      title: `${input.title} unexpectedly succeeded`,
      description: 'A route accepted an input that should be rejected for this probe scenario.',
      reproduction: input.reproduction,
      evidence: responseEvidence(input.response, input.payloads),
      recommendation: 'Reject invalid or adversarial input at the validation boundary.',
    };
  }

  if (reflectedPayloads.length > 0 && isHtmlResponse(input.response)) {
    return {
      id: input.id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'high',
      title: `${input.title} reflected payload in HTML`,
      description: 'A payload appeared in an HTML response where it may execute in a browser.',
      reproduction: input.reproduction,
      evidence: responseEvidence(input.response, input.payloads),
      recommendation: 'Escape reflected user input before rendering HTML.',
    };
  }

  return {
    id: input.id,
    metric: 'input_sanitization_failures',
    surface: 'input_sanitization',
    status: 'pass',
    severity: 'info',
    title: input.title,
    description: 'The adversarial input was rejected or not reflected in an executable response context.',
    reproduction: input.reproduction,
    evidence: responseEvidence(input.response, input.payloads),
  };
}

function classifyStoredJsonPayload(input: {
  id: string;
  title: string;
  response: ProbeHttpResponse;
  payloads: string[];
  reproduction: string[];
}): SecurityFinding {
  if (input.response.status >= 500) {
    return {
      id: input.id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'medium',
      title: `${input.title} caused server error`,
      description: 'A stored-input probe caused a server error.',
      reproduction: input.reproduction,
      evidence: responseEvidence(input.response, input.payloads),
      recommendation: 'Validate stored content and handle adversarial strings safely.',
    };
  }

  if (isHtmlResponse(input.response) && reflectedPayloadsInResponse(input.response, input.payloads).length > 0) {
    return {
      id: input.id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'high',
      title: `${input.title} returned executable HTML`,
      description: 'Stored user input was returned in an HTML response context.',
      reproduction: input.reproduction,
      evidence: responseEvidence(input.response, input.payloads),
      recommendation: 'Return stored content as data or escape it before rendering.',
    };
  }

  return {
    id: input.id,
    metric: 'input_sanitization_failures',
    surface: 'input_sanitization',
    status: input.response.status >= 200 && input.response.status < 300 ? 'pass' : 'inconclusive',
    severity: 'info',
    title: input.title,
    description: 'The payload was handled as API data rather than executable HTML.',
    reproduction: input.reproduction,
    evidence: responseEvidence(input.response, input.payloads),
  };
}

export function classifyRejectedLongInput(
  id: string,
  title: string,
  response: ProbeHttpResponse,
  expectedMaxLength: number
): SecurityFinding {
  if (response.status >= 200 && response.status < 300) {
    return {
      id,
      metric: 'input_sanitization_failures',
      surface: 'input_sanitization',
      status: 'finding',
      severity: 'medium',
      title: `${title} unexpectedly accepted`,
      description: 'The route accepted an input longer than the documented/schema boundary.',
      reproduction: [`POST an input longer than ${expectedMaxLength} characters.`],
      evidence: responseEvidence(response, []),
      recommendation: 'Enforce the documented maximum length at the API boundary.',
    };
  }

  return {
    id,
    metric: 'input_sanitization_failures',
    surface: 'input_sanitization',
    status: response.status >= 400 && response.status < 500 ? 'pass' : 'inconclusive',
    severity: 'info',
    title,
    description: 'The route rejected the overlong input.',
    reproduction: [`POST an input longer than ${expectedMaxLength} characters.`],
    evidence: responseEvidence(response, []),
  };
}

function credentialsRequiredFinding(id: string, title: string): SecurityFinding {
  return {
    id,
    metric: 'input_sanitization_failures',
    surface: 'input_sanitization',
    status: 'not_run_credentials_required',
    severity: 'info',
    title,
    description: 'Authenticated input probe could not run because usable credentials were unavailable.',
    reproduction: ['Provide valid credentials and rerun the probe.'],
    evidence: {},
  };
}

function targetUnavailableFinding(id: string, title: string, error: unknown): SecurityFinding {
  return {
    id,
    metric: 'input_sanitization_failures',
    surface: 'input_sanitization',
    status: 'not_run_target_unavailable',
    severity: 'info',
    title,
    description: 'The target did not respond to the input sanitization probe.',
    reproduction: ['Start the target app or verify the configured API URL, then rerun the probe.'],
    evidence: { error: error instanceof Error ? error.message : String(error) },
  };
}

function extractId(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }

  return undefined;
}

function reflectedPayloadsInResponse(response: ProbeHttpResponse, payloads: string[]): string[] {
  return payloads.filter((payload) => response.bodyText.includes(payload));
}

function isHtmlResponse(response: ProbeHttpResponse): boolean {
  return (response.headers['content-type'] || '').toLowerCase().includes('text/html');
}

function responseEvidence(response: ProbeHttpResponse, payloads: string[]): Record<string, unknown> {
  return {
    status: response.status,
    contentType: response.headers['content-type'],
    reflectedPayloads: reflectedPayloadsInResponse(response, payloads),
    body: truncate(response.bodyText),
  };
}

function truncate(value: string, maxLength = 500): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
