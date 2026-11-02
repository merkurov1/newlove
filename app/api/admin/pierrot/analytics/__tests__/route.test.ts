/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => {
    throw new Error('Unauthorized');
  }),
  getServerSupabaseClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/analytics/pierrotViews', () => ({
  loadPierrotViewMetrics: jest.fn(async () => ({ overview: [] })),
}));

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

describe('GET /api/admin/pierrot/analytics', () => {
  it('does not expose owner analytics to an unauthenticated visitor', async () => {
    const response = await GET(new Request('http://localhost/api/admin/pierrot/analytics'));

    expect(response.status).toBe(401);
  });
});
