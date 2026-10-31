import { chunkArticle } from '@/lib/knowledge/brain/chunk';
import type { ExtractedArticle } from '@/lib/knowledge/brain/extract';
import { extractPdfDocument } from '@/lib/knowledge/brain/pdfExtract';
import { extractPlainTextDocument } from '@/lib/knowledge/brain/textExtract';
import {
  BrainSourceError,
  decodeUtf8Strict,
  normalizePublishedAt,
  normalizePlainText,
  sha256Hex,
  validateMetadataOverride,
  validatePastedText,
  validatePdfBuffer,
  validateTxtBuffer,
} from '@/lib/knowledge/brain/sourceValidation';
import { createBrainStorage, type BrainStorage } from '@/lib/knowledge/brain/storage';
import { createBrainStore, type MediaCoverageMatch, type BrainStore } from '@/lib/knowledge/brain/store';
import { BrainUrlError, normalizeSourceUrl } from '@/lib/knowledge/brain/url';
import {
  classifyMediaPublication,
  fallbackMediaClassification,
  normalizeMediaLanguage,
  MEDIA_KINDS,
  MEDIA_TOPICS,
  type MediaKind,
  type MediaTopic,
} from './classify';
import { extractMediaPage, type MediaPageExtraction } from './page';
import { evaluateMediaTextQuality, type MediaQualityAssessment } from './quality';

export type MediaSourceKind = 'url' | 'pdf' | 'txt' | 'text';
export type MediaSourceFormat = 'url' | 'pdf' | 'txt' | 'text';

export type MediaPreviewInput = {
  kind: MediaSourceKind;
  /** Original publication URL. Required for every media record. */
  url: string;
  /** Required when kind=text. */
  text?: string;
  storagePath?: string | null;
  sourceSha256?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  title?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  kindOverride?: string | null;
  topic?: string | null;
};

export type MediaSourceDescriptor = {
  kind: MediaSourceKind;
  format: MediaSourceFormat;
  storagePath: string;
  sourceSha256: string;
  contentHash: string;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
};

export type MediaPreviewRecord = {
  url: string;
  canonical_url: string;
  title: string;
  outlet: string;
  author: string | null;
  published_date: string | null;
  lang: string;
  kind: string;
  topic: string;
  summary: string;
  image_url: string | null;
};

export type MediaPreviewExtraction = {
  quality: string;
  coverageStatus: string;
  extractionStatus: string;
  errorCode: string | null;
  charCount: number;
  wordCount: number;
  chunkCount: number;
  languageDetected: string | null;
  paywallDetected: boolean;
  truncated: boolean;
  parser: string;
  fetchedBytes: number;
  finalUrl: string | null;
  pageCount: number | null;
  skippedPages: number[];
  sourceFormat: MediaSourceFormat;
  contentHash: string;
  sourceSha256: string;
};

export type MediaPreviewDeps = {
  store?: BrainStore | null;
  storage?: BrainStorage | null;
  extractPage?: (url: string) => Promise<MediaPageExtraction>;
  extractPdf?: typeof extractPdfDocument;
  extractText?: typeof extractPlainTextDocument;
  classify?: typeof classifyMediaPublication;
};

export type MediaPreviewResult = {
  record: MediaPreviewRecord;
  source: MediaSourceDescriptor | null;
  extraction: MediaPreviewExtraction;
  duplicate:
    | {
        id: string;
        title: string;
        status: string;
        canonical_url: string;
        coverage: MediaCoverageMatch | null;
      }
    | null;
};

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').slice(0, 300);
  } catch {
    return 'Unknown publication';
  }
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function validArchiveDate(value: string | null | undefined): string | null {
  const date = value?.slice(0, 10) || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function isKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && (MEDIA_KINDS as readonly string[]).includes(value);
}

function isTopic(value: unknown): value is MediaTopic {
  return typeof value === 'string' && (MEDIA_TOPICS as readonly string[]).includes(value);
}

function summaryFallback(article: ExtractedArticle): string {
  const paragraph = article.blocks.find(
    (block) => block.type === 'paragraph' && block.text.trim().length >= 20
  );

  return clean(paragraph?.text || article.text, 2000);
}

