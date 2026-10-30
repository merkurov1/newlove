/** @jest-environment node */

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';

import { chunkArticle } from '../chunk';
import { extractArticle } from '../extract';
import { deriveMediaCoverageDocumentId, processNextBrainJob } from '../process';
import type { BrainJobRow, BrainStore, MediaArchiveRecord, MediaCoverageMatch } from '../store';
import { BrainUrlError } from '../url';

const mediaRecord: MediaArchiveRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  url: 'https://example.com/coverage?utm_source=feed',
  canonical_url: 'https://example.com/coverage',
  title: 'A French publication about digital control',
  outlet: 'Le Monde',
  published_date: '2026-10-13',
  lang: 'fr',
  kind: 'quote',
  topic: 'Internet & Censorship',
  summary: 'A short summary.',
  image_url: null,
  status: 'published',
  ai_metadata: { reviewed: false, import_pending: true },
  updated_at: new Date().toISOString(),
};

const longText =
  'La question du contrôle numérique traverse les institutions, les rédactions et les foyers. '.repeat(
    18
  );

function html(options: { paywall?: boolean; metadataOnly?: boolean } = {}): string {
  if (options.metadataOnly) {
    return `<html lang="fr"><head><title>Only metadata</title>
      <meta name="description" content="A short description only." />
      <link rel="canonical" href="https://example.com/coverage" /></head>
      <body><p>A short description only.</p></body></html>`;
  }

  const paywall = options.paywall ? '<p>Subscribe to continue reading this article.</p>' : '';

  return `<html lang="fr"><head><title>Coverage</title>
    <link rel="canonical" href="https://example.com/coverage" /></head>
    <body><article><h1>Coverage</h1>
      ${paywall}
      <p>${longText}</p><p>${longText}</p><p>${longText}</p>
    </article></body></html>`;
}

function job(overrides: Partial<BrainJobRow> = {}): BrainJobRow {
  return {
    id: 'job-media-1',
    run_id: 'run-media-1',
    input_url: mediaRecord.url,
    normalized_url: mediaRecord.canonical_url,
    canonical_url: null,
    final_url: null,
    status: 'queued',
    attempts: 0,
    max_attempts: 1,
    retry_after: null,
    document_id: null,
    content_hash: null,
    title: null,
    language: null,
    error_code: null,
    error_detail: null,
    extraction_status: null,
    extraction_metadata: {},
    worker_id: null,
    locked_at: null,
    started_at: null,
    processed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_type: 'media_coverage',
    media_record_id: mediaRecord.id,
    requested_by: 'test',
    ...overrides,
  };
}

function embeddingClient(): EmbeddingClient {
  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    embed: jest.fn(async (texts: string[]) =>
      texts.map(() => Array.from({ length: 1024 }, () => 0.01))
    ),
  };
}

function matchFromDocument(document: Record<string, unknown>): MediaCoverageMatch {
  return {
    documentId: String(document.id),
    title: String(document.title || ''),
    match: 'media_record_id',
    ingestionStatus: (document.ingestion_status as string | null) ?? null,
    contentHash: (document.content_hash as string | null) ?? null,
    canonicalUrl: (document.canonical_url as string | null) ?? null,
    normalizedUrl: (document.normalized_url as string | null) ?? null,
    chunkCount: (document.chunk_count as number | null) ?? null,
    sourceType: String(document.source_type || ''),
    mediaRecordId: (document.media_record_id as string | null) ?? null,
    extractionStatus: (document.extraction_status as string | null) ?? null,
    processedAt: (document.processed_at as string | null) ?? null,
    sourceCharCount: (document.source_char_count as number | null) ?? null,
    coverageStatus: (document.media_coverage_status as string | null) ?? null,
    coverageMethod: (document.media_coverage_method as string | null) ?? null,
    textQuality: (document.media_text_quality as string | null) ?? null,
    language: (document.language as string | null) ?? null,
  };
}

