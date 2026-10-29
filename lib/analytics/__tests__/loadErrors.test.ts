/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: () => ({
            order: () => ({
              range: async () => ({ data: null, error: { message: 'db unavailable' } }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

const { loadPierrotDashboard } = require('../pierrotIntelligence') as {
  loadPierrotDashboard: (filters: unknown) => Promise<unknown>;
};

describe('Pierrot analytics failure handling', () => {
  it('surfaces a server analytics failure instead of returning empty success data', async () => {
    await expect(
      loadPierrotDashboard({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-31T23:59:59.999Z',
      })
    ).rejects.toThrow('db unavailable');
  });
});
