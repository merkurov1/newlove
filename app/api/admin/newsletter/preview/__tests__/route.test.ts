/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: 'admin-1' })),
  getServerSupabaseClient: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  requireAdminFromRequest: jest.Mock;
  getServerSupabaseClient: jest.Mock;
};
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

const confirmedRu = Array.from({ length: 18 }, (_, index) => ({
  id: `ru-${index + 1}`,
  email: `reader${index + 1}@example.ru`,
  locale: 'ru',
  isActive: true,
  confirmedAt: '2026-11-20T10:00:00.000Z',
}));

const rows = [
  ...confirmedRu,
  {
    id: 'en-unconfirmed',
    email: 'english@example.com',
    locale: 'en',
    isActive: true,
    confirmedAt: null,
  },
  {
    id: 'unconfirmed',
    email: 'unconfirmed@example.ru',
    locale: 'ru',
    isActive: true,
    confirmedAt: null,
  },
  {
    id: 'inactive',
    email: 'inactive@example.ru',
    locale: 'ru',
    isActive: false,
    confirmedAt: '2026-11-20T10:00:00.000Z',
  },
];

function makeStore() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = chain;
  builder.eq = chain;
  builder.not = chain;
  builder.limit = chain;
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve, reject);

  return { from: () => builder };
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.requireAdminFromRequest.mockResolvedValue({ id: 'admin-1' });
  serverAuth.getServerSupabaseClient.mockReturnValue(makeStore());
});

describe('GET /api/admin/newsletter/preview', () => {
  it('previews exactly 18 confirmed RU recipients without sending', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/newsletter/preview?lang=ru')
    );
    const json = (await response.json()) as {
      dryRun?: boolean;
      emailsSent?: number;
      eligibleCount?: number;
      byLanguage?: { ru?: number; en?: number };
      recipients?: Array<{ email?: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.dryRun).toBe(true);
    expect(json.emailsSent).toBe(0);
    expect(json.eligibleCount).toBe(18);
    expect(json.byLanguage).toEqual({ ru: 18, en: 0 });
    expect(json.recipients).toHaveLength(18);
    expect(json.recipients?.every((row) => row.email?.includes('@example.ru'))).toBe(true);
    expect(json.recipients?.some((row) => row.email?.startsWith('r'))).toBe(true);
    expect(JSON.stringify(json)).not.toContain('reader1@example.ru');
  });

  it('previews the EN audience separately', async () => {
    const response = await GET(
      new Request('http://localhost/api/admin/newsletter/preview?lang=en')
    );
    const json = (await response.json()) as { eligibleCount?: number; recipients?: unknown[] };

    expect(response.status).toBe(200);
    expect(json.eligibleCount).toBe(0);
    expect(json.recipients).toHaveLength(0);
  });

  it('requires an admin session', async () => {
    serverAuth.requireAdminFromRequest.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(
      new Request('http://localhost/api/admin/newsletter/preview?lang=ru')
    );

    expect(response.status).toBe(401);
  });
});
