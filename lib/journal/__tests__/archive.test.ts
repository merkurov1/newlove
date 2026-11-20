import { selectJournalIssues } from '../archive';

const en = { id: 'en-1', lang: 'en' as const };
const ru = { id: 'ru-1', lang: 'ru' as const };
const olderEn = { id: 'en-2', lang: 'en' as const };
const olderRu = { id: 'ru-2', lang: 'ru' as const };

describe('journal archive language independence', () => {
  it('keeps Russian editions in the English journal archive', () => {
    const { featured, archive } = selectJournalIssues([en, ru, olderEn, olderRu], 'en');

    expect(featured?.id).toBe('en-1');
    expect(archive.map((issue) => issue.id)).toEqual(['ru-1', 'en-2', 'ru-2']);
  });

  it('keeps English editions in the Russian journal archive', () => {
    const { featured, archive } = selectJournalIssues([en, ru, olderEn, olderRu], 'ru');

    expect(featured?.id).toBe('ru-1');
    expect(archive.map((issue) => issue.id)).toEqual(['en-1', 'en-2', 'ru-2']);
  });

  it('falls back to the latest issue when the interface language has no edition', () => {
    const { featured, archive } = selectJournalIssues([ru, olderRu], 'en');

    expect(featured?.id).toBe('ru-1');
    expect(archive.map((issue) => issue.id)).toEqual(['ru-2']);
  });

  it('never duplicates the featured issue in the archive', () => {
    const { featured, archive } = selectJournalIssues([en, ru], 'en');

    expect(archive.some((issue) => issue.id === featured?.id)).toBe(false);
  });
});