function applyArticleOverrides(
  article: ExtractedArticle,
  input: MediaPreviewInput,
  overrides: Required<ReturnType<typeof validateMetadataOverride>>
): void {
  if (overrides.title) article.title = overrides.title.slice(0, 500);
  if (overrides.author) article.author = overrides.author.slice(0, 300);
  if (overrides.publishedAt) {
    article.publishedAt = normalizePublishedAt(overrides.publishedAt);
    article.publishedAtSource = article.publishedAt ? 'metadata' : null;
  }
  if (overrides.language) article.language = overrides.language.slice(0, 16);
  if (input.summary) article.description = clean(input.summary, 2000);
}

function sourceFormatFor(kind: MediaSourceKind): MediaSourceFormat {
  return kind;
}

function buildRecord(input: {
  kind: MediaSourceKind;
  originalUrl: string;
  canonicalUrl: string;
  article: ExtractedArticle;
  metadataTitle?: string | null;
  metadataOutlet?: string | null;
  metadataSummary?: string | null;
  metadataImage?: string | null;
  publishedDate?: string | null;
  lang: string;
  kindValue: string;
  topic: string;
}): MediaPreviewRecord {
  const title =
    clean(input.metadataTitle, 500) ||
    clean(input.article.title, 500) ||
    `Publication at ${hostOf(input.canonicalUrl)}`;
  const outlet = clean(input.metadataOutlet, 300) || hostOf(input.canonicalUrl);
  const summary =
    clean(input.metadataSummary, 2000) ||
    clean(input.article.description || '', 2000) ||
    summaryFallback(input.article);

  return {
    url: input.originalUrl,
    canonical_url: input.canonicalUrl,
    title,
    outlet,
    author: clean(input.article.author, 300) || null,
    published_date:
      validArchiveDate(input.publishedDate) || validArchiveDate(input.article.publishedAt),
    lang: input.lang,
    kind: input.kindValue,
    topic: input.topic,
    summary,
    image_url: input.metadataImage || input.article.imageUrl || null,
  };
}

function extractionFor(
  article: ExtractedArticle,
  quality: MediaQualityAssessment,
  chunkCount: number,
  source: { format: MediaSourceFormat; contentHash: string; sourceSha256: string; fetchedBytes: number; finalUrl: string | null }
): MediaPreviewExtraction {
  return {
    quality: quality.quality,
    coverageStatus: quality.coverageStatus,
    extractionStatus: quality.extractionStatus,
    errorCode: quality.errorCode,
    charCount: article.charCount,
    wordCount: article.wordCount,
    chunkCount,
    languageDetected: article.language || null,
    paywallDetected: article.diagnostics.paywallDetected,
    truncated: article.diagnostics.truncated,
    parser: article.diagnostics.parser,
    fetchedBytes: source.fetchedBytes,
    finalUrl: source.finalUrl,
    pageCount: article.diagnostics.file?.pageCount ?? null,
    skippedPages: article.diagnostics.file?.skippedPages ?? [],
    sourceFormat: source.format,
    contentHash: source.contentHash,
    sourceSha256: source.sourceSha256,
  };
}

async function blockedUrlPreview(input: {
  originalUrl: string;
  canonicalUrl: string;
  error: unknown;
  store: NonNullable<ReturnType<typeof createBrainStore>>;
}): Promise<MediaPreviewResult> {
  const code =
    input.error instanceof BrainUrlError
      ? input.error.code
      : input.error instanceof Error && input.error.message
        ? input.error.message
        : 'extraction_failed';
  const outlet = hostOf(input.canonicalUrl);
  let title = `Publication at ${outlet}`;

  try {
    const slug = new URL(input.canonicalUrl).pathname.split('/').filter(Boolean).pop();
    if (slug) title = slug.replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]+$/i, '').trim().slice(0, 500) || title;
  } catch {
    // Keep the host fallback.
  }

  const classification = fallbackMediaClassification('und');
  const record: MediaPreviewRecord = {
    url: input.originalUrl,
    canonical_url: input.canonicalUrl,
    title,
    outlet,
    author: null,
    published_date: null,
    lang: classification.lang,
    kind: classification.kind,
    topic: classification.topic,
    summary: '',
    image_url: null,
  };
  const duplicateRecord = await input.store.findMediaRecordByUrl(
    input.originalUrl,
    input.canonicalUrl
  );
  const duplicateCoverage = duplicateRecord
    ? await input.store.findMediaCoverageDocument({
        mediaRecordId: duplicateRecord.id,
        canonicalUrl: duplicateRecord.canonical_url,
      })
    : null;

  return {
    record,
    source: null,
    extraction: {
      quality: 'blocked',
      coverageStatus: 'blocked',
      extractionStatus: 'blocked',
      errorCode: code,
      charCount: 0,
      wordCount: 0,
      chunkCount: 0,
      languageDetected: null,
      paywallDetected: /paywall|subscriber|forbidden|http_status_403/i.test(code),
      truncated: /truncat|preview/i.test(code),
      parser: 'none',
      fetchedBytes: 0,
      finalUrl: null,
      pageCount: null,
      skippedPages: [],
      sourceFormat: 'url',
      contentHash: '',
      sourceSha256: '',
    },
    duplicate: duplicateRecord
      ? {
          id: duplicateRecord.id,
          title: duplicateRecord.title,
          status: duplicateRecord.status,
          canonical_url: duplicateRecord.canonical_url,
          coverage: duplicateCoverage,
        }
      : null,
  };
}

