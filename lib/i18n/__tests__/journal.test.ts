import { JOURNAL_COPY, journalArchiveHref, journalIssueHref, journalMetadata } from '../journal';
import { languageAlternates, localizedPath } from '../config';
import { SITE_URL } from '@/lib/seo';

describe('Journal bilingual configuration', () => {
  it('keeps the existing English route and adds a prefixed Russian route', () => {
    expect(localizedPath('journal', 'en')).toBe('/journal');
    expect(localizedPath('journal', 'ru')).toBe('/ru/journal');
    expect(languageAlternates('journal')).toEqual({
      'x-default': '/journal',
      en: '/journal',
      ru: '/ru/journal',
    });
  });

  it('builds self-canonical localized metadata with real hreflang versions', () => {
    const en = journalMetadata('en');
    const ru = journalMetadata('ru');

    expect(en.alternates?.canonical).toBe(`${SITE_URL}/journal`);
    expect(ru.alternates?.canonical).toBe(`${SITE_URL}/ru/journal`);
    expect(en.alternates?.languages).toEqual({
      'x-default': `${SITE_URL}/journal`,
      en: `${SITE_URL}/journal`,
      ru: `${SITE_URL}/ru/journal`,
    });
    expect(ru.alternates?.languages).toEqual(en.alternates?.languages);
  });

  it('localizes titles and Open Graph locales', () => {
    const en = journalMetadata('en');
    const ru = journalMetadata('ru');

    expect(en.openGraph?.title).toContain('The Journal');
    expect(ru.openGraph?.title).toContain('Журнал');
    expect(en.openGraph?.locale).toBe('en_US');
    expect(ru.openGraph?.locale).toBe('ru_RU');
    expect(en.openGraph?.alternateLocale).toBe('ru_RU');
    expect(ru.openGraph?.alternateLocale).toBe('en_US');
  });

  it('has complete copy for both languages', () => {
    for (const lang of ['en', 'ru'] as const) {
      const copy = JOURNAL_COPY[lang];
      expect(copy.masthead.title.trim()).not.toBe('');
      expect(copy.meta.description.trim()).not.toBe('');
      expect(copy.nav.ariaLabel.trim()).not.toBe('');
      expect(copy.featured.read.trim()).not.toBe('');
      expect(copy.flow.types.note.trim()).not.toBe('');
      expect(copy.archive.title.trim()).not.toBe('');
      expect(copy.subscribe.title.trim()).not.toBe('');
      expect(copy.languages.en.trim()).not.toBe('');
      expect(copy.languages.ru.trim()).not.toBe('');
    }
  });

  it('routes each issue to its real language archive', () => {
    expect(journalIssueHref('ru', 'issue-1')).toBe('/flow-issues/issue-1');
    expect(journalIssueHref('en', 'issue-1')).toBe('/en/flow-issues/issue-1');
    expect(journalArchiveHref('ru')).toBe('/flow-issues');
    expect(journalArchiveHref('en')).toBe('/en/flow-issues');
  });
});
