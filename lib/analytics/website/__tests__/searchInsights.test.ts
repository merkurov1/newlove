/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { GSC_READONLY_SCOPE, missingRequiredScope } from '../config';
import { previousWindow } from '../period';
import { fetchSearchConsoleRows } from '../providers/searchConsole';
import { syncOutcome } from '../sync';
import {
  buildSearchBrandSplit,
  detectSearchAnomalies,
  expectedSearchDataEnd,
  isBrandQuery,
  rowsUpTo,
  searchDeltaPercent,
  DEFAULT_SEARCH_THRESHOLDS,
} from '../searchInsights';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function rawRow(input: {
  date?: string;
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  position?: number;
}) {
  return {
    keys: [input.date ?? '2026-11-10', input.query ?? '', input.page ?? '/', 'usa', 'DESKTOP'],
    clicks: input.clicks,
    impressions: input.impressions,
    ctr: input.impressions > 0 ? input.clicks / input.impressions : 0,
    position: input.position ?? 5,
  };
}

function searchRow(input: {
  date?: string;
  query?: string;
  page?: string;
  clicks: number;
  impressions: number;
  position?: number;
}) {
  return {
    metric_date: input.date ?? '2026-11-10',
    query: input.query ?? '',
    page: input.page ?? '/',
    country: 'usa',
    device: 'DESKTOP',
    clicks: input.clicks,
    impressions: input.impressions,
    position: input.position ?? 5,
  };
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('Search Console API pagination', () => {
  it('requests every page until the provider returns a short page', async () => {
    const startRows: number[] = [];
    const pages = [
      [rawRow({ clicks: 1, impressions: 10 }), rawRow({ clicks: 2, impressions: 20 })],
      [rawRow({ clicks: 3, impressions: 30 })],
    ];

    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { startRow?: number };
      startRows.push(Number(body.startRow ?? 0));
      return jsonResponse({ rows: pages[Number(body.startRow ?? 0) / 2] ?? [] });
    }) as typeof fetch;

    const result = await fetchSearchConsoleRows({
      accessToken: 'token',
      siteUrl: 'sc-domain:merkurov.love',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
      pageSize: 2,
    });

    expect(startRows).toEqual([0, 2]);
    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it('marks a reached row cap as truncated instead of complete', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        rows: [rawRow({ clicks: 1, impressions: 1 }), rawRow({ clicks: 1, impressions: 1 })],
      })
    ) as typeof fetch;

    const result = await fetchSearchConsoleRows({
      accessToken: 'token',
      siteUrl: 'sc-domain:merkurov.love',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
      pageSize: 2,
      maxRows: 3,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });
});

describe('Search Console lag and date windows', () => {
  it('excludes the last three days from a comparable window', () => {
    const expectedEnd = expectedSearchDataEnd({ today: '2026-11-20' });
    expect(expectedEnd).toBe('2026-11-17');

    const rows = [
      searchRow({ date: '2026-11-16', clicks: 1, impressions: 10 }),
      searchRow({ date: '2026-11-17', clicks: 2, impressions: 20 }),
      searchRow({ date: '2026-11-18', clicks: 9, impressions: 90 }),
      searchRow({ date: '2026-11-19', clicks: 9, impressions: 90 }),
    ];

    expect(rowsUpTo(rows, expectedEnd).map((row) => row.metric_date)).toEqual([
      '2026-11-16',
      '2026-11-17',
    ]);
  });

  it('builds the immediately preceding 28-day window and compares like with like', () => {
    expect(previousWindow('2026-10-21', '2026-11-17')).toEqual({
      start: '2026-09-23',
      end: '2026-10-20',
    });
    expect(searchDeltaPercent(39, 128)).toBeCloseTo(-69.53125, 5);
    // A zero previous value must not be reported as infinite growth.
    expect(searchDeltaPercent(3, 0)).toBeNull();
  });
});

