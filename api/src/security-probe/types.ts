export const AUDIT_METRIC_DEFINITIONS = [
  {
    key: 'security_probe_tool',
    label: 'Security probe tool',
    expectedBaseline: 'Runnable (Yes / No)',
    source: 'Probe command and report metadata',
  },
  {
    key: 'auth_session_vulnerabilities',
    label: 'Auth/session vulnerabilities found',
    expectedBaseline: 'List with severity',
    source: 'Auth/session probes plus manual review',
  },
  {
    key: 'websocket_validation_failures',
    label: 'WebSocket validation failures',
    expectedBaseline: 'List with severity',
    source: 'WebSocket probes',
  },
  {
    key: 'input_sanitization_failures',
    label: 'Input sanitization failures',
    expectedBaseline: 'List with severity',
    source: 'Input probes plus browser/security test evidence when relevant',
  },
  {
    key: 'high_critical_cves',
    label: 'High/Critical CVEs in dependencies',
    expectedBaseline: 'Count + list',
    source: 'Parsed dependency audit',
  },
  {
    key: 'cors_csp_misconfiguration',
    label: 'CORS/CSP misconfiguration',
    expectedBaseline: 'Yes / No + details',
    source: 'Header probes plus manual review',
  },
  {
    key: 'secrets_exposure_risk',
    label: 'Secrets exposure risk',
    expectedBaseline: 'Yes / No + details',
    source: 'Common-path/client-bundle checks plus manual review',
  },
  {
    key: 'rate_limiting_absent',
    label: 'Rate limiting absent on endpoints',
    expectedBaseline: 'List',
    source: 'Live bounded probes plus route/middleware review',
  },
  {
    key: 'verbose_error_leakage',
    label: 'Verbose error leakage',
    expectedBaseline: 'Yes / No + examples',
    source: 'Error probes plus error-handler review',
  },
] as const;

export type AuditMetricKey = typeof AUDIT_METRIC_DEFINITIONS[number]['key'];

export type SecurityProbeMode = 'local' | 'remote';

export type SecurityProbeSurface =
  | 'tool'
  | 'auth_session'
  | 'websocket'
  | 'input_sanitization'
  | 'dependency_cve'
  | 'cors_csp'
  | 'secrets'
  | 'rate_limiting'
  | 'verbose_errors'
  | 'cleanup';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus =
  | 'pass'
  | 'finding'
  | 'inconclusive'
  | 'error'
  | 'not_run_credentials_required'
  | 'not_run_secondary_credentials_required'
  | 'not_run_target_unavailable'
  | 'not_run_safety_limit';

export interface SecurityProbeCredentialConfig {
  email: string;
  password: string;
  source: 'default' | 'env' | 'cli' | 'prompt';
}

export interface SecurityProbeConfig {
  mode: SecurityProbeMode;
  webUrl: string;
  apiUrl: string;
  outDir: string;
  reportName: string;
  runId: string;
  startedAt: string;
  nonInteractive: boolean;
  credential: SecurityProbeCredentialConfig;
  secondaryCredential?: SecurityProbeCredentialConfig;
  limits: {
    requestTimeoutMs: number;
    maxWebSocketPayloadBytes: number;
    allowOversizedWebSocketProbe: boolean;
    maxInvalidLoginAttempts: number;
    maxRateLimitProbeRequests: number;
  };
}

export interface ProbeEvidence {
  [key: string]: unknown;
}

export interface SecurityFinding {
  id: string;
  metric: AuditMetricKey;
  surface: SecurityProbeSurface;
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  description: string;
  reproduction: string[];
  evidence: ProbeEvidence;
  recommendation?: string;
  cleanup?: {
    attempted: boolean;
    status: 'not_needed' | 'success' | 'failed' | 'not_available';
    details?: string;
  };
}

export interface AuditMatrixRow {
  metric: string;
  baseline: string;
  source: string;
}

export interface SecurityProbeReport {
  schemaVersion: 1;
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    mode: SecurityProbeMode;
    webUrl: string;
    apiUrl: string;
    reportName: string;
    nonInteractive: boolean;
  };
  credentials: {
    defaultAttempted: boolean;
    primaryEmail: string;
    primarySource: SecurityProbeCredentialConfig['source'];
    secondaryProvided: boolean;
  };
  summary: {
    totalFindings: number;
    findingsByStatus: Record<FindingStatus, number>;
    findingsBySeverity: Record<FindingSeverity, number>;
  };
  auditMatrix: AuditMatrixRow[];
  findings: SecurityFinding[];
}
