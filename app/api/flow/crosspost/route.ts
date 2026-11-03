import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { invalidateFlowCache } from '@/lib/flow/items-cash';
import type { CrosspostPayload } from '@/lib/flow/crosspost';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * POST /api/flow/crosspost
 *
 * Поддерживаемые запросы:
 *   { id }                  — запись по ID из Supabase
 *   { slug }                — запись по slug из Supabase
 *   { title, body_md, ... } — публикация из переданного содержимого
 *
 * Доступ разрешён только администратору.
 */
export async function POST(req: Request) {
  try {
    // Авторизация до чтения или публикации данных.
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    let parsedBody: unknown;

    try {
      parsedBody = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Request body must be valid JSON.' },
        { status: 400 }
      );
    }

    if (!isRecord(parsedBody)) {
      return NextResponse.json(
        { success: false, error: 'Request body must be a JSON object.' },
        { status: 400 }
      );
    }

    const body = parsedBody;
    let payload: CrosspostPayload;

    const id =
      typeof body.id === 'string' ? body.id.trim() : '';
    const slug =
      typeof body.slug === 'string' ? body.slug.trim() : '';

    // 1. Публикация существующей записи из Supabase.
    if (id || slug) {
      const supabase = getSupabaseAdmin();

      let query = supabase.from('items').select('*');

      if (id) {
        query = query.eq('id', id);
      } else {
        query = query.eq('slug', slug);
      }

      const { data: item, error } = await query.maybeSingle();

      if (error) {
        console.error(
          '[api/flow/crosspost] Supabase lookup failed:',
          error.message
        );

        return NextResponse.json(
          { success: false, error: 'Failed to load Flow item.' },
          { status: 500 }
        );
      }

      if (!item) {
        return NextResponse.json(
          { success: false, error: 'Flow item not found.' },
          { status: 404 }
        );
      }

      if (
        item.status !== 'published' ||
        item.visibility !== 'public'
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'Only published public items can be crossposted.',
          },
          { status: 409 }
        );
      }

      payload = item as CrosspostPayload;
    } else {
      // 2. Ручная публикация из переданного содержимого.
      const title =
        typeof body.title === 'string' ? body.title : null;
      const bodyMd =
        typeof body.body_md === 'string' ? body.body_md : null;

      if (!title?.trim() && !bodyMd?.trim()) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Provide an item id, slug, or publication content (title/body_md).',
          },
          { status: 400 }
        );
      }

      const metadata = isRecord(body.metadata) ? body.metadata : {};

      const imageUrls = Array.isArray(body.imageUrls)
        ? body.imageUrls.filter(
            (value): value is string =>
              typeof value === 'string' && value.trim().length > 0
          )
        : null;

      payload = {
        id: id || `manual-${Date.now()}`,
        title,
        type: typeof body.type === 'string' ? body.type : 'note',
        body_md: bodyMd,
        source_url:
          typeof body.source_url === 'string' ? body.source_url : null,
        slug: slug || null,
        lang: typeof body.lang === 'string' ? body.lang : 'ru',
        imageUrl:
          typeof body.imageUrl === 'string' ? body.imageUrl : null,
        imageUrls,
        youtubeUrl:
          typeof body.youtubeUrl === 'string' ? body.youtubeUrl : null,
        description:
          typeof body.description === 'string' ? body.description : null,
        metadata,
      };
    }

    const requestedChannels = Array.isArray(body.channels)
      ? body.channels.filter(
          (
            channel
          ): channel is 'telegram' | 'bluesky' | 'facebook' | 'threads' =>
            channel === 'telegram' ||
            channel === 'bluesky' ||
            channel === 'facebook' ||
            channel === 'threads'
        )
      : undefined;

    // Ленивый импорт: sharp и прочие тяжёлые зависимости не грузятся при сборке.
    const { crosspostFlowItem } = await import('@/lib/flow/crosspost');

    // Каждый канал обрабатывается независимо внутри crosspostFlowItem.
    const result = await crosspostFlowItem(payload, {
      channels: requestedChannels,
      retryFailed: body.retryFailed === true,
      force: body.force === true,
      retryUncertain: body.retryUncertain === true,
    });

    invalidateFlowCache();

    const telegramState = result.channels?.telegram;
    const blueskyState = result.channels?.bluesky;
    const facebookState = result.channels?.facebook;
    const threadsState = result.channels?.threads;

    const channels = {
      bluesky: {
        success: blueskyState?.status === 'published',
        status: blueskyState?.status ?? 'not_attempted',
        uri: result.bluesky?.uri ?? blueskyState?.externalUri ?? null,
        externalId: blueskyState?.externalId ?? null,
        externalUri: blueskyState?.externalUri ?? null,
        error: blueskyState?.lastError ?? null,
        attempts: blueskyState?.attempts ?? 0,
        uncertain: blueskyState?.uncertain ?? false,
      },
      telegram: {
        success: telegramState?.status === 'published',
        status: telegramState?.status ?? 'not_attempted',
        messageId:
          result.telegram?.messageId ??
          telegramState?.messageIds[0] ??
          null,
        messageIds: telegramState?.messageIds ?? [],
        externalId: telegramState?.externalId ?? null,
        externalUri: telegramState?.externalUri ?? null,
        error: telegramState?.lastError ?? null,
        attempts: telegramState?.attempts ?? 0,
        uncertain: telegramState?.uncertain ?? false,
      },
      facebook: {
        success: facebookState?.status === 'published',
        status: facebookState?.status ?? 'not_attempted',
        externalId: facebookState?.externalId ?? null,
        externalUri: facebookState?.externalUri ?? null,
        postId:
          facebookState?.status === 'published'
            ? result.facebook?.id ?? facebookState.externalId ?? null
            : null,
        url:
          facebookState?.status === 'published'
            ? result.facebook?.url ?? facebookState.externalUri ?? null
            : null,
        error: facebookState?.lastError ?? null,
        attempts: facebookState?.attempts ?? 0,
        uncertain: facebookState?.uncertain ?? false,
      },
      threads: {
        success: threadsState?.status === 'published',
        status: threadsState?.status ?? 'not_attempted',
        externalId: threadsState?.externalId ?? null,
        externalUri: threadsState?.externalUri ?? null,
        postId:
          threadsState?.status === 'published'
            ? result.threads?.id ?? threadsState.externalId ?? null
            : null,
        url:
          threadsState?.status === 'published'
            ? result.threads?.url ?? threadsState.externalUri ?? null
            : null,
        error: threadsState?.lastError ?? null,
        attempts: threadsState?.attempts ?? 0,
        uncertain: threadsState?.uncertain ?? false,
      },
      osirisWebhook: {
        configured:
          result.osirisWebhook !== null &&
          result.osirisWebhook !== undefined,
        success: result.osirisWebhook?.ok ?? null,
        status: result.osirisWebhook?.status ?? null,
        error: result.osirisWebhook?.error ?? null,
      },
      pierrotWebhook: {
        configured:
          result.pierrotWebhook !== null &&
          result.pierrotWebhook !== undefined,
        success: result.pierrotWebhook?.ok ?? null,
        status: result.pierrotWebhook?.status ?? null,
        error: result.pierrotWebhook?.error ?? null,
      },
    };

    const publishedSomewhere =
      channels.bluesky.success ||
      channels.telegram.success ||
      channels.facebook.success ||
      channels.threads.success ||
      channels.osirisWebhook.success === true ||
      channels.pierrotWebhook.success === true;

    console.info('[api/flow/crosspost] Completed:', {
      itemId: payload.id,
      channels,
    });

    return NextResponse.json({
      success: publishedSomewhere,
      itemId: payload.id,
      attemptedChannels: result.attemptedChannels ?? [],
      channels,
      result,
    });
  } catch (error: unknown) {
    console.error('[api/flow/crosspost] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Crosspost API failed.',
        details:
          error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
