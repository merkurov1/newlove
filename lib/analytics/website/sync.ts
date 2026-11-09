import { randomUUID } from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getAnalyticsTimezone,
  getBackfillDays,
  getIncrementalDays,
  getUmamiConfig,
} from './config';
import { fullHash, openSecret, sealSecret } from './tokenCrypto';
import { normalizePath } from './normalize';
import {
  finishSyncRun,
  getStoredConnection,
  insertSyncRun,
  markConnectionError,
  markConnectionSynced,
  saveSnapshot,
  tryLock,
  unlock,
  upsertConnection,
  writeMetricRows,
  writeSearchRows,
  type MetricRowInput,
  type SearchRowInput,
  type StoredConnection,
} from './store';
import {
  AnalyticsProviderError,
} from './providers/http';
import {
  buildGa4Reports,
  ga4DateToIso,
  runGa4Report,
} from './providers/googleAnalytics';
import { fetchSearchConsoleRows } from './providers/searchConsole';
import {
  fetchUmamiMetrics,
  fetchUmamiPageviews,
  fetchUmamiStats,
  umamiDateRange,
} from './providers/umami';
import { refreshGoogleAccessToken } from './providers/oauth';
import type { AnalyticsProvider } from './types';

assertServerOnly('lib/analytics/website/sync');

export type SyncMode = 'manual' | 'incremental' | 'backfill' | 'repair';

export type SyncOptions = {
  mode?: SyncMode;
  providers?: AnalyticsProvider[];
  range?: { start: string; end: string };
  timezone?: string;
  now?: Date;
};

