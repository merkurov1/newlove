/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

import { chunkArticle } from '@/lib/knowledge/brain/chunk';
import { extractArticle, type ExtractedArticle } from '@/lib/knowledge/brain/extract';
import { sha256Hex } from '@/lib/knowledge/brain/sourceValidation';
import type { BrainStorage } from '@/lib/knowledge/brain/storage';
import type { BrainStore } from '@/lib/knowledge/brain/store';
import { BrainUrlError } from '@/lib/knowledge/brain/url';
import { fallbackMediaClassification } from '../classify';
import { evaluateMediaTextQuality } from '../quality';
import { buildPdfArticle } from '@/lib/knowledge/brain/pdfExtract';
import { previewMediaSource, type MediaPreviewDeps } from '../sourcePreview';
import type { MediaPageExtraction } from '../page';

const WAPO_URL =
  'https://www.washingtonpost.com/world/2026/10/29/ukrainian-attacks-are-threatening-putin-ai-aspirations/';

const longText =
  'Ukrainian attacks are threatening Putin AI aspirations. '.repeat(30) +
  'This is a long-form article body used for a deterministic preview test. '.repeat(20);

function pageFixture(): MediaPageExtraction {
  const html = `<html><head><title>Ukrainian attacks and Putin AI aspirations</title>
    <link rel="canonical" href="${WAPO_URL}" />
    <meta name="description" content="A report about Ukrainian attacks and Russian AI ambitions." />
    </head><body><article><h1>Ukrainian attacks and Putin AI aspirations</h1>
    <p>${longText}</p><p>${longText}</p></article></body></html>`;
  const article = extractArticle(html, WAPO_URL);
  article.author = 'Washington Post staff';
  article.diagnostics.paywallDetected = false;
  article.diagnostics.truncated = false;
  const quality = evaluateMediaTextQuality(article);

  return {
    html,
    article,
    quality,
    chunking: chunkArticle(article, 'doc_media_preview', { sourceType: 'media_coverage' }),
    metadata: {
      url: WAPO_URL,
      canonical_url: WAPO_URL,
      title: 'Ukrainian attacks and Putin AI aspirations',
      outlet: 'washingtonpost.com',
      summary: 'A report about Ukrainian attacks and Russian AI ambitions.',
      image_url: null,
      published_date: '2026-10-29',
    },
    fetchedBytes: html.length,
    finalUrl: WAPO_URL,
    contentType: 'text/html',
  };
}

function fakeStore(input: { duplicate?: boolean } = {}): BrainStore {
  return {
    findMediaRecordByUrl: jest.fn(async () =>
      input.duplicate
        ? {
            id: 'media-existing',
            url: WAPO_URL,
            canonical_url: WAPO_URL,
            title: 'Existing Washington Post record',
            outlet: 'washingtonpost.com',
            published_date: '2026-10-29',
            lang: 'EN',
            kind: 'mention',
            topic: 'AI & Tech',
            summary: 'Existing summary',
            image_url: null,
            status: 'published',
            ai_metadata: {},
            updated_at: new Date().toISOString(),
          }
        : null
    ),
    findMediaCoverageDocument: jest.fn(async () =>
      input.duplicate
        ? {
            documentId: 'doc_media_existing',
            title: 'Existing Washington Post record',
            match: 'media_record_id',
            ingestionStatus: 'completed',
            contentHash: 'a'.repeat(64),
            canonicalUrl: WAPO_URL,
            normalizedUrl: WAPO_URL,
            chunkCount: 4,
            sourceType: 'media_coverage',
            mediaRecordId: 'media-existing',
            extractionStatus: 'complete',
            processedAt: new Date().toISOString(),
            sourceCharCount: 2000,
            coverageStatus: 'completed',
            coverageMethod: 'url',
            textQuality: 'full_text',
            language: 'en',
          }
        : null
    ),
  } as unknown as BrainStore;
}

function fakeStorage(): BrainStorage {
  return {
    storeSourceBuffer: jest.fn(
      async (buffer: Buffer, format: 'pdf' | 'txt' | 'html') => {
        const sha = sha256Hex(buffer);
        return {
          sourcePath: `brain-sources/${sha.slice(0, 2)}/${sha}.${format}`,
          sourceSha256: sha,
          byteSize: buffer.length,
        };
      }
    ),
    promoteIncomingSource: jest.fn(),
  } as unknown as BrainStorage;
}