describe('Search Console brand split and anomaly thresholds', () => {
  it('separates brand and non-brand using documented terms', () => {
    const rows = [
      searchRow({ query: 'anton merkurov', clicks: 2, impressions: 50 }),
      searchRow({ query: 'меркуров heritage', clicks: 1, impressions: 30 }),
      searchRow({ query: 'contemporary art market', clicks: 0, impressions: 20 }),
    ];
    const split = buildSearchBrandSplit(rows, [], ['merkurov', 'меркуров']);

    expect(isBrandQuery('ANTON MERKUROV', ['merkurov'])).toBe(true);
    expect(isBrandQuery('art market', ['merkurov'])).toBe(false);
    expect(split.brand.clicks).toBe(3);
    expect(split.brand.impressions).toBe(80);
    expect(split.nonBrand.impressions).toBe(20);
    expect(split.brand.shareOfImpressions).toBe(80);
  });

  it('does not alarm on single impressions but detects a large drop above the floor', () => {
    const small = detectSearchAnomalies(
      [searchRow({ page: '/tiny', clicks: 0, impressions: 0 })],
      [searchRow({ page: '/tiny', clicks: 0, impressions: 5 })]
    );
    expect(small).toHaveLength(0);

    const previous = Array.from({ length: 10 }, (_, index) =>
      searchRow({ page: '/heritage', clicks: index === 0 ? 1 : 0, impressions: 10 })
    );
    const current = Array.from({ length: 2 }, () =>
      searchRow({ page: '/heritage', clicks: 0, impressions: 10 })
    );

    const findings = detectSearchAnomalies(current, previous);
    const total = findings.find((finding) => finding.key === 'total_impressions_drop');
    const page = findings.find((finding) => finding.key === 'page_impressions_drop:/heritage');

    expect(total).toBeDefined();
    expect(total?.previous).toBe(100);
    expect(total?.current).toBe(20);
    expect(page).toBeDefined();
    expect(page?.sample).toBeGreaterThanOrEqual(
      DEFAULT_SEARCH_THRESHOLDS.segmentMinPreviousImpressions
    );
  });

  it('reports a missing read scope only when the stored grant lists scopes', () => {
    expect(missingRequiredScope([GSC_READONLY_SCOPE], GSC_READONLY_SCOPE)).toBe(false);
    expect(
      missingRequiredScope(
        ['https://www.googleapis.com/auth/analytics.readonly'],
        GSC_READONLY_SCOPE
      )
    ).toBe(true);
    // Legacy rows without a scope list are unknown, not a confirmed grant.
    expect(missingRequiredScope([], GSC_READONLY_SCOPE)).toBe(false);
    expect(missingRequiredScope(null, GSC_READONLY_SCOPE)).toBe(false);
  });
});

describe('partial provider results', () => {
  it('marks some failed reports and any truncation as partial, never complete', () => {
    expect(syncOutcome({ reportCount: 4, failureCount: 1 })).toMatchObject({
      partial: true,
      reportsFailed: 1,
      reportsTotal: 4,
    });
    expect(syncOutcome({ reportCount: 4, failureCount: 4 }).partial).toBe(false);
    expect(syncOutcome({ reportCount: 1, failureCount: 0, truncated: true }).partial).toBe(true);
  });
});

describe('supplied GSC slices remain separate', () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'analytics', name), 'utf8'));

  it('keeps property, dates, filters and search type with the daily slice', () => {
    const daily = read('gsc-daily-window-2026-10-21_2026-11-17.json');

    expect(daily.property.value).toBe('sc-domain:merkurov.love');
    expect(daily.searchType.value).toBe('web');
    expect(daily.dateRange).toEqual({ start: '2026-10-21', end: '2026-11-17', days: 28 });
    expect(daily.filters.query).toBe('all');
    expect(daily.totals).toMatchObject({ impressions: 167, clicks: 3 });

    const sum = daily.windows.reduce(
      (
        total: { impressions: number; clicks: number },
        window: { impressions: number; clicks: number }
      ) => ({
        impressions: total.impressions + window.impressions,
        clicks: total.clicks + window.clicks,
      }),
      { impressions: 0, clicks: 0 }
    );
    expect(sum).toEqual({ impressions: 167, clicks: 3 });
  });

  it('refuses to merge top pages with the daily total', () => {
    const pages = read('gsc-top-pages-unattributed.json');
    const listed = pages.rows.reduce(
      (sum: number, row: { impressions: number }) => sum + row.impressions,
      0
    );

    expect(listed).toBe(178);
    expect(pages.compatibility.mergeableWithDailySlice).toBe(false);
    expect(pages.period).toBeNull();
    expect(pages.searchType).toBeNull();
  });

  it('keeps top countries as an unattributed view', () => {
    const countries = read('gsc-top-countries-unattributed.json');
    const listed = countries.rows.reduce(
      (sum: number, row: { impressions: number }) => sum + row.impressions,
      0
    );

    expect(listed).toBe(120);
    expect(countries.compatibility.mergeableWithDailySlice).toBe(false);
    expect(countries.period).toBeNull();
  });
});
