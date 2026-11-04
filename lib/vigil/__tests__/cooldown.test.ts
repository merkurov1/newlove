import {
  VIGIL_COOLDOWN_MS,
  formatVigilCooldown,
  vigilCooldownMessage,
  vigilCooldownRemainingMs,
} from '@/lib/vigil/cooldown';

describe('Vigil cooldown', () => {
  const now = Date.parse('2026-11-04T12:00:00.000Z');

  it('measures a full 24-hour window', () => {
    expect(
      vigilCooldownRemainingMs('2026-11-04T12:00:00.000Z', now)
    ).toBe(VIGIL_COOLDOWN_MS);
    expect(
      vigilCooldownRemainingMs('2026-11-03T18:00:00.000Z', now)
    ).toBe(6 * 60 * 60 * 1000);
  });

  it('returns zero for expired or invalid timestamps and caps a future timestamp', () => {
    expect(
      vigilCooldownRemainingMs('2026-11-03T11:59:59.000Z', now)
    ).toBe(0);
    expect(vigilCooldownRemainingMs('not-a-date', now)).toBe(0);
    expect(vigilCooldownRemainingMs(null, now)).toBe(0);
    expect(
      vigilCooldownRemainingMs('2026-11-05T12:00:00.000Z', now)
    ).toBe(VIGIL_COOLDOWN_MS);
  });

  it('formats minute-level remaining time for the interface', () => {
    expect(formatVigilCooldown(24 * 60 * 60 * 1000)).toBe('24h');
    expect(formatVigilCooldown(2 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe(
      '2h 5m'
    );
    expect(formatVigilCooldown(30 * 1000)).toBe('1m');
    expect(formatVigilCooldown(0)).toBe('');
    expect(vigilCooldownMessage(90 * 1000)).toBe(
      'You can light the heart again in 2m.'
    );
  });
});
