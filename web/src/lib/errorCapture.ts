import {
  captureError,
  getCapturedErrors,
  clearCapturedErrors,
  type CapturedError,
} from '@ship/shared';

export { captureError, getCapturedErrors, clearCapturedErrors, type CapturedError };

function logCaptured(entry: ReturnType<typeof captureError>): void {
  console.error(`[error-capture:${entry.source}]`, entry.message, entry.context ?? '');
}

export function installClientErrorCapture(): void {
  window.addEventListener('error', (event) => {
    logCaptured(
      captureError(event.error ?? event.message, 'window.error', {
        filename: event.filename,
        lineno: event.lineno,
      }),
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    logCaptured(captureError(event.reason, 'window.unhandledrejection'));
  });
}
