/** @jest-environment node */

import { buildSourceCoverage } from '../coverage';
import { deriveProviderConnectionStatus } from '../dataset';

const period = {
  start: '2026-11-12',
  end: '2026-11-18',
  timezone: 'Europe/Moscow',
};

describe('analytics source health', () => {
  it('escalates an authorization error even when the stored row says connected', () => {
    expect(
      deriveProviderConnectionStatus({
        configured: true,
        connection: { status: 'connected', last_error_code: 'invalid_grant' },
      })
    ).toBe('needs_reauthorization');

    expect(
      deriveProviderConnectionStatus({
        configured: true,
        connection: { status: 'connected', last_error_code: null },
      })
    ).toBe('connected');

    expect(deriveProviderConnectionStatus({ configured: false, connection: null })).toBe(
      'not_configured'
    );
  });

  it('separates fresh, stale, missing and zero data', () => {
    const fresh = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: [
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
        '2026-11-15',
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
      ],
      lastSyncAt: '2026-11-18T23:00:00.000Z',
      configured: true,
      connected: true,
      now: new Date('2026-11-18T23:30:00.000Z'),
    });
    expect(fresh.state).toBe('complete');
    expect(fresh.freshness).toBe('fresh');

    const stale = buildSourceCoverage({
      provider: 'search_console',
      period,
      dataDates: ['2026-11-12', '2026-11-13'],
      lastSyncAt: '2026-11-14T10:00:00.000Z',
      configured: true,
      connected: true,
      now: new Date('2026-11-18T23:30:00.000Z'),
    });
    expect(stale.state).toBe('partial');
    expect(stale.freshness).toBe('stale');

    const missing = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: [],
      lastSyncAt: null,
      configured: true,
      connected: true,
      now: new Date('2026-11-18T23:30:00.000Z'),
    });
    expect(missing.state).toBe('stale');
    expect(missing.actualDataTo).toBeNull();

    const authError = buildSourceCoverage({
      provider: 'google_analytics',
      period,
      dataDates: [],
      lastSyncAt: '2026-11-10T10:00:00.000Z',
      configured: true,
      connected: false,
      error: 'invalid_grant',
      now: new Date('2026-11-18T23:30:00.000Z'),
    });
    expect(authError.state).toBe('unavailable');

    // A stored day with a real zero metric is present data, not a missing day.
    const zeroDay = buildSourceCoverage({
      provider: 'google_analytics',
      period: { start: '2026-11-18', end: '2026-11-18', timezone: 'Europe/Moscow' },
      dataDates: ['2026-11-18'],
      lastSyncAt: '2026-11-18T22:00:00.000Z',
      configured: true,
      connected: true,
      now: new Date('2026-11-18T23:30:00.000Z'),
    });
    expect(zeroDay.actualDataTo).toBe('2026-11-18');
    expect(zeroDay.state).toBe('complete');
  });
});
