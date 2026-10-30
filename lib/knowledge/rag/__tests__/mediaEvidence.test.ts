/** @jest-environment node */

import {
  buildMediaEvidencePrompt,
  buildMediaEvidenceSources,
  type MediaEvidenceResult,
} from '../mediaEvidence';

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
});
