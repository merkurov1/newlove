export type Theme = 'light' | 'sepia' | 'dark';
export type FontFamily = 'serif' | 'sans';

export interface ReaderPrefs {
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  theme: Theme;
}

export interface StoredReadingPosition {
  version: string;
  progress: number;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 19,
  fontFamily: 'serif',
  lineHeight: 1.8,
  theme: 'light',
};

export const PREFS_KEY = 'unframed_prefs';
export const READING_POSITION_KEY = 'unframed_reading_position';

export const FONT_SIZE_MIN = 15;
export const FONT_SIZE_MAX = 26;
export const LINE_HEIGHT_MIN = 1.5;
export const LINE_HEIGHT_MAX = 2.2;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/** Rejects partially corrupted or hand-edited localStorage values. */
export function sanitizePrefs(value: unknown): ReaderPrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PREFS };
  }

  const input = value as Record<string, unknown>;
  const theme: Theme =
    input.theme === 'light' || input.theme === 'sepia' || input.theme === 'dark'
      ? input.theme
      : DEFAULT_PREFS.theme;
  const fontFamily: FontFamily =
    input.fontFamily === 'serif' || input.fontFamily === 'sans'
      ? input.fontFamily
      : DEFAULT_PREFS.fontFamily;

  const rawFontSize = finiteNumber(input.fontSize);
  const fontSize =
    rawFontSize === null
      ? DEFAULT_PREFS.fontSize
      : clamp(Math.round(rawFontSize), FONT_SIZE_MIN, FONT_SIZE_MAX);

  const rawLineHeight = finiteNumber(input.lineHeight);
  const lineHeight =
    rawLineHeight === null
      ? DEFAULT_PREFS.lineHeight
      : clamp(Math.round(rawLineHeight * 100) / 100, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX);

  return { fontSize, fontFamily, lineHeight, theme };
}

export function loadPrefs(storage: StorageLike | null = browserStorage()): ReaderPrefs {
  if (!storage) return { ...DEFAULT_PREFS };

  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(
  prefs: ReaderPrefs,
  storage: StorageLike | null = browserStorage()
): void {
  if (!storage) return;

  try {
    storage.setItem(PREFS_KEY, JSON.stringify(sanitizePrefs(prefs)));
  } catch {
    // Private browsing or a full quota must never break reading.
  }
}

export function loadReadingPosition(
  version: string,
  storage: StorageLike | null = browserStorage()
): number | null {
  if (!storage || !version) return null;

  try {
    const raw = storage.getItem(READING_POSITION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredReadingPosition>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== version) return null;

    const progress = finiteNumber(parsed.progress);
    if (progress === null || progress < 0 || progress > 1) return null;

    return progress;
  } catch {
    return null;
  }
}

export function saveReadingPosition(
  version: string,
  progress: number,
  storage: StorageLike | null = browserStorage()
): void {
  if (!storage || !version || !Number.isFinite(progress)) return;

  const safeProgress = clamp(progress, 0, 1);

  try {
    storage.setItem(
      READING_POSITION_KEY,
      JSON.stringify({ version, progress: safeProgress } satisfies StoredReadingPosition)
    );
  } catch {
    // Reading must continue even when persistence is unavailable.
  }
}
