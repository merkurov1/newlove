import { NextResponse } from 'next/server';
import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { loadOwnerConversation } from '@/lib/pierrot/workspace/data';
import { loadHistoryMessagePage, resolveHistoryScope } from '@/lib/pierrot/history/store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const admin = await requireAdminFromRequest(request);
    const url = new URL(request.url);
    const historyId = url.searchParams.get('historyId') || '';
    const sessionId = url.searchParams.get('sessionId') || '';
    const conversationId = url.searchParams.get('conversationId') || '';
    const beforeRaw = url.searchParams.get('beforeSequence') || url.searchParams.get('beforeIndex');
    const limitRaw = url.searchParams.get('limit');

    const beforeSequence = beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : null;
    const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 120;

    if (historyId) {
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(historyId)) {
        return NextResponse.json({ error: 'Invalid history id.' }, { status: 400 });
      }
      const store = getServerSupabaseClient({ useServiceRole: true });
      const scope = await resolveHistoryScope(store, admin.id, {
        historyId,
        episodeId: sessionId || null,
        createSession: false,
      });
      if (!scope) {
        return NextResponse.json({ error: 'History not found.' }, { status: 404 });
      }
      const page = await loadHistoryMessagePage(store, admin.id, scope, {
        limit,
        beforeSequence: beforeSequence && beforeSequence > 0 ? beforeSequence : null,
        sessionId: sessionId || null,
      });
      return NextResponse.json({
        historyId: scope.history.id,
        sessionId: scope.session?.id || null,
        messages: page.messages,
        hasMore: page.hasMore,
        oldestSequence: page.oldestSequence,
        newestSequence: page.newestSequence,
        historyMaxSequence: page.historyMaxSequence,
        oldestMessageIndex: page.oldestSequence,
      });
    }

    if (!/^[A-Za-z0-9_-]{8,64}$/.test(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation id.' }, { status: 400 });
    }

    const conversation = await loadOwnerConversation(admin.id, conversationId, {
      ...(beforeSequence && beforeSequence > 0 ? { beforeIndex: beforeSequence } : {}),
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

    // Never delete a conversation that is a permanent history's canonical
    // storage or a session's provenance: that would cascade-delete preserved
    // messages. Deletion remains available only for unlinked legacy rows.
    try {
      const [historyRef, sessionRef] = await Promise.all([
        store
          .from('pierrot_histories')
          .select('id')
          .eq('canonical_conversation_id', conversationId)
          .limit(1),
        store
          .from('pierrot_sessions')
          .select('id')
          .or(
            `conversation_id.eq.${conversationId},source_conversation_id.eq.${conversationId}`
          )
          .limit(1),
      ]);

      if (
        (Array.isArray(historyRef.data) && historyRef.data.length > 0) ||
        (Array.isArray(sessionRef.data) && sessionRef.data.length > 0)
      ) {
        return NextResponse.json(
          { error: 'This conversation belongs to a permanent history and cannot be deleted.' },
          { status: 409 }
        );
      }
    } catch {
      // A partially migrated database or a minimal test double may not expose
      // the new tables. The legacy delete path remains available there.
    }

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
