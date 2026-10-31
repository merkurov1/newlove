import type { ExtractedArticle } from './extract';
import { extractArticle } from './extract';
import {
  ARTICLE_CHUNKER_VERSION,
  ARTICLE_PARSER_VERSION,
  chunkArticle,
} from './chunk';
import { extractPdfDocument } from './pdfExtract';
import { extractPlainTextDocument } from './textExtract';
import {
  BrainSourceError,
  decodeUtf8Strict,
  deriveFileDocumentId,
  isIncomingStoragePath,
  normalizePublishedAt,
  sha256Hex,
  sourceObjectPathFromPath,
  sourcePathForStorage,
  syntheticSourceUrl,
  validateMetadataOverride,
  validatePdfBuffer,
  validatePastedText,
  validateTxtBuffer,
} from './sourceValidation';
import { createBrainStorage, type BrainStorage } from './storage';
import type { BrainDuplicateInfo, BrainSourceKind, BrainSourceMetadataOverride, BrainSourcePreview } from './sourceTypes';
import type { BrainSourceType } from './store';
import { createBrainStore } from './store';
import { fetchHtmlSafely, normalizeSourceUrl } from './url';

export type PreviewInput =
  | {
      kind: 'url';
      url: string;
      overrides?: BrainSourceMetadataOverride;
    }
  | {
      kind: 'text';
      text: string;
      overrides?: BrainSourceMetadataOverride;
    }
  | {
      kind: 'pdf' | 'txt';
      storagePath: string;
      sourceSha256: string;
      originalFilename?: string | null;
      mimeType?: string | null;
      byteSize?: number | null;
      overrides?: BrainSourceMetadataOverride;
    };

export type PreviewResult = {
  preview: BrainSourcePreview;
  /** The worker must download this stored original; never a public URL. */
  storagePath: string | null;
};

function applyOverrides(
  article: ExtractedArticle,
  overrides: Required<BrainSourceMetadataOverride>
): void {
  if (overrides.title) article.title = overrides.title.slice(0, 200);
  if (overrides.author) article.author = overrides.author.slice(0, 300);
  if (overrides.publishedAt) {
    article.publishedAt = normalizePublishedAt(overrides.publishedAt);
    article.publishedAtSource = article.publishedAt ? 'metadata' : null;
  }
  if (overrides.language) article.language = overrides.language.slice(0, 16);
}

function duplicateType(article: ExtractedArticle): BrainSourceType {
  return article.sourceType === 'article' ? 'article' : article.sourceType;
}

async function findDuplicate(input: {
  store: NonNullable<ReturnType<typeof createBrainStore>>;
  article: ExtractedArticle;
  normalizedUrl: string;
  canonicalUrl: string | null;
  sourceSha256: string;
  kind: BrainSourceKind;
}): Promise<BrainDuplicateInfo | null> {
  const { store, article, normalizedUrl, canonicalUrl, sourceSha256, kind } = input;

  const active = await store.findActiveJobsByUrls([normalizedUrl]).catch(() => []);

  if (active.length > 0) {
    return {
      status: 'existing_active',
      documentId: '',
      title: 'A job for this source is already queued or processing.',
      match: kind === 'url' ? 'normalized_url' : 'source_sha256',
      ingestionStatus: 'queued',
      chunkCount: null,
    };
  }

  const byUrl = kind === 'url'
    ? await store.findDuplicate({ normalizedUrl, canonicalUrl }).catch(() => null)
    : null;

  if (byUrl) {
    return {
      status: 'existing',
      documentId: byUrl.documentId,
      title: byUrl.title,
      match: byUrl.match === 'content_hash' ? 'content_hash' : byUrl.match,
      ingestionStatus: byUrl.ingestionStatus,
      chunkCount: byUrl.chunkCount,
    };
  }

  const bySource = kind !== 'url'
    ? await store
        .findSourceDuplicate({
          sourceSha256,
          sourceTypes: ['pdf', 'txt', 'text'],
        })
        .catch(() => null)
    : null;

  if (bySource) {
    return {
      status: 'existing',
      documentId: bySource.documentId,
      title: bySource.title,
      match: 'source_sha256',
      ingestionStatus: bySource.ingestionStatus,
      chunkCount: bySource.chunkCount,
    };
  }

  const byContent = await store
    .findContentDuplicate({
      contentHash: article.contentHash,
      sourceTypes: ['article', 'pdf', 'txt', 'text'],
      excludeDocumentId: null,
    })
    .catch(() => null);

  if (byContent) {
    return {
      status: 'duplicate_content',
      documentId: byContent.documentId,
      title: byContent.title,
      match: 'content_hash',
      ingestionStatus: byContent.ingestionStatus,
      chunkCount: byContent.chunkCount,
    };
  }

  return null;
}

