/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
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
const { POST } = require('../route') as {
  POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
};

const job = {
  id: 'job-1',
  run_id: 'run-1',
  status: 'failed',
  attempts: 3,
  max_attempts: 3,
  extraction_metadata: {},
  extraction_status: 'failed',
};

function store() {
  return {
    getJob: jest.fn(async (_id: string) => job),
    resetJob: jest.fn(async (_id: string) => ({ ...job, status: 'queued' })),
    updateRun: jest.fn(async (_id: string, _patch: unknown) => undefined),
    getJobs: jest.fn(async (_id: string) => [{ ...job, status: 'queued' }]),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  adminAuth.authorizeKnowledgeAdmin.mockResolvedValue({
    ok: true,
    via: 'session',
    actor: 'admin',
  });
});

describe('Brain single-job retry', () => {
  it('requeues a failed job without deleting its document', async () => {
    const mock = store();
    brainStore.createBrainStore.mockReturnValue(mock);

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'job-1' }),
    });
    const body = (await response.json()) as { status: string; job: { status: string } };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.job.status).toBe('queued');
    expect(mock.resetJob).toHaveBeenCalledWith('job-1');
    expect(mock.updateRun).toHaveBeenCalledWith('run-1', {
      status: 'running',
      completed_at: null,
    });
    expect(mock.getJobs).toHaveBeenCalledWith('run-1');
  });

  it('rejects an unauthenticated request', async () => {
    adminAuth.authorizeKnowledgeAdmin.mockResolvedValue({ ok: false });

    const response = await POST(new Request('http://localhost', { method: 'POST' }), {
      params: Promise.resolve({ id: 'job-1' }),
    });

    expect(response.status).toBe(401);
    expect(brainStore.createBrainStore).not.toHaveBeenCalled();
  });
});