function fakeStore(
  existing: MediaCoverageMatch | null = null,
  options: {
    reprintCandidates?: Array<{ mediaRecordId: string; documentId: string }>;
  } = {}
) {
  const state = {
    job: job(),
    jobs: [job()] as BrainJobRow[],
    mediaRecord: { ...mediaRecord },
    runStatus: 'running' as string,
    claimed: false,
    document: existing ? { ...existing } : (null as MediaCoverageMatch | null),
    documents: [] as Array<Record<string, unknown>>,
    chunks: [] as Array<Record<string, unknown>>,
    statusPatches: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  };

  const syncJob = () => {
    state.jobs = state.jobs.map((entry) => (entry.id === state.job.id ? state.job : entry));
  };

  const store = {
    getRun: jest.fn(async () => ({
      id: 'run-media-1',
      status: state.runStatus,
      metadata: {},
      created_at: '',
      updated_at: '',
      completed_at: null,
    })),
    reclaimStaleJobs: jest.fn(async () => 0),
    getJobs: jest.fn(async () => state.jobs.map((entry) => ({ ...entry }))),
    claimNextJob: jest.fn(async () => {
      if (state.claimed) return null;
      state.claimed = true;
      state.job = { ...state.job, status: 'processing', attempts: state.job.attempts + 1 };
      syncJob();
      return { ...state.job };
    }),
    findDuplicate: jest.fn(async () => null),
    getMediaRecord: jest.fn(async () => state.mediaRecord),
    findMediaRecordByUrl: jest.fn(async () => null),
    updateMediaRecord: jest.fn(async (_id: string, patch: Record<string, unknown>) => {
      state.mediaRecord = { ...state.mediaRecord, ...patch } as MediaArchiveRecord;
    }),
    findReprintCandidates: jest.fn(async () => options.reprintCandidates || []),
    upsertMediaRelation: jest.fn(async () => undefined),
    findMediaCoverageDocument: jest.fn(async () => state.document),
    insertMediaCoverageDocument: jest.fn(async (document: Record<string, unknown>) => {
      if (state.document) return { status: 'duplicate' as const };
      state.documents.push(document);
      state.document = matchFromDocument(document);
      return { status: 'inserted' as const };
    }),
    updateMediaCoverageDocument: jest.fn(async (document: Record<string, unknown>) => {
      state.documents.push(document);
      state.document = matchFromDocument(document);
    }),
    updateMediaCoverageMetadata: jest.fn(async (_id: string, patch: Record<string, unknown>) => {
      if (state.document) {
        state.document = {
          ...state.document,
          ...(patch.title ? { title: String(patch.title) } : {}),
          ...(patch.canonical_url ? { canonicalUrl: String(patch.canonical_url) } : {}),
          ...(patch.language ? { language: String(patch.language) } : {}),
        };
      }
    }),
    setMediaCoverageStatus: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      state.statusPatches.push({ id, patch });
      if (state.document) {
        state.document = {
          ...state.document,
          ...(patch.media_coverage_status
            ? { coverageStatus: String(patch.media_coverage_status) }
            : {}),
          ...(patch.ingestion_status ? { ingestionStatus: String(patch.ingestion_status) } : {}),
          ...(patch.extraction_status ? { extractionStatus: String(patch.extraction_status) } : {}),
          ...(patch.media_coverage_method
            ? { coverageMethod: String(patch.media_coverage_method) }
            : {}),
          ...(patch.content_hash !== undefined
            ? { contentHash: (patch.content_hash as string | null) ?? null }
            : {}),
          ...(patch.chunk_count !== undefined ? { chunkCount: Number(patch.chunk_count) } : {}),
          ...(patch.processed_at !== undefined
            ? { processedAt: (patch.processed_at as string | null) ?? null }
            : {}),
          ...(patch.media_text_quality !== undefined
            ? { textQuality: (patch.media_text_quality as string | null) ?? null }
            : {}),
        };
      }
    }),
    updateJob: jest.fn(async (_id: string, patch: Partial<BrainJobRow>) => {
      state.job = { ...state.job, ...patch };
      syncJob();
    }),
    updateRun: jest.fn(async (_id: string, patch: { status?: string }) => {
      if (patch.status) state.runStatus = patch.status;
    }),
    insertArticleChunks: jest.fn(async (chunks: Array<Record<string, unknown>>) => {
      state.chunks.push(...chunks);
    }),
    deleteArticleChunksExcept: jest.fn(async () => 0),
    completeArticleDocument: jest.fn(async () => undefined),
    getJob: jest.fn(async () => ({ ...state.job })),
    resetJob: jest.fn(async () => ({ ...state.job, status: 'queued' as const })),
  };

  return { store: store as unknown as BrainStore, state, raw: store };
}

async function run(
  store: BrainStore,
  options: {
    client?: EmbeddingClient;
    fetch?: (url: string) => Promise<{
      url: string;
      html: string;
      status: number;
      contentType: string;
      bytes: number;
    }>;
  } = {}
) {
  return processNextBrainJob({
    runId: 'run-media-1',
    store,
    embeddingClient: options.client ?? embeddingClient(),
    workerId: 'test-media-worker',
    mediaRecord,
    fetchArticle:
      options.fetch ??
      (async (url) => ({
        url,
        html: html(),
        status: 200,
        contentType: 'text/html',
        bytes: html().length,
      })),
  });
}

