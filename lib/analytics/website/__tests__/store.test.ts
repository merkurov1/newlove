/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeMetricRows, writeSearchRows } from '../store';

function fakeStore() {
  const upsert = jest.fn(async () => ({ error: null }));
  const store = {
    from: jest.fn(() => ({ upsert })),
  } as unknown as SupabaseClient;
  return { store, upsert };
}

const baseMetric = {
  provider: 'google_analytics' as const,
  report_type: 'page',
  metric_date: '2026-11-10',
  dimension_key: 'page',
  dimension_value: '/admin/pierrot',
  dimension_hash: 'hash-admin',
  metric: 'screenPageViews',
  value: 2,
  unit: 'count',
};

describe('Analytics upsert deduplication', () => {
  it('merges duplicate GA4 conflict keys before upsert', async () => {
    const { store, upsert } = fakeStore();

    await writeMetricRows(store, [
      baseMetric,
      { ...baseMetric, value: 3, metadata: { title: 'Admin' } },
    ]);

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as Array<{ value: number; metadata: Record<string, unknown> }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(5);
    expect(rows[0].metadata.title).toBe('Admin');
  });

  it('does not sum ratio metrics', async () => {
    const { store, upsert } = fakeStore();

    await writeMetricRows(store, [
      { ...baseMetric, metric: 'engagementRate', unit: 'ratio', value: 0.4 },
      { ...baseMetric, metric: 'engagementRate', unit: 'ratio', value: 0.6 },
    ]);

    const rows = upsert.mock.calls[0][0] as Array<{ value: number }>;
    expect(rows[0].value).toBe(0.6);
  });

  it('merges duplicate Search Console rows and recomputes CTR/position', async () => {
    const { store, upsert } = fakeStore();
    const base = {
      metric_date: '2026-11-10',
      site_url: 'sc-domain:merkurov.love',
      query: 'anton',
      page: '/',
      country: 'rus',
      device: 'DESKTOP',
      query_hash: 'q',
      page_hash: 'p',
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      position: 4,
      data_state: 'final',
    };

    await writeSearchRows(store, [
      base,
      { ...base, clicks: 3, impressions: 30, ctr: 0.1, position: 8 },
    ]);

    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0] as Array<{
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].clicks).toBe(4);
    expect(rows[0].impressions).toBe(40);
    expect(rows[0].ctr).toBeCloseTo(0.1, 6);
    expect(rows[0].position).toBeCloseTo(7, 6);
  });
});
