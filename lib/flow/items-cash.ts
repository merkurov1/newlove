
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

export const FLOW_ITEMS_CACHE_TAG = 'flow-items';

/**
 * Invalidate the public list, feed, item pages and metadata together.
 * Tag invalidation is the primary mechanism; revalidatePath covers route-level
 * ISR caches so an edit is visible immediately after the admin action.
 */
export function invalidateFlowCache(): void {
  revalidateTag(FLOW_ITEMS_CACHE_TAG);

  try {
    revalidatePath('/flow');
    revalidatePath('/flow/[slug]', 'page');
  } catch {
    // revalidatePath is only available inside a Next.js request context.
  }
}

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
          'created_at',
          'updated_at',
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

export type FlowItemBundle = {
  item: Record<string, unknown>;
  media: Record<string, unknown>[];
  aiContext: Record<string, unknown> | null;
};

const FLOW_ITEM_FIELDS = [
  'id',
  'title',
  'slug',
  'lang',
  'type',
  'status',
  'visibility',
  'body_md',
  'source_url',
  'ai_allowed',
  'rag_allowed',
  'metadata',
  'published_at',
  'created_at',
  'updated_at',
  'bluesky_uri',
  'telegram_message_id',
].join(',');

/**
 * Publication data and its ready AI context share one cache entry. The admin
 * AI endpoint invalidates the same tag, so generating context does not make
 * the public page uncacheable or stale.
 */
const readCachedFlowItem = unstable_cache(
  async (slug: string): Promise<FlowItemBundle | null> => {
    const supabase = getSupabaseAdmin();

    const { data: item, error } = await supabase
      .from('items')
      .select(FLOW_ITEM_FIELDS)
      .eq('slug', slug)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load Flow item: ${error.message}`);
    }

    if (!item) return null;

    const itemId = String(
      (item as unknown as Record<string, unknown>).id ?? ''
    );

    let media: Record<string, unknown>[] = [];
    let aiContext: Record<string, unknown> | null = null;

    if (itemId) {
      const mediaResult = await supabase
        .from('media')
        .select('id,item_id,storage_key,mime,width,height,alt,created_at')
        .eq('item_id', itemId);

      if (mediaResult.error) {
        console.warn('[flow/item] media unavailable:', mediaResult.error.message);
      } else {
        media = (mediaResult.data ?? []) as unknown as Record<string, unknown>[];
      }

      const contextResult = await supabase
        .from('flow_ai_context')
        .select('id,item_id,content,model,provider,status,generated_at')
        .eq('item_id', itemId)
        .maybeSingle();

      if (contextResult.error) {
        console.warn(
          '[flow/item] AI context unavailable:',
          contextResult.error.message
        );
      } else {
        aiContext =
          (contextResult.data as unknown as Record<string, unknown> | null) ??
          null;
      }
    }

    return {
      item: item as unknown as Record<string, unknown>,
      media,
      aiContext,
    };
  },
  ['flow-public-item-v2'],
  {
    revalidate: 3600,
    tags: [FLOW_ITEMS_CACHE_TAG],
  }
);

export async function getCachedFlowItem(
  slug: string,
): Promise<FlowItemBundle | null> {
  return readCachedFlowItem(slug);
}

