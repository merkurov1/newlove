import type {
  ArticleBlock,
  ArticleExtractionDiagnostics,
  ArticleExtractionStatus,
  ExtractedArticle,
} from './extract';
import {
  inferAuthorFromText,
  inferDateFromText,
  inferLanguage,
  inferTitleFromText,
  normalizePlainText,
  sha256Hex,
  syntheticSourceUrl,
  BrainSourceError,
} from './sourceValidation';
import { BRAIN_SOURCE_LIMITS } from './sourceTypes';

export const TEXT_EXTRACTION_VERSION = 'brain-text-extractor-v1';

export type PlainTextExtractionInput = {
  kind: 'txt' | 'text';
  rawText: string;
  sourceSha256: string;
  filename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
};

function compactLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isMarkdownHeading(line: string): number | null {
  const match = line.match(/^(#{1,6})\s+(.+)$/);
  return match ? match[1].length : null;
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

function isQuoteLine(line: string): boolean {
  return /^\s*>\s+/.test(line);
}

function looksLikeHeading(line: string, nextLine: string | null): boolean {
  const value = compactLine(line);

  if (!value || value.length > 90) return false;
  if (/[.!?…,;:]$/.test(value)) return false;
  if (isListLine(line) || isQuoteLine(line)) return false;

  const words = value.split(/\s+/).length;
  if (words > 12) return false;

  const nextIsBlank = nextLine === null || !nextLine.trim();
  const mostlyUpper = value === value.toUpperCase() && /[A-ZА-ЯЁ]/.test(value);

  return mostlyUpper || nextIsBlank;
}

/**
 * Converts normalized plain text into the same block model used by the HTML
 * article extractor. This keeps chunking, provenance and retrieval identical
 * for URL, PDF, TXT and pasted text.
 */
export function buildPlainTextBlocks(text: string, page?: number): ArticleBlock[] {
  const lines = normalizePlainText(text).split('\n');
  const blocks: ArticleBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;

    const value = paragraph.map(compactLine).filter(Boolean).join(' ').trim();
    paragraph = [];

    if (value) blocks.push({ type: 'paragraph', text: value, ...(page ? { page } : {}) });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const markdownLevel = isMarkdownHeading(trimmed);

    if (markdownLevel) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        text: compactLine(trimmed.replace(/^#{1,6}\s+/, '')),
        level: Math.min(6, Math.max(1, markdownLevel)),
        ...(page ? { page } : {}),
      });
      continue;
    }

    if (isQuoteLine(trimmed)) {
      flushParagraph();
      blocks.push({
        type: 'quote',
        text: compactLine(trimmed.replace(/^\s*>\s+/, '')),
        ...(page ? { page } : {}),
      });
      continue;
    }

    if (isListLine(trimmed)) {
      flushParagraph();
      blocks.push({
        type: 'list',
        text: compactLine(trimmed.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')),
        ...(page ? { page } : {}),
      });
      continue;
    }

    const nextLine = index + 1 < lines.length ? lines[index + 1] : null;

    if (looksLikeHeading(trimmed, nextLine)) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        text: compactLine(trimmed),
        level: 2,
        ...(page ? { page } : {}),
      });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();

  return blocks;
}

function extractionStatus(charCount: number, blocks: ArticleBlock[]): ArticleExtractionStatus {
  if (blocks.length === 0 || charCount === 0) return 'failed';
  if (charCount < 8) return 'needs_review';
  return 'complete';
}

function filenameTitle(filename: string | null | undefined): string | null {
  if (!filename) return null;

  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BRAIN_SOURCE_LIMITS.maxTitleChars);
}

export function extractPlainTextDocument(input: PlainTextExtractionInput): ExtractedArticle {
  const normalized = normalizePlainText(input.rawText);
  const blocks = buildPlainTextBlocks(normalized);

  if (normalized.length === 0 || blocks.length === 0) {
    throw new BrainSourceError('txt_empty');
  }

  const title =
    input.title?.trim() ||
    inferTitleFromText(normalized, filenameTitle(input.filename)) ||
    'Untitled document';
  const author = input.author?.trim() || inferAuthorFromText(normalized);
  const publishedAt = input.publishedAt || inferDateFromText(normalized);
  const language = input.language?.trim() || inferLanguage(normalized);
  const contentHash = sha256Hex(normalized);
  const wordCount = (normalized.match(/[\p{L}\p{N}]+/gu) || []).length;
  const headingCount = blocks.filter((block) => block.type === 'heading').length;
  const paragraphCount = blocks.filter((block) => block.type === 'paragraph').length;

  const diagnostics: ArticleExtractionDiagnostics = {
    parser: 'fallback',
    fallbackChars: normalized.length,
    selectedChars: normalized.length,
    bodyChars: normalized.length,
    wordCount,
    paragraphCount,
    headingCount,
    linkDensity: 0,
    boilerplateChars: 0,
    boilerplateCount: 0,
    boilerplateRatio: 0,
    completeness: 1,
    paywallDetected: false,
    truncated: false,
    htmlChars: 0,
    sourceDomain: null,
    siteProfile: 'generic',
    extractionVersion: TEXT_EXTRACTION_VERSION,
    publishedAtSource: publishedAt ? 'metadata' : null,
    file: {
      format: input.kind,
      pageCount: null,
      usablePageCount: null,
      skippedPages: [],
      emptyPageCount: 0,
      ocrSuspected: false,
      byteSize: input.byteSize ?? null,
    },
  };

  return {
    url: syntheticSourceUrl(input.sourceSha256),
    canonicalUrl: syntheticSourceUrl(input.sourceSha256),
    sourceDomain: null,
    sourceType: input.kind,
    title,
    author,
    siteName: input.kind === 'txt' ? 'TXT upload' : 'Pasted text',
    description: null,
    imageUrl: null,
    publishedAt,
    publishedAtSource: publishedAt ? 'metadata' : null,
    language,
    text: normalized,
    blocks,
    contentHash,
    wordCount,
    charCount: normalized.length,
    status: extractionStatus(normalized.length, blocks),
    extractionVersion: TEXT_EXTRACTION_VERSION,
    diagnostics,
  };
}
