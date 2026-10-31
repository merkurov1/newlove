import { createHash } from 'node:crypto';

import {
  BRAIN_SOURCE_LIMITS,
  type BrainSourceFormat,
  type BrainSourceKind,
  type BrainSourceMetadataOverride,
  type BrainSourceType,
} from './sourceTypes';

export const BRAIN_SOURCE_BUCKET = 'brain-sources';

export class BrainSourceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: string, message?: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message || code);
    this.name = 'BrainSourceError';
    this.code = code;
    this.status = options.status ?? 400;
    this.retryable = options.retryable ?? false;
  }
}

export function isBrainSourceError(error: unknown): error is BrainSourceError {
  return error instanceof BrainSourceError;
}

/** Human-readable reason for admin-facing source errors. */
export function brainSourceErrorMessage(code: string): string {
  switch (code) {
    case 'pdf_ocr_required':
      return 'This PDF appears to be scanned or image-only. OCR is required before indexing.';
    case 'pdf_password_protected':
      return 'This PDF is password-protected and cannot be read.';
    case 'pdf_parse_failed':
      return 'This PDF is damaged or uses an unsupported format.';
    case 'pdf_signature_invalid':
      return 'This file is not a valid PDF (missing %PDF signature).';
    case 'pdf_no_text':
      return 'The PDF contains no usable text pages.';
    case 'pdf_empty':
      return 'The PDF is empty.';
    case 'pdf_mime_invalid':
      return 'The uploaded MIME type does not match a PDF.';
    case 'pdf_too_large':
      return 'The PDF is larger than the 25 MB limit.';
    case 'pdf_text_too_large':
      return 'The PDF contains more text than this ingestion path accepts.';
    case 'txt_encoding_invalid':
      return 'The text file is not valid UTF-8.';
    case 'txt_binary_content':
      return 'The file contains binary content and is not a plain text file.';
    case 'txt_mime_invalid':
      return 'The uploaded MIME type does not match plain text.';
    case 'txt_too_large':
      return 'The text file is larger than the 5 MB limit.';
    case 'source_text_empty':
      return 'The pasted text is empty.';
    case 'source_text_too_large':
      return 'The pasted text is larger than the 2 MB limit.';
    case 'source_text_invalid':
      return 'The pasted text contains invalid binary characters.';
    case 'source_title_too_long':
      return 'The title is too long.';
    case 'source_author_too_long':
      return 'The author name is too long.';
    case 'source_language_invalid':
      return 'The language code is invalid.';
    case 'source_date_invalid':
      return 'The publication date is invalid.';
    case 'storage_not_configured':
      return 'Private source storage is not configured.';
    case 'storage_hash_mismatch':
      return 'The stored file does not match its recorded SHA-256.';
    case 'storage_path_invalid':
    case 'storage_incoming_path_invalid':
      return 'The private source path is invalid.';
    case 'storage_download_failed':
    case 'storage_incoming_missing':
      return 'The original file could not be read from private storage.';
    case 'storage_upload_failed':
    case 'storage_upload_url_failed':
      return 'The original file could not be written to private storage.';
    default:
      return code.replace(/_/g, ' ');
  }
}

export function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sourceTypeForKind(kind: BrainSourceKind): BrainSourceType {
  return kind === 'url' ? 'article' : kind;
}

export function sourceFormatForKind(kind: BrainSourceKind): BrainSourceFormat {
  return kind;
}

export function syntheticSourceUrl(sha256: string): string {
  return `brain-upload://${sha256}`;
}

export function deriveFileDocumentId(kind: Exclude<BrainSourceKind, 'url'>, sha256: string): string {
  return `doc_${kind}_${sha256.slice(0, 32)}`;
}

export type BrainStorageFormat = 'pdf' | 'txt' | 'html';

export function sourceObjectPath(sha256: string, format: BrainStorageFormat): string {
  return `${sha256.slice(0, 2)}/${sha256}.${format}`;
}

export function sourcePathForStorage(sha256: string, format: BrainStorageFormat): string {
  return `${BRAIN_SOURCE_BUCKET}/${sourceObjectPath(sha256, format)}`;
}

export function sourceObjectPathFromPath(value: string): string | null {
  const trimmed = value.trim().replace(/^\/+/, '');
  const prefix = `${BRAIN_SOURCE_BUCKET}/`;
  const objectPath = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;

  return /^[a-f0-9]{2}\/[a-f0-9]{64}\.(pdf|txt|html)$/.test(objectPath) ? objectPath : null;
}

export function isIncomingStoragePath(value: string): boolean {
  return /^incoming\/[A-Za-z0-9_-]{8,80}\.(pdf|txt)$/.test(value.trim().replace(/^\/+/, ''));
}

export function extensionForKind(kind: BrainSourceKind): 'pdf' | 'txt' {
  return kind === 'pdf' ? 'pdf' : 'txt';
}

export function sanitizeOriginalFilename(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]+/g, '-')
    .trim()
    .slice(0, BRAIN_SOURCE_LIMITS.maxOriginalFilenameChars);

  return cleaned || null;
}

