import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isPierrotId } from '@/lib/pierrot/conversation';
import { isHumanAccessToken } from '@/lib/pierrot/humanPresenceShared';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import {
  buildHumanStateResponse,
  closeHumanSession,
  declineHumanRequest,
  getHumanPresenceByRequestId,
  getHumanPresenceByToken,
  getHumanPresenceForConversation,
  recordHumanEvent,
} from '@/lib/pierrot/humanPresence';
import {
  closedNotificationText,
  declinedNotificationText,
  editHumanRequestNotification,
  sendOwnerConfirmation,
} from '@/lib/pierrot/humanPresenceTelegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 15;

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Visitor-side controls: cancel a pending request or leave an active human
 * conversation. Both are idempotent and validated server-side.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'pierrot-human-action',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const rawToken = body?.token;
  const token = isHumanAccessToken(rawToken) ? rawToken : null;
  const conversationId = body?.conversationId;
  const sessionId = body?.sessionId;
  const action = body?.action;

  if (action !== 'cancel' && action !== 'close') {
    return errorResponse('Invalid action.', 400);
  }

  if (!token && (!isPierrotId(conversationId) || !isPierrotId(sessionId))) {
    return errorResponse('Conversation credentials are required.', 400);
  }

  const store = createPierrotStore();

  if (!store) return errorResponse('Storage is unavailable.', 503);

  try {
    let record = token ? await getHumanPresenceByToken(store, token) : null;

    if (!record && isPierrotId(conversationId) && isPierrotId(sessionId)) {
      record = await getHumanPresenceForConversation(store, conversationId, sessionId);
    }

    if (!record) return errorResponse('Not found.', 403);

    const request = record.request;

    if (action === 'cancel' && request.status === 'pending') {
      const result = await declineHumanRequest(store, request.id, 'visitor');

      if (result.telegramChatId && result.telegramMessageId) {
        await editHumanRequestNotification(
          result.telegramChatId,
          result.telegramMessageId,
          declinedNotificationText(request.visitor_label, 'visitor'),
        ).catch(() => undefined);
      }

      await recordHumanEvent(store, {
        conversationId: request.conversation_id,
        eventName: 'human_declined',
        eventKey: `human_declined:${request.id}`,
        payload: { resolved_by: 'visitor' },
      }).catch(() => undefined);
    }

    if (action === 'close' && request.status === 'active') {
      const result = await closeHumanSession(store, request.id, 'visitor');

      if (
        result.telegramChatId &&
        (request.telegram_status_message_id || request.telegram_message_id)
      ) {
        await editHumanRequestNotification(
          result.telegramChatId,
          request.telegram_status_message_id ?? request.telegram_message_id ?? 0,
          closedNotificationText(request.visitor_label, 'visitor'),
        ).catch(() => undefined);
      }

      if (result.telegramChatId) {
        await sendOwnerConfirmation(
          result.telegramChatId,
          `Visitor ended conversation ${request.visitor_label}. Piero has resumed.`,
        ).catch(() => undefined);
      }

      await recordHumanEvent(store, {
        conversationId: request.conversation_id,
        eventName: 'human_closed',
        eventKey: `human_closed:${request.id}`,
        payload: { closed_by: 'visitor' },
      }).catch(() => undefined);
    }

    const updated = await getHumanPresenceByRequestId(store, request.id);
    const state = updated
      ? await buildHumanStateResponse(store, updated)
      : {
          request: null,
          session: null,
          conversationId: request.conversation_id,
          sessionId: record.conversationSessionId,
          messages: [],
          serverTime: new Date().toISOString(),
        };

    return NextResponse.json(state, { headers: NO_STORE });
  } catch {
    console.error('[human-presence] visitor action failed');
    return errorResponse('The request could not be updated.', 500);
  }
}
