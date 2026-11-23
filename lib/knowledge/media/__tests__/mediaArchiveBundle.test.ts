/** @jest-environment node */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

const RECORD_ID = '775e8169-a02e-4b64-b3f8-e3722a48c28f';
const BUNDLE_DIR = path.join('data', 'media-archive', RECORD_ID);
const PDF_PATH = path.join(BUNDLE_DIR, 'Pilot.pdf');
const TEXT_PATH = path.join(BUNDLE_DIR, 'yarmarka-intellekta.txt');
const MANIFEST_PATH = path.join(BUNDLE_DIR, 'manifest.json');

const pdf = fs.readFileSync(path.resolve(PDF_PATH));
const text = fs.readFileSync(path.resolve(TEXT_PATH), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.resolve(MANIFEST_PATH), 'utf8')) as {
  source: { bytes: number; sha256: string; pageCount: number; unchanged: boolean };
  article: {
    pdfPage: number;
    printPage: number;
    spreadPages?: number[];
    signedByline: string;
    bytes: number;
    characters: number;
    words: number;
    bodyParagraphs: number;
    textBlocks: number;
    sha256: string;
    contentHash: string;
    textFile: string;
  };
  storage: { originalPdfPath: string; cleanedTextPath: string };
  recordUpdate: {
    source_path: string;
    source_sha256: string;
    content_hash: string;
    extraction_diagnostics: {
      ocrReviewed: boolean;
      paragraphCount: number;
      originalPdf: { articlePages: number[]; articleSpreadPages?: number[] };
    };
  };
};

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('media archive bundle 775e8169', () => {
  it('keeps the manifest in sync with the archived files', () => {
    const textBytes = Buffer.from(text, 'utf8');

    expect(manifest.source.bytes).toBe(pdf.length);
    expect(manifest.source.sha256).toBe(sha256(pdf));
    expect(manifest.source.pageCount).toBe(16);
    expect(manifest.source.unchanged).toBe(true);

    expect(manifest.article.textFile).toBe('yarmarka-intellekta.txt');
    expect(manifest.article.bytes).toBe(textBytes.length);
    expect(manifest.article.sha256).toBe(sha256(textBytes));
    expect(manifest.article.contentHash).toBe(
      createHash('sha256').update(text.trim(), 'utf8').digest('hex')
    );
    expect(manifest.article.characters).toBe(text.trim().length);
    expect(manifest.article.words).toBe((text.match(/[\p{L}\p{N}]+/gu) || []).length);
    expect(manifest.article.pdfPage).toBe(3);
    expect(manifest.article.printPage).toBe(3);
    expect(manifest.article.spreadPages).toEqual([2, 3]);
    expect(manifest.article.signedByline).toBe('Антон (Палыч) МЕРКУРОВ');
    expect(manifest.storage.originalPdfPath).toBe(
      `brain-sources/${manifest.source.sha256.slice(0, 2)}/${manifest.source.sha256}.pdf`
    );
    expect(manifest.storage.cleanedTextPath).toBe(
      `brain-sources/${manifest.article.sha256.slice(0, 2)}/${manifest.article.sha256}.txt`
    );
  });

  it('records the same source path and hashes that the importer plans to write', () => {
    expect(manifest.recordUpdate.source_path).toBe(manifest.storage.cleanedTextPath);
    expect(manifest.recordUpdate.source_sha256).toBe(manifest.article.sha256);
    expect(manifest.recordUpdate.content_hash).toBe(manifest.article.contentHash);
    expect(manifest.recordUpdate.extraction_diagnostics.ocrReviewed).toBe(true);
    expect(manifest.recordUpdate.extraction_diagnostics.paragraphCount).toBe(
      manifest.article.bodyParagraphs
    );
    expect(manifest.recordUpdate.extraction_diagnostics.originalPdf.articlePages).toEqual([3]);
    expect(manifest.recordUpdate.extraction_diagnostics.originalPdf.articleSpreadPages).toEqual([
      2, 3,
    ]);
  });
});
