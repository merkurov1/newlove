import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { invalidateFlowCache } from '@/lib/flow/items-cash';
import {
  isTechnicalText,
  normalizeFlowItem,
} from '@/lib/flow/content';
import { ensurePublishedFlowContext } from '@/lib/flow/publishedContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type UpdatePayload = {
  title?: string;
  body_md?: string;
  lang?: string;
  slug?: string;
  visibility?: string;
  status?: string;
  type?: string;
  source_url?: string | null;
  metadata?: Record<string, unknown>;
  rag_allowed?: boolean;
};

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

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Unknown server error.';
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await requireAdminFromRequest(req);

    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: 'Failed to load item.',
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    const { data: aiContext, error: aiContextError } = await supabase
      .from('flow_ai_context')
      .select('*')
      .eq('item_id', id)
      .maybeSingle();

    if (aiContextError) {
      console.warn('[admin/items/:id] AI context lookup failed:', aiContextError.message);
    }

    return NextResponse.json(
      {
        item: data,
        aiContext: aiContext ?? null,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await requireAdminFromRequest(req);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('id,status,slug')
      .eq('id', id)
      .maybeSingle();

    if (itemError) {
      throw itemError;
    }

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    const { data: media, error: mediaError } = await supabase
      .from('media')
      .select('id,storage_key')
      .eq('item_id', id);

    if (mediaError) {
      throw mediaError;
    }

    const storageKeys = (media ?? [])
      .map((row) => row.storage_key)
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (storageKeys.length > 0) {
      const { error: storageError } = await supabase.storage.from('media').remove(storageKeys);

      if (storageError) {
        console.warn('[admin/items/:id] Storage cleanup failed:', storageError);
      }
    }

    if (media && media.length > 0) {
      const { error: mediaDeleteError } = await supabase.from('media').delete().eq('item_id', id);

      if (mediaDeleteError) {
        throw mediaDeleteError;
      }
    }

    const { error: contextError } = await supabase
      .from('flow_ai_context')
      .delete()
      .eq('item_id', id);

    if (contextError) {
      console.warn('[admin/items/:id] AI context cleanup failed:', contextError);
    }

    const { error: deleteError } = await supabase.from('items').delete().eq('id', id);

    if (deleteError) {
      throw deleteError;
    }

    // Invalidate cached public Flow pages after deletion.
    invalidateFlowCache();

    return NextResponse.json(
      {
        success: true,
        id,
        status: item.status,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[admin/items/:id] DELETE failed:', error);

    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await requireAdminFromRequest(req);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 401 });
  }

  const { id } = await context.params;

  let payload: UpdatePayload;

  try {
    payload = (await req.json()) as UpdatePayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing, error: existingError } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: 'Failed to load item.',
          details: existingError.message,
        },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    const nextStatus = payload.status !== undefined ? payload.status : existing.status;

    const allowedStatuses = ['draft', 'published', 'archived'];

    if (!allowedStatuses.includes(nextStatus)) {
      return NextResponse.json({ error: `Invalid status: ${nextStatus}` }, { status: 400 });
    }

    const nextLang =
      typeof payload.lang === 'string' && payload.lang.trim() ? payload.lang.trim() : existing.lang;

    const nextType = typeof payload.type === 'string' ? payload.type : existing.type;

    const nextBody = payload.body_md !== undefined ? payload.body_md : (existing.body_md ?? '');

    let nextMetadata: Record<string, unknown> =
      payload.metadata !== undefined
        ? payload.metadata
        : existing.metadata &&
            typeof existing.metadata === 'object' &&
            !Array.isArray(existing.metadata)
          ? existing.metadata
          : {};

    const resolved = normalizeFlowItem({
      ...existing,
      title: payload.title !== undefined ? payload.title : existing.title,
      body_md: nextBody,
      type: nextType,
      lang: nextLang,
      source_url:
        payload.source_url !== undefined
          ? payload.source_url
          : existing.source_url,
      status: nextStatus,
      metadata: nextMetadata,
    });

    const titleIsManual =
      typeof payload.title === 'string' && !isTechnicalText(payload.title);

    let nextTitle =
      typeof payload.title === 'string' && titleIsManual
        ? payload.title.trim()
        : isTechnicalText(existing.title)
          ? resolved.title
          : payload.title !== undefined
            ? resolved.title
            : existing.title ?? resolved.title;

    if (!nextTitle) nextTitle = resolved.title;

    nextMetadata = {
      ...nextMetadata,
      title_source: titleIsManual ? 'manual' : resolved.titleSource,
      ...(titleIsManual
        ? { generated_title: undefined }
        : { generated_title: nextTitle }),
    };

    let nextSlug = existing.slug ?? '';

    if (existing.status !== 'published' || !nextSlug) {
      nextSlug = payload.slug !== undefined ? slugify(payload.slug) : slugify(nextTitle);
    }

    if (nextStatus === 'published') {
      if (!nextTitle) {
        return NextResponse.json(
          {
            error: 'Could not derive a title for this item.',
          },
          { status: 400 }
        );
      }

      if (!nextSlug) {
        nextSlug = slugify(nextTitle);
      }

      if (!nextSlug) {
        return NextResponse.json(
          {
            error: 'Could not generate a valid slug.',
          },
          { status: 400 }
        );
      }

      const { data: collision, error: collisionError } = await supabase
        .from('items')
        .select('id')
        .eq('lang', nextLang)
        .eq('slug', nextSlug)
        .neq('id', id)
        .limit(1)
        .maybeSingle();

      if (collisionError) {
        return NextResponse.json(
          {
            error: 'Failed to check slug availability.',
            details: collisionError.message,
          },
          { status: 500 }
        );
      }

      if (collision) {
        if (existing.status === 'published') {
          return NextResponse.json(
            {
              error: 'Published item slug is immutable.',
            },
            { status: 409 }
          );
        }

        nextSlug = `${nextSlug}-${id.slice(0, 8)}`;
      }
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
    };

    if (
      payload.title !== undefined ||
      nextStatus === 'published' ||
      isTechnicalText(existing.title)
    ) {
      update.title = nextTitle;
    }

    if (payload.body_md !== undefined) {
      update.body_md = nextBody;
    }

    if (payload.lang !== undefined) {
      update.lang = nextLang;
    }

    if (payload.type !== undefined) {
      update.type = nextType;
    }

    if (payload.source_url !== undefined) {
      update.source_url = payload.source_url;
    }

    update.metadata = nextMetadata;

    if (typeof payload.rag_allowed === 'boolean') {
      update.rag_allowed = payload.rag_allowed;
    }

    const shouldWriteSlug =
      existing.status !== 'published' && (payload.slug !== undefined || nextStatus === 'published');

    if (shouldWriteSlug) {
      update.slug = nextSlug;
    }

    if (nextStatus === 'published') {
      update.visibility = payload.visibility ?? 'public';

      update.published_at = existing.published_at ?? new Date().toISOString();

      if (existing.status === 'published' && existing.slug) {
        update.slug = existing.slug;
      }
    }

    if (nextStatus === 'draft') {
      update.published_at = null;
      update.visibility = payload.visibility ?? 'private';
    }

    if (nextStatus === 'archived') {
      update.visibility = payload.visibility ?? 'private';
    }

    const { data, error } = await supabase
      .from('items')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[admin/items/:id] UPDATE DATABASE ERROR:', error);

      return NextResponse.json(
        {
          error: error.message || 'Failed to update item.',
          details: error.details ?? null,
          hint: error.hint ?? null,
          code: error.code ?? null,
        },
        { status: 500 }
      );
    }

    // Invalidate cached public Flow pages after update.
    invalidateFlowCache();

    const wasPublished =
      existing.status === 'published' && existing.visibility === 'public';
    const isNowPublished =
      data.status === 'published' && data.visibility === 'public';

    if (!wasPublished && isNowPublished) {
      try {
        const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
        await crosspostFlowItem(data);
        invalidateFlowCache();
      } catch (crosspostError) {
        console.error('[admin/items/:id] crosspost error:', crosspostError);
      }
    }

    // Context is generated automatically when an item becomes public for the
    // first time. Existing rows are never regenerated by this path.
    const publishedContext = await ensurePublishedFlowContext(supabase, data);

    // The context may have been generated by this save; invalidate the item
    // cache again so the public page does not keep a pre-generation snapshot.
    invalidateFlowCache();

    return NextResponse.json(
      {
        success: true,
        item: data,
        aiContext: publishedContext,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[admin/items/:id] PATCH unexpected error:', error);

    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
