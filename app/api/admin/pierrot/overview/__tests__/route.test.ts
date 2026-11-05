/** @jest-environment node */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { emptyCommercialSummary } from '@/lib/pierrot/commercialSummary';
import type { WorkspaceOverview } from '@/lib/pierrot/workspace/types';
import type { BrainStatusSnapshot } from '@/lib/pierrot/memory/brainStatusTypes';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({})),
}));

jest.mock('@/lib/pierrot/workspace/data', () => ({
  loadWorkspaceOverview: jest.fn(),
}));

jest.mock('@/lib/pierrot/memory/brainStatus', () => ({
  loadBrainStatus: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
};
const data = require('@/lib/pierrot/workspace/data') as {
  loadWorkspaceOverview: jest.Mock;
};
const brain = require('@/lib/pierrot/memory/brainStatus') as {
  loadBrainStatus: jest.Mock;
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

function overview(): WorkspaceOverview {
  const commercial = emptyCommercialSummary('last_7_days');
  return {
    period: 7,
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-08T00:00:00.000Z',
    metrics: [
      ['users', 'Пользователи'],
      ['subscribers', 'Подписчики'],
      ['flow', 'Flow'],
      ['conversations', 'Диалоги'],
      ['media', 'Медиа'],
    ].map(([key, label]) => ({
      key: key as WorkspaceOverview['metrics'][number]['key'],
      label,
      current: 1,
      periodCount: 1,
      previousCount: 1,
      state: 'стоит' as const,
      series: [0, 0, 0, 0, 0, 0, 1],
      available: true,
    })),
    commercial: { ...commercial, complete: true, errors: [] },
    summary: 'Показатели держатся ровно.',
    generatedAt: '2026-11-08T00:00:00.000Z',
  };
}

function brainStatus(): BrainStatusSnapshot {
  return {
    state: 'stable',
    label: 'Stable',
    summary: 'Память актуальна.',
    checkedAt: '2026-11-08T00:00:00.000Z',
    stale: false,
    storageAvailable: true,
    retrievalAvailable: true,
    embeddingProviderAvailable: true,
    metrics: {
      activeRecords: 5,
      archivedRecords: 0,
      uncertainRecords: 0,
      openTasks: 0,
      overdueTasks: 0,
      staleTemporary: 0,
      conflicts: 0,
      embeddingsReady: 5,
      embeddingsPending: 0,
      embeddingsFailed: 0,
      linkedSupersessions: 0,
    },
    issues: [],
  };
}

describe('POST /api/admin/pierrot/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    data.loadWorkspaceOverview.mockResolvedValue(overview());
    brain.loadBrainStatus.mockResolvedValue(brainStatus());
  });

  it('rejects an unauthenticated visitor', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));

    const response = await POST(
      new Request('http://localhost/api/admin/pierrot/overview', { method: 'POST' })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: 'Unauthorized' });
  });

  it('forces a fresh overview and memory check', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/pierrot/overview', { method: 'POST' })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(data.loadWorkspaceOverview).toHaveBeenCalledWith(7);
    expect(brain.loadBrainStatus).toHaveBeenCalledWith(
      expect.anything(),
      'admin-1',
      expect.objectContaining({ force: true })
    );

    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        partial: false,
        overview: expect.objectContaining({ period: 7 }),
        brainStatus: expect.objectContaining({ state: 'stable' }),
      })
    );
  });

  it('keeps the successful half on a partial failure', async () => {
    data.loadWorkspaceOverview.mockRejectedValue(new Error('analytics_unavailable'));

    const response = await POST(
      new Request('http://localhost/api/admin/pierrot/overview', { method: 'POST' })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        partial: true,
        overview: null,
        brainStatus: expect.objectContaining({ state: 'stable' }),
      })
    );
  });

  it('reports a total failure without inventing zeros', async () => {
    data.loadWorkspaceOverview.mockRejectedValue(new Error('analytics_unavailable'));
    brain.loadBrainStatus.mockRejectedValue(new Error('memory_unavailable'));

    const response = await POST(
      new Request('http://localhost/api/admin/pierrot/overview', { method: 'POST' })
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload).toMatchObject({
      ok: false,
      partial: true,
      error: 'refresh_failed',
      overview: null,
      brainStatus: null,
    });
  });
});
