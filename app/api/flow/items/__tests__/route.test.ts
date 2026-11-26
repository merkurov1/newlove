/** @jest-environment node */

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => undefined),
}));

jest.mock('@/lib/flow/publish', () => ({
  createFlowItem: jest.fn(),
}));

jest.mock('@/lib/flow/items-cash', () => ({
  loadFlowItemsPage: jest.fn(),
  invalidateFlowCache: jest.fn(),
}));

const { GET } = require('../route') as {
  GET: (req: Request) => Promise<Response>;
};

const { loadFlowItemsPage } = require('@/lib/flow/items-cash') as {
  loadFlowItemsPage: jest.Mock;
};

function request(path: string): Request {
  return new Request(`https://www.merkurov.love${path}`);
}

const item = {
  id: 'item-1',
  slug: 'item-1',
  title: 'Русская заметка',
  lang: 'ru',
  type: 'note',
  body_md: 'Текст',
  published_at: '2026-11-20T10:00:00.000Z',
  contentType: 'note',
  canonicalUrl: 'https://www.merkurov.love/flow/item-1',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/flow/items', () => {
  it('keeps the public response contract while using the shared loader', async () => {
    loadFlowItemsPage.mockResolvedValue({
      items: [item],
      hasMore: true,
      total: 12,
      nextOffset: 10,
    });

    const response = await GET(request('/api/flow/items?limit=10&offset=10'));
    const json = await response.json();

    expect(loadFlowItemsPage).toHaveBeenCalledWith(10, 10);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(json).toEqual({
      items: [item],
      hasMore: true,
      total: 12,
      nextOffset: 10,
    });
  });

  it('clamps limit and offset exactly as before', async () => {
    loadFlowItemsPage.mockResolvedValue({
      items: [],
      hasMore: false,
      total: 0,
      nextOffset: 0,
    });

    await GET(request('/api/flow/items?limit=999&offset=-5'));

    expect(loadFlowItemsPage).toHaveBeenCalledWith(50, 0);

    await GET(request('/api/flow/items?limit=0&offset=abc'));

    expect(loadFlowItemsPage).toHaveBeenLastCalledWith(10, 0);
  });

  it('returns a JSON 500 with diagnostics when the loader fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    loadFlowItemsPage.mockRejectedValueOnce(new Error('db down'));

    const response = await GET(request('/api/flow/items'));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: 'Internal server error while loading Flow items.',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[api/flow/items] GET error:',
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
