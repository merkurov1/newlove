import {
  formatGlobalFlameRemaining,
  globalFlameRemainingMs,
  isGlobalFlameLit,
  vigilHeartHeat,
} from '@/lib/vigil/flame';
import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';

const NOW = new Date('2026-11-24T12:00:00.000Z').getTime();

describe('Vigil global flame clock', () => {
  it('is extinguished without a spark', () => {
    expect(globalFlameRemainingMs(null, NOW)).toBe(0);
    expect(isGlobalFlameLit(null, NOW)).toBe(false);
    expect(formatGlobalFlameRemaining(0)).toBe('FLAME EXTINGUISHED');
  });

  it('stays lit for 24 hours from the latest accepted spark', () => {
    const litAt = new Date(NOW - 23 * 60 * 60 * 1000).toISOString();

    expect(isGlobalFlameLit(litAt, NOW)).toBe(true);
    expect(globalFlameRemainingMs(litAt, NOW)).toBe(60 * 60 * 1000);
    expect(formatGlobalFlameRemaining(60 * 60 * 1000)).toBe(
      '1h 0m remaining'
    );
  });

  it('extinguishes exactly at the end of the shared clock', () => {
    const litAt = new Date(NOW - VIGIL_COOLDOWN_MS - 1).toISOString();

    expect(isGlobalFlameLit(litAt, NOW)).toBe(false);
    expect(globalFlameRemainingMs(litAt, NOW)).toBe(0);
  });

  it('never lets guardian count keep an extinguished heart glowing', () => {
    expect(vigilHeartHeat(false, 10)).toBe(0);
    expect(vigilHeartHeat(true, 0)).toBe(1);
    expect(vigilHeartHeat(true, 4)).toBe(4);
    expect(vigilHeartHeat(true, 99)).toBe(10);
  });
});