function previewWarnings(article: ExtractedArticle): string[] {
  const warnings: string[] = [];
  const file = article.diagnostics.file;

  if (article.status === 'needs_review') {
    warnings.push('Extraction requires operator review before it can be indexed.');
  }

  if (file && file.skippedPages.length > 0) {
    warnings.push(
      `Skipped ${file.skippedPages.length} empty or unusable page(s): ${file.skippedPages
        .slice(0, 20)
        .join(', ')}${file.skippedPages.length > 20 ? '…' : ''}.`
    );
  }

  if (file?.ocrSuspected) {
    warnings.push(
      'Part of this PDF looks scanned or image-only. Empty pages were skipped; run OCR before relying on those pages.'
    );
  }

  if (article.charCount < 600 && article.sourceType !== 'article') {
    warnings.push('The extracted text is short. Verify that the document is complete.');
  }

  return warnings;
}

function documentIdFor(input: {
  kind: BrainSourceKind;
  article: ExtractedArticle;
  canonicalUrl: string | null;
  sourceSha256: string;
}): string {
  if (input.kind === 'url' && input.canonicalUrl) {
    return `doc_article_${sha256Hex(input.canonicalUrl).slice(0, 32)}`;
  }

  return deriveFileDocumentId(input.kind as Exclude<BrainSourceKind, 'url'>, input.sourceSha256);
}

