import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import {
  getCachedFlowItems,
  invalidateFlowCache,
} from '@/lib/flow/items-cash';
import {
  normalizeFlowItem,
  type FlowItemInput,
} from '@/lib/flow/content';
import { ensurePublishedFlowContext } from '@/lib/flow/publishedContext';

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

function generateSlug(title?: string | null, bodyMd?: string | null): string {
  const source = (title?.trim() || bodyMd?.split(/\r?\n/)[0]?.trim() || 'post').slice(0, 50);

  const base = source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const idSuffix = Math.random().toString(36).substring(2, 7);

  return base ? `${base}-${idSuffix}` : `flow-${Date.now().toString(36)}`;
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
    const now = new Date().toISOString();

    const allowedTypes = ['note', 'article', 'link', 'photo', 'video', 'quote'];

    const itemType = allowedTypes.includes(body.type) ? body.type : 'article';

    const allowedStatuses = ['draft', 'published', 'archived'];
    const allowedVisibilities = ['public', 'private'];

    const status = allowedStatuses.includes(body.status) ? body.status : 'published';

    const visibility = allowedVisibilities.includes(body.visibility) ? body.visibility : 'public';

    const inputMetadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const content = normalizeFlowItem({
      title: body.title,
      body_md: body.body_md,
      source_url: body.source_url,
      type: itemType,
      lang: body.lang || 'ru',
      metadata: inputMetadata,
    });

    const slug = body.slug || generateSlug(content.title, body.body_md);

    const metadata = {
      ...inputMetadata,
      title_source: content.titleSource,
      ...(content.titleSource === 'manual'
        ? { generated_title: undefined }
        : { generated_title: content.title }),
    };

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        // A published item always has a title, including a neutral fallback.
        title: content.title,
        slug,
        lang: body.lang || 'ru',
        type: itemType,
        status,
        visibility,
        body_md: body.body_md || null,
        source_url: body.source_url || content.sourceUrl || null,
        metadata,
        published_at: status === 'published' ? body.published_at || now : null,
      })
      .select()
      .single();

    if (error || !item) {
      console.error('[api/flow/items] insert error:', error);

      return NextResponse.json({ error: 'Failed to create item.' }, { status: 500 });
    }

    // Сбрасываем публичную ленту после успешной записи.
    invalidateFlowCache();

    let crosspostResult = null;

    if (item.status === 'published' && item.visibility === 'public') {
      try {
        // Ленивый импорт: sharp не грузится на этапе сборки.
        const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
        crosspostResult = await crosspostFlowItem(item);
        // Crossposting stores channel state in metadata.
        invalidateFlowCache();
      } catch (crosspostError) {
        console.error('[api/flow/items] crosspost error:', crosspostError);
      }
    }

    const aiContext = await ensurePublishedFlowContext(supabase, item);

    return NextResponse.json(
      {
        success: true,
        item,
        crosspost: crosspostResult,
        aiContext,
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