function deps(
  extractPage: MediaPreviewDeps['extractPage'],
  options: { duplicate?: boolean } = {}
) {
  return {
    store: fakeStore(options),
    storage: fakeStorage(),
    extractPage,
    classify: jest.fn(async () => fallbackMediaClassification('en')),
  } as MediaPreviewDeps;
}


function metadataOnlyPageFixture(): MediaPageExtraction {
  const shortText = 'Washington Post subscriber preview. '.repeat(20);
  const html = `<html><head><title>These data centers hold Putin's AI aspirations</title>
    <link rel="canonical" href="${WAPO_URL}" />
    <meta name="description" content="A subscriber preview." />
    </head><body><article><h1>These data centers hold Putin's AI aspirations</h1>
    <p>${shortText}</p></article></body></html>`;
  const article = extractArticle(html, WAPO_URL);
  article.diagnostics.paywallDetected = false;
  article.diagnostics.truncated = false;
  const quality = evaluateMediaTextQuality(article);

  return {
    html,
    article,
    quality,
    chunking: chunkArticle(article, 'doc_media_preview', { sourceType: 'media_coverage' }),
    metadata: {
      url: WAPO_URL,
      canonical_url: WAPO_URL.replace(/\/$/, ''),
      title: "These data centers hold Putin's AI aspirations",
      outlet: 'The Washington Post',
      summary: 'A subscriber preview.',
      image_url: null,
      published_date: '2026-10-29',
    },
    fetchedBytes: 1_746_230,
    finalUrl: WAPO_URL,
    contentType: 'text/html',
  };
}

