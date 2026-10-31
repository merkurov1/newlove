/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';
import { processNextBrainJob } from '../process';
import { sha256Hex, sourcePathForStorage } from '../sourceValidation';
import type { BrainJobRow, BrainStore } from '../store';

// pdfjs uses a dynamic worker import that Jest's VM cannot execute. The real
// pdf-parse integration is exercised by scripts and the pure PDF extraction
// tests; here we verify the process/storage wiring with a deterministic parser.
jest.mock('pdf-parse', () => ({
  PDFParse: class {
    async getInfo() {
      return {
        total: 1,
        info: { Title: 'Sample PDF', Author: 'Test Author' },
        pages: [],
        getDateNode: () => ({ CreationDate: new Date('2024-01-01T00:00:00Z') }),
      };
    }

    async getText() {
      const text = 'Sample PDF text long enough to be indexed and chunked.';
      return { total: 1, text, pages: [{ num: 1, text }] };
    }

    async destroy() {
      return undefined;
    }
  },
}));

function job(overrides: Partial<BrainJobRow>): BrainJobRow {
  return {
    id: 'job-file',
    run_id: 'run-file',
    input_url: 'brain-upload://placeholder',
    normalized_url: 'brain-upload://placeholder',
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

function fakeStore(initialJob: BrainJobRow) {
  const state = {
    job: { ...initialJob },
    jobs: [initialJob] as BrainJobRow[],
    runStatus: 'running',
    claimed: false,
    documents: [] as Array<Record<string, unknown>>,
    chunks: [] as Array<Record<string, unknown>>,
  };

  const syncJob = () => {
    state.jobs = state.jobs.map((entry) => (entry.id === state.job.id ? state.job : entry));
  };

  const store = {
    getRun: jest.fn(async () => ({
      id: 'run-file',
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
    findSourceDuplicate: jest.fn(async () => null),
    findContentDuplicate: jest.fn(async () => null),
    updateJob: jest.fn(async (_id: string, patch: Partial<BrainJobRow>) => {
      state.job = { ...state.job, ...patch };
      syncJob();
    }),
    updateRun: jest.fn(async (_id: string, patch: { status?: string }) => {
      if (patch.status) state.runStatus = patch.status;
    }),
    insertArticleDocument: jest.fn(async (document: Record<string, unknown>) => {
      state.documents.push(document);
      return { status: 'inserted' as const };
    }),
    updateArticleDocument: jest.fn(async (document: Record<string, unknown>) => {
      state.documents.push(document);
    }),
    insertArticleChunks: jest.fn(async (chunks: Array<Record<string, unknown>>) => {
      state.chunks.push(...chunks);
    }),
    deleteArticleChunksExcept: jest.fn(async () => 0),
    completeArticleDocument: jest.fn(async () => undefined),
    getJob: jest.fn(async () => ({ ...state.job })),
    resetJob: jest.fn(async () => ({ ...state.job, status: 'queued' as const })),
  };

  return { store: store as unknown as BrainStore, state };
}

const storage = {
  downloadSource: jest.fn(async () => Buffer.alloc(0)),
} as unknown as Parameters<typeof processNextBrainJob>[0]['storage'];

describe('Brain file/text ingestion', () => {
  it('indexes pasted text through the same document and chunk pipeline', async () => {
    const text = [
      '# Private note',
      '',
      'Author: Anton Merkurov',
      '',
      'A paragraph with Unicode: Привет, мир.',
      '',
      'A second paragraph for chunking.',
    ].join('\n');
    const buffer = Buffer.from(text, 'utf8');
    const sourceSha = sha256Hex(buffer);
    const sourcePath = sourcePathForStorage(sourceSha, 'txt');
    const { store, state } = fakeStore(
      job({
        source_type: 'text',
        source_format: 'text',
        storage_path: sourcePath,
        source_sha256: sourceSha,
        byte_size: buffer.length,
        input_url: `brain-upload://${sourceSha}`,
        normalized_url: `brain-upload://${sourceSha}`,
      })
    );

    (storage!.downloadSource as unknown as { mockResolvedValue: (value: Buffer) => void }).mockResolvedValue(buffer);

    const result = await processNextBrainJob({
      runId: 'run-file',
      store,
      embeddingClient: embeddingClient(),
      storage,
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]).toMatchObject({
      source_type: 'text',
      source_format: 'text',
      source_sha256: sourceSha,
      source_path: sourcePath,
      access_class: 'owner',
    });
    expect(state.chunks.length).toBeGreaterThan(0);
    expect(state.chunks[0]).toMatchObject({
      document_id: state.documents[0].id,
      access_class: 'owner',
    });
  });

  it('extracts a real PDF server-side and stores page provenance', async () => {
    const buffer = fs.readFileSync(
      path.join(process.cwd(), 'lib', 'knowledge', 'brain', '__tests__', 'fixtures', 'sample.pdf')
    );
    const sourceSha = sha256Hex(buffer);
    const sourcePath = sourcePathForStorage(sourceSha, 'pdf');
    const { store, state } = fakeStore(
      job({
        source_type: 'pdf',
        source_format: 'pdf',
        storage_path: sourcePath,
        source_sha256: sourceSha,
        byte_size: buffer.length,
        original_filename: 'sample.pdf',
        mime_type: 'application/pdf',
      })
    );

    (storage!.downloadSource as unknown as { mockResolvedValue: (value: Buffer) => void }).mockResolvedValue(buffer);

    const result = await processNextBrainJob({
      runId: 'run-file',
      store,
      embeddingClient: embeddingClient(),
      storage,
    });

    expect(result.state).toBe('processed');
    expect(state.job.status).toBe('completed');
    expect(state.documents[0]).toMatchObject({
      source_type: 'pdf',
      source_format: 'pdf',
      page_count: 1,
      original_filename: 'sample.pdf',
      mime_type: 'application/pdf',
    });
    expect(state.documents[0].source_path).toBe(sourcePath);
    expect(state.chunks[0].metadata).toMatchObject({
      source_type: 'pdf',
      page_start: 1,
      page_end: 1,
    });
  });
});
