import { NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import { isPierrotId } from '@/lib/pierrot/conversation';
import { isHumanAccessToken } from '@/lib/pierrot/humanPresenceShared';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import {
  buildHumanStateResponse,
  getHumanPresenceByToken,
  getHumanPresenceForConversation,
  recordHumanEvent,
} from '@/lib/pierrot/humanPresence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 15;

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

/**
 * Authorized human-presence state for the visitor's browser.
 *
 * A caller must prove ownership with either:
 *   * the opaque recovery token returned once when the request was created; or
 *   * the existing conversationId + sessionId pair.
 *
 * The response is sanitized: no token hashes, Telegram ids or other
 * conversations are ever returned.
 */
export async function POST(req: Request) {
  const limited = await checkPierrotRateLimit({
    identifier: getClientIp(req),
    intervalMs: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'pierrot-human-state',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const rawToken = body?.token;
  const token = isHumanAccessToken(rawToken) ? rawToken : null;
  const conversationId = body?.conversationId;
  const sessionId = body?.sessionId;

  if (!token && (!isPierrotId(conversationId) || !isPierrotId(sessionId))) {
    return NextResponse.json(
      { error: 'Conversation credentials are required.' },
      { status: 400, headers: NO_STORE },
    );
  }

  const store = createPierrotStore();

  if (!store) {
    return NextResponse.json(
      { error: 'Storage is unavailable.' },
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    let record = token ? await getHumanPresenceByToken(store, token) : null;

    // A stale recovery token must not block the current tab, which still
    // holds the original conversation/session credentials.
    if (!record && isPierrotId(conversationId) && isPierrotId(sessionId)) {
      record = await getHumanPresenceForConversation(store, conversationId, sessionId);
    }

    if (!record) {
      if (token) {
        return NextResponse.json(
          { error: 'Not found.' },
          { status: 403, headers: NO_STORE },
        );
      }

      return NextResponse.json(
        {
          request: null,
          session: null,
          conversationId: isPierrotId(conversationId) ? conversationId : null,
          sessionId: null,
          messages: [],
          serverTime: new Date().toISOString(),
        },
        { headers: NO_STORE },
      );
    }

    if (record.request.status === 'expired') {
      await recordHumanEvent(store, {
        conversationId: record.request.conversation_id,
        eventName: 'human_expired',
        eventKey: `human_expired:${record.request.id}`,
        payload: { request_id: record.request.id },
      }).catch(() => undefined);
    }

    const payload = await buildHumanStateResponse(store, record);

    return NextResponse.json(payload, { headers: NO_STORE });
  } catch {
    // Never leak database/provider details to an anonymous caller.
    console.error('[human-presence] state lookup failed');
    return NextResponse.json(
      { error: 'State is temporarily unavailable.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
