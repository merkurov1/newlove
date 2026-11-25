import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEMPLE_AGGREGATE_MAX_ROWS,
  TEMPLE_AGGREGATE_PAGE_SIZE,
  TEMPLE_CHRONICLES_WINDOW_DAYS,
  TEMPLE_CHRONICLES_WINDOW_MS,
  TEMPLE_FEED_TTL_MS,
  TEMPLE_RITUAL_OR_FILTER,
  TEMPLE_TRACE_FETCH_LIMIT,
  TEMPLE_TRACE_LIMIT,
  aggregateTempleRows,
  selectTempleTraces,
  type TempleChroniclesStats,
  type TempleFeedPayload,
  type TempleLogRow,
  type TemplePublicAggregates,
} from '@/lib/temple/feed';
import { TtlCache } from '@/lib/temple/feedCache';

type QueryClient = Pick<SupabaseClient, 'from'>;

export type TempleFeedQueryClient = QueryClient;

export type TempleFeedCacheStatus = 'hit' | 'miss' | 'stale' | 'error';

export type TempleFeedResolution = {
  payload: TempleFeedPayload | null;
  cache: TempleFeedCacheStatus;
  error: string | null;
};

export const templeFeedCache = new TtlCache<TempleFeedPayload>(
  TEMPLE_FEED_TTL_MS
);

export function invalidateTempleFeedCache(): void {
  templeFeedCache.invalidate();
}

export function templeFeedCacheTtlMs(): number {
  return TEMPLE_FEED_TTL_MS;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
  }
  return String(error);
}

/**
 * The seven-ish most recent eligible ritual rows are selected by PostgREST:
 * case-insensitive include patterns, newest first, bounded fetch. The canonical
 * classifier then guards against a pattern matching an unexpected legacy value.
 */
export async function fetchRecentRitualRows(
  client: QueryClient,
  nowMs: number = Date.now(),
  limit: number = TEMPLE_TRACE_FETCH_LIMIT
): Promise<TempleLogRow[]> {
  const { data, error } = await client
    .from('temple_log')
    .select('id,event_type,author,created_at,audio_url,is_public_identity')
    .or(TEMPLE_RITUAL_OR_FILTER)
    .lte('created_at', iso(nowMs))
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []) as TempleLogRow[];
}

/**
 * Reads every eligible ritual row in the inclusive Chronicles window, paging
 * server-side rather than sampling the latest ten records. The stored message
 * column is deliberately not selected: public aggregates never need it.
 */
export async function fetchWindowRitualRows(
  client: QueryClient,
  windowStartMs: number,
  windowEndMs: number
): Promise<{ rows: TempleLogRow[]; truncated: boolean }> {
  const rows: TempleLogRow[] = [];
  let from = 0;
  let truncated = false;

  while (true) {
    const { data, error } = await client
      .from('temple_log')
      .select('id,event_type,author,created_at,is_public_identity')
      .or(TEMPLE_RITUAL_OR_FILTER)
      .gte('created_at', iso(windowStartMs))
      .lte('created_at', iso(windowEndMs))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + TEMPLE_AGGREGATE_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as TempleLogRow[];
    rows.push(...page);

    if (page.length < TEMPLE_AGGREGATE_PAGE_SIZE) break;

    if (rows.length >= TEMPLE_AGGREGATE_MAX_ROWS) {
      truncated = true;
      break;
    }

    from += TEMPLE_AGGREGATE_PAGE_SIZE;
  }

  return { rows, truncated };
}

export type TempleAggregateStats = {
  aggregates: TemplePublicAggregates;
  truncated: boolean;
};

/**
 * The public aggregate panel is intentionally small: completed rituals, public
 * names and Vigil sparks inside the same rolling window. It never returns
 * exclusion counts, cache details or implementation labels.
 */
export async function loadTemplePublicAggregates(
  client: QueryClient,
  nowMs: number = Date.now()
): Promise<TempleAggregateStats> {
  const windowStartMs = nowMs - TEMPLE_CHRONICLES_WINDOW_MS;
  const windowEndMs = nowMs;
  const result = await fetchWindowRitualRows(
    client,
    windowStartMs,
    windowEndMs
  );
  const aggregate = aggregateTempleRows(
    result.rows,
    windowStartMs,
    windowEndMs
  );

  return {
    aggregates: {
      ...aggregate,
      windowDays: TEMPLE_CHRONICLES_WINDOW_DAYS,
      windowStart: iso(windowStartMs),
      windowEnd: iso(windowEndMs),
      truncated: result.truncated,
    },
    truncated: result.truncated,
  };
}

export type LoadTempleFeedOptions = {
  nowMs?: number;
};

export async function loadTempleFeed(
  client: QueryClient,
  options: LoadTempleFeedOptions = {}
): Promise<TempleFeedPayload> {
  const nowMs = options.nowMs ?? Date.now();

  const [traceRows, aggregate] = await Promise.all([
    fetchRecentRitualRows(client, nowMs),
    loadTemplePublicAggregates(client, nowMs),
  ]);

  const traces = selectTempleTraces(traceRows, TEMPLE_TRACE_LIMIT);

  const stats: TempleChroniclesStats = aggregate.aggregates;

  return {
    ok: true,
    data: traces,
    stats,
    meta: {
      generatedAt: iso(nowMs),
      stale: false,
    },
    error: null,
  };
}

function withCacheMeta(
  payload: TempleFeedPayload,
  stale: boolean
): TempleFeedPayload {
  return {
    ...payload,
    meta: {
      ...payload.meta,
      stale,
    },
  };
}

export type ResolveTempleFeedOptions = {
  getClient: () => QueryClient;
  nowMs?: number;
  cache?: TtlCache<TempleFeedPayload>;
};

/**
 * Shared route logic:
 * 1. reuse a fresh in-process cache;
 * 2. refresh from the database on TTL expiry;
 * 3. if the database fails, return the last known good payload marked stale;
 * 4. only return no payload when there has never been a successful read.
 */
export async function resolveTempleFeed(
  options: ResolveTempleFeedOptions
): Promise<TempleFeedResolution> {
  const nowMs = options.nowMs ?? Date.now();
  const cache = options.cache ?? templeFeedCache;
  const cached = cache.get(nowMs);

  if (cached) {
    return {
      payload: withCacheMeta(cached.value, false),
      cache: 'hit',
      error: null,
    };
  }

  try {
    const payload = await loadTempleFeed(options.getClient(), { nowMs });
    cache.set(payload, nowMs);

    return {
      payload: withCacheMeta(payload, false),
      cache: 'miss',
      error: null,
    };
  } catch (error) {
    const stale = cache.peek();

    if (stale) {
      return {
        payload: withCacheMeta(stale.value, true),
        cache: 'stale',
        error: messageOf(error),
      };
    }

    return { payload: null, cache: 'error', error: messageOf(error) };
  }
}
