import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deleteFromBluesky } from '@/lib/bluesky';
import { deleteFromTelegramChannel } from '@/lib/telegram';
import { crosspostFlowItem } from '@/lib/flow/crosspost';

export const dynamic = 'force-dynamic';

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

// --- GET: Fetch single Flow item by ID ---
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: item, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error('[api/flow/items/[id]:GET] error:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching item.' },
      { status: 500 },
    );
  }
}

// --- PATCH: Update Flow item by ID ---
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchErr } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updatePayload.title = body.title;
    if (body.slug !== undefined) updatePayload.slug = body.slug;
    if (body.lang !== undefined) updatePayload.lang = body.lang;
    if (body.type !== undefined) updatePayload.type = body.type;
    if (body.status !== undefined) updatePayload.status = body.status;
    if (body.visibility !== undefined) updatePayload.visibility = body.visibility;
    if (body.body_md !== undefined) updatePayload.body_md = body.body_md;
    if (body.source_url !== undefined) updatePayload.source_url = body.source_url;

    if (body.metadata !== undefined) {
      updatePayload.metadata = {
        ...(existing.metadata || {}),
        ...(body.metadata || {}),
      };
    }

    const { data: updatedItem, error: updateErr } = await supabase
      .from('items')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr || !updatedItem) {
      return NextResponse.json(
        { error: 'Failed to update item', details: updateErr?.message },
        { status: 500 },
      );
    }

    // If publishing newly or re-publishing
    const wasPublished = existing.status === 'published' && existing.visibility === 'public';
    const isNowPublished = updatedItem.status === 'published' && updatedItem.visibility === 'public';
    if (!wasPublished && isNowPublished) {
      try {
        await crosspostFlowItem(updatedItem);
      } catch (cErr) {
        console.error('[api/flow/items/[id]:PATCH] crosspost error:', cErr);
      }
    }

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('[api/flow/items/[id]:PATCH] error:', error);
    return NextResponse.json(
      { error: 'Internal server error while updating item.' },
      { status: 500 },
    );
  }
}

// --- DELETE: Delete Flow item + Cascade delete Bluesky & Telegram ---
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    // 1. Находим пост, его bluesky_uri и telegram_message_id
    const { data: item, error: fetchError } = await supabase
      .from('items')
      .select('id, bluesky_uri, telegram_message_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // 2. Параллельно удаляем пост из внешней сети Bluesky и Telegram-канала
    const deletePromises: Promise<unknown>[] = [];

    if (item.bluesky_uri) {
      deletePromises.push(deleteFromBluesky(item.bluesky_uri));
    }

    if (item.telegram_message_id) {
      deletePromises.push(deleteFromTelegramChannel(item.telegram_message_id));
    }

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 3. Удаляем запись из Supabase
    const { error: deleteError } = await supabase
      .from('items')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete item', details: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/flow/items/delete] error:', error);
    return NextResponse.json(
      { error: 'Internal server error while deleting item.' },
      { status: 500 },
    );
  }
}