export type ProviderSyncResult = {
  provider: AnalyticsProvider;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  rowsWritten: number;
  snapshotRows: number;
  rangeStart: string | null;
  rangeEnd: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const ALL_PROVIDERS: AnalyticsProvider[] = [
  'google_analytics',
  'search_console',
  'umami',
];

function todayInZone(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateOfTimestamp(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayInZone(timezone, parsed);
}

export function resolveSyncRange(
  mode: SyncMode,
  input: {
    timezone: string;
    now?: Date;
    explicit?: { start: string; end: string };
    lastSyncAt?: string | null;
  }
): { start: string; end: string } {
  const timezone = input.timezone || getAnalyticsTimezone();
  const now = input.now ?? new Date();
  const today = todayInZone(timezone, now);

  if (input.explicit?.start && input.explicit?.end) {
    return input.explicit.start <= input.explicit.end
      ? input.explicit
      : { start: input.explicit.end, end: input.explicit.start };
  }

  if (mode === 'backfill') {
    return { start: shiftDate(today, -(getBackfillDays() - 1)), end: today };
  }

  if (mode === 'repair') {
    return { start: shiftDate(today, -6), end: today };
  }

  const lastSyncDay = dateOfTimestamp(input.lastSyncAt ?? null, timezone);

  if (!lastSyncDay) {
    return { start: shiftDate(today, -(getBackfillDays() - 1)), end: today };
  }

  const start = shiftDate(lastSyncDay, -getIncrementalDays());
  const floor = shiftDate(today, -(getBackfillDays() - 1));

  return { start: start < floor ? floor : start, end: today };
}

async function resolveAccessToken(
  store: SupabaseClient,
  connection: StoredConnection
): Promise<string> {
  const refreshToken = openSecret({
    ciphertext: connection.token_ciphertext,
    iv: connection.token_iv,
    tag: connection.token_tag,
  });

  if (!refreshToken) {
    throw new AnalyticsProviderError({
      provider: connection.provider,
      code: 'needs_reauthorization',
      message: 'The stored authorization is missing or cannot be decrypted.',
    });
  }

  const token = await refreshGoogleAccessToken(refreshToken);

  if (token.refreshToken && token.refreshToken !== refreshToken) {
    const sealed = sealSecret(token.refreshToken);
    await upsertConnection(store, {
      provider: connection.provider,
      status: 'connected',
      accountLabel: connection.account_label,
      externalId: connection.external_id,
      externalMeta: connection.external_meta ?? {},
      scopes: connection.scopes ?? [],
      sealed,
      connectedBy: null,
    });
  }

  return token.accessToken;
}

function ga4Path(value: string): string {
  if (!value || value === '(not set)') return value || '';
  return normalizePath(value);
}

function metricUnit(name: string): string {
  if (name === 'engagementRate' || name === 'sessionConversionRate') return 'ratio';
  if (name === 'userEngagementDuration' || name === 'averageSessionDuration') return 'seconds';
  return 'count';
}

async function syncGoogleAnalytics(
  store: SupabaseClient,
  connection: StoredConnection,
  range: { start: string; end: string }
): Promise<{ rows: number; snapshots: number; details: Record<string, unknown> }> {
  if (!connection.external_id) {
    throw new AnalyticsProviderError({
      provider: 'google_analytics',
      code: 'missing_property_id',
      message: 'GA4 property id is not configured for this connection.',
    });
  }

  const accessToken = await resolveAccessToken(store, connection);
  const reports = buildGa4Reports();
  const failures: Array<{ report: string; code: string; message: string }> = [];
  const reportSummary: Record<string, number> = {};
  let rowsWritten = 0;
  let snapshots = 0;

  for (const definition of reports) {
    try {
      const report = await runGa4Report({
        accessToken,
        propertyId: connection.external_id,
        definition,
        startDate: range.start,
        endDate: range.end,
      });

      const rows: MetricRowInput[] = [];

      for (const row of report.rows) {
        const date = ga4DateToIso(row.dimensions.date || '') ?? row.date;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        const add = (
          key: string,
          value: string,
          metric: string,
          metricValue: number,
          metadata: Record<string, unknown> = {}
        ) => {
          rows.push({
            provider: 'google_analytics',
            report_type: definition.key,
            metric_date: date,
            dimension_key: key,
            dimension_value: value,
            dimension_hash: fullHash(value),
            metric,
            value: metricValue,
            unit: metricUnit(metric),
            metadata,
          });
        };

        if (definition.key === 'total') {
          for (const [metric, value] of Object.entries(row.metrics)) {
            add('total', '', metric, value);
          }
        } else if (definition.key === 'channel') {
          const value = row.dimensions.sessionDefaultChannelGroup || '(not set)';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('channel', value, metric, value2);
          }
        } else if (definition.key === 'source') {
          const source = row.dimensions.sessionSource || '(direct)';
          const medium = row.dimensions.sessionMedium || '(none)';
          const value = `${source}|${medium}`;
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('source', value, metric, value2, { source, medium });
          }
        } else if (definition.key === 'landing_page') {
          const value = ga4Path(row.dimensions.landingPage || '') || '(not set)';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('landing_page', value, metric, value2);
          }
        } else if (definition.key === 'page') {
          const value = ga4Path(row.dimensions.pagePath || '') || '(not set)';
          const title = row.dimensions.pageTitle || '';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('page', value, metric, value2, { title });
          }
        } else if (definition.key === 'country') {
          const value = row.dimensions.country || '(not set)';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('country', value, metric, value2);
          }
        } else if (definition.key === 'device') {
          const value = row.dimensions.deviceCategory || '(not set)';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            add('device', value, metric, value2);
          }
        } else if (definition.key === 'event') {
          const value = row.dimensions.eventName || '(not set)';
          for (const [metric, value2] of Object.entries(row.metrics)) {
            if (value2 === 0) continue;
            add('event', value, metric, value2);
          }
        }
      }

      if (rows.length > 0) {
        rowsWritten += await writeMetricRows(store, rows);
      }
      reportSummary[definition.key] = report.rowCount;

      await saveSnapshot(store, {
        provider: 'google_analytics',
        reportType: definition.key,
        periodStart: range.start,
        periodEnd: range.end,
        checksum: fullHash(JSON.stringify(report.raw)).slice(0, 40),
        payload: report.raw,
      });
      snapshots += 1;
    } catch (error) {
      const providerError =
        error instanceof AnalyticsProviderError
          ? error
          : new AnalyticsProviderError({
              provider: 'google_analytics',
              code: 'report_failed',
              message: error instanceof Error ? error.message : 'GA4 report failed.',
            });

      if (
        providerError.code === 'unauthorized' ||
        providerError.code === 'forbidden' ||
        providerError.code === 'invalid_grant' ||
        providerError.code === 'needs_reauthorization'
      ) {
        throw providerError;
      }

      failures.push({
        report: definition.key,
        code: providerError.code,
        message: providerError.message,
      });
    }
  }

  if (failures.length === reports.length) {
    throw new AnalyticsProviderError({
      provider: 'google_analytics',
      code: failures[0]?.code || 'all_reports_failed',
      message: failures[0]?.message || 'All GA4 reports failed.',
    });
  }

  return {
    rows: rowsWritten,
    snapshots,
    details: {
      reports: reportSummary,
      failures,
      partial: failures.length > 0,
    },
  };
}

