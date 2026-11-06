import type { MediaRecord } from '@/data/media';
import {
  isMediaReprint,
  originalMediaRelation,
  reprintMediaRelations,
} from '@/lib/mediaClassification';

function record(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    slug: 'record',
    title: 'Record',
    outlet: 'Outlet',
    url: 'https://example.com/record',
    date: '2026-10-14',
    lang: 'EN',
    topic: 'Internet & Censorship',
    kind: 'mention',
    summary: '',
    ...overrides,
  };
}

describe('media reprint classification', () => {
  const original = record({
    slug: 'le-monde-original',
    title: 'Original article',
    outlet: 'Le Monde',
    related: [
      {
        slug: 'le-temps-reprint',
        title: 'Reprinted article',
        outlet: 'Le Temps',
        url: 'https://example.com/reprint',
        date: '2026-10-14',
        relationType: 'reprint',
        confidence: 1,
        role: 'reprint',
      },
    ],
  });

  const reprint = record({
    slug: 'le-temps-reprint',
    title: 'Reprinted article',
    outlet: 'Le Temps',
    related: [
      {
        slug: 'le-monde-original',
        title: 'Original article',
        outlet: 'Le Monde',
        url: 'https://example.com/original',
        date: '2026-10-13',
        relationType: 'reprint',
        confidence: 1,
        role: 'original',
      },
    ],
  });

  it('recognises a record as a reprint only when it points at an original', () => {
    expect(isMediaReprint(reprint)).toBe(true);
    expect(isMediaReprint(original)).toBe(false);
  });

  it('exposes the original source and the reprints separately', () => {
    expect(originalMediaRelation(reprint)?.outlet).toBe('Le Monde');
    expect(originalMediaRelation(original)).toBeUndefined();
    expect(reprintMediaRelations(original).map((item) => item.outlet)).toEqual(['Le Temps']);
    expect(reprintMediaRelations(reprint)).toEqual([]);
  });
});
