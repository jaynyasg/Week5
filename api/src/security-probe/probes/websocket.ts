import WebSocket from 'ws';
import { SecurityProbeHttpClient, type ProbeHttpResponse } from '../http-client.js';
import type { SecurityFinding, SecurityProbeConfig, SecurityProbeCredentialConfig } from '../types.js';

interface WebSocketProbeHttpClient {
  readonly cookieHeader: string;
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

export interface WebSocketAttemptResult {
  url: string;
  opened: boolean;
  httpStatus?: number;
  closeCode?: number;
  closeReason?: string;
  error?: string;
  messages: string[];
}

interface OpenWebSocketResult extends WebSocketAttemptResult {
  socket?: WebSocket;
}

interface MessageObservation {
  sentBytes: number;
  stillOpen: boolean;
  closeCode?: number;
  closeReason?: string;
  messages: string[];
  error?: string;
}

const PROBE_DOCUMENT_UUID = '00000000-0000-4000-8000-000000000000';

export async function runWebSocketProbes(
  config: SecurityProbeConfig,
  client: WebSocketProbeHttpClient = new SecurityProbeHttpClient(config)
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  findings.push(
    classifyUnauthenticatedWebSocket(
      'ws-unauth-events',
      'Unauthenticated /events WebSocket upgrade',
      await openWebSocket(config, '/events')
    )
  );

  findings.push(
    classifyUnauthenticatedWebSocket(
      'ws-unauth-collaboration',
      'Unauthenticated collaboration WebSocket upgrade',
      await openWebSocket(config, `/collaboration/wiki:${PROBE_DOCUMENT_UUID}`)
    )
  );

  const login = await loginForWebSocketChecks(client, config);
  if (!login.success) {
    findings.push(credentialsRequiredFinding('ws-auth-events', 'Authenticated /events WebSocket checks require login.'));
    findings.push(credentialsRequiredFinding('ws-auth-collaboration', 'Authenticated collaboration checks require login.'));
    return findings;
  }

  const eventsOpen = await openWebSocket(config, '/events', client.cookieHeader);
  findings.push(classifyAuthenticatedOpen('ws-auth-events-open', 'Authenticated /events WebSocket opens', eventsOpen));
  if (eventsOpen.opened && eventsOpen.socket) {
    try {
      const ping = await sendAndObserve(eventsOpen.socket, JSON.stringify({ type: 'ping' }), 800);
      findings.push(classifyEventPing(ping));

      const malformed = await sendAndObserve(eventsOpen.socket, '{not-json', 300);
      findings.push(classifySafeMessageHandling(
        'ws-events-malformed-json',
        'Events WebSocket malformed JSON handling',
        malformed
      ));
    } finally {
      terminateSocket(eventsOpen.socket);
    }
  }

  const docId = await createProbeDocument(client, config);
  if (!docId) {
    findings.push(credentialsRequiredFinding('ws-auth-collaboration', 'Authenticated collaboration checks require a probe document.'));
    return findings;
  }

  const collaborationPath = `/collaboration/wiki:${docId}`;
  const collabOpen = await openWebSocket(config, collaborationPath, client.cookieHeader);
  findings.push(classifyAuthenticatedOpen('ws-auth-collaboration-open', 'Authenticated collaboration WebSocket opens', collabOpen));
  if (collabOpen.opened && collabOpen.socket) {
    try {
      const unexpectedType = await sendAndObserve(collabOpen.socket, Buffer.from([99]), 300);
      findings.push(classifySafeMessageHandling(
        'ws-collaboration-unexpected-type',
        'Collaboration WebSocket unexpected message type handling',
        unexpectedType
      ));

      const malformedBinary = await sendAndObserve(collabOpen.socket, Buffer.from([0]), 300);
      findings.push(classifySafeMessageHandling(
        'ws-collaboration-malformed-binary',
        'Collaboration WebSocket malformed binary handling',
        malformedBinary
      ));

      if (config.limits.allowOversizedWebSocketProbe) {
        const oversizedOpen = await openWebSocket(config, collaborationPath, client.cookieHeader);
        if (oversizedOpen.opened && oversizedOpen.socket) {
          try {
            const oversized = await sendAndObserve(
              oversizedOpen.socket,
              Buffer.alloc(config.limits.maxWebSocketPayloadBytes, 0),
              1_000
            );
            findings.push(classifyOversizedPayload(oversized));
          } finally {
            terminateSocket(oversizedOpen.socket);
          }
        } else {
          findings.push(classifyOversizedProbeUnavailable(oversizedOpen));
        }
      } else {
        findings.push({
          id: 'ws-collaboration-oversized-payload',
          metric: 'websocket_validation_failures',
          surface: 'websocket',
          status: 'not_run_safety_limit',
          severity: 'info',
          title: 'Oversized WebSocket payload probe disabled',
          description: 'The oversized payload check was disabled by configuration.',
          reproduction: ['Run without --skip-oversized-websocket-probe.'],
          evidence: { allowOversizedWebSocketProbe: false },
        });
      }
    } finally {
      terminateSocket(collabOpen.socket);
    }
  }

  findings.push(await probePostWebSocketHealth(client));

  return findings;
}

async function loginForWebSocketChecks(
  client: WebSocketProbeHttpClient,
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
  client: WebSocketProbeHttpClient,
  config: SecurityProbeConfig
): Promise<string | undefined> {
  try {
    const title = `ship-security-probe-${config.runId}-websocket`;
    const response = await client.request('/api/documents', {
      method: 'POST',
      csrf: true,
      body: {
        title,
        document_type: 'wiki',
        content: { type: 'doc', content: [] },
      },
    });

    const id = extractId(response.json);
    if (response.status >= 200 && response.status < 300 && id) {
      client.addCleanup({
        id: `websocket-document-${id}`,
        description: 'Delete WebSocket probe document',
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

function extractId(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : undefined;
  }

  return undefined;
}

export function classifyUnauthenticatedWebSocket(
  id: string,
  title: string,
  result: WebSocketAttemptResult
): SecurityFinding {
  if (result.opened) {
    return {
      id,
      metric: 'websocket_validation_failures',
      surface: 'websocket',
      status: 'finding',
      severity: 'high',
      title: `${title} allowed connection`,
      description: 'A WebSocket endpoint accepted an unauthenticated upgrade request.',
      reproduction: [`Open ${result.url} without a session cookie.`],
      evidence: socketEvidence(result),
      recommendation: 'Validate the session before completing the WebSocket upgrade.',
    };
  }

  if (result.httpStatus && [401, 403, 429].includes(result.httpStatus)) {
    return {
      id,
      metric: 'websocket_validation_failures',
      surface: 'websocket',
      status: 'pass',
      severity: 'info',
      title: `${title} rejected`,
      description: 'The WebSocket endpoint rejected an unauthenticated upgrade request.',
      reproduction: [`Open ${result.url} without a session cookie.`],
      evidence: socketEvidence(result),
    };
  }

  return {
    id,
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: result.error ? 'not_run_target_unavailable' : 'inconclusive',
    severity: 'info',
    title: `${title} inconclusive`,
    description: 'The WebSocket unauthenticated upgrade result could not be classified.',
    reproduction: [`Open ${result.url} without a session cookie.`],
    evidence: socketEvidence(result),
  };
}

function classifyAuthenticatedOpen(id: string, title: string, result: WebSocketAttemptResult): SecurityFinding {
  return {
    id,
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: result.opened ? 'pass' : 'inconclusive',
    severity: 'info',
    title: result.opened ? title : `${title} did not open`,
    description: result.opened
      ? 'The authenticated WebSocket opened so validation messages can be tested.'
      : 'The authenticated WebSocket did not open; downstream validation checks could not run.',
    reproduction: [`Open ${result.url} with a valid session cookie.`],
    evidence: socketEvidence(result),
  };
}

function classifyEventPing(observation: MessageObservation): SecurityFinding {
  const pong = observation.messages.some((message) => message.includes('"pong"'));
  return {
    id: 'ws-events-ping',
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: pong ? 'pass' : 'inconclusive',
    severity: 'info',
    title: pong ? 'Events WebSocket ping returned pong' : 'Events WebSocket ping did not return pong',
    description: 'The probe sent a valid ping message to establish baseline event socket behavior.',
    reproduction: ['Open /events with a valid session cookie.', 'Send {"type":"ping"}.'],
    evidence: messageEvidence(observation),
  };
}

export function classifySafeMessageHandling(
  id: string,
  title: string,
  observation: MessageObservation
): SecurityFinding {
  const controlledClose = observation.closeCode !== undefined && [1008, 1009, 4000, 4001, 4403].includes(observation.closeCode);
  const safe = observation.stillOpen || controlledClose;

  return {
    id,
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: safe ? 'pass' : observation.error ? 'inconclusive' : 'finding',
    severity: safe ? 'info' : 'medium',
    title: safe ? `${title} handled safely` : `${title} was not handled safely`,
    description: safe
      ? 'The WebSocket stayed open or closed with a controlled policy/validation code.'
      : 'The WebSocket closed unexpectedly after a malformed or unexpected message.',
    reproduction: ['Open the authenticated WebSocket.', `Send ${observation.sentBytes} bytes of malformed or unexpected data.`],
    evidence: messageEvidence(observation),
    recommendation: safe ? undefined : 'Catch malformed WebSocket protocol messages and close with a controlled code.',
  };
}

function classifyOversizedPayload(observation: MessageObservation): SecurityFinding {
  const safeClose = observation.closeCode === 1009 || observation.closeCode === 1008;
  return {
    id: 'ws-collaboration-oversized-payload',
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: safeClose || !observation.stillOpen ? 'pass' : 'finding',
    severity: safeClose || !observation.stillOpen ? 'info' : 'high',
    title: safeClose || !observation.stillOpen
      ? 'Oversized WebSocket payload rejected'
      : 'Oversized WebSocket payload remained accepted',
    description: 'The probe sent one payload above the documented WebSocket max payload size.',
    reproduction: ['Open an authenticated collaboration WebSocket.', `Send ${observation.sentBytes} bytes.`],
    evidence: messageEvidence(observation),
    recommendation: safeClose || !observation.stillOpen
      ? undefined
      : 'Enforce a max WebSocket payload size and close oversized messages with code 1009.',
  };
}

function classifyOversizedProbeUnavailable(result: WebSocketAttemptResult): SecurityFinding {
  return {
    id: 'ws-collaboration-oversized-payload',
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: 'not_run_target_unavailable',
    severity: 'info',
    title: 'Oversized WebSocket payload probe could not open a fresh socket',
    description: 'The oversized payload check opens a fresh authenticated collaboration socket because earlier malformed-message checks may close their socket safely.',
    reproduction: ['Open an authenticated collaboration WebSocket.', 'Send an oversized payload.'],
    evidence: socketEvidence(result),
    recommendation: 'Verify the target is still running and rerun the probe.',
  };
}

async function probePostWebSocketHealth(client: WebSocketProbeHttpClient): Promise<SecurityFinding> {
  try {
    const response = await client.request('/health');
    const healthy = response.status >= 200 && response.status < 300;

    return {
      id: 'ws-post-probe-health',
      metric: 'websocket_validation_failures',
      surface: 'websocket',
      status: healthy ? 'pass' : 'finding',
      severity: healthy ? 'info' : 'medium',
      title: healthy ? 'API remained healthy after WebSocket probes' : 'API returned unhealthy status after WebSocket probes',
      description: 'The probe checks API health after active WebSocket validation payloads to catch crash-only failures.',
      reproduction: ['Run the WebSocket validation probes.', 'GET /health after malformed and oversized WebSocket payloads.'],
      evidence: {
        status: response.status,
        body: response.bodyText.slice(0, 500),
      },
      recommendation: healthy ? undefined : 'Handle WebSocket parser and payload errors without terminating the API process.',
    };
  } catch (error) {
    return {
      id: 'ws-post-probe-health',
      metric: 'websocket_validation_failures',
      surface: 'websocket',
      status: 'finding',
      severity: 'medium',
      title: 'API target unavailable after WebSocket probes',
      description: 'The probe checks API health after active WebSocket validation payloads to catch crash-only failures.',
      reproduction: ['Run the WebSocket validation probes.', 'GET /health after malformed and oversized WebSocket payloads.'],
      evidence: {
        error: error instanceof Error ? error.message : String(error),
      },
      recommendation: 'Handle WebSocket parser and payload errors without terminating the API process.',
    };
  }
}

function credentialsRequiredFinding(id: string, title: string): SecurityFinding {
  return {
    id,
    metric: 'websocket_validation_failures',
    surface: 'websocket',
    status: 'not_run_credentials_required',
    severity: 'info',
    title,
    description: 'Authenticated WebSocket probe could not run because usable credentials were unavailable.',
    reproduction: ['Provide valid credentials and rerun the probe.'],
    evidence: {},
  };
}

async function openWebSocket(
  config: SecurityProbeConfig,
  path: string,
  cookieHeader?: string
): Promise<OpenWebSocketResult> {
  const url = webSocketUrl(config.apiUrl, path);
  const headers = cookieHeader ? { Cookie: cookieHeader } : undefined;
  const messages: string[] = [];

  return await new Promise<OpenWebSocketResult>((resolve) => {
    const ws = new WebSocket(url, { headers });
    let settled = false;

    const finish = (result: OpenWebSocketResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ ...result, url, messages: [...messages, ...(result.messages || [])] });
    };

    const timeout = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        finish({ url, opened: true, socket: ws, messages });
      } else {
        ws.terminate();
        finish({ url, opened: false, error: 'Timed out opening WebSocket', messages });
      }
    }, Math.min(config.limits.requestTimeoutMs, 5_000));

    ws.on('message', (data) => {
      messages.push(data.toString());
    });

    ws.once('open', () => {
      finish({ url, opened: true, socket: ws, messages });
    });

    ws.once('unexpected-response', (_request, response) => {
      finish({ url, opened: false, httpStatus: response.statusCode, messages });
    });

    ws.once('error', (error) => {
      finish({ url, opened: false, error: error.message, messages });
    });

    ws.once('close', (code, reason) => {
      if (!settled) {
        finish({ url, opened: false, closeCode: code, closeReason: reason.toString(), messages });
      }
    });
  });
}

