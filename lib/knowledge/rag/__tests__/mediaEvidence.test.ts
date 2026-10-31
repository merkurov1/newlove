/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MediaEvidenceResult } from '../mediaEvidence';

jest.mock('@/lib/mediaRecords', () => ({
  getMediaRecords: jest.fn(),
}));

jest.mock('@/lib/knowledge/media/search', () => ({
  searchMediaIntelligence: jest.fn(),
}));

const {
  buildMediaEvidencePrompt,
  buildMediaEvidenceSources,
  retrieveMediaEvidence,
} = require('../mediaEvidence') as typeof import('../mediaEvidence');

const mediaRecords = require('@/lib/mediaRecords') as {
  getMediaRecords: {
    mockResolvedValue: (value: unknown) => void;
    mock: { calls: unknown[][] };
  };
};
const mediaSearch = require('@/lib/knowledge/media/search') as {
  searchMediaIntelligence: {
    mockResolvedValue: (value: unknown) => void;
    mock: { calls: unknown[][] };
  };
};

const records = [
  {
    id: 'media-old',
    slug: 'old',
    title: 'Older interview',
    outlet: 'Le Monde',
    url: 'https://example.com/old',
    date: '2026-09-01',
    lang: 'FR',
    kind: 'interview',
    topic: 'Internet & Censorship',
    summary: 'An interview about digital control.',
  },
  {
    id: 'media-new',
    slug: 'new',
    title: 'Latest press mention',
    outlet: 'Новая газета',
    url: 'https://example.com/new',
    date: '2026-10-24',
    lang: 'RU',
    kind: 'mention',
    topic: 'Internet & Censorship',
    summary: 'A recent mention of Anton Merkurov.',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mediaRecords.getMediaRecords.mockResolvedValue(records);
  mediaSearch.searchMediaIntelligence.mockResolvedValue({
    results: [],
    summary: '',
    facts: [],
    interpretation: [],
    insufficient: true,
    count: 0,
  });
});

const result: MediaEvidenceResult = {
  outcome: 'relevant_results',
  hits: [
    {
      mediaRecordId: 'media-1',
      documentId: 'doc-1',
      chunkId: 'chk-1',
      title: 'Digital control',
      outlet: 'Le Monde',
      date: '2026-10-13',
      language: 'fr',
      canonicalUrl: 'https://example.com/article',
      topic: 'Internet & Censorship',
      textQuality: 'full_text',
      excerpt: 'Anton Merkurov said that hardware control is the next frontier.',
      quotes: [
        {
          id: 'mq_1',
          text: 'Hardware control is the next frontier.',
          type: 'direct_quote',
          language: 'fr',
          translation: 'Контроль над железом — следующий рубеж.',
        },
      ],
      verificationStatus: 'verified',
      similarity: 0.82,
      fallback: false,
    },
  ],
};

describe('Pierrot media evidence', () => {
  it('labels verified direct quotes separately from paraphrase and synthesis', () => {
    const prompt = buildMediaEvidencePrompt(result);

    expect(prompt).toContain('verified_direct_quote');
    expect(prompt).toContain('verified_paraphrase');
    expect(prompt).toContain('synthesis');
    expect(prompt).toContain('Never present an unverified candidate as direct speech');
    expect(prompt).toContain('https://example.com/article');
  });

  it('returns insufficient instructions with no hits', () => {
    const prompt = buildMediaEvidencePrompt({ outcome: 'no_match', hits: [] });

    expect(prompt).toContain('MEDIA_EVIDENCE_INSUFFICIENT');
    expect(prompt).toContain('Do not invent');
  });

  it('builds media-only evidence sources with source links and quote status', () => {
    const sources = buildMediaEvidenceSources(result);

    expect(sources[0]).toMatchObject({
      sourceType: 'media_coverage',
      sourceClass: 'media_coverage',
      outlet: 'Le Monde',
      canonicalUrl: 'https://example.com/article',
      quoteType: 'direct_quote',
      verificationStatus: 'verified',
    });
  });

  it('orders latest-coverage questions by date without a semantic call', async () => {
    const response = await retrieveMediaEvidence({
      query: 'Какие последние СМИ меня цитировали?',
      limit: 8,
      ownerAccess: true,
    });

    expect(response.outcome).toBe('relevant_results');
    expect(response.hits.map((hit) => hit.date)).toEqual(['2026-10-24', '2026-09-01']);
    expect(response.hits[0].outlet).toBe('Новая газета');
    expect(mediaSearch.searchMediaIntelligence).not.toHaveBeenCalled();
  });

  it('never sends public media questions through the owner semantic index', async () => {
    await retrieveMediaEvidence({
      query: 'What did the press write about digital control?',
      limit: 8,
      ownerAccess: false,
    });

    expect(mediaSearch.searchMediaIntelligence).not.toHaveBeenCalled();
    expect(mediaRecords.getMediaRecords).toHaveBeenCalled();
  });
});
