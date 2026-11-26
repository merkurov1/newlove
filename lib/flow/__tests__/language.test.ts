import {
  detectFlowTextLanguage,
  languageFromPathname,
  languageFromSitePath,
  languageFromTag,
  normalizeFlowLanguage,
  resolveFlowComposerLanguage,
} from '../language';

describe('Flow language resolution', () => {
  it('normalizes stored language tags without turning EN into RU', () => {
    expect(normalizeFlowLanguage('en')).toBe('en');
    expect(normalizeFlowLanguage('EN')).toBe('en');
    expect(normalizeFlowLanguage('en-US')).toBe('en');
    expect(normalizeFlowLanguage('ru')).toBe('ru');
    expect(normalizeFlowLanguage('ru-RU')).toBe('ru');
    expect(normalizeFlowLanguage(undefined)).toBe('ru');
  });

  it('only treats explicit EN/RU tags as composer context', () => {
    expect(languageFromTag('en-GB')).toBe('en');
    expect(languageFromTag('ru_RU')).toBe('ru');
    expect(languageFromTag('de-DE')).toBeNull();
    expect(languageFromTag(null)).toBeNull();
  });

  it('detects authored text and ignores empty photo-only bodies', () => {
    expect(detectFlowTextLanguage('An English note about the archive.')).toBe('en');
    expect(detectFlowTextLanguage('Заметка о памяти и архиве.')).toBe('ru');
    expect(detectFlowTextLanguage('')).toBeNull();
    expect(detectFlowTextLanguage('2026 — 42')).toBeNull();
  });

  it('reads only real locale prefixes from the pathname', () => {
    expect(languageFromPathname('/en/journal')).toBe('en');
    expect(languageFromPathname('/ru/journal')).toBe('ru');
    expect(languageFromPathname('/flow')).toBeNull();
    expect(languageFromPathname('/admin/pierrot/flow')).toBeNull();
  });

  it('maps site routes to the edition that opened the composer', () => {
    expect(languageFromSitePath('/journal')).toBe('en');
    expect(languageFromSitePath('/heritage/krass')).toBe('en');
    expect(languageFromSitePath('/ru/journal')).toBe('ru');
    expect(languageFromSitePath('/en/journal')).toBe('en');
    expect(languageFromSitePath('/flow')).toBe('ru');
    expect(languageFromSitePath('/admin/pierrot/flow')).toBe('ru');
    expect(languageFromSitePath('/temple')).toBeNull();
  });

  it('keeps an explicit EN edition even when the photo has no text', () => {
    expect(
      resolveFlowComposerLanguage({
        explicit: 'en',
        text: '',
        pathname: '/flow',
        storedChoice: 'ru',
        browserLanguage: 'ru-RU',
      })
    ).toBe('en');
  });

  it('keeps an explicit RU edition even when the photo has no text', () => {
    expect(
      resolveFlowComposerLanguage({
        explicit: 'ru',
        text: '',
        pathname: '/en/journal',
        storedChoice: 'en',
        browserLanguage: 'en-US',
      })
    ).toBe('ru');
  });

  it('falls back through text, pathname, stored choice and browser preference', () => {
    expect(
      resolveFlowComposerLanguage({
        text: 'English body',
        pathname: '/ru/journal',
        storedChoice: 'ru',
      })
    ).toBe('en');

    expect(
      resolveFlowComposerLanguage({
        text: '',
        pathname: '/ru/journal',
        storedChoice: 'en',
      })
    ).toBe('ru');

    expect(
      resolveFlowComposerLanguage({
        text: '',
        pathname: '/flow',
        storedChoice: 'en',
        browserLanguage: 'en-US',
      })
    ).toBe('ru');

    expect(
      resolveFlowComposerLanguage({
        text: '',
        pathname: '/journal',
        storedChoice: 'ru',
        browserLanguage: 'ru-RU',
      })
    ).toBe('en');

    expect(
      resolveFlowComposerLanguage({
        text: '',
        pathname: '/temple',
        storedChoice: 'en',
        browserLanguage: 'ru-RU',
      })
    ).toBe('en');

    expect(
      resolveFlowComposerLanguage({
        text: '',
        pathname: '/temple',
        storedChoice: null,
        browserLanguage: 'en-US',
      })
    ).toBe('en');

    expect(resolveFlowComposerLanguage({})).toBe('ru');
  });
});
