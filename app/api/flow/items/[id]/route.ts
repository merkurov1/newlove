import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { invalidateFlowCache } from '@/lib/flow/items-cash';
import {
  isTechnicalText,
  normalizeFlowItem,
} from '@/lib/flow/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'note',
  'article',
  'link',
  'photo',
  'video',
  'quote',
];

const ALLOWED_STATUSES = ['draft', 'published', 'archived'];
const ALLOWED_VISIBILITIES = ['public', 'private'];

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// Next 14: params — объект; Next 15+: Promise. Тип покрывает оба случая.
type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

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

async function isAdminRequest(req: Request): Promise<boolean> {
  try {
    await requireAdminFromRequest(req);
    return true;
  } catch {
    return false;
  }
}

// GET: public items are readable by everyone;
// drafts and private items are only readable by an administrator.
export async function GET(
  req: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const admin = await isAdminRequest(req);
    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('items')
      .select('*')
      .eq('id', id);

    if (!admin) {
      query = query
        .eq('status', 'published')
        .eq('visibility', 'public');
    }

    const { data: item, error } = await query.maybeSingle();

    if (error) {
      console.error('[api/flow/items/[id]:GET] database error:', error);

      return NextResponse.json(
        { error: 'Failed to load item.' },
        { status: 500 },
      );
    }

    if (!item) {
      // Use 404 for private records to avoid confirming their existence.
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { item },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('[api/flow/items/[id]:GET] error:', error);

    return NextResponse.json(
      { error: 'Internal server error while fetching item.' },
      { status: 500 },
    );
  }
}

// PATCH: administrator-only update.
export async function PATCH(
  req: Request,
  context: RouteContext,
) {
  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 },
      );
    }

    if (body.type !== undefined && !ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: 'Invalid item type.' },
        { status: 400 },
      );
    }

    if (
      body.status !== undefined &&
      !ALLOWED_STATUSES.includes(body.status)
    ) {
      return NextResponse.json(
        { error: 'Invalid item status.' },
        { status: 400 },
      );
    }

    if (
      body.visibility !== undefined &&
      !ALLOWED_VISIBILITIES.includes(body.visibility)
    ) {
      return NextResponse.json(
        { error: 'Invalid visibility.' },
        { status: 400 },
      );
    }

    for (const key of ['title', 'body_md', 'source_url'] as const) {
      if (body[key] !== undefined && !isStringOrNull(body[key])) {
        return NextResponse.json(
          { error: `${key} must be a string or null.` },
          { status: 400 },
        );
      }
    }

    for (const key of ['slug', 'lang'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        return NextResponse.json(
          { error: `${key} must be a string.` },
          { status: 400 },
        );
      }
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        '[api/flow/items/[id]:PATCH] lookup error:',
        fetchError,
      );

      return NextResponse.json(
        { error: 'Failed to load item.' },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 },
      );
    }

    let nextMetadata: Record<string, unknown> =
      existing.metadata &&
      typeof existing.metadata === 'object' &&
      !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};

    if (body.metadata !== undefined) {
      if (
        !body.metadata ||
        typeof body.metadata !== 'object' ||
        Array.isArray(body.metadata)
      ) {
        return NextResponse.json(
          { error: 'metadata must be an object.' },
          { status: 400 },
        );
      }

      // The composer sends the complete metadata document. Replacing it (not
      // merging) makes image/link removal actually remove legacy fields.
      nextMetadata = body.metadata;
    }

    const nextTitleInput =
      body.title !== undefined ? body.title : existing.title;
    const nextBody =
      body.body_md !== undefined ? body.body_md : existing.body_md;
    const nextType = body.type !== undefined ? body.type : existing.type;
    const nextSourceUrl =
      body.source_url !== undefined ? body.source_url : existing.source_url;
    const nextStatus = body.status !== undefined ? body.status : existing.status;
    const nextVisibility =
      body.visibility !== undefined ? body.visibility : existing.visibility;

    const resolved = normalizeFlowItem({
      ...existing,
      title: nextTitleInput,
      body_md: nextBody,
      type: nextType,
      source_url: nextSourceUrl,
      status: nextStatus,
      visibility: nextVisibility,
      metadata: nextMetadata,
    });

    const titleIsManual =
      typeof body.title === 'string' && !isTechnicalText(body.title);

    nextMetadata = {
      ...nextMetadata,
      title_source: titleIsManual ? 'manual' : resolved.titleSource,
      ...(titleIsManual
        ? { generated_title: undefined }
        : { generated_title: resolved.title }),
    };

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      metadata: nextMetadata,
    };

    const shouldWriteResolvedTitle =
      body.title !== undefined ||
      isTechnicalText(existing.title) ||
      nextStatus === 'published';

    if (shouldWriteResolvedTitle) {
      updatePayload.title = titleIsManual
        ? String(body.title).trim()
        : resolved.title;
    }

    if (body.slug !== undefined) updatePayload.slug = body.slug;
    if (body.lang !== undefined) updatePayload.lang = body.lang;
    if (body.type !== undefined) updatePayload.type = body.type;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.visibility !== undefined) {
      updatePayload.visibility = body.visibility;
    }

    if (
      body.status === 'published' &&
      !existing.published_at
    ) {
      updatePayload.published_at = new Date().toISOString();
    }
    if (body.body_md !== undefined) {
      updatePayload.body_md = body.body_md;
    }
    if (body.source_url !== undefined) {
      updatePayload.source_url = body.source_url;
    }

    const { data: updatedItem, error: updateError } = await supabase
      .from('items')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedItem) {
      console.error(
        '[api/flow/items/[id]:PATCH] update error:',
        updateError,
      );

      return NextResponse.json(
        { error: 'Failed to update item.' },
        { status: 500 },
      );
    }

    // The public feed is cached by tag; invalidate immediately after the
    // database write, before waiting on external crossposting.
    invalidateFlowCache();

    const wasPublished =
      existing.status === 'published' &&
      existing.visibility === 'public';

    const isNowPublished =
      updatedItem.status === 'published' &&
      updatedItem.visibility === 'public';

    if (!wasPublished && isNowPublished) {
      try {
        // Ленивый импорт: sharp не грузится на этапе сборки.
        const { crosspostFlowItem } = await import('@/lib/flow/crosspost');
        await crosspostFlowItem(updatedItem);
        // Crossposting stores channel state in metadata.
        invalidateFlowCache();
      } catch (crosspostError) {
        console.error(
          '[api/flow/items/[id]:PATCH] crosspost error:',
          crosspostError,
        );
      }
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  } catch (error) {
    console.error('[api/flow/items/[id]:PATCH] error:', error);

    return NextResponse.json(
      { error: 'Internal server error while updating item.' },
      { status: 500 },
    );
  }
}

