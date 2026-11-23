/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import type { MediaArchiveRecord } from '@/lib/knowledge/brain/store';
import { planMediaArchiveTextSource } from '../archiveTextImport';

const RECORD_ID = '775e8169-a02e-4b64-b3f8-e3722a48c28f';
const BUNDLE_DIR = path.join('data', 'media-archive', RECORD_ID);
const PDF_PATH = path.join(BUNDLE_DIR, 'Pilot.pdf');
const TEXT_PATH = path.join(BUNDLE_DIR, 'yarmarka-intellekta.txt');
const SOURCE_URL = 'https://www.expertiza.org/MAYDAYCO/CDPRO/Pilot.pdf';

const pdf = fs.readFileSync(path.resolve(PDF_PATH));
const text = fs.readFileSync(path.resolve(TEXT_PATH), 'utf8');

const record: MediaArchiveRecord = {
  id: RECORD_ID,
  url: SOURCE_URL,
  canonical_url: SOURCE_URL,
  title: 'Ярмарка интеллекта',
  outlet: 'CDпро.ru',
  author: null,
  source_format: 'url',
  content_hash: null,
  source_path: SOURCE_URL,
  source_sha256: null,
  published_date: '2001-12-10',
  lang: 'RU',
  kind: 'column',
  topic: 'Art & Culture',
  summary: '',
  image_url: null,
  status: 'published',
  ai_metadata: { reviewed: true, import_pending: false },
  updated_at: '2026-11-23T00:00:00.000Z',
};

function plan() {
  return planMediaArchiveTextSource({
    record,
    pdf,
    text,
    pdfFilename: 'Pilot.pdf',
    textFilename: 'yarmarka-intellekta.txt',
    pdfPageCount: 16,
    articlePageNumbers: [3],
    articleSpreadPages: [2, 3],
    issue: {
      publication: 'CDпро.ru',
      number: 27,
      year: 2001,
      publishedAt: '2001-12-10',
      sourceUrl: SOURCE_URL,
    },
    authorFallback: 'Антон (Палыч) Меркуров',
    ocrReviewNote: 'Verified proofread OCR.',
    now: new Date('2026-11-23T12:00:00.000Z'),
  });
}

describe('planMediaArchiveTextSource', () => {
  it('archives the unchanged PDF and indexes the proofread text', () => {
    const result = plan();

    expect(result.pdf.sourceSha256).toBe(
      'b86b1dc5e4ef6f48c3563d0293e77873a0bcf9500803f3cddd8a12c41c041acf'
    );
    expect(result.text.sourceSha256).toBe(
      '59141b0aa36b37938dc677013371f239402f39da2c6f21a09b455d89e46460a3'
    );
    expect(result.pdf.sourcePath).toBe(
      `brain-sources/${result.pdf.sourceSha256.slice(0, 2)}/${result.pdf.sourceSha256}.pdf`
    );
    expect(result.text.sourcePath).toBe(
      `brain-sources/${result.text.sourceSha256.slice(0, 2)}/${result.text.sourceSha256}.txt`
    );
    expect(result.patch.source_format).toBe('text');
    expect(result.patch.source_path).toBe(result.text.sourcePath);
    expect(result.patch.source_sha256).toBe(result.text.sourceSha256);
    expect(result.patch.content_hash).toBe(result.text.contentHash);
    expect(result.job.storagePath).toBe(result.text.sourcePath);
    expect(result.job.sourceFormat).toBe('text');
    expect(result.job.inputUrl).toBe(SOURCE_URL);
    expect(result.job.normalizedUrl).toBe(SOURCE_URL);
  });

  it('records article provenance, OCR review and compact diagnostics', () => {
    const result = plan();
    const diagnostics = result.diagnostics as {
      ocrReviewed: boolean;
      paragraphCount: number;
      pageCount: number;
      originalPdf: {
        sourcePath: string;
        sourceSha256: string;
        pageCount: number;
        articlePages: number[];
        articleSpreadPages: number[];
      };
      issue: { publication: string; number: string; year: string; publishedAt: string };
    };

    expect(diagnostics.ocrReviewed).toBe(true);
    expect(diagnostics.pageCount).toBe(16);
    expect(diagnostics.paragraphCount).toBeGreaterThan(25);
    expect(diagnostics.originalPdf.sourcePath).toBe(result.pdf.sourcePath);
    expect(diagnostics.originalPdf.sourceSha256).toBe(result.pdf.sourceSha256);
    expect(diagnostics.originalPdf.pageCount).toBe(16);
    expect(diagnostics.originalPdf.articlePages).toEqual([3]);
    expect(diagnostics.originalPdf.articleSpreadPages).toEqual([2, 3]);
    expect(diagnostics.issue).toMatchObject({
      publication: 'CDпро.ru',
      number: '27',
      year: '2001',
      publishedAt: '2001-12-10',
    });
    expect(result.diagnosticsBytes).toBeLessThanOrEqual(8_000);
    expect(result.text.quality).toBe('full_text');
    expect(result.text.chunkCount).toBeGreaterThan(0);
    expect(result.text.wordCount).toBeGreaterThan(900);
    expect(result.text.paragraphCount).toBeGreaterThan(25);
  });

  it('keeps the byline and removes OCR line-break artefacts', () => {
    expect(text).toContain('Антон (Палыч) МЕРКУРОВ');
    expect(text).toContain('«non/fictio№3»');
    expect(text).toContain('CD-ROM');
    expect(text).toContain('интеллектуальной литературы');
    expect(text).not.toMatch(/[\u0019\u0008\u0010]/);
    expect(text).not.toContain('компакт,диск');
    expect(text).not.toContain('28ноября');
  });

  it('is deterministic and updates the existing record without inserting', () => {
    const first = plan();
    const second = plan();

    expect(second).toEqual(first);
    expect(first.recordId).toBe(RECORD_ID);
    expect(first.patch.author).toBe('Антон (Палыч) Меркуров');
    expect(first.patch.indexing_status).toBe('pending');
    expect(first.patch.indexing_error).toBeNull();
  });

  it('rejects a file that is not a PDF', () => {
    expect(() =>
      planMediaArchiveTextSource({
        record,
        pdf: Buffer.from('not a pdf'),
        text,
      })
    ).toThrow(/pdf_signature_invalid/);
  });
});
