import type {
  ArticleBlock,
  ArticleExtractionDiagnostics,
  ArticleExtractionStatus,
  ExtractedArticle,
} from './extract';
import {
  BrainSourceError,
  inferDateFromText,
  inferLanguage,
  inferTitleFromText,
  normalizePlainText,
  sha256Hex,
  syntheticSourceUrl,
} from './sourceValidation';
import { buildPlainTextBlocks } from './textExtract';
import { BRAIN_SOURCE_LIMITS } from './sourceTypes';

export const PDF_EXTRACTION_VERSION = 'brain-pdf-extractor-v1';
export const PDF_MAX_TEXT_CHARS = 8_000_000;

export type PdfPageInput = {
  num: number;
  text: string;
};

export type PdfInfoLike = {
  total?: number;
  info?: {
    Title?: unknown;
    Author?: unknown;
    Subject?: unknown;
    CreationDate?: unknown;
    ModDate?: unknown;
  } | null;
  getDateNode?: () =>
    | {
        CreationDate?: Date | null;
        ModDate?: Date | null;
        XmpCreateDate?: Date | null;
        XmpModifyDate?: Date | null;
      }
    | undefined;
};

export type PdfExtractionInput = {
  pages: PdfPageInput[];
  totalPages: number;
  info?: PdfInfoLike | null;
  sourceSha256: string;
  filename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
};

const PAGE_NUMBER_LINE = /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

function textValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lineKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanPageLines(value: string, repeatedLines: Set<string>): string[] {
  return normalizePlainText(value)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !PAGE_NUMBER_LINE.test(line))
    .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line))
    .filter((line) => !repeatedLines.has(lineKey(line)));
}

/**
 * PDF headers/footers are often repeated on every page. They are noise for
 * retrieval, so repeated short lines are removed only when the document has
 * enough pages to make the repetition meaningful.
 */
function repeatedPageLines(pages: PdfPageInput[]): Set<string> {
  const repeated = new Set<string>();
  const usable = pages.filter((page) => page.text.trim().length > 0);

  if (usable.length < 3) return repeated;

  const counts = new Map<string, number>();

  for (const page of usable) {
    const seen = new Set<string>();

    for (const line of normalizePlainText(page.text).split('\n')) {
      const value = line.replace(/\s+/g, ' ').trim();

      if (!value || value.length > 120) continue;

      const key = lineKey(value);

      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.ceil(usable.length * 0.6));

  for (const [line, count] of counts) {
    if (count >= threshold) repeated.add(line);
  }

  return repeated;
}

function pdfDate(info: PdfInfoLike | null | undefined): string | null {
  const dates = info?.getDateNode?.();
  const candidate =
    dates?.CreationDate ||
    dates?.ModDate ||
    dates?.XmpCreateDate ||
    dates?.XmpModifyDate ||
    null;

  if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
    return candidate.toISOString();
  }

  return null;
}

function pdfTitleFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;

  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BRAIN_SOURCE_LIMITS.maxTitleChars);
}

const MIN_PAGE_TEXT_CHARS = 8;

function extractionStatus(charCount: number, blocks: ArticleBlock[]): ArticleExtractionStatus {
  if (charCount === 0 || blocks.length === 0) return 'failed';
  if (charCount < MIN_PAGE_TEXT_CHARS) return 'needs_review';
  return 'complete';
}

