import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsProvider } from './types';

assertServerOnly('lib/analytics/website/store');

const PAGE_SIZE = 1000;
const WRITE_CHUNK = 500;

export type StoredConnection = {
  id: string;
  provider: AnalyticsProvider;
  status: string;
  account_label: string | null;
  external_id: string | null;
  external_meta: Record<string, unknown> | null;
  scopes: string[] | null;
  token_ciphertext: string | null;
  token_iv: string | null;
  token_tag: string | null;
  token_key_version: string | null;
  connected_by: string | null;
  connected_at: string | null;
  disabled_at: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
  updated_at: string | null;
};

export type MetricRowInput = {
  provider: 'google_analytics' | 'umami';
  report_type: string;
  metric_date: string;
  dimension_key: string;
  dimension_value: string;
  dimension_hash: string;
  metric: string;
  value: number;
  unit?: string;
  metadata?: Record<string, unknown>;
};

export type SearchRowInput = {
  metric_date: string;
  site_url: string;
  query: string;
  page: string;
  country: string;
  device: string;
  query_hash: string;
  page_hash: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  data_state?: string;
};

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export async function getStoredConnections(store: SupabaseClient): Promise<StoredConnection[]> {
  const { data, error } = await store
    .from('analytics_connections')
    .select('*')
    .order('provider', { ascending: true });

  if (error) throw new Error(`analytics_connections: ${error.message}`);
  return (data ?? []) as StoredConnection[];
}

export async function getStoredConnection(
  store: SupabaseClient,
  provider: AnalyticsProvider
): Promise<StoredConnection | null> {
  const { data, error } = await store
    .from('analytics_connections')
    .select('*')
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw new Error(`analytics_connections: ${error.message}`);
  return (data as StoredConnection | null) ?? null;
}

export async function upsertConnection(
  store: SupabaseClient,
  input: {
    provider: AnalyticsProvider;
    status: string;
    accountLabel?: string | null;
    externalId?: string | null;
    externalMeta?: Record<string, unknown>;
    scopes?: string[];
    sealed?: { ciphertext: string; iv: string; tag: string; keyVersion: string } | null;
    connectedBy?: string | null;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    provider: input.provider,
    status: input.status,
    account_label: input.accountLabel ?? null,
    external_id: input.externalId ?? null,
    external_meta: input.externalMeta ?? {},
    scopes: input.scopes ?? [],
    connected_by: input.connectedBy ?? null,
    connected_at: new Date().toISOString(),
    disabled_at: null,
    updated_at: new Date().toISOString(),
    ...(input.status === 'connected'
      ? { last_error_code: null, last_error_message: null, last_error_at: null }
      : {}),
  };

  if (input.sealed) {
    payload.token_ciphertext = input.sealed.ciphertext;
    payload.token_iv = input.sealed.iv;
    payload.token_tag = input.sealed.tag;
    payload.token_key_version = input.sealed.keyVersion;
  }

  const { error } = await store
    .from('analytics_connections')
    .upsert(payload, { onConflict: 'provider' });

  if (error) throw new Error(`analytics_connections upsert: ${error.message}`);
}

