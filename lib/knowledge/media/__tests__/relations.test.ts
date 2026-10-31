/** @jest-environment node */

import { deriveMediaRelations, type RelationMedia } from '../relations';

const base: RelationMedia = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Global internet fragmentation and decentralized bypass methods',
  outlet: 'Le Monde',
  publishedDate: '2026-10-13',
  topic: 'Internet & Censorship',
  subtopics: ['network resilience', 'hardware control'],
  contentHash: 'a'.repeat(64),
  quoteHashes: ['q1', 'q2'],
};

function other(overrides: Partial<RelationMedia> = {}): RelationMedia {
  return {
    ...base,
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Internet fragmentation and decentralized bypass methods',
    outlet: 'Le Temps',
    ...overrides,
  };
}

describe('Media relation hypotheses', () => {
  it('detects reprints and syndication without merging records', () => {
    const reprint = deriveMediaRelations(base, [other({ outlet: 'Le Monde' })]);
    const syndication = deriveMediaRelations(base, [other({ outlet: 'Le Temps' })]);

    expect(reprint.some((relation) => relation.relationType === 'reprint')).toBe(true);
    expect(syndication.some((relation) => relation.relationType === 'syndication')).toBe(true);
  });

  it('detects shared quotes and same-story evidence', () => {
    const relations = deriveMediaRelations(base, [
      other({ contentHash: 'b'.repeat(64), quoteHashes: ['q1', 'q2', 'q3'] }),
    ]);

    expect(relations.some((relation) => relation.relationType === 'shared_quote')).toBe(true);
    expect(relations.some((relation) => relation.relationType === 'same_story')).toBe(true);
  });

  it('detects same topic and story continuation', () => {
    const relations = deriveMediaRelations(base, [
      other({
        contentHash: 'c'.repeat(64),
        quoteHashes: [],
        outlet: 'Le Monde',
        title: 'Global internet fragmentation and decentralized bypass methods',
        publishedDate: '2026-10-18',
      }),
    ]);

    expect(relations.some((relation) => relation.relationType === 'same_topic')).toBe(true);
    expect(relations.some((relation) => relation.relationType === 'story_continuation')).toBe(true);
  });

  it('does not create self-relations', () => {
    expect(deriveMediaRelations(base, [base])).toEqual([]);
  });

  it('links interviews and columns on the same topic across outlets', () => {
    const relations = deriveMediaRelations(
      { ...base, kind: 'interview', title: 'Interview about internet control', quoteHashes: [] },
      [
        other({
          kind: 'column',
          outlet: 'Le Temps',
          title: 'Column about internet control',
          contentHash: 'd'.repeat(64),
          quoteHashes: [],
        }),
      ]
    );

    expect(relations.some((relation) => relation.relationType === 'related')).toBe(true);
  });
});
