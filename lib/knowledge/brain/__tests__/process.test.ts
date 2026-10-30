/** @jest-environment node */

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import { EmbeddingProviderError } from '@/lib/knowledge/rag/errors';

import { processNextBrainJob } from '../process';
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

function fakeStore(initialJob: BrainJobRow, duplicate: Awaited<ReturnType<BrainStore['findDuplicate']>> = null) {
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
    completeArticleDocument: jest.fn(async (documentId: string) => {
      state.completed.push(documentId);
    }),
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
  });

  it('does not fetch or re-embed an article that already exists', async () => {
    const { store, state } = fakeStore(job(), {
      documentId: 'doc_article_existing',
      title: 'Existing article',
      match: 'normalized_url',
      ingestionStatus: 'completed',
    });

    const fetchArticle = jest.fn();

    const result = await processNextBrainJob({
      runId: 'run-1',
      store,
      embeddingClient: embeddingClient(),
      workerId: 'test-worker',
      fetchArticle,
    });

    expect(result.state).toBe('processed');
    expect(fetchArticle).not.toHaveBeenCalled();
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
});
