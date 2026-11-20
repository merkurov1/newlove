import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getCachedFlowItems, invalidateFlowCache } from '@/lib/flow/items-cash';
import { normalizeFlowItem, type FlowItemInput } from '@/lib/flow/content';
import { createFlowItem } from '@/lib/flow/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

// GET: публичная лента с серверным кэшированием.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 50);

    const offset = Math.max(parseInt(offsetParam || '0', 10) || 0, 0);

    const result = await getCachedFlowItems(limit, offset);

    // The database snapshot is cached; normalization is cheap and guarantees
    // every client receives the same title/image/link decisions as the page,
    // feeds and social cards.
    const items = result.items.map((item) => {
      const normalized = normalizeFlowItem(item as FlowItemInput);

      return {
        ...item,
        title: normalized.title,
        titleSource: normalized.titleSource,
        contentType: normalized.contentType,
        description: normalized.description,
        bodyText: normalized.bodyText,
        bodyExcerpt: normalized.bodyExcerpt,
        bodyTruncated: normalized.bodyTruncated,
        showTitle: normalized.showTitle,
        titleIsRedundant: normalized.titleIsRedundant,
        images: normalized.images,
        videos: normalized.videos,
        links: normalized.links,
        canonicalUrl: normalized.canonicalUrl,
        sourceName: normalized.sourceName,
        imageAlt: normalized.imageAlt,
        language: normalized.language,
        version: normalized.version,
      };
    });

    return NextResponse.json(
      { ...result, items },
      {
        status: 200,
        headers: {
          // Браузер не хранит ответ самостоятельно.
          // Кэширование выполняется на стороне Next.js.
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[api/flow/items] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error while loading Flow items.' },
      { status: 500 }
    );
  }
}

// POST: создание записи и публикация во внешние каналы.
export async function POST(req: Request) {
  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const publication = await createFlowItem(
      supabase,
      {
        title: body.title,
        body_md: body.body_md,
        source_url: body.source_url,
        type: body.type,
        lang: body.lang,
        status: body.status,
        visibility: body.visibility,
        metadata: body.metadata,
        slug: typeof body.slug === 'string' ? body.slug : null,
        published_at: typeof body.published_at === 'string' ? body.published_at : null,
      },
      // The Flow item is saved before the response. External channels are
      // published after the response so a slow Telegram/Bluesky call never
      // keeps the composer open. Channel state is persisted independently.
      { deferDistribution: true }
    );

    if (!publication.ok) {
      console.error('[api/flow/items] insert error:', publication.details);

      return NextResponse.json({ error: publication.error }, { status: publication.status });
    }

    invalidateFlowCache();

    const shouldDistribute =
      publication.item.status === 'published' && publication.item.visibility === 'public';

    if (shouldDistribute) {
      const item = publication.item;

      try {
        after(async () => {
          try {
            const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
            await crosspostFlowItem(item);
            invalidateFlowCache();
          } catch (error) {
            console.error('[api/flow/items] deferred crosspost error:', error);
          }

          try {
            const { ensurePublishedFlowContext } = await import(
              '@/lib/flow/publishedContext'
            );
            await ensurePublishedFlowContext(
              supabase,
              item as unknown as import('@/lib/flow/publishedContext').PublishedFlowItem
            );
            invalidateFlowCache();
          } catch (error) {
            console.error('[api/flow/items] deferred AI context error:', error);
          }
        });
      } catch (error) {
        // The item is already persisted. Never turn a scheduling problem into
        // an error response that could make the owner publish a duplicate.
        console.error('[api/flow/items] could not schedule distribution:', error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        item: publication.item,
        crosspost: publication.crosspost,
        // The client uses this flag to follow channel state instead of
        // presenting an unfinished publication as fully delivered.
        crosspostPending: shouldDistribute,
        aiContext: publication.aiContext,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[api/flow/items] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error while creating item.' },
      { status: 500 }
    );
  }
}
