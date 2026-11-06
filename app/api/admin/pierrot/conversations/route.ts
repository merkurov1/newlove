import { NextResponse } from 'next/server';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { loadOwnerConversation } from '@/lib/pierrot/workspace/data';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const conversationId = url.searchParams.get('conversationId') || '';
    const beforeRaw = url.searchParams.get('beforeIndex');
    const limitRaw = url.searchParams.get('limit');

    if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id.' }, { status: 400 });
    }

    const beforeIndex = beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : null;
    const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 120;

    const conversation = await loadOwnerConversation(admin.id, conversationId, {
      ...(beforeIndex && beforeIndex > 0 ? { beforeIndex } : {}),
      limit,
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }

    return NextResponse.json({
      messages: conversation.messages,
      hasMore: Boolean(conversation.hasMore),
      oldestMessageIndex: conversation.oldestMessageIndex ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lookup failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    );
  }
}

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
