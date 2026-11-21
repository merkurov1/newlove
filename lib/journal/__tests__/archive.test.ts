import {
  findIssueCounterpart,
  selectJournalIssues,
  sortJournalIssues,
  uniqueJournalIssues,
} from '../archive';

const en = {
  id: 'en-1',
  lang: 'en' as const,
  number: 4,
  publishedAt: '2026-11-20T10:00:00.000Z',
  periodStart: '2026-11-14T00:00:00.000Z',
  periodEnd: '2026-11-20T00:00:00.000Z',
};
const ru = {
  id: 'ru-1',
  lang: 'ru' as const,
  number: 4,
  publishedAt: '2026-11-21T10:00:00.000Z',
  periodStart: '2026-11-15T00:00:00.000Z',
  periodEnd: '2026-11-21T00:00:00.000Z',
};
const olderEn = {
  id: 'en-2',
  lang: 'en' as const,
  number: 3,
  publishedAt: '2026-11-13T10:00:00.000Z',
  periodStart: '2026-11-07T00:00:00.000Z',
  periodEnd: '2026-11-13T00:00:00.000Z',
};
const olderRu = {
  id: 'ru-2',
  lang: 'ru' as const,
  number: 2,
  publishedAt: '2026-11-12T10:00:00.000Z',
  periodStart: '2026-11-06T00:00:00.000Z',
  periodEnd: '2026-11-12T00:00:00.000Z',
};

describe('journal archive language independence', () => {
  it('features the same globally latest issue on both language versions', () => {
    const enPage = selectJournalIssues([en, ru, olderEn, olderRu], 'en');
    const ruPage = selectJournalIssues([en, ru, olderEn, olderRu], 'ru');

    expect(enPage.featured?.id).toBe('ru-1');
    expect(ruPage.featured?.id).toBe('ru-1');
  });

  it('keeps every other issue in the archive, in both languages', () => {
    const { featured, archive } = selectJournalIssues([en, ru, olderEn, olderRu], 'en');

    expect(featured?.id).toBe('ru-1');
    expect(archive.map((issue) => issue.id)).toEqual(['en-1', 'en-2', 'ru-2']);
  });

  it('deduplicates repeated rows without dropping a language', () => {
    const { featured, archive } = selectJournalIssues(
      [en, ru, ru, olderEn, olderRu, olderRu],
      'en'
    );

    expect(featured?.id).toBe('ru-1');
    expect(archive.map((issue) => issue.id)).toEqual(['en-1', 'en-2', 'ru-2']);
  });

  it('sorts by publication date even when the catalogue arrives unsorted', () => {
    const sorted = sortJournalIssues([olderRu, en, olderEn, ru]);

    expect(sorted.map((issue) => issue.id)).toEqual(['ru-1', 'en-1', 'en-2', 'ru-2']);
  });

  it('falls back to the only available issue when one language is empty', () => {
    const { featured, archive } = selectJournalIssues([olderRu], 'en');

    expect(featured?.id).toBe('ru-2');
    expect(archive).toEqual([]);
  });

  it('never duplicates the featured issue in the archive', () => {
    const { featured, archive } = selectJournalIssues([en, ru], 'en');

    expect(archive.some((issue) => issue.id === featured?.id)).toBe(false);
  });
});

describe('journal issue language counterparts', () => {
  // RU and EN editions are numbered independently. The production catalogue
  // has EN issue 17 next to RU issue 25 for the same week, while RU issue 17
  // belongs to a different (older) issue. A same number alone is a false pair.
  const enSameWeek = {
    ...en,
    id: 'en-26',
    number: 18,
    periodStart: ru.periodStart,
    periodEnd: ru.periodEnd,
  };

  it('links editions that share an exact period, even when numbers differ', () => {
    expect(
      findIssueCounterpart(ru, [ru, enSameWeek, en, olderEn, olderRu], 'en')?.id
    ).toBe('en-26');
    expect(
      findIssueCounterpart(enSameWeek, [ru, enSameWeek, en, olderEn, olderRu], 'ru')?.id
    ).toBe('ru-1');
  });

  it('never links by number alone when the periods differ', () => {
    expect(findIssueCounterpart(ru, [ru, en, olderEn, olderRu], 'en')).toBeNull();
    expect(findIssueCounterpart(en, [ru, en, olderEn, olderRu], 'ru')).toBeNull();
  });

  it('does not invent a counterpart when the period is absent', () => {
    const current = { ...ru, periodStart: null, periodEnd: null };

    expect(findIssueCounterpart(current, [current, enSameWeek], 'en')).toBeNull();
  });

  it('uses the period as the reliable key, not the number', () => {
    const wrongNumber = {
      ...en,
      id: 'en-wrong-number',
      number: 9,
      periodStart: ru.periodStart,
      periodEnd: ru.periodEnd,
    };

    expect(findIssueCounterpart(ru, [ru, wrongNumber, en], 'en')?.id).toBe('en-wrong-number');
  });

  it('never links an issue to its own language', () => {
    expect(findIssueCounterpart(ru, [ru, en], 'ru')).toBeNull();
  });

  it('uniqueJournalIssues preserves the first occurrence', () => {
    expect(uniqueJournalIssues([ru, en, ru]).map((issue) => issue.id)).toEqual(['ru-1', 'en-1']);
  });
});