describe('Media coverage ingestion', () => {
  it('derives a stable document id from the media record id', () => {
    expect(deriveMediaCoverageDocumentId(mediaRecord.id)).toBe(
      'doc_media_11111111111141118111111111111111'
    );
    expect(() => deriveMediaCoverageDocumentId('not-a-uuid')).toThrow('media_record_id_invalid');
  });

  it('indexes full text as media_coverage with archive provenance', async () => {
    const { store, state, raw } = fakeStore();

    const result = await run(store);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.job.document_id).toBe(deriveMediaCoverageDocumentId(mediaRecord.id));
    expect(raw.insertMediaCoverageDocument).toHaveBeenCalledTimes(1);
    expect(raw.insertArticleChunks).toHaveBeenCalled();
    expect(state.chunks.length).toBeGreaterThan(0);

    const document = state.documents.at(-1) as Record<string, unknown>;
    expect(document.source_type).toBe('media_coverage');
    expect(document.media_record_id).toBe(mediaRecord.id);
    expect(document.media_outlet).toBe('Le Monde');
    expect(document.media_kind).toBe('mention');
    expect(document.media_topic).toBe('Internet & Censorship');
    expect(document.media_language).toBe('FR');
    expect(document.language).toBe('fr');
    expect(document.published_at).toBe('2026-10-13T00:00:00.000Z');
    expect(document.media_published_date).toBe('2026-10-13');
    expect(document.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(document.chunk_count).toBeGreaterThan(0);
    expect(document.media_coverage_status).toBe('completed');
    expect(document.media_coverage_method).toBe('brain-article-extractor-v2');
    expect((document.metadata as Record<string, unknown>).content_origin).toBe('full_text');
    expect((document.metadata as Record<string, unknown>).media_record_id).toBe(mediaRecord.id);
  });

  it('adds media provenance to chunks without changing article chunking', () => {
    const article = extractArticle(html(), mediaRecord.canonical_url);
    const media = chunkArticle(article, 'doc_media_test', {
      sourceType: 'media_coverage',
      mediaRecordId: mediaRecord.id,
    });
    const ordinary = chunkArticle(article, 'doc_article_test');

    expect(media.chunks[0].metadata).toMatchObject({
      source_type: 'media_coverage',
      media_record_id: mediaRecord.id,
    });
    expect(ordinary.chunks[0].metadata).toMatchObject({ source_type: 'article' });
    expect(ordinary.chunks[0].metadata.media_record_id).toBeUndefined();
  });

  it('marks identical text at another media record as a reprint relation', async () => {
    const { store, raw } = fakeStore(null, {
      reprintCandidates: [
        { mediaRecordId: '22222222-2222-4222-8222-222222222222', documentId: 'doc_media_other' },
      ],
    });

    await run(store);

    expect(raw.upsertMediaRelation).toHaveBeenCalledWith(
      expect.objectContaining({
        relationType: 'reprint',
        targetMediaRecordId: '22222222-2222-4222-8222-222222222222',
        detectedBy: 'content_hash',
      })
    );
    expect(raw.insertArticleChunks).toHaveBeenCalled();
  });

  it('does not re-embed unchanged coverage', async () => {
    const article = extractArticle(html(), mediaRecord.canonical_url);
    const existing: MediaCoverageMatch = {
      documentId: deriveMediaCoverageDocumentId(mediaRecord.id),
      title: mediaRecord.title,
      match: 'media_record_id',
      ingestionStatus: 'completed',
      contentHash: article.contentHash,
      canonicalUrl: 'https://example.com/old-coverage',
      normalizedUrl: mediaRecord.canonical_url,
      chunkCount: 3,
      sourceCharCount: 3000,
      sourceType: 'media_coverage',
      mediaRecordId: mediaRecord.id,
      extractionStatus: 'complete',
      processedAt: new Date().toISOString(),
      coverageStatus: 'completed',
      coverageMethod: 'brain-article-extractor-v2',
      textQuality: 'full_text',
      language: 'fr',
    };
    const { store, state, raw } = fakeStore(existing);

    const result = await run(store);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('duplicate');
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
    expect(raw.deleteArticleChunksExcept).not.toHaveBeenCalled();
    expect(state.chunks).toHaveLength(0);
    expect(state.document?.coverageStatus).toBe('completed');
    expect(state.document?.canonicalUrl).toBe(mediaRecord.canonical_url);
  });

  it('updates the same document and replaces chunks when text changed', async () => {
    const existing: MediaCoverageMatch = {
      documentId: deriveMediaCoverageDocumentId(mediaRecord.id),
      title: mediaRecord.title,
      match: 'media_record_id',
      ingestionStatus: 'completed',
      contentHash: 'b'.repeat(64),
      canonicalUrl: mediaRecord.canonical_url,
      normalizedUrl: mediaRecord.canonical_url,
      chunkCount: 2,
      sourceCharCount: 2000,
      sourceType: 'media_coverage',
      mediaRecordId: mediaRecord.id,
      extractionStatus: 'complete',
      processedAt: new Date().toISOString(),
      coverageStatus: 'completed',
      coverageMethod: 'brain-article-extractor-v2',
      textQuality: 'full_text',
      language: 'fr',
    };
    const { store, state, raw } = fakeStore(existing);

    const result = await run(store);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.job.document_id).toBe(existing.documentId);
    expect(raw.updateMediaCoverageDocument).toHaveBeenCalledTimes(1);
    expect(raw.insertMediaCoverageDocument).not.toHaveBeenCalled();
    expect(raw.insertArticleChunks).toHaveBeenCalled();
    expect(raw.deleteArticleChunksExcept).toHaveBeenCalled();
    expect(state.document?.contentHash).not.toBe(existing.contentHash);
    expect(state.document?.coverageStatus).toBe('completed');
  });

  it('indexes usable paywalled text as partial_text, not full_text', async () => {
    const { store, state, raw } = fakeStore();

    const result = await run(store, {
      fetch: async (url) => ({
        url,
        html: html({ paywall: true }),
        status: 200,
        contentType: 'text/html',
        bytes: html({ paywall: true }).length,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(raw.insertArticleChunks).toHaveBeenCalled();
    expect(state.document?.coverageStatus).toBe('partial');
    expect(state.document?.textQuality).toBe('partial_text');
    expect(state.document?.ingestionStatus).toBe('completed');
    expect(state.document?.chunkCount).toBeGreaterThan(0);
  });

  it('marks paywalled coverage as blocked without indexing chunks', async () => {
    const { store, state, raw } = fakeStore();

    const result = await run(store, {
      fetch: async (url) => ({
        url,
        html: '<html lang="fr"><head><title>Locked</title><link rel="canonical" href="https://example.com/coverage" /></head><body><article><p>Subscribe to continue reading this article.</p></article></body></html>',
        status: 200,
        contentType: 'text/html',
        bytes: 180,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(state.job.error_code).toBe('paywall_detected');
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
    expect(state.chunks).toHaveLength(0);
    expect(state.document?.coverageStatus).toBe('blocked');
    expect(state.document?.ingestionStatus).toBe('pending');
    expect(state.document?.chunkCount).toBe(0);
  });

  it('preserves an existing indexed document when a later check hits a paywall', async () => {
    const existing: MediaCoverageMatch = {
      documentId: deriveMediaCoverageDocumentId(mediaRecord.id),
      title: mediaRecord.title,
      match: 'media_record_id',
      ingestionStatus: 'completed',
      contentHash: 'b'.repeat(64),
      canonicalUrl: mediaRecord.canonical_url,
      normalizedUrl: mediaRecord.canonical_url,
      chunkCount: 3,
      sourceCharCount: 3000,
      sourceType: 'media_coverage',
      mediaRecordId: mediaRecord.id,
      extractionStatus: 'complete',
      processedAt: new Date().toISOString(),
      coverageStatus: 'completed',
      coverageMethod: 'brain-article-extractor-v2',
      textQuality: 'full_text',
      language: 'fr',
    };
    const { store, state, raw } = fakeStore(existing);

    const result = await run(store, {
      fetch: async (url) => ({
        url,
        html: html({ paywall: true }),
        status: 200,
        contentType: 'text/html',
        bytes: html({ paywall: true }).length,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
    expect(raw.deleteArticleChunksExcept).not.toHaveBeenCalled();
    expect(state.document?.coverageStatus).toBe('partial');
    expect(state.document?.ingestionStatus).toBe('completed');
    expect(state.document?.chunkCount).toBe(3);
    expect(state.document?.textQuality).toBe('full_text');
  });

  it('does not treat title and description as successfully indexed text', async () => {
    const { store, state, raw } = fakeStore();

    const result = await run(store, {
      fetch: async (url) => ({
        url,
        html: html({ metadataOnly: true }),
        status: 200,
        contentType: 'text/html',
        bytes: html({ metadataOnly: true }).length,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('failed');
    expect(state.job.error_code).toBe('metadata_only');
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
    expect(state.chunks).toHaveLength(0);
    expect(state.document?.coverageStatus).toBe('failed');
    expect(state.document?.ingestionStatus).toBe('pending');
  });

  it('records safe failure state when the source cannot be fetched', async () => {
    const { store, state } = fakeStore();

    const result = await run(store, {
      fetch: async () => {
        throw new BrainUrlError('fetch_timeout');
      },
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('failed');
    expect(state.job.error_code).toBe('fetch_timeout');
    expect(state.job.error_detail).toBe('The page took too long to load.');
    expect(state.document?.coverageStatus).toBe('failed');
    expect(state.document?.ingestionStatus).toBe('pending');
  });
});
