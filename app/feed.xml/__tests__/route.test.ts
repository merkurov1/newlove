/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          not: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    title: 'Journal entry',
                    slug: 'journal-entry',
                    publishedAt: '2026-10-31T09:00:00.000Z',
                    createdAt: '2026-10-31T08:00:00.000Z',
                    content: '<p>Journal body</p>',
                    kind: 'letter',
                    status: 'published',
                    published: true,
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

const { GET } = require('../route') as {
  GET: () => Promise<Response>;
};

describe('GET /feed.xml', () => {
  it('serves the Journal feed with a /feed.xml self link', async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(body).toContain('<title>Anton Merkurov — Journal</title>');
    expect(body).toContain(
      '<atom:link href="https://www.merkurov.love/feed.xml" rel="self" type="application/rss+xml" />'
    );
    expect(body).not.toContain('Flow — Anton Merkurov');
  });
});