export async function markConnectionError(
  store: SupabaseClient,
  provider: AnalyticsProvider,
  code: string,
  message: string
): Promise<void> {
  const { error } = await store
    .from('analytics_connections')
    .update({
      status:
        code === 'unauthorized' || code === 'invalid_grant' ? 'needs_reauthorization' : 'error',
      last_error_code: code.slice(0, 120),
      last_error_message: message.slice(0, 600),
      last_error_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider);

  if (error) {
    // Never fail the sync because its own error could not be recorded.
    console.error('[website analytics] could not record connection error');
  }
}

export async function markConnectionSynced(
  store: SupabaseClient,
  provider: AnalyticsProvider,
  status: 'connected' | 'partial' | 'error'
): Promise<void> {
  const { error } = await store
    .from('analytics_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status,
      status: status === 'error' ? 'error' : 'connected',
      ...(status !== 'error'
        ? { last_error_code: null, last_error_message: null, last_error_at: null }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider);

  if (error) {
    console.error('[website analytics] could not record sync status');
  }
}

export async function disableConnection(
  store: SupabaseClient,
  provider: AnalyticsProvider
): Promise<void> {
  const { error } = await store
    .from('analytics_connections')
    .update({
      status: 'disabled',
      disabled_at: new Date().toISOString(),
      token_ciphertext: null,
      token_iv: null,
      token_tag: null,
      external_meta: {},
      updated_at: new Date().toISOString(),
    })
    .eq('provider', provider);

  if (error) throw new Error(`analytics_connections disable: ${error.message}`);
}

export async function insertSyncRun(
  store: SupabaseClient,
  input: {
    id: string;
    provider: AnalyticsProvider;
    mode: 'manual' | 'incremental' | 'backfill' | 'repair';
    rangeStart: string;
    rangeEnd: string;
    timezone: string;
  }
): Promise<void> {
  const { error } = await store.from('analytics_sync_runs').insert({
    id: input.id,
    provider: input.provider,
    mode: input.mode,
    status: 'running',
    range_start: input.rangeStart,
    range_end: input.rangeEnd,
    timezone: input.timezone,
  });

  if (error) throw new Error(`analytics_sync_runs insert: ${error.message}`);
}

export async function finishSyncRun(
  store: SupabaseClient,
  input: {
    id: string;
    status: 'completed' | 'partial' | 'failed' | 'skipped';
    rowsWritten: number;
    snapshotRows: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await store
    .from('analytics_sync_runs')
    .update({
      status: input.status,
      rows_written: input.rowsWritten,
      snapshot_rows: input.snapshotRows,
      error_code: input.errorCode?.slice(0, 120) ?? null,
      error_message: input.errorMessage?.slice(0, 1000) ?? null,
      details: input.details ?? {},
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.id);

  if (error) {
    console.error('[website analytics] could not finish sync run');
  }
}

export type StoredSyncRun = {
  id: string;
  provider: AnalyticsProvider;
  mode: string;
  status: string;
  range_start: string | null;
  range_end: string | null;
  rows_written: number;
  snapshot_rows: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

export async function getRecentSyncRuns(
  store: SupabaseClient,
  limit = 20
): Promise<StoredSyncRun[]> {
  const { data, error } = await store
    .from('analytics_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) throw new Error(`analytics_sync_runs: ${error.message}`);
  return (data ?? []) as StoredSyncRun[];
}

export async function writeMetricRows(
  store: SupabaseClient,
  rows: MetricRowInput[]
): Promise<number> {
  let written = 0;

  for (const part of chunks(rows, WRITE_CHUNK)) {
    const { error } = await store.from('analytics_metrics_daily').upsert(
      part.map((row) => ({
        provider: row.provider,
        report_type: row.report_type,
        metric_date: row.metric_date,
        dimension_key: row.dimension_key,
        dimension_value: row.dimension_value.slice(0, 2048),
        dimension_hash: row.dimension_hash,
        metric: row.metric,
        value: row.value,
        unit: row.unit ?? 'count',
        metadata: row.metadata ?? {},
        synced_at: new Date().toISOString(),
      })),
      {
        onConflict: 'provider,report_type,metric_date,dimension_key,dimension_hash,metric',
      }
    );

    if (error) throw new Error(`analytics_metrics_daily upsert: ${error.message}`);
    written += part.length;
  }

  return written;
}

export async function writeSearchRows(
  store: SupabaseClient,
  rows: SearchRowInput[]
): Promise<number> {
  let written = 0;

  for (const part of chunks(rows, WRITE_CHUNK)) {
    const { error } = await store.from('analytics_search_performance').upsert(
      part.map((row) => ({
        metric_date: row.metric_date,
        site_url: row.site_url,
        query: row.query.slice(0, 1024),
        page: row.page.slice(0, 2048),
        country: row.country,
        device: row.device,
        query_hash: row.query_hash,
        page_hash: row.page_hash,
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        ctr: row.ctr,
        position: row.position,
        data_state: row.data_state ?? 'final',
        synced_at: new Date().toISOString(),
      })),
      {
        onConflict: 'metric_date,site_url,query_hash,page_hash,country,device',
      }
    );

    if (error) throw new Error(`analytics_search_performance upsert: ${error.message}`);
    written += part.length;
  }

  return written;
}

export async function saveSnapshot(
  store: SupabaseClient,
  input: {
    provider: AnalyticsProvider;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    checksum: string;
    payload: unknown;
  }
): Promise<void> {
  const { error } = await store.from('analytics_snapshots').upsert(
    {
      provider: input.provider,
      report_type: input.reportType,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      checksum: input.checksum,
      payload: input.payload,
    },
    {
      onConflict: 'provider,report_type,period_start,period_end,checksum',
      ignoreDuplicates: true,
    }
  );

  if (error) throw new Error(`analytics_snapshots upsert: ${error.message}`);
}

export type MetricRow = {
  provider: string;
  report_type: string;
  metric_date: string;
  dimension_key: string;
  dimension_value: string;
  metric: string;
  value: number;
  unit: string;
  metadata: Record<string, unknown> | null;
  synced_at: string;
};

export async function readMetricRows(
  store: SupabaseClient,
  input: {
    provider: string;
    from: string;
    to: string;
    reportTypes?: string[];
  }
): Promise<MetricRow[]> {
  const rows: MetricRow[] = [];
  let offset = 0;

  for (;;) {
    let query = store
      .from('analytics_metrics_daily')
      .select(
        'provider,report_type,metric_date,dimension_key,dimension_value,metric,value,unit,metadata,synced_at'
      )
      .eq('provider', input.provider)
      .gte('metric_date', input.from)
      .lte('metric_date', input.to)
      .order('metric_date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (input.reportTypes && input.reportTypes.length > 0) {
      query = query.in('report_type', input.reportTypes);
    }

    const { data, error } = await query;
    if (error) throw new Error(`analytics_metrics_daily read: ${error.message}`);

    const page = (data ?? []) as MetricRow[];
    rows.push(...page.map((row) => ({ ...row, value: Number(row.value) })));

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;

    if (offset > 250_000) break;
  }

  return rows;
}

export type SearchPerformanceRow = {
  metric_date: string;
  site_url: string;
  query: string;
  page: string;
  country: string;
  device: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

export async function readSearchRows(
  store: SupabaseClient,
  input: { siteUrl: string; from: string; to: string }
): Promise<SearchPerformanceRow[]> {
  const rows: SearchPerformanceRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await store
      .from('analytics_search_performance')
      .select('metric_date,site_url,query,page,country,device,clicks,impressions,ctr,position')
      .eq('site_url', input.siteUrl)
      .gte('metric_date', input.from)
      .lte('metric_date', input.to)
      .order('metric_date', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`analytics_search_performance read: ${error.message}`);

    const page = (data ?? []) as SearchPerformanceRow[];
    rows.push(
      ...page.map((row) => ({
        ...row,
        clicks: Number(row.clicks),
        impressions: Number(row.impressions),
        ctr: row.ctr === null ? null : Number(row.ctr),
        position: row.position === null ? null : Number(row.position),
      }))
    );

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;

    if (offset > 500_000) break;
  }

  return rows;
}

export type DataCoverage = {
  provider: string;
  from: string | null;
  to: string | null;
  rows: number;
};

export async function getDataCoverage(store: SupabaseClient): Promise<DataCoverage[]> {
  const result: DataCoverage[] = [];

  for (const provider of ['google_analytics', 'umami'] as const) {
    const { data, error } = await store
      .from('analytics_metrics_daily')
      .select('metric_date')
      .eq('provider', provider)
      .order('metric_date', { ascending: true })
      .limit(1);

    const { data: tail, error: tailError } = await store
      .from('analytics_metrics_daily')
      .select('metric_date')
      .eq('provider', provider)
      .order('metric_date', { ascending: false })
      .limit(1);

    if (error || tailError) continue;

    result.push({
      provider,
      from: (data?.[0]?.metric_date as string) ?? null,
      to: (tail?.[0]?.metric_date as string) ?? null,
      rows: 0,
    });
  }

  const { data: searchFrom, error: searchFromError } = await store
    .from('analytics_search_performance')
    .select('metric_date')
    .order('metric_date', { ascending: true })
    .limit(1);

  const { data: searchTo, error: searchToError } = await store
    .from('analytics_search_performance')
    .select('metric_date')
    .order('metric_date', { ascending: false })
    .limit(1);

  if (!searchFromError && !searchToError) {
    result.push({
      provider: 'search_console',
      from: (searchFrom?.[0]?.metric_date as string) ?? null,
      to: (searchTo?.[0]?.metric_date as string) ?? null,
      rows: 0,
    });
  }

  return result;
}

export async function tryLock(
  store: SupabaseClient,
  provider: AnalyticsProvider,
  runId: string,
  ttlSeconds = 600
): Promise<boolean> {
  const { data, error } = await store.rpc('analytics_try_lock', {
    p_provider: provider,
    p_run_id: runId,
    p_ttl_seconds: ttlSeconds,
  });

  if (error) throw new Error(`analytics_try_lock: ${error.message}`);
  return data === true;
}

export async function unlock(
  store: SupabaseClient,
  provider: AnalyticsProvider,
  runId: string
): Promise<void> {
  try {
    await store.rpc('analytics_unlock', { p_provider: provider, p_run_id: runId });
  } catch {
    // The lock expires on its own.
  }
}
