/** @jest-environment node */

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import { EmbeddingProviderError } from '@/lib/knowledge/rag/errors';

import { processNextBrainJob } from '../process';
import { extractArticle } from '../extract';
import { BrainUrlError } from '../url';
import type { BrainJobRow, BrainStore } from '../store';

const longText =
  'This is a long-form column about art, memory and the architecture of attention. '.repeat(20);

function html(): string {
  return `<html><head><title>Attention</title><link rel="canonical" href="https://example.com/column" /></head>
    <body><article><h1>Attention</h1>
      <p>${longText}</p><p>${longText}</p><p>${longText}</p>
    </article></body></html>`;
}

function job(overrides: Partial<BrainJobRow> = {}): BrainJobRow {
  return {
    id: 'job-1',
    run_id: 'run-1',
    input_url: 'https://example.com/column?utm_source=feed',
    normalized_url: 'https://example.com/column',
    canonical_url: null,
    final_url: null,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
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

function fakeStore(
  initialJob: BrainJobRow,
  duplicate: Awaited<ReturnType<BrainStore['findDuplicate']>> = null
) {
  const state = {
    job: { ...initialJob },
    jobs: [initialJob] as BrainJobRow[],
    runStatus: 'running' as string,
    claimed: false,
    documents: [] as unknown[],
    chunks: [] as unknown[],
    completed: [] as string[],
  };

  const syncJob = () => {
    state.jobs = state.jobs.map((entry) => (entry.id === state.job.id ? state.job : entry));
  };

  const store = {
    getRun: jest.fn(async () => ({
      id: 'run-1',
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
    findDuplicate: jest.fn(async () => duplicate),
    updateJob: jest.fn(async (_id: string, patch: Partial<BrainJobRow>) => {
      state.job = { ...state.job, ...patch };
      syncJob();
    }),
    updateRun: jest.fn(async (_id: string, patch: { status?: string }) => {
      if (patch.status) state.runStatus = patch.status;
    }),
    insertArticleDocument: jest.fn(async (document: unknown) => {
      state.documents.push(document);
      return { status: 'inserted' as const };
    }),
    updateArticleDocument: jest.fn(async (document: unknown) => {
      state.documents.push(document);
    }),
    insertArticleChunks: jest.fn(async (chunks: unknown[]) => {
      state.chunks.push(...chunks);
    }),
    deleteArticleChunksExcept: jest.fn(async () => 0),
    completeArticleDocument: jest.fn(async (documentId: string, _status?: string) => {
      state.completed.push(documentId);
    }),
    getJob: jest.fn(async () => ({ ...state.job })),
    resetJob: jest.fn(async () => ({ ...state.job, status: 'queued' as const })),
  };

  return { store: store as unknown as BrainStore, state, raw: store };
}

async function run(store: BrainStore, client: EmbeddingClient = embeddingClient()) {
  return processNextBrainJob({
    runId: 'run-1',
    store,
    embeddingClient: client,
    workerId: 'test-worker',
    fetchArticle: async (url) => ({
      url,
      html: html(),
      status: 200,
      contentType: 'text/html',
      bytes: html().length,
    }),
  });
}

describe('Brain ingestion worker', () => {
  it('extracts, embeds and indexes a new article', async () => {
    const { store, state, raw } = fakeStore(job());

    const result = await run(store);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.job.document_id).toMatch(/^doc_article_[a-f0-9]{32}$/);
    expect(raw.insertArticleDocument).toHaveBeenCalledTimes(1);
    expect(raw.insertArticleChunks).toHaveBeenCalled();
    expect(state.completed).toHaveLength(1);

    const document = state.documents[0] as Record<string, unknown>;
    expect(document.source_type).toBe('article');
    expect(document.access_class).toBe('owner');
    expect(document.canonical_url).toBe('https://example.com/column');
    expect(document.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Number(document.chunk_count)).toBeGreaterThan(0);
    expect(document.extraction_status).toBe('complete');
    expect((document.metadata as Record<string, unknown>).source_domain).toBe('example.com');
    expect((document.metadata as Record<string, unknown>).change).toBe('inserted');
    expect(state.job.extraction_status).toBe('complete');
    expect((state.job.extraction_metadata as Record<string, unknown>).chunks).toBe(
      document.chunk_count
    );
  });

  it('updates the existing logical document when the content changed', async () => {
    const { store, state, raw } = fakeStore(job(), {
      documentId: 'doc_article_existing',
      title: 'Existing article',
      match: 'normalized_url',
      ingestionStatus: 'completed',
      contentHash: 'b'.repeat(64),
      canonicalUrl: 'https://example.com/column',
      normalizedUrl: 'https://example.com/column',
      chunkCount: 2,
    });

    const result = await run(store);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.job.document_id).toBe('doc_article_existing');
    expect(raw.updateArticleDocument).toHaveBeenCalledTimes(1);
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
    expect(raw.deleteArticleChunksExcept).toHaveBeenCalled();
    expect(state.completed).toEqual(['doc_article_existing']);
    expect((state.job.extraction_metadata as Record<string, unknown>).change).toBe('updated');
    expect((state.job.extraction_metadata as Record<string, unknown>).previous_content_hash).toBe(
      'b'.repeat(64)
    );
  });

  it('fetches a known URL and marks it duplicate when the content is unchanged', async () => {
    const existingHash = extractArticle(html(), 'https://example.com/column').contentHash;
    const { store, state } = fakeStore(job(), {
      documentId: 'doc_article_existing',
      title: 'Existing article',
      match: 'normalized_url',
      ingestionStatus: 'completed',
      contentHash: existingHash,
      canonicalUrl: 'https://example.com/column',
      normalizedUrl: 'https://example.com/column',
      chunkCount: 3,
    });

    const fetchArticle = jest.fn(async (url: string) => ({
      url,
      html: html(),
      status: 200,
      contentType: 'text/html',
      bytes: html().length,
    }));

    const result = await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle,
    });

    expect(result.state).toBe('processed');
    expect(fetchArticle).toHaveBeenCalledTimes(1);
    expect(state.job.status).toBe('duplicate');
    expect(state.job.document_id).toBe('doc_article_existing');
  });

  it('marks paywalled or partial extraction without indexing', async () => {
    const { store, state, raw } = fakeStore(job());

    const result = await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle: async (url) => ({
        url,
        html: '<html><head><title>Locked</title></head><body><article><p>Subscribe to continue reading this article.</p></article></body></html>',
        status: 200,
        contentType: 'text/html',
        bytes: 100,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(state.job.extraction_status).toBe('partial');
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
  });

  it('preserves an existing good document when a later extraction is partial', async () => {
    const { store, state, raw } = fakeStore(job(), {
      documentId: 'doc_article_existing',
      title: 'Existing article',
      match: 'normalized_url',
      ingestionStatus: 'completed',
      contentHash: 'a'.repeat(64),
      canonicalUrl: 'https://example.com/column',
      normalizedUrl: 'https://example.com/column',
      chunkCount: 4,
    });

    const result = await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle: async (url) => ({
        url,
        html: '<html><head><title>Locked</title></head><body><article><p>Subscribe to continue reading this article.</p></article></body></html>',
        status: 200,
        contentType: 'text/html',
        bytes: 100,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(state.job.document_id).toBe('doc_article_existing');
    expect(raw.updateArticleDocument).not.toHaveBeenCalled();
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
    expect(
      (state.job.extraction_metadata as Record<string, unknown>).existing_document_preserved
    ).toBe(true);
  });

  it('marks structurally weak extraction as needs_review without indexing', async () => {
    const { store, state, raw } = fakeStore(job());

    const weakHtml = `<html><head><title>Review me</title></head><body><article>${Array.from(
      { length: 3 },
      (_, index) =>
        `<p>Paragraph ${index + 1}. ${Array.from({ length: 55 }, (_, word) => `word${word + 1}`).join(' ')}.</p>`
    ).join('')}</article></body></html>`;

    const result = await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle: async (url) => ({
        url,
        html: weakHtml,
        status: 200,
        contentType: 'text/html',
        bytes: weakHtml.length,
      }),
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('partial');
    expect(state.job.extraction_status).toBe('needs_review');
    expect(state.job.error_code).toBe('needs_review');
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
    expect(raw.insertArticleChunks).not.toHaveBeenCalled();
  });

  it('retries transient embedding failures with a bounded backoff', async () => {
    const { store, state, raw } = fakeStore(job());

    const failingClient: EmbeddingClient = {
      ...embeddingClient(),
      embed: jest.fn(async () => {
        throw new EmbeddingProviderError('request_failed', 503);
      }),
    };

    const result = await run(store, failingClient);

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('queued');
    expect(state.job.error_code).toBe('embedding_failed');
    expect(state.job.retry_after).toBeTruthy();
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
  });

  it('does not index the same job twice when two workers race', async () => {
    const { store, state, raw } = fakeStore(job());

    const [first, second] = await Promise.all([run(store), run(store)]);

    expect([first.state, second.state]).toContain('processed');
    expect(raw.insertArticleDocument).toHaveBeenCalledTimes(1);
    expect(state.documents).toHaveLength(1);
    expect(state.completed).toHaveLength(1);
  });

  it('marks permanent embedding authentication failures as failed without retry', async () => {
    const { store, state, raw } = fakeStore(job());

    const failingClient: EmbeddingClient = {
      ...embeddingClient(),
      embed: jest.fn(async () => {
        throw new EmbeddingProviderError('request_failed', 401);
      }),
    };

    await run(store, failingClient);

    expect(state.job.status).toBe('failed');
    expect(state.job.error_code).toBe('embedding_auth_failed');
    expect(state.job.retry_after).toBeNull();
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
  });

  it('marks permanent payment errors as failed without retry', async () => {
    const { store, state } = fakeStore(job());

    const failingClient: EmbeddingClient = {
      ...embeddingClient(),
      embed: jest.fn(async () => {
        throw new EmbeddingProviderError('request_failed', 402);
      }),
    };

    await run(store, failingClient);

    expect(state.job.status).toBe('failed');
    expect(state.job.error_code).toBe('embedding_payment_required');
    expect(state.job.retry_after).toBeNull();
  });

  it('does not retry an upstream HTTP 402', async () => {
    const { store, state, raw } = fakeStore(job());

    await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle: async () => {
        throw new BrainUrlError('http_status_402');
      },
    });

    expect(state.job.status).toBe('failed');
    expect(state.job.error_code).toBe('http_status_402');
    expect(state.job.retry_after).toBeNull();
    expect(raw.insertArticleDocument).not.toHaveBeenCalled();
  });
});
