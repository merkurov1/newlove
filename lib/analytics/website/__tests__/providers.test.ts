/** @jest-environment node */

import { AnalyticsProviderError, fetchJson } from '../providers/http';
import { runGa4Report } from '../providers/googleAnalytics';
import { normalizeSiteUrl, querySearchConsole, siteMatchesHost } from '../providers/searchConsole';
import { fetchUmamiPageviews } from '../providers/umami';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('GA4 Data API adapter', () => {
  it('uses the numeric property id and normalizes dimension/metric headers', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? '') });
      return jsonResponse({
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: [{ name: 'sessions' }, { name: 'activeUsers' }],
        rows: [
          {
            dimensionValues: [{ value: '20261101' }],
            metricValues: [{ value: '12' }, { value: '9' }],
          },
        ],
        rowCount: 1,
      });
    }) as typeof fetch;

    const report = await runGa4Report({
      accessToken: 'access-token',
      propertyId: 'properties/123456789',
      definition: {
        key: 'total',
        dimensions: ['date'],
        metrics: ['sessions', 'activeUsers'],
        limit: 10,
      },
      startDate: '2026-11-01',
      endDate: '2026-11-07',
    });

    expect(calls[0].url).toContain('/properties/123456789:runReport');
    expect(JSON.parse(calls[0].body).dateRanges).toEqual([
      { startDate: '2026-11-01', endDate: '2026-11-07' },
    ]);
    expect(report.rows[0]).toMatchObject({
      date: '20261101',
      metrics: { sessions: 12, activeUsers: 9 },
    });
  });

  it('rejects a measurement id instead of silently querying the wrong resource', async () => {
    await expect(
      runGa4Report({
        accessToken: 'token',
        propertyId: 'G-J1F4ZTK9ND',
        definition: { key: 'total', dimensions: ['date'], metrics: ['sessions'], limit: 10 },
        startDate: '2026-11-01',
        endDate: '2026-11-07',
      })
    ).rejects.toThrow('GA4_PROPERTY_ID_INVALID');
  });
});

describe('Search Console adapter', () => {
  it('queries the encoded site and keeps API CTR/position', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        rows: [
          {
            keys: ['2026-11-01', 'flow', 'https://www.merkurov.love/flow', 'gbr', 'DESKTOP'],
            clicks: 4,
            impressions: 100,
            ctr: 0.04,
            position: 8.2,
          },
        ],
      })
    ) as typeof fetch;

    const result = await querySearchConsole({
      accessToken: 'token',
      siteUrl: 'sc-domain:merkurov.love',
      startDate: '2026-11-01',
      endDate: '2026-11-07',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ clicks: 4, impressions: 100, ctr: 0.04, position: 8.2 });
  });

  it('matches Search Console properties to the site host', () => {
    expect(siteMatchesHost('https://www.merkurov.love/', 'www.merkurov.love')).toBe(true);
    expect(siteMatchesHost('sc-domain:merkurov.love', 'www.merkurov.love')).toBe(true);
    expect(siteMatchesHost('https://example.com/', 'merkurov.love')).toBe(false);
    expect(normalizeSiteUrl('https://www.merkurov.love')).toBe('https://www.merkurov.love/');
    expect(normalizeSiteUrl('sc-domain:merkurov.love')).toBe('sc-domain:merkurov.love');
  });
});

describe('Umami adapter', () => {
  it('normalizes daily series without claiming GA4 equivalence', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        pageviews: [
          { x: '2026-11-01', y: 5 },
          { x: '2026-11-02', y: 7 },
        ],
        sessions: [{ x: '2026-11-01', y: 3 }],
      })
    ) as typeof fetch;

    const result = await fetchUmamiPageviews({
      baseUrl: 'https://umami.example.com',
      apiKey: 'key',
      websiteId: 'site',
      startAt: '2026-11-01T00:00:00.000Z',
      endAt: '2026-11-02T23:59:59.999Z',
      timezone: 'Europe/London',
    });

    expect(result.pageviews).toEqual([
      { date: '2026-11-01', value: 5 },
      { date: '2026-11-02', value: 7 },
    ]);
    expect(result.sessions).toEqual([{ date: '2026-11-01', value: 3 }]);
  });
});

describe('controlled retries', () => {
  it('retries a 429 and then returns the successful body', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '0' });
      }
      return jsonResponse({ ok: true });
    }) as typeof fetch;

    const result = await fetchJson<{ ok: boolean }>(
      'https://example.test',
      {},
      { provider: 'google_analytics', retries: 2 }
    );

    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry an authorization failure', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return jsonResponse({ error: 'unauthorized' }, 401);
    }) as typeof fetch;

    await expect(
      fetchJson('https://example.test', {}, { provider: 'google_analytics', retries: 2 })
    ).rejects.toBeInstanceOf(AnalyticsProviderError);

    expect(calls).toBe(1);
  });

  it('keeps the Google API error code and structured diagnostic for a disabled API', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message:
              'Google Analytics Admin API has not been used in project 123 before or it is disabled.',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        },
        403
      )
    ) as typeof fetch;

    try {
      await fetchJson('https://example.test', {}, { provider: 'google_analytics', retries: 0 });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AnalyticsProviderError);
      const providerError = error as AnalyticsProviderError;
      expect(providerError.code).toBe('api_not_enabled');
      expect(providerError.status).toBe(403);
      expect(providerError.googleCode).toBe('SERVICE_DISABLED');
      expect(providerError.googleMessage).toContain('has not been used');
      expect(providerError.retryable).toBe(false);
    }
  });

  it('distinguishes insufficient permissions from a disabled API', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: 'The caller does not have permission',
            details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
          },
        },
        403
      )
    ) as typeof fetch;

    await expect(
      fetchJson('https://example.test', {}, { provider: 'search_console', retries: 0 })
    ).rejects.toMatchObject({
      code: 'insufficient_permissions',
      status: 403,
      googleCode: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
    });
  });

  it('maps missing resources, rate limits, timeouts and upstream failures', async () => {
    const cases: Array<{
      status: number;
      code: string;
      fetchImpl: () => Promise<Response>;
    }> = [
      {
        status: 404,
        code: 'resource_not_found',
        fetchImpl: async () => jsonResponse({ error: { code: 404 } }, 404),
      },
      {
        status: 429,
        code: 'rate_limited',
        fetchImpl: async () => jsonResponse({ error: { code: 429 } }, 429),
      },
      {
        status: 503,
        code: 'upstream_error',
        fetchImpl: async () => jsonResponse({ error: { code: 503 } }, 503),
      },
    ];

    for (const testCase of cases) {
      global.fetch = jest.fn(testCase.fetchImpl) as unknown as typeof fetch;

      await expect(
        fetchJson('https://example.test', {}, { provider: 'google_analytics', retries: 0 })
      ).rejects.toMatchObject({ status: testCase.status, code: testCase.code });
    }

    global.fetch = jest.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;

    await expect(
      fetchJson('https://example.test', {}, { provider: 'google_analytics', retries: 0 })
    ).rejects.toMatchObject({ code: 'timeout', retryable: true });
  });
});