export async function previewMediaSource(
  input: MediaPreviewInput,
  deps: MediaPreviewDeps = {}
): Promise<MediaPreviewResult> {
  const store = deps.store === undefined ? createBrainStore() : deps.store;

  if (!store) throw new BrainSourceError('media_database_unavailable', undefined, { status: 503 });

  const storage = deps.storage === undefined ? createBrainStorage() : deps.storage;
  const extractPage = deps.extractPage || extractMediaPage;
  const extractPdf = deps.extractPdf || extractPdfDocument;
  const extractText = deps.extractText || extractPlainTextDocument;
  const classify = deps.classify || classifyMediaPublication;

  if (!storage) throw new BrainSourceError('storage_not_configured', undefined, { status: 503 });

  const originalUrl = clean(input.url, 2048);

  if (!originalUrl) throw new BrainSourceError('url_missing');

  let canonicalUrl: string;

  try {
    canonicalUrl = normalizeSourceUrl(originalUrl);
  } catch {
    throw new BrainSourceError('url_invalid');
  }

  const overrides = validateMetadataOverride({
    title: input.title,
    author: input.author,
    publishedAt: input.publishedAt,
    language: input.language,
  });

  let article: ExtractedArticle;
  let quality: MediaQualityAssessment;
  let sourcePath: string;
  let sourceSha256: string;
  let contentHash: string;
  let fetchedBytes = 0;
  let finalUrl: string | null = originalUrl;
  let originalFilename: string | null = input.originalFilename || null;
  let mimeType: string | null = input.mimeType || null;
  let byteSize: number | null = input.byteSize ?? null;
  let pageCount: number | null = null;
  let metadataTitle: string | null = null;
  let metadataOutlet: string | null = null;
  let metadataSummary: string | null = null;
  let metadataImage: string | null = null;
  let metadataPublishedDate: string | null = null;

  if (input.kind === 'url') {
    let page: Awaited<ReturnType<typeof extractMediaPage>>;

    try {
      page = await extractPage(originalUrl);
    } catch (error) {
      return blockedUrlPreview({
        originalUrl,
        canonicalUrl,
        error,
        store,
      });
    }

    article = page.article;
    quality = page.quality;
    fetchedBytes = page.fetchedBytes;
    finalUrl = page.finalUrl;
    canonicalUrl = page.metadata.canonical_url;
    metadataTitle = page.metadata.title;
    metadataOutlet = page.metadata.outlet;
    metadataSummary = page.metadata.summary;
    metadataImage = page.metadata.image_url;
    metadataPublishedDate = page.metadata.published_date;
    mimeType = 'text/html';
    const stored = await storage.storeSourceBuffer(
      Buffer.from(page.html, 'utf8'),
      'html',
      'text/html'
    );
    sourcePath = stored.sourcePath;
    sourceSha256 = stored.sourceSha256;
    byteSize = stored.byteSize;
    contentHash = page.article.contentHash;
  } else if (input.kind === 'text') {
    const validated = validatePastedText(input.text);
    const stored = await storage.storeSourceBuffer(validated.bytes, 'txt', 'text/plain');
    sourcePath = stored.sourcePath;
    sourceSha256 = stored.sourceSha256;
    byteSize = stored.byteSize;
    article = extractText({
      kind: 'text',
      rawText: validated.raw,
      sourceSha256,
      mimeType: 'text/plain',
      byteSize,
      title: overrides.title,
      author: overrides.author,
      publishedAt: overrides.publishedAt,
      language: overrides.language,
    });
    quality = evaluateMediaTextQuality(article);
    contentHash = article.contentHash;
    fetchedBytes = byteSize;
  } else {
    if (!input.storagePath || !input.sourceSha256) {
      throw new BrainSourceError('storage_path_invalid');
    }

    if (input.kind === 'pdf' || input.kind === 'txt') {
      if (!input.storagePath.startsWith('incoming/')) {
        throw new BrainSourceError('storage_incoming_path_invalid');
      }

      const promoted = await storage.promoteIncomingSource({
        incomingPath: input.storagePath,
        kind: input.kind,
        expectedSha256: input.sourceSha256,
      });

      sourcePath = promoted.sourcePath;
      sourceSha256 = promoted.sourceSha256;
      byteSize = promoted.byteSize;
      originalFilename = input.originalFilename || null;
      mimeType = input.mimeType || (input.kind === 'pdf' ? 'application/pdf' : 'text/plain');

      if (input.kind === 'pdf') {
        validatePdfBuffer(promoted.buffer, input.mimeType);
        article = await extractPdf(promoted.buffer, {
          sourceSha256,
          filename: originalFilename,
          mimeType,
          byteSize,
          title: overrides.title,
          author: overrides.author,
          publishedAt: overrides.publishedAt,
          language: overrides.language,
        });
      } else {
        const validated = validateTxtBuffer(promoted.buffer, input.mimeType);
        article = extractText({
          kind: 'txt',
          rawText: validated.text,
          sourceSha256,
          filename: originalFilename,
          mimeType,
          byteSize,
          title: overrides.title,
          author: overrides.author,
          publishedAt: overrides.publishedAt,
          language: overrides.language,
        });
      }

      quality = evaluateMediaTextQuality(article);
      contentHash = article.contentHash;
      fetchedBytes = byteSize;
      pageCount = article.diagnostics.file?.pageCount ?? null;
    } else {
      throw new BrainSourceError('source_kind_invalid');
    }
  }

  applyArticleOverrides(article, input, overrides);
  const classification = await classify({
    title: overrides.title || metadataTitle || article.title,
    outlet: metadataOutlet || hostOf(canonicalUrl),
    summary: clean(input.summary, 2000) || metadataSummary || summaryFallback(article),
    url: canonicalUrl,
    detectedLanguage: article.language,
  });
  const lang = normalizeMediaLanguage(
    input.language || article.language,
    classification.lang
  );
  const kindValue = isKind(input.kindOverride) ? input.kindOverride : classification.kind;
  const topic = isTopic(input.topic) ? input.topic : classification.topic;
  const record = buildRecord({
    kind: input.kind,
    originalUrl,
    canonicalUrl,
    article,
    metadataTitle: overrides.title || metadataTitle,
    metadataOutlet,
    metadataSummary: clean(input.summary, 2000) || metadataSummary,
    metadataImage: clean(input.imageUrl, 2048) || metadataImage,
    publishedDate: overrides.publishedAt || metadataPublishedDate || article.publishedAt,
    lang,
    kindValue,
    topic,
  });
  const chunking = chunkArticle(article, 'doc_media_preview', {
    sourceType: 'media_coverage',
  });
  const source: MediaSourceDescriptor = {
    kind: input.kind,
    format: sourceFormatFor(input.kind),
    storagePath: sourcePath,
    sourceSha256,
    contentHash,
    originalFilename,
    mimeType,
    byteSize,
    pageCount,
  };
  const duplicateRecord = await store.findMediaRecordByUrl(record.url, record.canonical_url);
  const duplicateCoverage = duplicateRecord
    ? await store.findMediaCoverageDocument({
        mediaRecordId: duplicateRecord.id,
        canonicalUrl: duplicateRecord.canonical_url,
      })
    : null;

  return {
    record,
    source,
    extraction: extractionFor(article, quality, chunking.chunks.length, {
      format: source.format,
      contentHash,
      sourceSha256,
      fetchedBytes,
      finalUrl,
    }),
    duplicate: duplicateRecord
      ? {
          id: duplicateRecord.id,
          title: duplicateRecord.title,
          status: duplicateRecord.status,
          canonical_url: duplicateRecord.canonical_url,
          coverage: duplicateCoverage,
        }
      : null,
  };
}
