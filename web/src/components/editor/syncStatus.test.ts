import { describe, expect, it } from 'vitest';
import { getSyncStatusDisplay } from './syncStatus';

describe('getSyncStatusDisplay', () => {
  it('shows an offline recovery banner when the browser is offline', () => {
    const display = getSyncStatusDisplay('synced', false);

    expect(display.label).toBe('Offline');
    expect(display.tone).toBe('danger');
    expect(display.showRetry).toBe(false);
    expect(display.showRecoveryBanner).toBe(true);
    expect(display.description).toContain('stored locally');
  });

  it('treats websocket disconnects with cache as reconnecting', () => {
    const display = getSyncStatusDisplay('reconnecting', true);

    expect(display.label).toBe('Reconnecting');
    expect(display.tone).toBe('warning');
    expect(display.showRetry).toBe(true);
    expect(display.showRecoveryBanner).toBe(true);
  });

  it('keeps the healthy synced state compact', () => {
    const display = getSyncStatusDisplay('synced', true);

    expect(display.label).toBe('Saved');
    expect(display.tone).toBe('success');
    expect(display.showRetry).toBe(false);
    expect(display.showRecoveryBanner).toBe(false);
  });

  it('does not show the recovery banner while local cache is loading', () => {
    const display = getSyncStatusDisplay('cached', true);

    expect(display.label).toBe('Cached');
    expect(display.tone).toBe('info');
    expect(display.showRecoveryBanner).toBe(false);
  });
});
