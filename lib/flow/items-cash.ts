
import { unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

export const FLOW_ITEMS_CACHE_TAG = 'flow-items';

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server environment variables are missing.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export type CachedFlowItemsResult = {
  items: Record<string, unknown>[];
  hasMore: boolean;
  total: number;
  nextOffset: number;
};

const readCachedFlowItems = unstable_cache(
  async (
    limit: number,
    offset: number,
  ): Promise<CachedFlowItemsResult> => {
    const supabase = getSupabaseAdmin();

    const { data, error, count } = await supabase
      .from('items')
      .select(
        [
          'id',
          'title',
          'slug',
          'lang',
          'type',
          'status',
          'visibility',
          'body_md',
          'published_at',
          'source_url',
          'metadata',
          'bluesky_uri',
          'telegram_message_id',
        ].join(','),
        { count: 'exact' },
      )
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('published_at', {
        ascending: false,
        nullsFirst: false,
      })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(
        `Failed to load Flow items: ${error.message}`,
      );
    }

    const items = (data ?? []) as unknown as Record<
      string,
      unknown
    >[];

    const total = count ?? 0;

    return {
      items,
      hasMore: total > offset + items.length,
      total,
      nextOffset: offset + items.length,
    };
  },
  ['flow-public-items-v1'],
  {
    revalidate: 3600,
    tags: [FLOW_ITEMS_CACHE_TAG],
  },
);

export async function getCachedFlowItems(
  limit: number,
  offset: number,
): Promise<CachedFlowItemsResult> {
  return readCachedFlowItems(limit, offset);
}

const FEED_FIELDS = [
  'id',
  'title',
  'slug',
  'lang',
  'type',
  'body_md',
  'source_url',
  'metadata',
  'published_at',
  'updated_at',
  'created_at',
  'bluesky_uri',
  'telegram_message_id',
].join(',');

export type CachedFlowFeedResult = {
  items: Record<string, unknown>[];
};

/**
 * Reader-facing feed snapshot. It uses the same cache tag as the public
 * list, so publishing or editing an item invalidates both immediately.
 */
const readCachedFlowFeed = unstable_cache(
  async (
    limit: number,
    lang: string | null,
  ): Promise<CachedFlowFeedResult> => {
    const supabase = getSupabaseAdmin();

    const base = supabase
      .from('items')
      .select(FEED_FIELDS)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .not('published_at', 'is', null);

    const filtered = lang ? base.eq('lang', lang) : base;

    const { data, error } = await filtered
      .order('published_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit);

    if (error) {
      throw new Error(
        `Failed to load Flow feed items: ${error.message}`,
      );
    }

    return {
      items: (data ?? []) as unknown as Record<
        string,
        unknown
      >[],
    };
  },
  ['flow-public-feed-v1'],
  {
    revalidate: 900,
    tags: [FLOW_ITEMS_CACHE_TAG],
  },
);

export async function getCachedFlowFeedItems(
  limit: number,
  lang: string | null,
): Promise<CachedFlowFeedResult> {
  return readCachedFlowFeed(limit, lang);
}

