/**
 * Shared, client-safe contracts for the unified Brain source loader.
 *
 * This module must not import Node APIs, Supabase or any server-only module:
 * the admin UI imports these types and labels directly.
 */

export type BrainSourceKind = 'url' | 'pdf' | 'txt' | 'text';

/**
 * `source_type` describes what the document is. URL ingestion keeps the
 * existing `article` value for backward compatibility.
 */
export type BrainSourceType = 'article' | 'media_coverage' | 'pdf' | 'txt' | 'text';

/**
 * `source_format` describes how the original was delivered.
 * `markdown` is reserved for the frozen UNFRAMED manuscript.
 */
export type BrainSourceFormat = 'url' | 'pdf' | 'txt' | 'text' | 'markdown';

export type BrainSourceMetadataOverride = {
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
};

export type BrainSourceDescriptor = BrainSourceMetadataOverride & {
  kind: BrainSourceKind;
  /** Required for kind=url. */
  url?: string;
  /** Required for kind=pdf|txt when the file was uploaded to private storage. */
  storagePath?: string;
  /** Required for kind=pdf|txt|text. SHA-256 of the original bytes. */
  sourceSha256?: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  pageCount?: number | null;
};

export type BrainDuplicateInfo = {
  status: 'existing' | 'existing_active' | 'duplicate_content';
  documentId: string;
  title: string;
  match: 'normalized_url' | 'canonical_url' | 'source_sha256' | 'content_hash';
  ingestionStatus: string | null;
  chunkCount: number | null;
  mediaRecordId?: string | null;
};

export type BrainSourcePreview = {
  kind: BrainSourceKind;
  sourceType: BrainSourceType;
  sourceFormat: BrainSourceFormat;
  documentId: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  language: string;
  canonicalUrl: string | null;
  normalizedUrl: string;
  sourcePath: string;
  sourceSha256: string;
  contentSha256: string;
  storagePath: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
  usablePageCount: number | null;
  skippedPages: number[];
  chunkCount: number;
  wordCount: number;
  charCount: number;
  excerpt: string;
  headings: string[];
  warnings: string[];
  duplicate: BrainDuplicateInfo | null;
  parserVersion: string;
  chunkerVersion: string;
  extractionVersion: string;
};

export type BrainPreviewResponse = {
  status: 'ok';
  preview: BrainSourcePreview;
};

export type BrainEnqueueRow = {
  input: string;
  kind: BrainSourceKind;
  status: 'queued' | 'existing' | 'already_queued' | 'duplicate_in_input' | 'invalid' | 'error';
  reason?: string;
  documentId?: string;
  title?: string;
  jobId?: string;
  runId?: string;
};

export const BRAIN_SOURCE_KIND_LABEL: Record<BrainSourceKind, string> = {
  url: 'URL',
  pdf: 'PDF',
  txt: 'TXT file',
  text: 'Pasted text',
};

export const BRAIN_SOURCE_LIMITS = {
  maxUrls: 200,
  maxPdfBytes: 25 * 1024 * 1024,
  maxTxtBytes: 5 * 1024 * 1024,
  maxTextBytes: 2 * 1024 * 1024,
  maxTitleChars: 200,
  maxAuthorChars: 300,
  maxLanguageChars: 16,
  maxOriginalFilenameChars: 300,
  maxPreviewChars: 4000,
} as const;

export function isBrainSourceKind(value: unknown): value is BrainSourceKind {
  return value === 'url' || value === 'pdf' || value === 'txt' || value === 'text';
}
