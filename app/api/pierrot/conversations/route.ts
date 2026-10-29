import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isPierrotId } from '@/lib/pierrot/conversation';
import {
  createPierrotStore,
  deletePierrotConversation,
  persistenceFailure,
} from '@/lib/pierrot/serverStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Server-side deletion for a browser that holds both random identifiers.
 * There is no GET handler and no response body, so this cannot be used to
 * enumerate or read another visitor's conversation.
 */
export async function DELETE(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'pierrot-delete',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { conversationId, sessionId } = body;

  if (!isPierrotId(conversationId) || !isPierrotId(sessionId)) {
    return NextResponse.json({ error: 'Invalid conversation identifiers.' }, { status: 400 });
  }

  const store = createPierrotStore();

  if (!store) {
    return NextResponse.json({ error: 'Storage is unavailable.' }, { status: 503 });
  }

  try {
    await deletePierrotConversation(store, conversationId, sessionId);
  } catch (error) {
    persistenceFailure(error, 'conversation_delete');
    return NextResponse.json({ error: 'Deletion failed.' }, { status: 500 });
  }

  return noContent();
}
