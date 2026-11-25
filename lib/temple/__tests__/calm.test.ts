import {
  CALM_COMPLETION_THRESHOLD_SECONDS,
  calmCompletionMessage,
  isCalmRitualComplete,
} from '@/lib/temple/calm';

describe('Keep Calm completion threshold', () => {
  it('keeps one deliberate threshold shared by the scene and the server', () => {
    expect(CALM_COMPLETION_THRESHOLD_SECONDS).toBe(30);
  });

  it('does not treat an early exit as completion', () => {
    expect(isCalmRitualComplete(0)).toBe(false);
    expect(isCalmRitualComplete(2)).toBe(false);
    expect(isCalmRitualComplete(29)).toBe(false);
    expect(isCalmRitualComplete(Number.NaN)).toBe(false);
  });

  it('only becomes complete at the threshold or later', () => {
    expect(isCalmRitualComplete(30)).toBe(true);
    expect(isCalmRitualComplete(31)).toBe(true);
  });

  it('describes a completed trace without accepting an early duration', () => {
    expect(calmCompletionMessage(30)).toBe('Completed 30 seconds of calm.');
    expect(calmCompletionMessage(5)).toBe('Completed 30 seconds of calm.');
  });
});
