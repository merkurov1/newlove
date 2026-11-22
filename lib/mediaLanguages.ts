/**
 * Shared language metadata for the public Media Archive, admin catalogue and
 * ingestion pipeline.
 *
 * The archive stores ISO 639-1 codes (occasionally with a region suffix). The
 * list below covers the codes the archive has used so far. A code that is not
 * in this list is still preserved verbatim instead of being silently rewritten
 * to English: the UI shows the original code next to "Unknown" until a proper
 * label is added.
 */

export const MEDIA_LANGUAGE_CODES = [
  'EN',
  'RU',
  'DE',
  'PL',
  'BS',
  'FR',
  'IT',
  'ES',
  'UK',
  'PT',
  'NL',
  'CS',
  'TR',
  'SR',
  'HR',
  'SQ',
  'HY',
] as const;

export type MediaLanguageCode = (typeof MEDIA_LANGUAGE_CODES)[number];

type LanguageMeta = {
  name: string;
  nativeName: string;
  flag: string;
};

const LANGUAGE_META: Record<MediaLanguageCode, LanguageMeta> = {
  EN: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  RU: { name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  DE: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  PL: { name: 'Polish', nativeName: 'Polski', flag: '🇵🇱' },
  BS: { name: 'Bosnian', nativeName: 'Bosanski', flag: '🇧🇦' },
  FR: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  IT: { name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  ES: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  UK: { name: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦' },
  PT: { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  NL: { name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱' },
  CS: { name: 'Czech', nativeName: 'Čeština', flag: '🇨🇿' },
  TR: { name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  SR: { name: 'Serbian', nativeName: 'Српски', flag: '🇷🇸' },
  HR: { name: 'Croatian', nativeName: 'Hrvatski', flag: '🇭🇷' },
  SQ: { name: 'Albanian', nativeName: 'Shqip', flag: '🇦🇱' },
  HY: { name: 'Armenian', nativeName: 'Հայերեն', flag: '🇦🇲' },
};

export const UNKNOWN_LANGUAGE = 'Unknown';

const UNKNOWN_CODES = new Set(['', 'UNKNOWN', 'UND']);

let displayNames: Intl.DisplayNames | null | undefined;

function englishDisplayName(code: string): string | null {
  try {
    if (displayNames === undefined) {
      displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    }
    const value = displayNames?.of(code.toLowerCase());
    return value && value.toLowerCase() !== code.toLowerCase() ? value : null;
  } catch {
    return null;
  }
}

function knownMeta(code: string): LanguageMeta | null {
  return (LANGUAGE_META as Record<string, LanguageMeta>)[code] ?? null;
}

function baseCode(value: string): string {
  return value.split('-')[0] ?? value;
}

/**
 * Canonicalise a stored language code without hiding unknown values.
 * `sq`, `sq-AL` and `SQ` all become `SQ`; `az` stays `AZ` and an empty value
 * becomes the supplied fallback (by default the literal `Unknown`).
 */
export function normalizeMediaLanguageCode(
  value: string | null | undefined,
  fallback: string = UNKNOWN_LANGUAGE
): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;

  const normalized = raw.replace(/_/g, '-').toUpperCase();
  if (UNKNOWN_CODES.has(normalized)) return UNKNOWN_LANGUAGE;

  const base = baseCode(normalized);
  return knownMeta(base) ? base : normalized;
}

export function isKnownMediaLanguage(value: string | null | undefined): boolean {
  return Boolean(knownMeta(normalizeMediaLanguageCode(value)));
}

export function mediaLanguageName(value: string | null | undefined): string {
  const code = normalizeMediaLanguageCode(value);
  if (code === UNKNOWN_LANGUAGE) return UNKNOWN_LANGUAGE;

  const known = knownMeta(baseCode(code));
  if (known) return known.name;

  return englishDisplayName(baseCode(code)) ?? UNKNOWN_LANGUAGE;
}

export function mediaLanguageNativeName(value: string | null | undefined): string | null {
  const code = normalizeMediaLanguageCode(value);
  return knownMeta(baseCode(code))?.nativeName ?? null;
}

export function mediaLanguageFlag(value: string | null | undefined): string | null {
  const code = normalizeMediaLanguageCode(value);
  return knownMeta(baseCode(code))?.flag ?? null;
}

/** Compact public label: `SQ / Albanian`, or `XX / Unknown`. */
export function mediaLanguageBadge(value: string | null | undefined): string {
  const code = normalizeMediaLanguageCode(value);
  if (code === UNKNOWN_LANGUAGE) return UNKNOWN_LANGUAGE;

  return `${code} / ${mediaLanguageName(code)}`;
}

/** Filter option label: `🇦🇱 Albanian (SQ)`, or `XX (Unknown)`. */
export function mediaLanguageOptionLabel(value: string | null | undefined): string {
  const code = normalizeMediaLanguageCode(value);
  if (code === UNKNOWN_LANGUAGE) return UNKNOWN_LANGUAGE;

  const name = mediaLanguageName(code);
  if (name === UNKNOWN_LANGUAGE) return `${code} (${UNKNOWN_LANGUAGE})`;

  const flag = mediaLanguageFlag(code);
  const prefix = flag ? `${flag} ` : '';
  return `${prefix}${name} (${code})`;
}

/** Text added to archive search so "Albanian" also finds `SQ`. */
export function mediaLanguageSearchText(value: string | null | undefined): string {
  const code = normalizeMediaLanguageCode(value);
  if (code === UNKNOWN_LANGUAGE) return UNKNOWN_LANGUAGE;

  return [code, mediaLanguageName(code), mediaLanguageNativeName(code)].filter(Boolean).join(' ');
}

/** BCP 47 tag for structured data. Unknown languages use the `und` tag. */
export function mediaLanguageTag(value: string | null | undefined): string {
  const code = normalizeMediaLanguageCode(value);
  return code === UNKNOWN_LANGUAGE ? 'und' : code.toLowerCase();
}

/** Stable alphabetical order by language name, with Unknown last. */
export function sortMediaLanguages(values: Iterable<string>): string[] {
  return [...new Set([...values].map((value) => normalizeMediaLanguageCode(value)))].sort(
    (left, right) => {
      if (left === UNKNOWN_LANGUAGE) return 1;
      if (right === UNKNOWN_LANGUAGE) return -1;

      return (
        mediaLanguageName(left).localeCompare(mediaLanguageName(right)) || left.localeCompare(right)
      );
    }
  );
}
