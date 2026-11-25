/** @jest-environment jsdom */

import { beforeEach, describe, expect, it } from '@jest/globals';

import {
  DEFAULT_FLOW_READER_PREFS,
  FLOW_FEED_STATE_KEY,
  FLOW_READER_FONT_SCALE_MAX,
  FLOW_READER_FONT_SCALE_MIN,
  FLOW_READER_LINE_HEIGHT_MAX,
  FLOW_READER_LINE_HEIGHT_MIN,
  FLOW_READER_PREFS_KEY,
  FLOW_READER_STATE_KEY,
  LEGACY_FLOW_SCROLL_KEY,
  readFlowFeedPosition,
  readFlowReaderPrefs,
  readFlowReaderState,
  sanitizeFlowReaderPrefs,
  writeFlowFeedPosition,
  writeFlowLastRead,
  writeFlowReaderPrefs,
  writeFlowReadingProgress,
} from '../readerState';

function memoryStorage() {
  const map = new Map<string, string>();

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Flow reader state', () => {
  it('round-trips the last read item with a versioned shape and no identity data', () => {
    const storage = memoryStorage();

    writeFlowLastRead(storage, {
      slug: 'structural-integrity',
      title: 'Structural Integrity',
      progress: 0.2,
    });

    const raw = storage.getItem(FLOW_READER_STATE_KEY) ?? '';

    expect(raw).toContain('"version":1');
    expect(raw).not.toMatch(/initData|telegram|user_id|token/i);

    const state = readFlowReaderState(storage);

    expect(state.lastRead).toMatchObject({
      slug: 'structural-integrity',
      title: 'Structural Integrity',
      progress: 0.2,
    });
    expect(state.lastRead?.openedAt).toBeGreaterThan(0);
  });

  it('preserves progress when the same item is reopened and clamps bad values', () => {
    const storage = memoryStorage();

    writeFlowLastRead(storage, { slug: 'a-note', title: 'A note' });
    writeFlowReadingProgress(storage, 'a-note', 4.2);

    expect(readFlowReaderState(storage).lastRead?.progress).toBe(1);

    writeFlowLastRead(storage, { slug: 'a-note' });

    expect(readFlowReaderState(storage).lastRead?.progress).toBe(1);
    expect(readFlowReaderState(storage).lastRead?.title).toBe('A note');
  });

  it('never updates progress for a different item', () => {
    const storage = memoryStorage();

    writeFlowLastRead(storage, { slug: 'current', title: 'Current', progress: 0.3 });
    writeFlowReadingProgress(storage, 'another', 0.9);

    expect(readFlowReaderState(storage).lastRead?.slug).toBe('current');
    expect(readFlowReaderState(storage).lastRead?.progress).toBe(0.3);
  });

  it('ignores corrupt, future-version and unavailable storage', () => {
    const storage = memoryStorage();

    storage.setItem(FLOW_READER_STATE_KEY, '{not json');
    expect(readFlowReaderState(storage).lastRead).toBeNull();

    storage.setItem(FLOW_READER_STATE_KEY, JSON.stringify({ version: 99, lastRead: {} }));
    expect(readFlowReaderState(storage).lastRead).toBeNull();

    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readFlowReaderState(throwing).lastRead).toBeNull();
    expect(() =>
      writeFlowLastRead(throwing, { slug: 'safe', title: 'Safe', progress: 0.4 })
    ).not.toThrow();
  });

  it('stores a stable feed anchor and falls back to the legacy pixel key', () => {
    const storage = memoryStorage();

    writeFlowFeedPosition(storage, {
      scrollY: 1240,
      anchorId: 'entry-7',
      anchorOffset: -32,
      loadedCount: 20,
    });

    expect(readFlowFeedPosition(storage)).toMatchObject({
      scrollY: 1240,
      anchorId: 'entry-7',
      anchorOffset: -32,
      loadedCount: 20,
    });
    expect(storage.getItem(LEGACY_FLOW_SCROLL_KEY)).toBe('1240');

    const legacy = memoryStorage();

    legacy.setItem(LEGACY_FLOW_SCROLL_KEY, '800');

    expect(readFlowFeedPosition(legacy)).toMatchObject({
      scrollY: 800,
      anchorId: null,
    });
  });

  it('rejects a feed state from another version instead of guessing', () => {
    const storage = memoryStorage();

    storage.setItem(FLOW_FEED_STATE_KEY, JSON.stringify({ version: 0, scrollY: 900 }));

    expect(readFlowFeedPosition(storage)).toBeNull();
  });
});

