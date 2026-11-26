import { journalFormat, normalizeJournalTitle, selectJournalHighlights } from '../selection';
import type { JournalMaterial } from '../issue';

function material(overrides: Partial<JournalMaterial>): JournalMaterial {
  return {
    id: 'material-1',
    kind: 'note',
    type: 'note',
    lang: 'en',
    title: 'A material',
    body: '',
    description: '',
    url: 'https://www.merkurov.love/flow/material-1',
    image: null,
    imageAlt: '',
    siteName: '',
    publishedAt: '2026-11-18T10:00:00.000Z',
    isLead: false,
    isExternal: false,
    ...overrides,
  };
}

describe('Journal title normalization', () => {
  it('removes a duplicated author byline', () => {
    expect(
      normalizeJournalTitle('UNFRAMED // Episode 0: The Spectral Tiger | Anton Merkurov')
    ).toBe('UNFRAMED // Episode 0: The Spectral Tiger');
    expect(normalizeJournalTitle('Заголовок — Антон Меркуров')).toBe('Заголовок');
  });

  it('removes the Flow signature used by issue feeds', () => {
    expect(
      normalizeJournalTitle(
        'Tomb in Siberia reveals humans were using cannabis 2800 years ago «| Поток - 13 ноября 2026 г.»'
      )
    ).toBe('Tomb in Siberia reveals humans were using cannabis 2800 years ago');
    expect(normalizeJournalTitle('A story | Flow - 13 November 2026')).toBe('A story');
    expect(normalizeJournalTitle('A story | Flow')).toBe('A story');
  });

  it('removes a known site name only when it is appended as a suffix', () => {
    expect(
      normalizeJournalTitle('A Kandinsky record at Christie’s | ARTnews.com', {
        siteName: 'ARTnews.com',
      })
    ).toBe('A Kandinsky record at Christie’s');
    expect(normalizeJournalTitle('ARTnews.com and the market', { siteName: 'ARTnews.com' })).toBe(
      'ARTnews.com and the market'
    );
  });

  it('removes service suffixes and dangling separators', () => {
    expect(normalizeJournalTitle('A note about archives — Read more')).toBe(
      'A note about archives'
    );
    expect(normalizeJournalTitle('A note about archives |')).toBe('A note about archives');
  });

  it('removes stacked source, author and Flow decoration in one pass', () => {
    expect(
      normalizeJournalTitle(
        'A story about archives | ARTnews.com | Anton Merkurov «| Flow - 13 November 2026»',
        { siteName: 'ARTnews.com' }
      )
    ).toBe('A story about archives');
  });

  it('keeps the real story text intact', () => {
    const title = 'Виртуальный Меркуров: интервью без имени сайта';
    expect(normalizeJournalTitle(title)).toBe(title);
    expect(normalizeJournalTitle('')).toBe('');
  });
});

describe('Journal format selection', () => {
  const items: JournalMaterial[] = [
    material({
      id: 'lead',
      kind: 'article',
      title: 'Lead article',
      isLead: true,
    }),
    material({
      id: 'post-2',
      kind: 'note',
      title: 'Second post',
      url: 'https://www.merkurov.love/flow/post-2',
    }),
    material({
      id: 'link-1',
      kind: 'link',
      title: 'A link',
      url: 'https://example.com/link',
    }),
    material({
      id: 'video-1',
      kind: 'video',
      title: 'A video',
      url: 'https://www.youtube.com/watch?v=abc',
    }),
    material({
      id: 'photo-1',
      kind: 'photo',
      title: 'A photo',
      url: 'https://www.merkurov.love/flow/photo-1',
    }),
    material({
      id: 'link-2',
      kind: 'link',
      title: 'Another link',
      url: 'https://example.com/other',
    }),
  ];

  it('maps text materials to post and keeps native media formats', () => {
    expect(journalFormat('note')).toBe('post');
    expect(journalFormat('article')).toBe('post');
    expect(journalFormat('photo')).toBe('photo');
    expect(journalFormat('video')).toBe('video');
    expect(journalFormat('link')).toBe('link');
  });

  it('picks one main and at most one material per format', () => {
    const { main, supporting } = selectJournalHighlights(items);

    expect(main?.id).toBe('lead');
    expect(supporting).toHaveLength(4);
    expect(supporting.map((item) => item.id)).toEqual(['post-2', 'photo-1', 'video-1', 'link-1']);
    expect(supporting.map((item) => journalFormat(item.kind))).toEqual([
      'post',
      'photo',
      'video',
      'link',
    ]);
  });

  it('never repeats the main material in the supporting set', () => {
    const duplicated = [
      items[0],
      { ...items[1], id: 'lead-copy', title: items[0].title, url: items[0].url },
      ...items.slice(1),
    ];

    const { main, supporting } = selectJournalHighlights(duplicated);

    expect(main?.id).toBe('lead');
    expect(supporting.some((item) => item.id === 'lead' || item.id === 'lead-copy')).toBe(false);
    expect(supporting.filter((item) => item.title === 'Lead article')).toHaveLength(0);
  });

  it('skips formats that are not present instead of inventing cards', () => {
    const { main, supporting } = selectJournalHighlights([items[0], items[1], items[4]]);

    expect(main?.id).toBe('lead');
    expect(supporting.map((item) => item.id)).toEqual(['post-2', 'photo-1']);
  });

  it('never returns more than the requested four supporting materials', () => {
    const { supporting } = selectJournalHighlights(items, 4);
    expect(supporting).toHaveLength(4);
  });

  it('returns an empty selection for an issue without materials', () => {
    expect(selectJournalHighlights([])).toEqual({ main: null, supporting: [] });
  });
});
