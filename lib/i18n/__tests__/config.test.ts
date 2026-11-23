import {
  LANGUAGES,
  SECTION_LANGUAGES,
  SECTION_PATHS,
  languageAlternates,
  localizedPath,
  type SectionKey,
} from '../config';

const SECTIONS = Object.keys(SECTION_PATHS) as SectionKey[];

describe('localised section routing', () => {
  it('only advertises languages that have a real route for the section', () => {
    for (const section of SECTIONS) {
      const alternates = languageAlternates(section);

      expect(alternates['x-default']).toBe(localizedPath(section, 'en'));

      for (const [language, path] of Object.entries(alternates)) {
        if (language === 'x-default') continue;
        expect(LANGUAGES).toContain(language);
        expect(SECTION_LANGUAGES[section]).toContain(language);
        expect(path).toBe(localizedPath(section, language as (typeof LANGUAGES)[number]));
      }

      // Every real language must have a self-referencing alternate.
      for (const language of SECTION_LANGUAGES[section]) {
        expect(alternates[language]).toBe(localizedPath(section, language));
      }
    }
  });

  it('never emits an alternate for a language with no page', () => {
    expect(languageAlternates('heritage')).not.toHaveProperty('de');
    expect(languageAlternates('heritage')).not.toHaveProperty('ar');
    expect(languageAlternates('lobby')).not.toHaveProperty('fr');
    expect(languageAlternates('isakeyforall')).not.toHaveProperty('ar');
    expect(languageAlternates('journal')).not.toHaveProperty('de');
  });

  it('keeps English unprefixed and prefixes every other language', () => {
    for (const section of SECTIONS) {
      expect(localizedPath(section, 'en')).toBe(SECTION_PATHS[section]);

      for (const language of SECTION_LANGUAGES[section]) {
        if (language === 'en') continue;
        expect(localizedPath(section, language)).toBe(`/${language}${SECTION_PATHS[section]}`);
      }
    }
  });
});
