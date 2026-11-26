import { languageFor, type FlowLanguage } from './content';

/**
 * Normalizes any value that is about to be written to `items.lang`.
 *
 * Flow only has two editorial languages. Keeping the stored value trimmed and
 * lowercase prevents a caller that sends `EN` or `en-US` from producing a row
 * that the EN/RU selects can no longer find.
 */
export function normalizeFlowLanguage(value: unknown): FlowLanguage {
  return languageFor(value);
}

/**
 * Strict language tag reader used for explicit composer context. Unlike
 * `normalizeFlowLanguage`, it never turns an unknown tag into Russian.
 */
export function languageFromTag(value: unknown): FlowLanguage | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace(/_/g, '-');

  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'ru' || normalized.startsWith('ru-')) return 'ru';

  return null;
}

/**
 * Detects the language of authored text. Photo-only posts have no text and
 * therefore fall through to the surrounding composer context.
 */
export function detectFlowTextLanguage(value: unknown): FlowLanguage | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const cyrillic = (value.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return null;
  if (cyrillic > latin) return 'ru';
  if (latin > cyrillic) return 'en';

  return null;
}

/**
 * Only explicit locale prefixes are read here. `/flow` intentionally remains
 * Russian because that page is the Russian Flow edition; `languageFromSitePath`
 * adds the known English-default public sections.
 */
export function languageFromPathname(pathname: unknown): FlowLanguage | null {
  if (typeof pathname !== 'string') return null;

  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();

  if (firstSegment === 'en' || firstSegment === 'ru') return firstSegment;

  return null;
}

/**
 * Public bilingual sections whose unprefixed URL is the English edition.
 * Russian and other translations live under an explicit `/ru/...` prefix.
 */
const ENGLISH_DEFAULT_SECTIONS = new Set([
  'heritage',
  'krass',
  'lobby',
  'advising',
  'isakeyforall',
  'journal',
]);

/** Owner-only and Flow pages without a translation use Russian by default. */
const RUSSIAN_DEFAULT_SECTIONS = new Set(['flow', 'admin']);

/**
 * Resolves an explicit composer edition from the current site route. Returns
 * null for ambiguous routes so the composer can fall back to the stored or
 * browser preference.
 */
export function languageFromSitePath(pathname: unknown): FlowLanguage | null {
  const locale = languageFromPathname(pathname);
  if (locale) return locale;

  if (typeof pathname !== 'string') return null;

  const firstSegment = pathname.split('/').filter(Boolean)[0]?.toLowerCase();

  if (!firstSegment) return null;
  if (ENGLISH_DEFAULT_SECTIONS.has(firstSegment)) return 'en';
  if (RUSSIAN_DEFAULT_SECTIONS.has(firstSegment)) return 'ru';

  return null;
}

export type FlowComposerLanguageInput = {
  /** Explicit composer edition, for example from the route or an editor. */
  explicit?: unknown;
  /** Current body text; used to keep text posts in their authored language. */
  text?: unknown;
  pathname?: unknown;
  storedChoice?: unknown;
  browserLanguage?: unknown;
  fallback?: FlowLanguage;
};

/**
 * Resolves the language for a new Flow item. An explicit context always wins
 * so a photo uploaded from an EN edition cannot be changed by an empty body.
 */
export function resolveFlowComposerLanguage(
  input: FlowComposerLanguageInput = {}
): FlowLanguage {
  const explicit = languageFromTag(input.explicit);
  if (explicit) return explicit;

  const textLanguage = detectFlowTextLanguage(input.text);
  if (textLanguage) return textLanguage;

  const pathLanguage = languageFromSitePath(input.pathname);
  if (pathLanguage) return pathLanguage;

  const storedLanguage = languageFromTag(input.storedChoice);
  if (storedLanguage) return storedLanguage;

  const browserLanguage = languageFromTag(input.browserLanguage);
  if (browserLanguage) return browserLanguage;

  return input.fallback ?? 'ru';
}
