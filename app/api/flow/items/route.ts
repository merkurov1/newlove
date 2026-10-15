import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crosspostFlowItem } from '@/lib/flow/crosspost';

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

function generateSlug(title?: string | null, bodyMd?: string | null): string {
  const source = (title?.trim() || bodyMd?.split(/\r?\n/)[0]?.trim() || 'post')
    .slice(0, 50);

  const base = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const idSuffix = Math.random().toString(36).substring(2, 7);
  return base ? `${base}-${idSuffix}` : `flow-${Date.now().toString(36)}`;
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

// --- POST: Создание поста во Flow + синхронный автопостинг (Telegram / Pierrot / Osiris / Bluesky) ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const now = new Date().toISOString();
    const slug = body.slug || generateSlug(body.title, body.body_md);

    // Determine database type conforming to check constraint
    // type in ('note','article','link','photo','video','quote')
    let itemType = body.type || 'article';
    const allowedTypes = ['note', 'article', 'link', 'photo', 'video', 'quote'];
    if (!allowedTypes.includes(itemType)) {
      itemType = 'article';
    }

    // 1. Создаем запись во Flow
    const { data: item, error } = await supabase
      .from('items')
      .insert({
        title: body.title || null,
        slug,
        lang: body.lang || 'ru',
        type: itemType,
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
      try {
        await crosspostFlowItem(item);
      } catch (crosspostError) {
        console.error('[api/flow/items] crosspost error:', crosspostError);
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