function terminateSocket(socket: WebSocket): void {
  if (
    socket.readyState === WebSocket.CONNECTING ||
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CLOSING
  ) {
    socket.terminate();
  }
}

async function sendAndObserve(
  socket: WebSocket,
  payload: string | Buffer,
  waitMs: number
): Promise<MessageObservation> {
  const messages: string[] = [];
  const sentBytes = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);

  return await new Promise<MessageObservation>((resolve) => {
    let settled = false;
    const finish = (observation: MessageObservation) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('close', onClose);
      socket.off('error', onError);
      resolve(observation);
    };

    const onMessage = (data: WebSocket.RawData) => {
      messages.push(data.toString());
    };

    const onClose = (code: number, reason: Buffer) => {
      finish({
        sentBytes,
        stillOpen: false,
        closeCode: code,
        closeReason: reason.toString(),
        messages,
      });
    };

    const onError = (error: Error) => {
      finish({
        sentBytes,
        stillOpen: false,
        error: error.message,
        messages,
      });
    };

    const timer = setTimeout(() => {
      finish({
        sentBytes,
        stillOpen: socket.readyState === WebSocket.OPEN,
        messages,
      });
    }, waitMs);

    socket.on('message', onMessage);
    socket.once('close', onClose);
    socket.once('error', onError);
    socket.send(payload);
  });
}

function webSocketUrl(apiUrl: string, path: string): string {
  const url = new URL(path, `${apiUrl}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function socketEvidence(result: WebSocketAttemptResult): Record<string, unknown> {
  return {
    url: result.url,
    opened: result.opened,
    httpStatus: result.httpStatus,
    closeCode: result.closeCode,
    closeReason: result.closeReason,
    error: result.error,
    messages: result.messages.slice(0, 3),
  };
}

function messageEvidence(observation: MessageObservation): Record<string, unknown> {
  return {
    sentBytes: observation.sentBytes,
    stillOpen: observation.stillOpen,
    closeCode: observation.closeCode,
    closeReason: observation.closeReason,
    error: observation.error,
    messages: observation.messages.slice(0, 3),
  };
}
