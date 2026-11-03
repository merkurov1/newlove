import {
  buildSelectionContent,
  buildSelectionSpecs,
  mergeSelectionContent,
  selectionArticleSnapshot,
  slugifyArtwork,
} from '../selection';
import type { NormalizedExtraction } from '../types';

const extraction: NormalizedExtraction = {
  title: 'Nymphéas',
  artist: 'Claude Monet',
  artistDates: '1840–1926',
  auctionHouse: "Sotheby's",
  year: 1907,
  medium: 'oil on canvas',
  dimensions: '92 x 73.6 cm',
  signature: 'signed',
  description: null,
  lotEssay: null,
  catalogueNote: null,
  conditionReport: null,
  conditionReportStatus: 'unknown',
  provenance: ['Private collection, Paris'],
  exhibitions: ['Paris, 1908'],
  literature: ['Catalogue raisonné'],
  lotNumber: '12',
  auctionDate: '2026-11-12',
  estimate: { raw: '£4,000,000 – 6,000,000', currency: 'GBP' },
  price: null,
  currency: 'GBP',
};

describe('Selection publication helpers', () => {
  it('builds a stable, readable slug', () => {
    expect(slugifyArtwork('Claude Monet', 'Nymphéas', 1907)).toBe(
      'claude-monet-nympheas-1907',
    );
  });

  it('builds Selection specs from confirmed fields only', () => {
    const specs = buildSelectionSpecs(extraction);

    expect(specs).toContain('**Details:**');
    expect(specs).toContain('Medium: oil on canvas');
    expect(specs).toContain('Dimensions: 92 x 73.6 cm');
    expect(specs).toContain('Provenance:');
    expect(specs).toContain('Exhibited:');
    expect(specs).toContain('Literature:');
    expect(specs).toContain('Private collection, Paris');
    expect(specs).not.toContain('Price realized');
  });

  it('builds the existing Selection image block', () => {
    const content = buildSelectionContent('https://images.example.com/work.jpg');
    const blocks = JSON.parse(content);

    expect(blocks[0].type).toBe('image');
    expect(blocks[0].data.file.url).toBe('https://images.example.com/work.jpg');
  });

  it('updates the lead image without deleting existing editorial blocks', () => {
    const existing = JSON.stringify([
      { type: 'image', data: { file: { url: 'https://old.example.com/a.jpg' } } },
      { type: 'paragraph', data: { text: 'Existing editorial block' } },
    ]);

    const merged = JSON.parse(
      mergeSelectionContent(existing, 'https://new.example.com/b.jpg'),
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].data.file.url).toBe('https://new.example.com/b.jpg');
    expect(merged[1].data.text).toBe('Existing editorial block');
  });

  it('keeps an article snapshot for publication history', () => {
    const snapshot = selectionArticleSnapshot({
      id: 'article-1',
      title: 'Nymphéas',
      slug: 'claude-monet-nympheas-1907',
      artist: 'Claude Monet',
      curatorNote: 'Essay',
      content: '[]',
      published: true,
    });

    expect(snapshot.id).toBe('article-1');
    expect(snapshot.slug).toBe('claude-monet-nympheas-1907');
    expect(snapshot.artist).toBe('Claude Monet');
  });
});

describe('Selection publication readiness', () => {
  it('reports the exact missing data before publication', () => {
    const { missingForPublication } = require('../extraction');

    expect(
      missingForPublication({
        extraction: {
          ...extraction,
          artist: '',
          title: '',
        },
        essay: null,
        imageUrl: null,
      }),
    ).toEqual(['artist', 'title', 'image', 'essay']);

    expect(
      missingForPublication({
        extraction,
        essay: 'A real essay',
        imageUrl: 'https://images.example.com/work.jpg',
      }),
    ).toEqual([]);
  });
});