describe('Flow reader appearance preferences', () => {
  it('round-trips appearance without identity data', () => {
    const storage = memoryStorage();

    writeFlowReaderPrefs(storage, {
      ...DEFAULT_FLOW_READER_PREFS,
      theme: 'sepia',
      fontScale: 1.2,
      lineHeight: 1.9,
      focusMode: true,
    });

    const raw = storage.getItem(FLOW_READER_PREFS_KEY) ?? '';

    expect(raw).toContain('"version":1');
    expect(raw).not.toMatch(/initData|telegram|user_id|token|auth/i);

    expect(readFlowReaderPrefs(storage)).toMatchObject({
      theme: 'sepia',
      fontScale: 1.2,
      lineHeight: 1.9,
      focusMode: true,
    });
  });

  it('clamps hand-edited numbers and rejects unknown themes', () => {
    expect(
      sanitizeFlowReaderPrefs({
        version: 1,
        theme: 'neon',
        fontScale: 99,
        lineHeight: -4,
        focusMode: 'yes',
      })
    ).toEqual({
      ...DEFAULT_FLOW_READER_PREFS,
      fontScale: FLOW_READER_FONT_SCALE_MAX,
      lineHeight: FLOW_READER_LINE_HEIGHT_MIN,
      focusMode: false,
    });

    expect(
      sanitizeFlowReaderPrefs({
        version: 1,
        theme: 'dark',
        fontScale: -1,
        lineHeight: 99,
        focusMode: true,
      })
    ).toEqual({
      ...DEFAULT_FLOW_READER_PREFS,
      theme: 'dark',
      fontScale: FLOW_READER_FONT_SCALE_MIN,
      lineHeight: FLOW_READER_LINE_HEIGHT_MAX,
      focusMode: true,
    });
  });

  it('falls back to defaults for corrupt, future-version and unavailable storage', () => {
    const storage = memoryStorage();

    storage.setItem(FLOW_READER_PREFS_KEY, '{not json');
    expect(readFlowReaderPrefs(storage)).toEqual(DEFAULT_FLOW_READER_PREFS);

    storage.setItem(
      FLOW_READER_PREFS_KEY,
      JSON.stringify({ version: 99, theme: 'dark', fontScale: 50 })
    );
    expect(readFlowReaderPrefs(storage)).toEqual(DEFAULT_FLOW_READER_PREFS);

    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    expect(readFlowReaderPrefs(throwing)).toEqual(DEFAULT_FLOW_READER_PREFS);
    expect(() =>
      writeFlowReaderPrefs(throwing, { ...DEFAULT_FLOW_READER_PREFS, theme: 'dark' })
    ).not.toThrow();
    expect(
      writeFlowReaderPrefs(throwing, { ...DEFAULT_FLOW_READER_PREFS, theme: 'dark' }).theme
    ).toBe('dark');
  });
});

describe('reading progress maths', () => {
  it('maps the article top and bottom to 0 and 1', async () => {
    const { computeReadingProgress, formatReadingProgress } = await import('../readingProgress');

    const args = { viewportHeight: 800, contentTop: 100, contentHeight: 2400 };

    expect(computeReadingProgress({ ...args, scrollTop: 0 })).toBe(0);
    expect(computeReadingProgress({ ...args, scrollTop: 100 })).toBe(0);
    expect(computeReadingProgress({ ...args, scrollTop: 900 })).toBeCloseTo(0.5, 2);
    expect(computeReadingProgress({ ...args, scrollTop: 1700 })).toBe(1);
    expect(formatReadingProgress(0.42)).toBe('42%');
    expect(formatReadingProgress(1)).toBe('Finished');
  });

  it('handles short articles that already fit the viewport', async () => {
    const { computeReadingProgress } = await import('../readingProgress');

    expect(
      computeReadingProgress({
        scrollTop: 0,
        viewportHeight: 900,
        contentTop: 100,
        contentHeight: 400,
      })
    ).toBe(0);

    expect(
      computeReadingProgress({
        scrollTop: 200,
        viewportHeight: 900,
        contentTop: 100,
        contentHeight: 400,
      })
    ).toBe(1);
  });

  it('maps saved progress back to a vertical scroll position for resume', async () => {
    const { computeScrollTopForProgress, shouldRestoreReadingProgress } = await import(
      '../readingProgress'
    );

    const args = { viewportHeight: 800, contentTop: 100, contentHeight: 2400 };

    expect(computeScrollTopForProgress({ ...args, progress: 0 })).toBe(100);
    expect(computeScrollTopForProgress({ ...args, progress: 0.5 })).toBe(900);
    expect(computeScrollTopForProgress({ ...args, progress: 1 })).toBe(1700);

    // Clamp malformed values instead of scrolling into unrelated content.
    expect(computeScrollTopForProgress({ ...args, progress: -1 })).toBe(100);
    expect(computeScrollTopForProgress({ ...args, progress: 5 })).toBe(1700);

    expect(shouldRestoreReadingProgress(0)).toBe(false);
    expect(shouldRestoreReadingProgress(0.005)).toBe(false);
    expect(shouldRestoreReadingProgress(0.4)).toBe(true);
    expect(shouldRestoreReadingProgress(0.98)).toBe(false);
    expect(shouldRestoreReadingProgress(Number.NaN)).toBe(false);
  });

  it('recomputes a stable resume target after content grows', async () => {
    const { computeScrollTopForProgress } = await import('../readingProgress');

    const base = { progress: 0.5, viewportHeight: 800, contentTop: 100 };

    expect(computeScrollTopForProgress({ ...base, contentHeight: 2400 })).toBe(900);
    expect(computeScrollTopForProgress({ ...base, contentHeight: 4800 })).toBe(2100);
  });
});
