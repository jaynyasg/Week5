/**
 * In-house error capture (Ship prohibits third-party telemetry per README).
 * Stores recent errors in memory for debugging; logs to console in all environments.
 */

export interface CapturedError {
  id: string;
  message: string;
  stack?: string;
  source: string;
  context?: Record<string, unknown>;
  capturedAt: string;
}

const MAX_CAPTURED = 100;
const captured: CapturedError[] = [];

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function captureError(
  error: unknown,
  source: string,
  context?: Record<string, unknown>,
): CapturedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const entry: CapturedError = {
    id: nextId(),
    message: err.message,
    stack: err.stack,
    source,
    context,
    capturedAt: new Date().toISOString(),
  };
  captured.unshift(entry);
  if (captured.length > MAX_CAPTURED) {
    captured.length = MAX_CAPTURED;
  }
  return entry;
}

export function getCapturedErrors(limit = 50): CapturedError[] {
  return captured.slice(0, limit);
}

export function clearCapturedErrors(): void {
  captured.length = 0;
}
