import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { deleteFromBluesky } from '@/lib/bluesky';
import { deleteFromTelegramChannel } from '@/lib/telegram';

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

    // 2. Параллельно удаляем пост из внешней сети Bluesky и Telegram-канала Unframed
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
