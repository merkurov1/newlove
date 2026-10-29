import { NextResponse } from 'next/server';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversationId = new URL(request.url).searchParams.get('id') || '';

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) {
    return NextResponse.json({ error: 'Invalid conversation id.' }, { status: 400 });
  }

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });

    const { error } = await store.from('pierrot_conversations').delete().eq('id', conversationId);

    if (error) throw error;

    // Best-effort cleanup of derived records that do not have a cascading FK.
    await store.from('art_service_leads').delete().eq('conversation_id', conversationId);
    await store.from('subscription_events').delete().eq('conversation_id', conversationId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/pierrot/conversations] delete failed:', error);
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}