// DELETE: administrator-only deletion, including external copies.
export async function DELETE(
  req: Request,
  context: RouteContext,
) {
  try {
    try {
      await requireAdminFromRequest(req);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { data: item, error: fetchError } = await supabase
      .from('items')
      .select('id, bluesky_uri, telegram_message_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(
        '[api/flow/items/[id]:DELETE] lookup error:',
        fetchError,
      );

      return NextResponse.json(
        { error: 'Failed to load item.' },
        { status: 500 },
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found' },
        { status: 404 },
      );
    }

    const deletePromises: Promise<unknown>[] = [];

    if (item.bluesky_uri) {
      const { deleteFromBluesky } = await import('@/lib/bluesky');
      deletePromises.push(deleteFromBluesky(item.bluesky_uri));
    }

    if (item.telegram_message_id) {
      const { deleteFromTelegramChannel } = await import('@/lib/telegram');
      deletePromises.push(
        deleteFromTelegramChannel(item.telegram_message_id),
      );
    }

    if (deletePromises.length > 0) {
      try {
        await Promise.all(deletePromises);
      } catch (externalError) {
        console.error(
          '[api/flow/items/[id]:DELETE] external deletion error:',
          externalError,
        );

        return NextResponse.json(
          {
            error:
              'Could not delete the external post copies. The Flow item was not deleted.',
          },
          { status: 502 },
        );
      }
    }

    const { error: deleteError } = await supabase
      .from('items')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error(
        '[api/flow/items/[id]:DELETE] database delete error:',
        deleteError,
      );

      return NextResponse.json(
        { error: 'Failed to delete item.' },
        { status: 500 },
      );
    }

    invalidateFlowCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/flow/items/[id]:DELETE] error:', error);

    return NextResponse.json(
      { error: 'Internal server error while deleting item.' },
      { status: 500 },
    );
  }
}
