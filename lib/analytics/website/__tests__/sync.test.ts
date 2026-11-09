/** @jest-environment node */

import { resolveSyncRange } from '../sync';

const NOW = new Date('2026-11-09T12:00:00.000Z');

describe('analytics sync ranges', () => {
  it('uses an explicit range unchanged', () => {
    expect(
      resolveSyncRange('manual', {
        timezone: 'Europe/London',
        now: NOW,
        explicit: { start: '2026-10-01', end: '2026-10-31' },
      })
    ).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('backfills the configured history ending today', () => {
    expect(
      resolveSyncRange('backfill', { timezone: 'Europe/London', now: NOW })
    ).toEqual({ start: '2026-08-12', end: '2026-11-09' });
  });

  it('repairs the last seven days', () => {
    expect(resolveSyncRange('repair', { timezone: 'Europe/London', now: NOW })).toEqual({
      start: '2026-11-03',
      end: '2026-11-09',
    });
  });

  it('re-reads delayed days on incremental sync and never goes before the floor', () => {
    expect(
      resolveSyncRange('incremental', {
        timezone: 'Europe/London',
        now: NOW,
        lastSyncAt: '2026-11-08T10:00:00.000Z',
      })
    ).toEqual({ start: '2026-11-05', end: '2026-11-09' });

    expect(
      resolveSyncRange('incremental', {
        timezone: 'Europe/London',
        now: NOW,
        lastSyncAt: '2026-01-01T10:00:00.000Z',
      })
    ).toEqual({ start: '2026-08-12', end: '2026-11-09' });
  });

  it('falls back to a backfill when the source has never synced', () => {
    expect(
      resolveSyncRange('incremental', { timezone: 'Europe/London', now: NOW, lastSyncAt: null })
    ).toEqual({ start: '2026-08-12', end: '2026-11-09' });
  });
});