export async function previewBrainSource(input: PreviewInput): Promise<PreviewResult> {
  const store = createBrainStore();

  if (!store) {
    throw new BrainSourceError('brain_database_unavailable', undefined, { status: 503 });
  }

  const overrides = validateMetadataOverride(input.overrides);
  const storage = createBrainStorage();

  if (!storage) {
    throw new BrainSourceError('storage_not_configured', undefined, { status: 503 });
  }

  let article: ExtractedArticle;
  let sourceSha256: string;
  let sourcePath: string;
  let storagePath: string | null = null;
  let originalFilename: string | null = null;
  let mimeType: string | null = null;
  let byteSize: number | null = null;
  let normalizedUrl: string;
  let canonicalUrl: string | null = null;

  if (input.kind === 'url') {
    let normalized: string;

    try {
      normalized = normalizeSourceUrl(input.url);
    } catch {
      throw new BrainSourceError('url_invalid');
    }

    normalizedUrl = normalized;
    const fetched = await fetchHtmlSafely(normalized, {
      timeoutMs: 20_000,
      maxBytes: 3_000_000,
      maxRedirects: 5,
    });
    article = extractArticle(fetched.html, fetched.url);

    try {
      canonicalUrl = normalizeSourceUrl(article.canonicalUrl);
    } catch {
      canonicalUrl = normalized;
    }

    article.canonicalUrl = canonicalUrl;
    sourceSha256 = article.contentHash;
    sourcePath =
      canonicalUrl.length <= 500
        ? canonicalUrl
        : `brain/article/${`doc_article_${sha256Hex(canonicalUrl).slice(0, 32)}`}`;
    originalFilename = null;
    mimeType = 'text/html';
    byteSize = Buffer.byteLength(fetched.html, 'utf8');
  } else if (input.kind === 'text') {
    const validated = validatePastedText(input.text);
    const stored = await storage.storeOriginal(validated.bytes, 'text');
    storagePath = stored.sourcePath;
    sourcePath = stored.sourcePath;
    sourceSha256 = stored.sourceSha256;
    byteSize = stored.byteSize;
    normalizedUrl = syntheticSourceUrl(sourceSha256);
    originalFilename = null;
    mimeType = 'text/plain';
    article = extractPlainTextDocument({
      kind: 'text',
      rawText: validated.raw,
      sourceSha256,
      mimeType,
      byteSize,
      title: overrides.title,
      author: overrides.author,
      publishedAt: overrides.publishedAt,
      language: overrides.language,
    });
  } else {
    const storagePathValue = input.storagePath.trim();

    if (!storagePathValue) throw new BrainSourceError('storage_path_invalid');

    if (isIncomingStoragePath(storagePathValue)) {
      const promoted = await storage.promoteIncomingSource({
        incomingPath: storagePathValue,
        kind: input.kind,
        expectedSha256: input.sourceSha256,
      });

      storagePath = promoted.sourcePath;
      sourcePath = promoted.sourcePath;
      sourceSha256 = promoted.sourceSha256;
      byteSize = promoted.byteSize;

      if (input.kind === 'pdf') validatePdfBuffer(promoted.buffer, input.mimeType);

      article =
        input.kind === 'pdf'
          ? await extractPdfDocument(promoted.buffer, {
              sourceSha256,
              filename: input.originalFilename,
              mimeType: input.mimeType || 'application/pdf',
              byteSize,
              title: overrides.title,
              author: overrides.author,
              publishedAt: overrides.publishedAt,
              language: overrides.language,
            })
          : extractPlainTextDocument({
              kind: 'txt',
              rawText: decodeUtf8Strict(validateTxtBuffer(promoted.buffer, input.mimeType).bytes),
              sourceSha256,
              filename: input.originalFilename,
              mimeType: input.mimeType || 'text/plain',
              byteSize,
              title: overrides.title,
              author: overrides.author,
              publishedAt: overrides.publishedAt,
              language: overrides.language,
            });
    } else {
      const objectPath = sourceObjectPathFromPath(storagePathValue);

      if (!objectPath) throw new BrainSourceError('storage_path_invalid');

      const verified = await storage.verifySource({
        sourcePath: storagePathValue,
        sourceSha256: input.sourceSha256,
        kind: input.kind,
      });

      sourcePath = sourcePathForStorage(input.sourceSha256, input.kind);
      storagePath = sourcePath;
      sourceSha256 = input.sourceSha256;
      byteSize = verified.byteSize;

      if (input.kind === 'pdf') validatePdfBuffer(verified.buffer, input.mimeType);

      article =
        input.kind === 'pdf'
          ? await extractPdfDocument(verified.buffer, {
              sourceSha256,
              filename: input.originalFilename,
              mimeType: input.mimeType || 'application/pdf',
              byteSize,
              title: overrides.title,
              author: overrides.author,
              publishedAt: overrides.publishedAt,
              language: overrides.language,
            })
          : extractPlainTextDocument({
              kind: 'txt',
              rawText: decodeUtf8Strict(validateTxtBuffer(verified.buffer, input.mimeType).bytes),
              sourceSha256,
              filename: input.originalFilename,
              mimeType: input.mimeType || 'text/plain',
              byteSize,
              title: overrides.title,
              author: overrides.author,
              publishedAt: overrides.publishedAt,
              language: overrides.language,
            });
    }

    normalizedUrl = syntheticSourceUrl(sourceSha256);
    originalFilename = input.originalFilename || null;
    mimeType = input.mimeType || (input.kind === 'pdf' ? 'application/pdf' : 'text/plain');
  }

  applyOverrides(article, overrides);

  const documentId = documentIdFor({
    kind: input.kind,
    article,
    canonicalUrl,
    sourceSha256,
  });
  const chunking = chunkArticle(article, documentId, {
    sourceType: duplicateType(article),
  });
  const duplicate = await findDuplicate({
    store,
    article,
    normalizedUrl,
    canonicalUrl,
    sourceSha256,
    kind: input.kind,
  });
  const headings = article.blocks
    .filter((block) => block.type === 'heading')
    .map((block) => block.text)
    .slice(0, 20);
  const file = article.diagnostics.file;

  return {
    storagePath,
    preview: {
      kind: input.kind,
      sourceType: duplicateType(article),
      sourceFormat: input.kind === 'url' ? 'url' : input.kind,
      documentId,
      title: article.title,
      author: article.author,
      publishedAt: article.publishedAt,
      language: article.language,
      canonicalUrl: input.kind === 'url' ? canonicalUrl : null,
      normalizedUrl,
      sourcePath,
      sourceSha256,
      contentSha256: article.contentHash,
      storagePath,
      originalFilename,
      mimeType,
      byteSize,
      pageCount: file?.pageCount ?? null,
      usablePageCount: file?.usablePageCount ?? null,
      skippedPages: file?.skippedPages ?? [],
      chunkCount: chunking.chunks.length,
      wordCount: article.wordCount,
      charCount: article.charCount,
      excerpt: article.text.slice(0, 4000),
      headings,
      warnings: previewWarnings(article),
      duplicate,
      parserVersion: ARTICLE_PARSER_VERSION,
      chunkerVersion: ARTICLE_CHUNKER_VERSION,
      extractionVersion: article.extractionVersion,
    },
  };
}