export function validateMetadataOverride(
  input: BrainSourceMetadataOverride | Record<string, unknown> | null | undefined
): Required<BrainSourceMetadataOverride> {
  const record = input && typeof input === 'object' ? input : {};
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const author = typeof record.author === 'string' ? record.author.trim() : '';
  const language = typeof record.language === 'string' ? record.language.trim().toLowerCase() : '';
  const publishedAt = normalizePublishedAt(record.publishedAt);

  if (title.length > BRAIN_SOURCE_LIMITS.maxTitleChars) {
    throw new BrainSourceError('source_title_too_long');
  }

  if (author.length > BRAIN_SOURCE_LIMITS.maxAuthorChars) {
    throw new BrainSourceError('source_author_too_long');
  }

  if (language && !/^[a-z]{2,8}(?:-[a-z0-9]{2,8})?$/.test(language)) {
    throw new BrainSourceError('source_language_invalid');
  }

  if (language.length > BRAIN_SOURCE_LIMITS.maxLanguageChars) {
    throw new BrainSourceError('source_language_invalid');
  }

  return {
    title: title || null,
    author: author || null,
    publishedAt,
    language: language || null,
  };
}

export function normalizePublishedAt(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value !== 'string') {
    throw new BrainSourceError('source_date_invalid');
  }

  const trimmed = value.trim();

  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BrainSourceError('source_date_invalid');
    }

    return date.toISOString();
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1000) {
    throw new BrainSourceError('source_date_invalid');
  }

  return parsed.toISOString();
}

export function normalizePlainText(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function decodeUtf8Strict(buffer: Buffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BrainSourceError('txt_encoding_invalid');
  }
}

export function validatePastedText(value: unknown): { raw: string; normalized: string; bytes: Buffer } {
  if (typeof value !== 'string') {
    throw new BrainSourceError('source_text_missing');
  }

  const raw = value;
  const bytes = Buffer.from(raw, 'utf8');

  if (bytes.length === 0) {
    throw new BrainSourceError('source_text_empty');
  }

  if (bytes.length > BRAIN_SOURCE_LIMITS.maxTextBytes) {
    throw new BrainSourceError('source_text_too_large', undefined, { status: 413 });
  }

  if (raw.includes('\u0000')) {
    throw new BrainSourceError('source_text_invalid');
  }

  const normalized = normalizePlainText(raw);

  if (!normalized) {
    throw new BrainSourceError('source_text_empty');
  }

  return { raw, normalized, bytes };
}

export function validateTxtBuffer(
  buffer: Buffer,
  mimeType?: string | null
): { text: string; bytes: Buffer } {
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();

  if (mime && !['text/plain', 'text/markdown', 'application/octet-stream'].includes(mime)) {
    throw new BrainSourceError('txt_mime_invalid');
  }

  if (buffer.length === 0) {
    throw new BrainSourceError('txt_empty');
  }

  if (buffer.length > BRAIN_SOURCE_LIMITS.maxTxtBytes) {
    throw new BrainSourceError('txt_too_large', undefined, { status: 413 });
  }

  if (buffer.includes(0)) {
    throw new BrainSourceError('txt_binary_content');
  }

  const decoded = decodeUtf8Strict(buffer);
  const text = normalizePlainText(decoded);

  if (!text) {
    throw new BrainSourceError('txt_empty');
  }

  return { text, bytes: buffer };
}

export function validatePdfBuffer(buffer: Buffer, mimeType?: string | null): void {
  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();

  if (mime && !['application/pdf', 'application/octet-stream'].includes(mime)) {
    throw new BrainSourceError('pdf_mime_invalid');
  }

  if (buffer.length === 0) {
    throw new BrainSourceError('pdf_empty');
  }

  if (buffer.length > BRAIN_SOURCE_LIMITS.maxPdfBytes) {
    throw new BrainSourceError('pdf_too_large', undefined, { status: 413 });
  }

  const header = buffer.subarray(0, 4096).toString('latin1');

  if (!header.includes('%PDF-')) {
    throw new BrainSourceError('pdf_signature_invalid');
  }
}

export function inferLanguage(text: string): 'ru' | 'en' | 'und' {
  const sample = text.slice(0, 20000);
  const cyrillic = (sample.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'und';
  if (cyrillic >= latin) return 'ru';
  return 'en';
}

function stripMarkdownHeading(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[*_`~]+|[*_`~]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferTitleFromText(text: string, fallback?: string | null): string {
  const lines = normalizePlainText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);

  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      const title = stripMarkdownHeading(line);
      if (title.length >= 2) return title.slice(0, BRAIN_SOURCE_LIMITS.maxTitleChars);
    }
  }

  const first = lines.find((line) => !/^[-*+]\s+/.test(line) && !/^\d+[.)]\s+/.test(line));

  if (first) {
    return stripMarkdownHeading(first).slice(0, BRAIN_SOURCE_LIMITS.maxTitleChars);
  }

  return (fallback || 'Untitled document').slice(0, BRAIN_SOURCE_LIMITS.maxTitleChars);
}

export function inferAuthorFromText(text: string): string | null {
  const match = text
    .slice(0, 4000)
    .match(/^(?:author|автор|by)\s*[:\-]\s*(.{2,300})$/im);

  return match ? match[1].trim().slice(0, BRAIN_SOURCE_LIMITS.maxAuthorChars) : null;
}

export function inferDateFromText(text: string): string | null {
  const sample = text.slice(0, 4000);
  const dateMatch = sample.match(
    /\b((?:19|20)\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
  );

  if (dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString();
    }
  }

  return null;
}

export function guessMimeType(kind: BrainSourceKind): string {
  if (kind === 'pdf') return 'application/pdf';
  return 'text/plain';
}
