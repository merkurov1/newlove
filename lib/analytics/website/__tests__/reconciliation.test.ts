/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { replaceMetricSlice, replaceSearchSlice } from '../store';

function fakeStore(rpcResult: { data?: unknown; error?: unknown } = { data: 1, error: null }) {
  const rpc = jest.fn(async () => rpcResult);
  const upsert = jest.fn(async () => ({ error: null }));
  const store = {
    rpc,
    from: jest.fn(() => ({ upsert })),
  } as unknown as SupabaseClient;
  return { store, rpc, upsert };
}

const metric = {
  provider: 'google_analytics' as const,
  report_type: 'page',
  metric_date: '2026-11-10',
  dimension_key: 'page',
  dimension_value: '/',
  dimension_hash: 'hash-home',
  metric: 'screenPageViews',
  value: 5,
  unit: 'count',
};

describe('analytics exact-slice reconciliation', () => {
  it('replaces the exact provider/report/date slice', async () => {
    const { store, rpc } = fakeStore();

    const written = await replaceMetricSlice(store, {
      provider: 'google_analytics',
      reportTypes: ['page'],
      from: '2026-11-04',
      to: '2026-11-10',
      rows: [metric],
    });

    expect(written).toBe(1);
    expect(rpc).toHaveBeenCalledWith('analytics_replace_metric_slice', {
      p_provider: 'google_analytics',
      p_report_types: ['page'],
      p_from: '2026-11-04',
      p_to: '2026-11-10',
      p_rows: [expect.objectContaining({ report_type: 'page', value: 5 })],
    });
  });

  it('deletes an empty successful slice instead of preserving obsolete rows', async () => {
    const { store, rpc } = fakeStore({ data: 0, error: null });

    await replaceMetricSlice(store, {
      provider: 'umami',
      reportTypes: ['page'],
      from: '2026-11-04',
      to: '2026-11-10',
      rows: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      'analytics_replace_metric_slice',
      expect.objectContaining({ p_rows: [] })
    );
  });

  it('replaces only the exact Search Console site/date slice', async () => {
    const { store, rpc } = fakeStore();

    await replaceSearchSlice(store, {
      siteUrl: 'sc-domain:merkurov.love',
      from: '2026-11-04',
      to: '2026-11-10',
      rows: [
        {
          metric_date: '2026-11-10',
          site_url: 'sc-domain:merkurov.love',
          query: 'anton',
          page: '/',
          country: 'rus',
          device: 'DESKTOP',
          query_hash: 'q',
          page_hash: 'p',
          clicks: 2,
          impressions: 20,
          ctr: 0.1,
          position: 3,
          data_state: 'final',
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith('analytics_replace_search_slice', {
      p_site_url: 'sc-domain:merkurov.love',
      p_from: '2026-11-04',
      p_to: '2026-11-10',
      p_rows: [expect.objectContaining({ query: 'anton', clicks: 2 })],
    });
  });

  it('falls back to an upsert when the reconciliation migration is absent', async () => {
    const { store, upsert } = fakeStore({
      data: null,
      error: { code: '42883', message: 'function analytics_replace_metric_slice does not exist' },
    });

    await replaceMetricSlice(store, {
      provider: 'google_analytics',
      reportTypes: ['page'],
      from: '2026-11-10',
      to: '2026-11-10',
      rows: [metric],
    });

    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
