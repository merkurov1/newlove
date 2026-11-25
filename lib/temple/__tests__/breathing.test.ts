import {
  HEART_BREATHING_CYCLE_MS,
  resolveHeartBreathingPhase,
} from '@/lib/temple/breathing';

describe('modal heart breathing phase', () => {
  it('inhales for seconds 0–4 and exhales for seconds 4–10', () => {
    expect(resolveHeartBreathingPhase(0)).toBe('Inhale');
    expect(resolveHeartBreathingPhase(3_999)).toBe('Inhale');
    expect(resolveHeartBreathingPhase(4_000)).toBe('Exhale');
    expect(resolveHeartBreathingPhase(9_999)).toBe('Exhale');
    expect(HEART_BREATHING_CYCLE_MS).toBe(10_000);
  });

  it('returns to Inhale at the start of every 10s cycle', () => {
    expect(resolveHeartBreathingPhase(10_000)).toBe('Inhale');
    expect(resolveHeartBreathingPhase(14_000)).toBe('Exhale');
    expect(resolveHeartBreathingPhase(-1)).toBe('Exhale');
  });
});
