import type { SecurityProbeConfig, SecurityProbeCredentialConfig } from './types.js';

export interface ProbeHttpResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  setCookie: string[];
  bodyText: string;
  json: unknown;
}

export interface LoginProbeResult {
  attemptedEmail: string;
  status: number;
  success: boolean;
  userId?: string;
  workspaceId?: string;
  cookieFlags: Record<string, string | boolean>;
  response: ProbeHttpResponse;
}

export interface CleanupItem {
  id: string;
  description: string;
  method: 'DELETE' | 'POST';
  path: string;
  body?: unknown;
}

export interface CleanupResult {
  id: string;
  description: string;
  status: 'success' | 'failed';
  httpStatus?: number;
  error?: string;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  csrf?: boolean;
}

type FetchLike = typeof fetch;

interface StoredCookie {
  name: string;
  value: string;
  attributes: Record<string, string | boolean>;
  raw: string;
}

export class SecurityProbeHttpClient {
  private readonly cookies = new Map<string, StoredCookie>();
  private readonly cleanupItems: CleanupItem[] = [];
  private csrfTokenValue: string | undefined;

  constructor(
    private readonly config: SecurityProbeConfig,
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {}

  get cookieHeader(): string {
    return [...this.cookies.values()]
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  }

  getCookie(name: string): StoredCookie | undefined {
    return this.cookies.get(name);
  }

  addCleanup(item: CleanupItem): void {
    if (!this.cleanupItems.some((existing) => existing.id === item.id)) {
      this.cleanupItems.push(item);
    }
  }

  async request(pathOrUrl: string, options: RequestOptions = {}): Promise<ProbeHttpResponse> {
    const url = this.resolveUrl(pathOrUrl);
    const headers: Record<string, string> = {
      'user-agent': `ship-security-probe/${this.config.runId}`,
      accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      ...options.headers,
    };

    if (options.csrf) {
      headers['x-csrf-token'] = await this.csrfToken();
    }

    if (this.cookieHeader && !headers.cookie && !headers.Cookie) {
      headers.cookie = this.cookieHeader;
    }

    const init: RequestInit = {
      method: options.method || 'GET',
      headers,
      signal: AbortSignal.timeout(this.config.limits.requestTimeoutMs),
    };

    if (options.body !== undefined) {
      headers['content-type'] = headers['content-type'] || 'application/json';
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(url, init);
    const bodyText = await response.text();
    const setCookie = setCookieHeaders(response.headers);
    for (const cookie of setCookie) {
      this.storeCookie(cookie);
    }

    return {
      url,
      status: response.status,
      ok: response.ok,
      headers: headersToRecord(response.headers),
      setCookie,
      bodyText,
      json: parseJson(bodyText),
    };
  }

  async csrfToken(): Promise<string> {
    if (this.csrfTokenValue) {
      return this.csrfTokenValue;
    }

    const response = await this.request('/api/csrf-token');
    const token = objectValue(response.json, 'token');
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error('CSRF token endpoint did not return a token.');
    }

    this.csrfTokenValue = token;
    return token;
  }

  async login(credential: SecurityProbeCredentialConfig = this.config.credential): Promise<LoginProbeResult> {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      csrf: true,
      body: {
        email: credential.email,
        password: credential.password,
      },
    });

    const data = objectValue(response.json, 'data');
    const user = isObject(data) ? objectValue(data, 'user') : undefined;
    const currentWorkspace = isObject(data) ? objectValue(data, 'currentWorkspace') : undefined;

    return {
      attemptedEmail: credential.email,
      status: response.status,
      success: response.ok && objectValue(response.json, 'success') === true,
      userId: isObject(user) && typeof user.id === 'string' ? user.id : undefined,
      workspaceId:
        isObject(currentWorkspace) && typeof currentWorkspace.id === 'string' ? currentWorkspace.id : undefined,
      cookieFlags: this.cookies.get('session_id')?.attributes || {},
      response,
    };
  }

  async runCleanup(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];

    for (const item of [...this.cleanupItems].reverse()) {
      try {
        const response = await this.request(item.path, {
          method: item.method,
          body: item.body,
          csrf: true,
        });

        results.push({
          id: item.id,
          description: item.description,
          status: response.status >= 200 && response.status < 300 ? 'success' : 'failed',
          httpStatus: response.status,
        });
      } catch (error) {
        results.push({
          id: item.id,
          description: item.description,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    return new URL(pathOrUrl, `${this.config.apiUrl}/`).toString();
  }

  private storeCookie(rawCookie: string): void {
    const parsed = parseSetCookie(rawCookie);
    if (parsed) {
      this.cookies.set(parsed.name, parsed);
    }
  }
}

export function splitSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let index = 0; index < header.length; index += 1) {
    const rest = header.slice(index).toLowerCase();
    if (rest.startsWith('expires=')) {
      inExpires = true;
    }

    if (inExpires && header[index] === ';') {
      inExpires = false;
    }

    if (!inExpires && header[index] === ',') {
      const next = header.slice(index + 1).trimStart();
      if (/^[^=;,\s]+=/.test(next)) {
        cookies.push(header.slice(start, index).trim());
        start = index + 1;
      }
    }
  }

  const finalCookie = header.slice(start).trim();
  if (finalCookie) {
    cookies.push(finalCookie);
  }

  return cookies;
}

function setCookieHeaders(headers: Headers): string[] {
  const maybeGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof maybeGetSetCookie.getSetCookie === 'function') {
    const setCookies = maybeGetSetCookie.getSetCookie();
    if (setCookies.length > 0) {
      return setCookies;
    }
  }

  const combined = headers.get('set-cookie');
  return combined ? splitSetCookieHeader(combined) : [];
}

function parseSetCookie(rawCookie: string): StoredCookie | undefined {
  const [nameValue, ...attributeParts] = rawCookie.split(';').map((part) => part.trim());
  if (!nameValue) {
    return undefined;
  }

  const equalsIndex = nameValue.indexOf('=');
  if (equalsIndex <= 0) {
    return undefined;
  }

  const name = nameValue.slice(0, equalsIndex);
  const value = nameValue.slice(equalsIndex + 1);
  const attributes: Record<string, string | boolean> = {};

  for (const part of attributeParts) {
    const partEqualsIndex = part.indexOf('=');
    if (partEqualsIndex === -1) {
      attributes[part.toLowerCase()] = true;
    } else {
      attributes[part.slice(0, partEqualsIndex).toLowerCase()] = part.slice(partEqualsIndex + 1);
    }
  }

  return { name, value, attributes, raw: rawCookie };
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

function parseJson(value: string): unknown {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function objectValue(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}
