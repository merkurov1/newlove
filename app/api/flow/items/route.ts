import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;
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

function generateSlug(
  title?: string | null,
  bodyMd?: string | null,
): string {
  const source = (
    title?.trim() ||
    bodyMd?.split(/\r?\n/)[0]?.trim() ||
    'post'
  ).slice(0, 50);

  const base = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const idSuffix = Math.random().toString(36).substring(2, 7);

  return base
    ? `${base}-${idSuffix}`
    : `flow-${Date.now().toString(36)}`;
}

// GET: публичная лента опубликованных публичных записей.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = Math.min(
      Math.max(parseInt(limitParam || '10', 10) || 10, 1),
      50,
    );
    const offset = Math.max(
      parseInt(offsetParam || '0', 10) || 0,
      0,
    );

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
        { error: 'Failed to load Flow items.' },
        { status: 500 },
      );
    }

    const items = data ?? [];
    const totalCount = count ?? 0;

    return NextResponse.json(
      {
        items,
        hasMore: totalCount > offset + items.length,
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
    console.error('[api/flow/items] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error while loading Flow items.' },
      { status: 500 },
    );
  }
}

// POST: создание записи и публикация во внешние каналы.
export async function POST(req: Request) {
  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const body = await req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const slug = body.slug || generateSlug(body.title, body.body_md);

    const allowedTypes = [
      'note',
      'article',
      'link',
      'photo',
      'video',
      'quote',
    ];

    const itemType = allowedTypes.includes(body.type)
      ? body.type
      : 'article';

    const allowedStatuses = ['draft', 'published', 'archived'];
    const allowedVisibilities = ['public', 'private', 'unlisted'];

    const status = allowedStatuses.includes(body.status)
      ? body.status
      : 'published';

    const visibility = allowedVisibilities.includes(body.visibility)
      ? body.visibility
      : 'public';

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        title: body.title || null,
        slug,
        lang: body.lang || 'ru',
        type: itemType,
        status,
        visibility,
        body_md: body.body_md || null,
        source_url: body.source_url || null,
        metadata:
          body.metadata &&
          typeof body.metadata === 'object' &&
          !Array.isArray(body.metadata)
            ? body.metadata
            : {},
        published_at: status === 'published'
          ? body.published_at || now
          : null,
      })
      .select()
      .single();

    if (error || !item) {
      console.error('[api/flow/items] insert error:', error);

      return NextResponse.json(
        { error: 'Failed to create item.' },
        { status: 500 },
      );
    }

    let crosspostResult = null;

    if (
      item.status === 'published' &&
      item.visibility === 'public'
    ) {
      try {
        // Ленивый импорт: sharp не грузится на этапе сборки.
        const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
        crosspostResult = await crosspostFlowItem(item);
      } catch (crosspostError) {
        console.error(
          '[api/flow/items] crosspost error:',
          crosspostError,
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        item,
        crosspost: crosspostResult,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[api/flow/items] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error while creating item.' },
      { status: 500 },
    );
  }
}