async function syncSearchConsole(
  store: SupabaseClient,
  connection: StoredConnection,
  range: { start: string; end: string }
): Promise<{ rows: number; snapshots: number; details: Record<string, unknown> }> {
  if (!connection.external_id) {
    throw new AnalyticsProviderError({
      provider: 'search_console',
      code: 'missing_site',
      message: 'A Search Console property is not configured for this connection.',
    });
  }

  const accessToken = await resolveAccessToken(store, connection);
  const result = await fetchSearchConsoleRows({
    accessToken,
    siteUrl: connection.external_id,
    startDate: range.start,
    endDate: range.end,
  });

  const rows: SearchRowInput[] = result.rows.map((row) => ({
    metric_date: row.date,
    site_url: connection.external_id as string,
    query: row.query,
    page: normalizePath(row.page),
    country: row.country,
    device: row.device,
    query_hash: fullHash(row.query),
    page_hash: fullHash(normalizePath(row.page)),
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    data_state: 'final',
  }));

  const written = rows.length > 0 ? await writeSearchRows(store, rows) : 0;

  await saveSnapshot(store, {
    provider: 'search_console',
    reportType: 'search_analytics',
    periodStart: range.start,
    periodEnd: range.end,
    checksum: fullHash(JSON.stringify(result.rawPages)).slice(0, 40),
    payload: result.rawPages,
  });

  return {
    rows: written,
    snapshots: 1,
    details: {
      truncated: result.truncated,
      rows: written,
      note: result.truncated
        ? 'Row cap reached; the range was not fully downloaded.'
        : null,
    },
  };
}

async function syncUmami(
  store: SupabaseClient,
  connection: StoredConnection,
  range: { start: string; end: string }
): Promise<{ rows: number; snapshots: number; details: Record<string, unknown> }> {
  const config = getUmamiConfig();

  if (!config.configured) {
    throw new AnalyticsProviderError({
      provider: 'umami',
      code: 'not_configured',
      message: `Umami is not configured: missing ${config.missing.join(', ')}.`,
    });
  }

  const websiteId = connection.external_id || config.websiteId;
  const dates = umamiDateRange(range.start, range.end);

  const [stats, series, urls, referrers] = await Promise.all([
    fetchUmamiStats({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      websiteId,
      ...dates,
    }),
    fetchUmamiPageviews({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      websiteId,
      ...dates,
      timezone: getAnalyticsTimezone(),
    }),
    fetchUmamiMetrics({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      websiteId,
      ...dates,
      type: 'url',
      limit: 100,
    }),
    fetchUmamiMetrics({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      websiteId,
      ...dates,
      type: 'referrer',
      limit: 100,
    }),
  ]);

  const rows: MetricRowInput[] = [];
  const push = (
    reportType: string,
    date: string,
    dimensionKey: string,
    dimensionValue: string,
    metric: string,
    value: number,
    metadata: Record<string, unknown> = {}
  ) => {
    rows.push({
      provider: 'umami',
      report_type: reportType,
      metric_date: date,
      dimension_key: dimensionKey,
      dimension_value: dimensionValue,
      dimension_hash: fullHash(dimensionValue),
      metric,
      value,
      unit: metric === 'totaltime' ? 'seconds' : 'count',
      metadata,
    });
  };

  for (const point of series.pageviews) {
    push('total', point.date, 'total', '', 'pageviews', point.value);
  }
  for (const point of series.sessions) {
    push('total', point.date, 'total', '', 'visits', point.value);
  }

  const periodMetadata = { period_start: range.start, period_end: range.end };
  push('period_total', range.end, 'total', '', 'pageviews', stats.pageviews, periodMetadata);
  push('period_total', range.end, 'total', '', 'visitors', stats.visitors, periodMetadata);
  push('period_total', range.end, 'total', '', 'visits', stats.visits, periodMetadata);
  push('period_total', range.end, 'total', '', 'bounces', stats.bounces, periodMetadata);
  push('period_total', range.end, 'total', '', 'totaltime', stats.totaltime, periodMetadata);

  for (const row of urls) {
    push('page', range.end, 'page', normalizePath(row.x), 'pageviews', row.y, periodMetadata);
  }
  for (const row of referrers) {
    push('referrer', range.end, 'referrer', row.x, 'pageviews', row.y, periodMetadata);
  }

  const written = rows.length > 0 ? await writeMetricRows(store, rows) : 0;

  await saveSnapshot(store, {
    provider: 'umami',
    reportType: 'summary',
    periodStart: range.start,
    periodEnd: range.end,
    checksum: fullHash(JSON.stringify({ stats, series, urls, referrers })).slice(0, 40),
    payload: { stats, series, urls, referrers },
  });

  return {
    rows: written,
    snapshots: 1,
    details: { stats, urls: urls.length, referrers: referrers.length },
  };
}

