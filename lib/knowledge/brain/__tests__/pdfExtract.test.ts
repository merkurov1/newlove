/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { buildPdfArticle } from '../pdfExtract';
import { BrainSourceError, validatePdfBuffer } from '../sourceValidation';
import { sha256Hex } from '../sourceValidation';

const sourceSha = sha256Hex('pdf-source');

function page(num: number, text: string) {
  return { num, text };
}

describe('PDF extraction', () => {
  it('preserves page numbering, skips empty pages and removes repeated footers', () => {
    const document = buildPdfArticle({
      totalPages: 4,
      sourceSha256: sourceSha,
      pages: [
        page(1, 'Annual Report\n\nIntro paragraph on page one.'),
        page(2, 'Section Two\n\nA second page with useful text.'),
        page(3, '-- 1 of 4 --\n\n   \n'),
        page(4, 'Final page with the conclusion.\n\n-- 1 of 4 --'),
      ],
    });

    expect(document.sourceType).toBe('pdf');
    expect(document.diagnostics.file).toMatchObject({
      format: 'pdf',
      pageCount: 4,
      usablePageCount: 3,
      skippedPages: [3],
    });
    expect(document.blocks.filter((block) => block.type === 'heading')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Page 1', page: 1 }),
        expect.objectContaining({ text: 'Page 2', page: 2 }),
        expect.objectContaining({ text: 'Page 4', page: 4 }),
      ])
    );
    expect(document.text).not.toContain('-- 1 of 4 --');
    expect(document.status).toBe('complete');
  });

  it('reports OCR instead of pretending a scanned PDF was extracted', () => {
    expect(() =>
      buildPdfArticle({
        totalPages: 3,
        sourceSha256: sourceSha,
        pages: [page(1, '  '), page(2, '1'), page(3, '\n\n')],
      })
    ).toThrow(BrainSourceError);

    try {
      buildPdfArticle({
        totalPages: 2,
        sourceSha256: sourceSha,
        pages: [page(1, ''), page(2, '')],
      });
    } catch (error) {
      expect((error as BrainSourceError).code).toBe('pdf_ocr_required');
    }
  });

  it('rejects a file without a PDF signature', () => {
    expect(() => validatePdfBuffer(Buffer.from('not a pdf'))).toThrow(BrainSourceError);

    try {
      validatePdfBuffer(Buffer.from('not a pdf'));
    } catch (error) {
      expect((error as BrainSourceError).code).toBe('pdf_signature_invalid');
    }
  });
});
