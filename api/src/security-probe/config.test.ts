import { describe, expect, it } from 'vitest';
import { parseSecurityProbeConfig, SecurityProbeConfigError } from './config.js';

describe('parseSecurityProbeConfig', () => {
  it('uses local defaults with seeded credentials', () => {
    const config = parseSecurityProbeConfig([], {});

    expect(config.mode).toBe('local');
    expect(config.webUrl).toBe('http://localhost:5173');
    expect(config.apiUrl).toBe('http://localhost:3000');
    expect(config.credential).toMatchObject({
      email: 'dev@ship.local',
      password: 'admin123',
      source: 'default',
    });
    expect(config.reportName).toBe('security-audit-baseline');
  });

  it('requires explicit URLs in remote mode', () => {
    expect(() => parseSecurityProbeConfig(['--mode', 'remote'], {})).toThrow(SecurityProbeConfigError);
  });

  it('accepts remote URLs and CLI credentials', () => {
    const config = parseSecurityProbeConfig(
      [
        '--mode',
        'remote',
        '--web-url',
        'https://ship.example.gov/',
        '--api-url',
        'https://api.ship.example.gov/',
        '--email',
        'auditor@example.gov',
        '--password',
        'secret',
        '--non-interactive',
      ],
      {}
    );

    expect(config.mode).toBe('remote');
    expect(config.webUrl).toBe('https://ship.example.gov');
    expect(config.apiUrl).toBe('https://api.ship.example.gov');
    expect(config.credential.source).toBe('cli');
    expect(config.nonInteractive).toBe(true);
  });

  it('reads secondary credentials from the environment', () => {
    const config = parseSecurityProbeConfig([], {
      SHIP_SECURITY_ALT_EMAIL: 'member@ship.local',
      SHIP_SECURITY_ALT_PASSWORD: 'admin123',
    });

    expect(config.secondaryCredential).toMatchObject({
      email: 'member@ship.local',
      source: 'env',
    });
  });
});
