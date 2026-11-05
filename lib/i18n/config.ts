/**
 * Small, explicit language layer for the four public pages that have
 * editorial translations. This is intentionally not a general i18n system:
 * there is no runtime translator, no message catalogue and no locale router.
 */

export const LANGUAGES = ['en', 'ru', 'de', 'fr', 'ar'] as const;

export type Language = (typeof LANGUAGES)[number];

export type SectionKey = 'heritage' | 'lobby' | 'advising' | 'isakeyforall';

export type Direction = 'ltr' | 'rtl';

export const DEFAULT_LANGUAGE: Language = 'en';

export const SECTION_PATHS: Record<SectionKey, string> = {
  heritage: '/heritage',
  lobby: '/lobby',
  advising: '/advising',
  isakeyforall: '/isakeyforall',
};

/** Only these languages have real, edited content for each section. */
export const SECTION_LANGUAGES: Record<SectionKey, readonly Language[]> = {
  heritage: ['en', 'ru'],
  lobby: ['en', 'ru', 'de'],
  advising: ['en', 'ru', 'de', 'fr', 'ar'],
  isakeyforall: ['en', 'ru', 'de'],
};

export const LANGUAGE_META: Record<
  Language,
  { label: string; nativeName: string; englishName: string; dir: Direction; ogLocale: string }
> = {
  en: { label: 'EN', nativeName: 'English', englishName: 'English', dir: 'ltr', ogLocale: 'en_US' },
  ru: { label: 'RU', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', ogLocale: 'ru_RU' },
  de: { label: 'DE', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', ogLocale: 'de_DE' },
  fr: { label: 'FR', nativeName: 'Français', englishName: 'French', dir: 'ltr', ogLocale: 'fr_FR' },
  ar: { label: 'AR', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', ogLocale: 'ar_AR' },
};

export const SECTION_BY_PATH: Record<string, SectionKey> = {
  [SECTION_PATHS.heritage]: 'heritage',
  [SECTION_PATHS.lobby]: 'lobby',
  [SECTION_PATHS.advising]: 'advising',
  [SECTION_PATHS.isakeyforall]: 'isakeyforall',
};

export function getDirection(language: Language): Direction {
  return LANGUAGE_META[language].dir;
}

export function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

export function isSectionLanguage(section: SectionKey, value: string): value is Language {
  return (SECTION_LANGUAGES[section] as readonly string[]).includes(value);
}

/** English stays on the existing unprefixed route; other languages are prefixed. */
export function localizedPath(section: SectionKey, language: Language): string {
  const path = SECTION_PATHS[section];
  return language === DEFAULT_LANGUAGE ? path : `/${language}${path}`;
}

/** Every translated URL, including the self-referencing English one. */
export function languageAlternates(section: SectionKey): Record<string, string> {
  const alternates: Record<string, string> = {
    'x-default': localizedPath(section, DEFAULT_LANGUAGE),
  };

  for (const language of SECTION_LANGUAGES[section]) {
    alternates[language] = localizedPath(section, language);
  }

  return alternates;
}

/** URLs that should be listed in the sitemap in addition to the English route. */
export function translatedPaths(section: SectionKey): string[] {
  return SECTION_LANGUAGES[section]
    .filter((language) => language !== DEFAULT_LANGUAGE)
    .map((language) => localizedPath(section, language));
}
