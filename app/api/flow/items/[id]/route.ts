import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.slug !== undefined) updatePayload.slug = body.slug;
    if (body.lang !== undefined) updatePayload.lang = body.lang;
    if (body.type !== undefined) updatePayload.type = body.type;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.visibility !== undefined) {
      updatePayload.visibility = body.visibility;
    }
    if (body.body_md !== undefined) {
      updatePayload.body_md = body.body_md;
    }
    if (body.source_url !== undefined) {
      updatePayload.source_url = body.source_url;
    }

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

      updatePayload.metadata = {
        ...(existing.metadata || {}),
        ...body.metadata,
      };
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/flow/items/[id]:DELETE] error:', error);

    return NextResponse.json(
      { error: 'Internal server error while deleting item.' },
      { status: 500 },
    );
  }
}
