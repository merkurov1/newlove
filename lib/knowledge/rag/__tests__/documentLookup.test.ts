/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { normalizeDocumentTitle, rankTitleCandidates } from '../documentLookup';

const candidates = [
  {
    id: 'doc_weekly',
    title: 'Anton Merkurov — Weekly Review',
  },
  {
    id: 'doc_weeknote',
    title: 'Weekly notes about the archive',
  },
  {
    id: 'doc_other',
    title: 'A completely different document',
  },
];

describe('Brain document title lookup', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeDocumentTitle('Anton Merkurov — Weekly Review')).toBe(
      'anton merkurov weekly review'
    );
  });

  it('ranks an exact title first', () => {
    const ranked = rankTitleCandidates(candidates, 'Anton Merkurov — Weekly Review');

    expect(ranked[0]?.id).toBe('doc_weekly');
    expect(ranked[0]?.match).toBe('exact');
  });

  it('finds a partial title without embeddings', () => {
    const ranked = rankTitleCandidates(candidates, 'Weekly Review');

    expect(ranked[0]?.id).toBe('doc_weekly');
    expect(ranked[0]?.match).toBe('partial');
  });

  it('returns nothing for a title that does not match', () => {
    expect(rankTitleCandidates(candidates, 'Quarterly budget')).toEqual([]);
  });

  it('surfaces both weekly titles for a single distinctive token', () => {
    const ranked = rankTitleCandidates(candidates, 'Weekly');
    expect(ranked.map((candidate) => candidate.id)).toEqual(['doc_weeknote', 'doc_weekly']);
  });
});
