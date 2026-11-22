/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import {
  MEDIA_LANGUAGE_CODES,
  mediaLanguageBadge,
  mediaLanguageOptionLabel,
  mediaLanguageSearchText,
  mediaLanguageTag,
  normalizeMediaLanguageCode,
  sortMediaLanguages,
} from '../mediaLanguages';
import { normalizeMediaLanguage } from '../knowledge/media/classify';

describe('media language metadata', () => {
  it('includes the archive languages Albanian and Armenian', () => {
    expect(MEDIA_LANGUAGE_CODES).toEqual(expect.arrayContaining(['SQ', 'HY', 'BS']));
    expect(mediaLanguageBadge('SQ')).toBe('SQ / Albanian');
    expect(mediaLanguageBadge('HY')).toBe('HY / Armenian');
    expect(mediaLanguageOptionLabel('SQ')).toContain('Albanian (SQ)');
    expect(mediaLanguageOptionLabel('HY')).toContain('Armenian (HY)');
  });

  it('normalises known codes but preserves unknown ones', () => {
    expect(normalizeMediaLanguageCode('sq')).toBe('SQ');
    expect(normalizeMediaLanguageCode('sq-al')).toBe('SQ');
    expect(normalizeMediaLanguageCode('bs')).toBe('BS');
    expect(normalizeMediaLanguageCode('az')).toBe('AZ');
    expect(normalizeMediaLanguageCode('zz-ZZ')).toBe('ZZ-ZZ');
    expect(normalizeMediaLanguageCode('')).toBe('Unknown');
    expect(normalizeMediaLanguageCode(null)).toBe('Unknown');
    expect(normalizeMediaLanguageCode('', 'EN')).toBe('EN');
  });

  it('shows an explicit Unknown label for codes without a name', () => {
    expect(mediaLanguageBadge('zz-ZZ')).toBe('ZZ-ZZ / Unknown');
    expect(mediaLanguageBadge(null)).toBe('Unknown');
    expect(mediaLanguageOptionLabel('zz-ZZ')).toBe('ZZ-ZZ (Unknown)');
  });

  it('makes language names searchable and emits valid structured-data tags', () => {
    expect(mediaLanguageSearchText('SQ')).toContain('Albanian');
    expect(mediaLanguageSearchText('SQ')).toContain('Shqip');
    expect(mediaLanguageSearchText('HY')).toContain('Armenian');
    expect(mediaLanguageTag('SQ')).toBe('sq');
    expect(mediaLanguageTag(null)).toBe('und');
  });

  it('sorts filters by display name and keeps Unknown last', () => {
    const sorted = sortMediaLanguages(['Unknown', 'RU', 'SQ', 'HY', 'EN', 'BS']);

    expect(sorted).toEqual(['SQ', 'HY', 'BS', 'EN', 'RU', 'Unknown']);
  });

  it('keeps unknown ingestion languages instead of coercing them to EN', () => {
    expect(normalizeMediaLanguage('az')).toBe('AZ');
    expect(normalizeMediaLanguage('sq-AL')).toBe('SQ');
    expect(normalizeMediaLanguage(null)).toBe('EN');
    expect(normalizeMediaLanguage(null, 'Unknown')).toBe('Unknown');
  });
});
