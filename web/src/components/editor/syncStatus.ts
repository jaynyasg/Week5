export type SyncStatus = 'connecting' | 'cached' | 'synced' | 'reconnecting' | 'disconnected';

export type SyncStatusTone = 'success' | 'info' | 'warning' | 'danger';

export interface SyncStatusDisplay {
  status: SyncStatus;
  label: string;
  description: string;
  tone: SyncStatusTone;
  showRetry: boolean;
  showRecoveryBanner: boolean;
  bannerTitle: string;
}

export function getSyncStatusDisplay(status: SyncStatus, isBrowserOnline: boolean): SyncStatusDisplay {
  if (!isBrowserOnline) {
    return {
      status: 'disconnected',
      label: 'Offline',
      description: 'Edits are stored locally and will sync when the network returns.',
      tone: 'danger',
      showRetry: false,
      showRecoveryBanner: true,
      bannerTitle: 'Connection offline',
    };
  }

  switch (status) {
    case 'synced':
      return {
        status,
        label: 'Saved',
        description: 'Collaboration is connected and the document is synced.',
        tone: 'success',
        showRetry: false,
        showRecoveryBanner: false,
        bannerTitle: 'Connected',
      };
    case 'cached':
      return {
        status,
        label: 'Cached',
        description: 'Cached content is loaded locally while Ship connects.',
        tone: 'info',
        showRetry: false,
        showRecoveryBanner: false,
        bannerTitle: 'Cached locally',
      };
    case 'connecting':
      return {
        status,
        label: 'Connecting',
        description: 'Ship is opening the collaboration connection.',
        tone: 'warning',
        showRetry: false,
        showRecoveryBanner: false,
        bannerTitle: 'Connecting',
      };
    case 'reconnecting':
      return {
        status,
        label: 'Reconnecting',
        description: 'Edits are stored locally while Ship restores collaboration.',
        tone: 'warning',
        showRetry: true,
        showRecoveryBanner: true,
        bannerTitle: 'Reconnecting collaboration',
      };
    case 'disconnected':
      return {
        status,
        label: 'Disconnected',
        description: 'The collaboration connection is unavailable. Retry when the server is reachable.',
        tone: 'danger',
        showRetry: true,
        showRecoveryBanner: true,
        bannerTitle: 'Connection interrupted',
      };
  }
}