async function syncOne(
  provider: AnalyticsProvider,
  options: Required<Pick<SyncOptions, 'mode' | 'timezone'>> & SyncOptions
): Promise<ProviderSyncResult> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const connection = await getStoredConnection(store, provider);

  if (!connection) {
    return {
      provider,
      status: 'skipped',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: null,
      rangeEnd: null,
      errorCode: 'not_connected',
      errorMessage: 'The source has not been connected.',
    };
  }

  if (connection.status === 'disabled') {
    return {
      provider,
      status: 'skipped',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: null,
      rangeEnd: null,
      errorCode: 'disabled',
      errorMessage: 'The source is disabled.',
    };
  }

  if (provider === 'umami' && !connection.external_id) {
    // Umami does not use an OAuth token; a configured website id is enough.
    const config = getUmamiConfig();
    if (!config.configured) {
      return {
        provider,
        status: 'skipped',
        rowsWritten: 0,
        snapshotRows: 0,
        rangeStart: null,
        rangeEnd: null,
        errorCode: 'not_configured',
        errorMessage: `Umami is not configured: missing ${config.missing.join(', ')}.`,
      };
    }
  } else if (!connection.token_ciphertext && provider !== 'umami') {
    return {
      provider,
      status: 'skipped',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: null,
      rangeEnd: null,
      errorCode: 'needs_reauthorization',
      errorMessage: 'No stored Google authorization. Reconnect the source.',
    };
  }

  const range = resolveSyncRange(options.mode, {
    timezone: options.timezone,
    now: options.now,
    explicit: options.range,
    lastSyncAt: connection.last_sync_at,
  });

  const runId = randomUUID();
  let locked = false;

  try {
    locked = await tryLock(store, provider, runId, 600);
  } catch (error) {
    return {
      provider,
      status: 'failed',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: range.start,
      rangeEnd: range.end,
      errorCode: 'lock_unavailable',
      errorMessage: error instanceof Error ? error.message : 'Lock acquisition failed.',
    };
  }

  if (!locked) {
    return {
      provider,
      status: 'skipped',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: range.start,
      rangeEnd: range.end,
      errorCode: 'already_running',
      errorMessage: 'Another synchronization is already running for this source.',
    };
  }

  try {
    await insertSyncRun(store, {
      id: runId,
      provider,
      mode: options.mode,
      rangeStart: range.start,
      rangeEnd: range.end,
      timezone: options.timezone,
    });

    const result =
      provider === 'google_analytics'
        ? await syncGoogleAnalytics(store, connection, range)
        : provider === 'search_console'
          ? await syncSearchConsole(store, connection, range)
          : await syncUmami(store, connection, range);

    const partial = result.details.partial === true;

    await finishSyncRun(store, {
      id: runId,
      status: partial ? 'partial' : 'completed',
      rowsWritten: result.rows,
      snapshotRows: result.snapshots,
      details: result.details,
    });
    await markConnectionSynced(store, provider, partial ? 'partial' : 'connected');

    return {
      provider,
      status: partial ? 'partial' : 'completed',
      rowsWritten: result.rows,
      snapshotRows: result.snapshots,
      rangeStart: range.start,
      rangeEnd: range.end,
      errorCode: partial ? 'partial_report_failure' : null,
      errorMessage: partial
        ? 'Some reports failed; stored data is incomplete for this range.'
        : null,
    };
  } catch (error) {
    const providerError =
      error instanceof AnalyticsProviderError
        ? error
        : new AnalyticsProviderError({
            provider,
            code: 'sync_failed',
            message: error instanceof Error ? error.message : 'Synchronization failed.',
          });

    await markConnectionError(store, provider, providerError.code, providerError.message);
    await finishSyncRun(store, {
      id: runId,
      status: 'failed',
      rowsWritten: 0,
      snapshotRows: 0,
      errorCode: providerError.code,
      errorMessage: providerError.message,
      details: { status: providerError.status, details: providerError.details },
    });

    return {
      provider,
      status: 'failed',
      rowsWritten: 0,
      snapshotRows: 0,
      rangeStart: range.start,
      rangeEnd: range.end,
      errorCode: providerError.code,
      errorMessage: providerError.message,
    };
  } finally {
    await unlock(store, provider, runId);
  }
}

export async function runAnalyticsSync(
  options: SyncOptions = {}
): Promise<ProviderSyncResult[]> {
  const mode = options.mode ?? 'incremental';
  const timezone = options.timezone ?? getAnalyticsTimezone();
  const providers = options.providers ?? ALL_PROVIDERS;
  const results: ProviderSyncResult[] = [];

  if (providers.includes('umami')) {
    try {
      await ensureUmamiConnection(getServerSupabaseClient({ useServiceRole: true }));
    } catch {
      // A missing Umami configuration is reported by syncOne as not_configured.
    }
  }

  for (const provider of providers) {
    results.push(
      await syncOne(provider, {
        ...options,
        mode,
        timezone,
      })
    );
  }

  return results;
}

export async function ensureUmamiConnection(store: SupabaseClient): Promise<void> {
  const config = getUmamiConfig();

  if (!config.configured) return;

  const existing = await getStoredConnection(store, 'umami');

  if (existing?.external_id) return;

  await upsertConnection(store, {
    provider: 'umami',
    status: 'connected',
    accountLabel: config.baseUrl,
    externalId: config.websiteId,
    externalMeta: { base_url: config.baseUrl },
    scopes: [],
    sealed: null,
  });
}
