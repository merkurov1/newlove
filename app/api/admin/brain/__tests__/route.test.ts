/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

jest.mock('@/lib/knowledge/adminAuth', () => ({
  authorizeKnowledgeAdmin: jest.fn(async () => ({ ok: true, via: 'session', actor: 'admin' })),
}));

jest.mock('@/lib/knowledge/brain/store', () => ({
  createBrainStore: jest.fn(),
}));

const adminAuth = require('@/lib/knowledge/adminAuth') as {
  authorizeKnowledgeAdmin: MockFn;
};
const brainStore = require('@/lib/knowledge/brain/store') as {
  createBrainStore: MockFn;
};
const { POST } = require('../runs/route') as {
  POST: (request: Request) => Promise<Response>;
};

const existing = {
  id: 'doc_article_existing',
  title: 'Existing article',
  normalized_url: 'https://example.com/article',
  canonical_url: 'https://example.com/article',
  source_url: 'https://example.com/article',
  content_hash: 'a'.repeat(64),
  ingestion_status: 'completed',
  chunk_count: 4,
  created_at: '2026-10-01T00:00:00.000Z',
};

function store() {
  const state = {
    inserted: [] as Array<{ inputUrl: string; normalizedUrl: string }>,
  };

  return {
    state,
    listArticleDocuments: jest.fn(async () => [existing]),
    findActiveJobsByUrls: jest.fn(async () => []),
    createRun: jest.fn(async () => ({
      id: 'run-1',
      status: 'running',
      metadata: {},
      created_at: '',
      updated_at: '',
      completed_at: null,
    })),
    insertJobs: jest.fn(async (_runId: string, jobs: typeof state.inserted) => {
      state.inserted = jobs;
      return jobs.map((job, index) => ({
        id: `job-${index}`,
        run_id: 'run-1',
        ...job,
        status: 'queued',
      }));
    }),
    getJobs: jest.fn(async () => []),
  };
}

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/admin/brain/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  adminAuth.authorizeKnowledgeAdmin.mockResolvedValue({
    ok: true,
    via: 'session',
    actor: 'admin',
  });
});

describe('Brain run creation', () => {
  it('skips existing URLs by default', async () => {
    const mock = store();
    brainStore.createBrainStore.mockReturnValue(mock);

    const response = await POST(request({ urls: 'https://example.com/article' }));
    const body = (await response.json()) as { status: string; skipped: unknown[] };

    expect(response.status).toBe(200);
    expect(body.status).toBe('noop');
    expect(body.skipped).toHaveLength(1);
    expect(mock.insertJobs).not.toHaveBeenCalled();
  });

  it('queues existing URLs when recheckExisting is true', async () => {
    const mock = store();
    brainStore.createBrainStore.mockReturnValue(mock);

    const response = await POST(
      request({ urls: 'https://example.com/article', recheckExisting: true })
    );
    const body = (await response.json()) as { status: string; run: { id: string } };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.run.id).toBe('run-1');
    expect(mock.insertJobs).toHaveBeenCalledWith('run-1', [
      {
        inputUrl: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
      },
    ]);
  });

  it('rejects an unauthenticated request', async () => {
    adminAuth.authorizeKnowledgeAdmin.mockResolvedValue({ ok: false });

    const response = await POST(request({ urls: 'https://example.com/article' }));

    expect(response.status).toBe(401);
    expect(brainStore.createBrainStore).not.toHaveBeenCalled();
  });
});