describe('Media Archive source preview', () => {
  it('handles the Washington Post URL as blocked when the page is too large', async () => {
    const result = await previewMediaSource(
      { kind: 'url', url: WAPO_URL },
      deps(async () => {
        throw new BrainUrlError('response_too_large');
      })
    );

    expect(result.record.url).toBe(WAPO_URL);
    expect(result.record.canonical_url).toBe(WAPO_URL.replace(/\/$/, ''));
    expect(result.record.outlet).toBe('washingtonpost.com');
    expect(result.extraction.quality).toBe('blocked');
    expect(result.extraction.errorCode).toBe('response_too_large');
    expect(result.source).toBeNull();
  });

  it('shows the real Washington Post subscriber/metadata-only preview without calling it full text', async () => {
    const result = await previewMediaSource(
      { kind: 'url', url: WAPO_URL },
      deps(async () => metadataOnlyPageFixture())
    );

    expect(result.record.url).toBe(WAPO_URL);
    expect(result.record.title).toContain('data centers');
    expect(result.record.outlet).toBe('The Washington Post');
    expect(result.record.published_date).toBe('2026-10-29');
    expect(result.extraction.quality).toBe('metadata_only');
    expect(result.extraction.coverageStatus).toBe('failed');
    expect(result.extraction.charCount).toBeGreaterThan(0);
    expect(result.extraction.wordCount).toBeLessThan(120);
    expect(result.extraction.chunkCount).toBeGreaterThan(0);
    expect(result.source).not.toBeNull();
  });

  it.each([
    ['http_status_403', 'blocked'],
    ['http_status_402', 'blocked'],
  ])('handles %s without claiming full text', async (errorCode, quality) => {
    const result = await previewMediaSource(
      { kind: 'url', url: WAPO_URL },
      deps(async () => {
        throw new BrainUrlError(errorCode);
      })
    );

    expect(result.extraction.quality).toBe(quality);
    expect(result.extraction.errorCode).toBe(errorCode);
    expect(result.extraction.charCount).toBe(0);
    expect(result.extraction.chunkCount).toBe(0);
  });

  it('keeps paywall warning and does not treat preview as full text', async () => {
    const page = pageFixture();
    page.article.diagnostics.paywallDetected = true;
    page.quality = evaluateMediaTextQuality(page.article);

    const result = await previewMediaSource({ kind: 'url', url: WAPO_URL }, deps(async () => page));

    expect(result.extraction.paywallDetected).toBe(true);
    expect(result.extraction.quality).toBe('partial_text');
    expect(result.extraction.coverageStatus).toBe('partial');
    expect(result.source).not.toBeNull();
  });

  it('marks truncated extraction as partial', async () => {
    const page = pageFixture();
    page.article.diagnostics.truncated = true;
    page.quality = evaluateMediaTextQuality(page.article);

    const result = await previewMediaSource({ kind: 'url', url: WAPO_URL }, deps(async () => page));

    expect(result.extraction.truncated).toBe(true);
    expect(result.extraction.quality).toBe('partial_text');
    expect(result.extraction.coverageStatus).toBe('partial');
  });

  it('supports manual full text and preserves the original URL', async () => {
    const result = await previewMediaSource(
      { kind: 'text', url: WAPO_URL, text: `# Manual copy\n\n${longText}` },
      deps(async () => pageFixture())
    );

    expect(result.record.url).toBe(WAPO_URL);
    expect(result.source?.format).toBe('text');
    expect(result.source?.storagePath).toMatch(/\.txt$/);
    expect(result.extraction.chunkCount).toBeGreaterThan(0);
    expect(result.extraction.sourceFormat).toBe('text');
  });

  it('supports a PDF source and records page provenance', async () => {
    const buffer = Buffer.from('%PDF-1.4 test', 'utf8');
    const sourceSha256 = sha256Hex(buffer);
    const pdfArticle = buildPdfArticle({
      totalPages: 1,
      sourceSha256,
      pages: [{ num: 1, text: `# PDF copy\n\n${longText}` }],
    });
    const storage = {
      promoteIncomingSource: jest.fn(async () => ({
        sourcePath: `brain-sources/${sourceSha256.slice(0, 2)}/${sourceSha256}.pdf`,
        sourceSha256,
        byteSize: buffer.length,
        buffer,
      })),
      storeSourceBuffer: jest.fn(),
    } as unknown as BrainStorage;

    const result = await previewMediaSource(
      {
        kind: 'pdf',
        url: WAPO_URL,
        storagePath: 'incoming/test.pdf',
        sourceSha256,
        originalFilename: 'publication.pdf',
        mimeType: 'application/pdf',
      },
      {
        store: fakeStore(),
        storage,
        extractPage: async () => {
          throw new Error('PDF preview must not fetch the publication page');
        },
        extractPdf: jest.fn(async () => pdfArticle),
        classify: jest.fn(async () => fallbackMediaClassification('en')),
      }
    );

    expect(result.source?.format).toBe('pdf');
    expect(result.source?.pageCount).toBe(1);
    expect(result.extraction.pageCount).toBe(1);
    expect(result.extraction.chunkCount).toBeGreaterThan(0);
    expect(result.record.url).toBe(WAPO_URL);
  });

  it('supports a TXT source without fetching the publication page', async () => {
    const text = `# TXT copy\n\n${longText}`;
    const buffer = Buffer.from(text, 'utf8');
    const sourceSha256 = sha256Hex(buffer);
    const storage = {
      promoteIncomingSource: jest.fn(async () => ({
        sourcePath: `brain-sources/${sourceSha256.slice(0, 2)}/${sourceSha256}.txt`,
        sourceSha256,
        byteSize: buffer.length,
        buffer,
      })),
      storeSourceBuffer: jest.fn(),
    } as unknown as BrainStorage;

    const result = await previewMediaSource(
      {
        kind: 'txt',
        url: WAPO_URL,
        storagePath: 'incoming/test.txt',
        sourceSha256,
      },
      {
        store: fakeStore(),
        storage,
        extractPage: async () => {
          throw new Error('TXT preview must not fetch the publication page');
        },
        classify: jest.fn(async () => fallbackMediaClassification('en')),
      }
    );

    expect(result.source?.format).toBe('txt');
    expect(result.source?.storagePath).toMatch(/\.txt$/);
    expect(result.extraction.chunkCount).toBeGreaterThan(0);
    expect(result.record.url).toBe(WAPO_URL);
  });

  it('returns the existing record and coverage status instead of proposing a duplicate', async () => {
    const result = await previewMediaSource(
      { kind: 'url', url: WAPO_URL },
      deps(async () => pageFixture(), { duplicate: true })
    );

    expect(result.duplicate?.id).toBe('media-existing');
    expect(result.duplicate?.coverage?.documentId).toBe('doc_media_existing');
    expect(result.duplicate?.coverage?.coverageStatus).toBe('completed');
  });
});