export function buildPdfArticle(input: PdfExtractionInput): ExtractedArticle {
  const totalPages = Math.max(0, Math.trunc(input.totalPages || input.pages.length));
  const repeatedLines = repeatedPageLines(input.pages);
  const cleanedPages: Array<{ num: number; text: string; blocks: ArticleBlock[] }> = [];
  const skippedPages: number[] = [];

  for (const page of [...input.pages].sort((left, right) => left.num - right.num)) {
    const text = cleanPageLines(page.text, repeatedLines).join('\n\n').trim();

    if (text.length < MIN_PAGE_TEXT_CHARS) {
      skippedPages.push(page.num);
      continue;
    }

    const blocks = buildPlainTextBlocks(text, page.num);

    if (blocks.length === 0) {
      skippedPages.push(page.num);
      continue;
    }

    cleanedPages.push({ num: page.num, text, blocks });
  }

  const documentText = cleanedPages.map((page) => page.text).join('\n\n').trim();

  if (documentText.length > PDF_MAX_TEXT_CHARS) {
    throw new BrainSourceError('pdf_text_too_large', undefined, { status: 413 });
  }

  if (documentText.length === 0 || cleanedPages.length === 0) {
    const rawChars = input.pages.reduce((sum, page) => sum + page.text.trim().length, 0);
    const likelyScanned = totalPages > 0 && rawChars < totalPages * 10;

    throw new BrainSourceError(likelyScanned ? 'pdf_ocr_required' : 'pdf_no_text');
  }

  const emptyPageCount = Math.max(0, totalPages - cleanedPages.length);
  const ocrSuspected = emptyPageCount > 0 && emptyPageCount >= Math.ceil(totalPages * 0.5);
  const blocks: ArticleBlock[] = [];

  for (const page of cleanedPages) {
    blocks.push({ type: 'heading', text: `Page ${page.num}`, level: 2, page: page.num });
    blocks.push(...page.blocks);
  }

  const infoTitle = textValue(input.info?.info?.Title);
  const infoAuthor = textValue(input.info?.info?.Author);
  const dateFromInfo = pdfDate(input.info);
  const firstText = cleanedPages[0]?.text || documentText;
  const title =
    input.title?.trim() ||
    infoTitle ||
    inferTitleFromText(firstText, pdfTitleFromFilename(input.filename)) ||
    'Untitled PDF';
  const author = input.author?.trim() || infoAuthor || null;
  const publishedAt = input.publishedAt || dateFromInfo || inferDateFromText(firstText);
  const language = input.language?.trim() || inferLanguage(documentText);
  const contentHash = sha256Hex(documentText);
  const wordCount = (documentText.match(/[\p{L}\p{N}]+/gu) || []).length;
  const headingCount = blocks.filter((block) => block.type === 'heading').length;
  const paragraphCount = blocks.filter((block) => block.type === 'paragraph').length;

  const diagnostics: ArticleExtractionDiagnostics = {
    parser: 'fallback',
    fallbackChars: documentText.length,
    selectedChars: documentText.length,
    bodyChars: documentText.length,
    wordCount,
    paragraphCount,
    headingCount,
    linkDensity: 0,
    boilerplateChars: 0,
    boilerplateCount: 0,
    boilerplateRatio: 0,
    completeness: skippedPages.length === 0 ? 1 : cleanedPages.length / Math.max(1, totalPages),
    paywallDetected: false,
    truncated: false,
    htmlChars: 0,
    sourceDomain: null,
    siteProfile: 'generic',
    extractionVersion: PDF_EXTRACTION_VERSION,
    publishedAtSource: publishedAt ? 'metadata' : null,
    file: {
      format: 'pdf',
      pageCount: totalPages,
      usablePageCount: cleanedPages.length,
      skippedPages,
      emptyPageCount,
      ocrSuspected,
      byteSize: input.byteSize ?? null,
    },
  };

  return {
    url: syntheticSourceUrl(input.sourceSha256),
    canonicalUrl: syntheticSourceUrl(input.sourceSha256),
    sourceDomain: null,
    sourceType: 'pdf',
    title,
    author,
    siteName: 'PDF upload',
    description: null,
    imageUrl: null,
    publishedAt,
    publishedAtSource: publishedAt ? 'metadata' : null,
    language,
    text: documentText,
    blocks,
    contentHash,
    wordCount,
    charCount: documentText.length,
    status: extractionStatus(documentText.length, blocks),
    extractionVersion: PDF_EXTRACTION_VERSION,
    diagnostics,
  };
}

function isPasswordError(error: unknown): boolean {
  const value = error as { name?: unknown; message?: unknown; code?: unknown } | null;
  const text = `${String(value?.name || '')} ${String(value?.message || '')} ${String(value?.code || '')}`;
  return /password|encrypted|passwordexception/i.test(text);
}

/**
 * Server-only PDF text extraction. It never renders pages and never claims
 * success for a scanned/image-only PDF: that case is surfaced as
 * `pdf_ocr_required`.
 */
type PdfParserLike = {
  getText: () => Promise<{ pages?: PdfPageInput[]; text?: string; total?: number }>;
  getInfo?: (params?: Record<string, unknown>) => Promise<PdfInfoLike>;
  destroy: () => Promise<void>;
};

export async function extractPdfDocument(
  buffer: Buffer,
  input: Omit<PdfExtractionInput, 'pages' | 'totalPages' | 'info'>
): Promise<ExtractedArticle> {
  let parser: PdfParserLike | null = null;

  try {
    const { PDFParse } = await import('pdf-parse');
    parser = new PDFParse({
      data: new Uint8Array(buffer),
      verbosity: 0,
      isEvalSupported: false,
      useWorkerFetch: false,
      useWasm: false,
      stopAtErrors: true,
    }) as unknown as PdfParserLike;

    const info = (await parser
      .getInfo?.({ parsePageInfo: false })
      .catch(() => null)) as PdfInfoLike | null;

    const textResult = await parser.getText();
    const pages =
      Array.isArray(textResult.pages) && textResult.pages.length > 0
        ? textResult.pages
        : String(textResult.text || '')
            .split('\f')
            .map((text, index) => ({ num: index + 1, text }));

    const totalPages = Math.max(0, Number(textResult.total) || pages.length);

    if (totalPages === 0 && pages.length === 0) {
      throw new BrainSourceError('pdf_empty');
    }

    return buildPdfArticle({
      ...input,
      pages,
      totalPages: totalPages || pages.length,
      info,
    });
  } catch (error) {
    if (error instanceof BrainSourceError) throw error;

    if (isPasswordError(error)) {
      throw new BrainSourceError('pdf_password_protected');
    }

    throw new BrainSourceError('pdf_parse_failed');
  } finally {
    if (parser) {
      await parser.destroy().catch(() => undefined);
    }
  }
}
