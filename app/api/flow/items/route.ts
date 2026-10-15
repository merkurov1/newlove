import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { publishToBluesky } from '@/lib/bluesky';
import { publishToTelegramChannel } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

// --- GET: Выдача списка постов Flow ---
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = Math.min(
      Math.max(parseInt(limitParam || '10', 10) || 10, 1),
      50,
    );
    const offset = Math.max(parseInt(offsetParam || '0', 10) || 0, 0);

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
      console.error('[api/flow/items] database error:', error);
      return NextResponse.json(
        { error: 'Failed to load Flow items.', details: error.message },
        { status: 500 },
      );
    }

    const items = data ?? [];
    const totalCount = count ?? 0;
    const hasMore = totalCount > offset + items.length;

    return NextResponse.json(
      {
        items,
        hasMore,
        total: totalCount,
        nextOffset: offset + items.length,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('[api/flow/items] unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error while loading Flow items.' },
      { status: 500 },
    );
  }
}

// --- POST: Создание поста во Flow + синхронный автопостинг в Bluesky и Telegram (Unframed) ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();

    // 1. Создаем запись во Flow
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        title: body.title || null,
        slug: body.slug || null,
        lang: body.lang || 'ru',
        type: body.type || 'article',
        status: body.status || 'published',
        visibility: body.visibility || 'public',
        body_md: body.body_md || null,
        source_url: body.source_url || null,
        metadata: body.metadata || {},
        published_at: body.published_at || now,
      })
      .select()
      .single();

    if (error || !item) {
      console.error('[api/flow/items] insert error:', error);
      return NextResponse.json(
        { error: 'Failed to create item', details: error?.message },
        { status: 500 },
      );
    }

    // 2. Если пост публичный и опубликован — синхронизируем внешние каналы
    if (item.status === 'published' && item.visibility === 'public') {
      // 2a. Публикация в Bluesky
      const bskyPromise = publishToBluesky({
        title: item.title,
        body_md: item.body_md,
        source_url: item.source_url,
        slug: item.slug,
        lang: item.lang,
      });

      // 2b. Публикация в Telegram Unframed
      const imageUrl =
        typeof item.metadata?.public_url === 'string'
          ? item.metadata.public_url
          : typeof item.metadata?.image === 'string'
            ? item.metadata.image
            : null;

      const tgPromise = publishToTelegramChannel({
        title: item.title,
        body_md: item.body_md,
        source_url: item.source_url,
        slug: item.slug,
        lang: item.lang,
        imageUrl,
      });

      // Параллельно дожидаемся обоих ответов
      const [bskyResult, tgResult] = await Promise.all([
        bskyPromise,
        tgPromise,
      ]);

      // 3. Сохраняем идентификаторы публичных постов для будущего каскадного удаления
      const updateData: Record<string, unknown> = {};

      if (bskyResult) {
        updateData.bluesky_uri = bskyResult.uri;
        updateData.bluesky_cid = bskyResult.cid;
        item.bluesky_uri = bskyResult.uri;
        item.bluesky_cid = bskyResult.cid;
      }

      if (tgResult) {
        updateData.telegram_message_id = tgResult.messageId;
        updateData.telegram_channel_id = tgResult.chatId;
        item.telegram_message_id = tgResult.messageId;
        item.telegram_channel_id = tgResult.chatId;
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('items')
          .update(updateData)
          .eq('id', item.id);
      }
    }

    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error) {
    console.error('[api/flow/items] POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error while creating item.' },
      { status: 500 },
    );
  }
}
