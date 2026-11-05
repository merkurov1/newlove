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

jest.mock('@/lib/pierrot/memory/brainStatus', () => ({
  loadBrainStatus: jest.fn(async () => ({
    state: 'stable',
    label: 'Stable',
    summary: 'Память актуальна.',
    checkedAt: '2026-11-19T10:00:00.000Z',
    stale: false,
    storageAvailable: true,
    retrievalAvailable: true,
    embeddingProviderAvailable: true,
    metrics: {},
    issues: [],
  })),
}));

const auth = require('@/lib/serverAuth') as {
  getCurrentUser: { mockResolvedValue: (value: unknown) => void };
};
const brain = require('@/lib/pierrot/memory/brainStatus') as {
  loadBrainStatus: jest.Mock;
};
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

const ownerId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  jest.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue({
    id: ownerId,
    role: 'ADMIN',
    profile: { role: 'ADMIN' },
  });
});

describe('Brain status API', () => {
  it('rejects a visitor before reading memory storage', async () => {
    auth.getCurrentUser.mockResolvedValue({
      id: ownerId,
      role: 'USER',
      profile: { role: 'USER' },
    });

    const response = await GET(new Request('http://localhost/api/pierrot/brain-status'));
    expect(response.status).toBe(403);
    expect(brain.loadBrainStatus).not.toHaveBeenCalled();
  });

  it('returns the cached snapshot for the verified owner', async () => {
    const response = await GET(new Request('http://localhost/api/pierrot/brain-status?detail=1'));
    const json = (await response.json()) as { state: string };

    expect(response.status).toBe(200);
    expect(json.state).toBe('stable');
    expect(brain.loadBrainStatus).toHaveBeenCalledWith(
      expect.anything(),
      ownerId,
      expect.objectContaining({ detailed: true })
    );
  });
});
