/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-require-imports */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(),
  requireAdminFromRequest: jest.fn(async () => {
    throw new Error('not admin');
  }),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/memory/store', () => ({
  getMemorySummary: jest.fn(),
  listMemoryRecords: jest.fn(),
  createMemoryRecord: jest.fn(),
  updateMemoryRecord: jest.fn(),
  deleteMemoryRecord: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  getCurrentUser: {
    mockResolvedValue: (value: unknown) => void;
    mockResolvedValueOnce: (value: unknown) => void;
  };
};
const memory = require('@/lib/pierrot/memory/store') as {
  getMemorySummary: jest.Mock;
  listMemoryRecords: jest.Mock;
  createMemoryRecord: jest.Mock;
  updateMemoryRecord: jest.Mock;
  deleteMemoryRecord: jest.Mock;
};
const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};
const { PATCH, DELETE } = require('../[id]/route') as {
  PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  DELETE: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
};

const ownerId = '11111111-1111-4111-8111-111111111111';
const memoryId = '33333333-3333-4333-8333-333333333333';

function request(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue({
    id: ownerId,
    role: 'ADMIN',
    profile: { role: 'ADMIN' },
  });
  memory.getMemorySummary.mockResolvedValue({
    counts: { memory: 1, saved: 2, reminder: 3 },
    reminders: [],
    available: true,
  });
  memory.listMemoryRecords.mockResolvedValue([]);
  memory.createMemoryRecord.mockImplementation(async (_store, _userId, input) => ({
    id: memoryId,
    kind: input.kind,
    title: input.title || 'Title',
    content: input.content,
    status: 'current',
    reviewAt: input.reviewAt || null,
  }));
  memory.updateMemoryRecord.mockResolvedValue({
    id: memoryId,
    kind: 'reminder',
    title: 'Check LinkedIn',
    content: 'Check LinkedIn',
    status: 'completed',
  });
  memory.deleteMemoryRecord.mockResolvedValue(true);
});

describe('owner memory API authorization', () => {
  it('rejects a visitor before touching memory storage', async () => {
    auth.getCurrentUser.mockResolvedValue({
      id: ownerId,
      role: 'USER',
      profile: { role: 'USER' },
    });

    const response = await GET(request('http://localhost/api/pierrot/memory?view=summary'));

    expect(response.status).toBe(403);
    expect(memory.getMemorySummary).not.toHaveBeenCalled();
  });

  it('returns summary for the verified owner', async () => {
    const response = await GET(request('http://localhost/api/pierrot/memory?view=summary'));
    const json = (await response.json()) as {
      counts: { memory: number };
    };

    expect(response.status).toBe(200);
    expect(json.counts.memory).toBe(1);
    expect(memory.getMemorySummary).toHaveBeenCalledWith(expect.anything(), ownerId);
  });

  it('creates only for the verified owner', async () => {
    const response = await POST(
      request('http://localhost/api/pierrot/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'memory',
          content: 'Предпочитает короткие ответы.',
        }),
      })
    );
    const json = (await response.json()) as { record: { kind: string } };

    expect(response.status).toBe(201);
    expect(json.record.kind).toBe('memory');
    expect(memory.createMemoryRecord).toHaveBeenCalledWith(
      expect.anything(),
      ownerId,
      expect.objectContaining({ kind: 'memory' })
    );
  });
});

describe('owner memory item API', () => {
  it('completes a reminder', async () => {
    const response = await PATCH(
      request(`http://localhost/api/pierrot/memory/${memoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }),
      { params: Promise.resolve({ id: memoryId }) }
    );
    const json = (await response.json()) as { record: { status: string } };

    expect(response.status).toBe(200);
    expect(json.record.status).toBe('completed');
    expect(memory.updateMemoryRecord).toHaveBeenCalledWith(expect.anything(), ownerId, memoryId, {
      status: 'completed',
    });
  });

  it('deletes only the owner record', async () => {
    const response = await DELETE(
      request(`http://localhost/api/pierrot/memory/${memoryId}?permanent=1`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: memoryId }) }
    );

    expect(response.status).toBe(200);
    expect(memory.deleteMemoryRecord).toHaveBeenCalledWith(expect.anything(), ownerId, memoryId);
  });
});
