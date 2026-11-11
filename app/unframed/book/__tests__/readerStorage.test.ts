/** @jest-environment node */

import {
  DEFAULT_PREFS,
  PREFS_KEY,
  READING_POSITION_KEY,
  loadPrefs,
  loadReadingPosition,
  sanitizePrefs,
  savePrefs,
  saveReadingPosition,
} from '../readerStorage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };

  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe('reader preferences validation', () => {
  it('falls back to defaults for missing or corrupted values', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(
      sanitizePrefs({
        theme: 'neon',
        fontFamily: 42,
        fontSize: 'huge',
        lineHeight: Number.NaN,
      })
    ).toEqual(DEFAULT_PREFS);
  });

  it('clamps out-of-range values and rounds font size', () => {
    expect(
      sanitizePrefs({
        theme: 'dark',
        fontFamily: 'sans',
        fontSize: 99.6,
        lineHeight: 9,
      })
    ).toEqual({ theme: 'dark', fontFamily: 'sans', fontSize: 26, lineHeight: 2.2 });

    expect(
      sanitizePrefs({
        theme: 'sepia',
        fontFamily: 'serif',
        fontSize: 19.6,
        lineHeight: 0.1,
      })
    ).toEqual({ theme: 'sepia', fontFamily: 'serif', fontSize: 20, lineHeight: 1.5 });
  });

  it('survives invalid JSON and non-object storage values', () => {
    const storage = memoryStorage({ [PREFS_KEY]: '{broken' });
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);

    storage.data[PREFS_KEY] = '"dark"';
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
  });

  it('writes sanitized preferences only', () => {
    const storage = memoryStorage();

    savePrefs({ theme: 'sepia', fontFamily: 'sans', fontSize: 21, lineHeight: 1.9 }, storage);

    expect(JSON.parse(storage.data[PREFS_KEY])).toEqual({
      theme: 'sepia',
      fontFamily: 'sans',
      fontSize: 21,
      lineHeight: 1.9,
    });
  });
});

describe('reading position persistence', () => {
  it('stores a position only for the matching manuscript version', () => {
    const storage = memoryStorage();

    saveReadingPosition('version-a', 0.42, storage);

    expect(loadReadingPosition('version-a', storage)).toBe(0.42);
    expect(loadReadingPosition('version-b', storage)).toBeNull();
  });

  it('rejects corrupted or out-of-range positions', () => {
    const storage = memoryStorage();

    storage.data[READING_POSITION_KEY] = '{not-json';
    expect(loadReadingPosition('version-a', storage)).toBeNull();

    storage.data[READING_POSITION_KEY] = JSON.stringify({ version: 'version-a', progress: 4 });
    expect(loadReadingPosition('version-a', storage)).toBeNull();

    storage.data[READING_POSITION_KEY] = JSON.stringify({ version: 'version-a', progress: 'half' });
    expect(loadReadingPosition('version-a', storage)).toBeNull();
  });

  it('clamps progress before writing', () => {
    const storage = memoryStorage();

    saveReadingPosition('version-a', 1.5, storage);

    expect(loadReadingPosition('version-a', storage)).toBe(1);
  });
});
