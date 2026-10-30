/** @jest-environment node */

import { emptyOverview } from '@/lib/analytics/mediaIntelligenceFilters';

const authorizeMediaIntelligence = jest.fn();
const loadMediaIntelligenceOverview = jest.fn();

jest.mock('@/lib/analytics/mediaIntelligenceRoute', () => {
  const actual = jest.requireActual('@/lib/analytics/mediaIntelligenceRoute');

  return {
    ...actual,
    authorizeMediaIntelligence: (...args: unknown[]) => authorizeMediaIntelligence(...args),
  };
});

jest.mock('@/lib/analytics/mediaIntelligence', () => ({
  loadMediaIntelligenceOverview: (...args: unknown[]) => loadMediaIntelligenceOverview(...args),
}));

import { GET } from '../route';

describe('Media Intelligence overview API', () => {
  beforeEach(() => {
    authorizeMediaIntelligence.mockReset();
    loadMediaIntelligenceOverview.mockReset();
  });

  it('rejects unauthenticated requests', async () => {
    authorizeMediaIntelligence.mockResolvedValue({ ok: false });

    const response = await GET(
      new Request('http://localhost/api/admin/media/intelligence/overview')
    );

    expect(response.status).toBe(401);
    expect(loadMediaIntelligenceOverview).not.toHaveBeenCalled();
  });

  it('returns an empty overview instead of failing on an empty archive', async () => {
    authorizeMediaIntelligence.mockResolvedValue({ ok: true, via: 'session', actor: 'admin' });
    loadMediaIntelligenceOverview.mockResolvedValue(emptyOverview());

    const response = await GET(
      new Request('http://localhost/api/admin/media/intelligence/overview')
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.total).toBe(0);
    expect(json.data.quotes.direct).toBe(0);
  });
});
