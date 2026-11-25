import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TEMPLE_RITUAL_OR_FILTER,
  type TempleLogRow,
} from '@/lib/temple/feed';
import {
  buildTempleChroniclesPage,
  clampChroniclesLimit,
  decodeTempleCursor,
  type TempleChroniclesCursor,
  type TempleChroniclesPageSlice,
} from '@/lib/temple/chronicles';

type QueryClient = Pick<SupabaseClient, 'from'>;

export type TempleChroniclesQueryClient = QueryClient;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function beforeFilter(cursor: TempleChroniclesCursor): string {
  return [
    `created_at.lt.${cursor.occurredAt}`,
    `and(created_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
  ].join(',');
}

/**
 * Keyset pagination over the allowlisted public columns. Ordering is stable:
 * newest `created_at` first, then the event id as a deterministic tie-breaker.
 * One extra row is fetched so the caller knows whether another page exists
 * without an expensive count.
 */
export async function fetchTempleChronicleRows(
  client: QueryClient,
  options: {
    before?: TempleChroniclesCursor | null;
    limit?: number;
    nowMs?: number;
  } = {}
): Promise<{ rows: TempleLogRow[]; limit: number }> {
  const nowMs = options.nowMs ?? Date.now();
  const limit = clampChroniclesLimit(options.limit);

  let query = client
    .from('temple_log')
    .select('id,event_type,author,created_at,is_public_identity')
    .or(TEMPLE_RITUAL_OR_FILTER)
    .lte('created_at', iso(nowMs));

  if (options.before) {
    query = query.or(beforeFilter(options.before));
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (error) throw error;

  return {
    rows: (data ?? []) as TempleLogRow[],
    limit,
  };
}

export async function loadTempleChroniclesPage(
  client: QueryClient,
  options: {
    before?: string | null;
    limit?: number;
    nowMs?: number;
  } = {}
): Promise<{ page: TempleChroniclesPageSlice; limit: number; badCursor: boolean }> {
  const limit = clampChroniclesLimit(options.limit);
  const before = options.before
    ? decodeTempleCursor(options.before)
    : null;

  if (options.before && !before) {
    return {
      page: { events: [], nextCursor: null, hasMore: false },
      limit,
      badCursor: true,
    };
  }

  const result = await fetchTempleChronicleRows(client, {
    before,
    limit,
    nowMs: options.nowMs,
  });

  return {
    page: buildTempleChroniclesPage(result.rows, limit),
    limit,
    badCursor: false,
  };
}
