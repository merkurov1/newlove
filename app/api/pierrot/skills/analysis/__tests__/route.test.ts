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

jest.mock('@/lib/pierrot/skills/analysis/store', () => ({
  isSkillAnalysisStoreAvailable: jest.fn(async () => true),
  getLatestSkillAnalysis: jest.fn(async () => null),
  listRecentSkillAnalyses: jest.fn(async () => []),
}));

jest.mock('@/lib/pierrot/skills/analysis/run', () => ({
  runOwnerSkillAnalysis: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as {
  getCurrentUser: { mockResolvedValue: (value: unknown) => void };
};
const analysisStore = require('@/lib/pierrot/skills/analysis/store') as {
  isSkillAnalysisStoreAvailable: jest.Mock;
};
const analysisRun = require('@/lib/pierrot/skills/analysis/run') as {
  runOwnerSkillAnalysis: jest.Mock;
};
const route = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
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

describe('Skill analysis API', () => {
  it('rejects visitors before loading any analysis', async () => {
    auth.getCurrentUser.mockResolvedValue({ id: ownerId, role: 'USER', profile: { role: 'USER' } });

    const response = await route.GET(new Request('http://localhost/api/pierrot/skills/analysis'));

    expect(response.status).toBe(403);
    expect(analysisStore.isSkillAnalysisStoreAvailable).not.toHaveBeenCalled();
  });

  it('reports a missing migration instead of pretending analysis is saved', async () => {
    analysisStore.isSkillAnalysisStoreAvailable.mockResolvedValueOnce(false);

    const response = await route.GET(new Request('http://localhost/api/pierrot/skills/analysis'));
    const json = (await response.json()) as { available: boolean; reason?: string };

    expect(response.status).toBe(200);
    expect(json.available).toBe(false);
    expect(json.reason).toBe('migration_required');
  });

  it('runs analysis only through the explicit owner POST', async () => {
    analysisRun.runOwnerSkillAnalysis.mockResolvedValueOnce({
      status: 'completed',
      persisted: false,
      stored: null,
      analysis: {
        id: null,
        generatedAt: '2026-11-01T00:00:00.000Z',
        periodDays: 30,
        periodStart: '2026-10-02T00:00:00.000Z',
        periodEnd: '2026-11-01T00:00:00.000Z',
        overview: 'No procedures.',
        sources: [],
        procedures: [],
        problems: [],
        proposals: [],
        skillReviews: [],
        stats: {
          conversations: 0,
          messages: 0,
          devTasks: 0,
          devRequests: 0,
          memoryRecords: 0,
          toolTraceEvents: 0,
        },
      },
    });

    const response = await route.POST(
      new Request('http://localhost/api/pierrot/skills/analysis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 30 }),
      })
    );
    const json = (await response.json()) as {
      available: boolean;
      persisted: boolean;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(json.available).toBe(true);
    expect(json.persisted).toBe(false);
    expect(json.status).toBe('completed');
    expect(analysisRun.runOwnerSkillAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ownerId, days: 30 })
    );
  });
});
