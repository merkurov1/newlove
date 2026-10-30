import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { isPierrotId } from '@/lib/pierrot/conversation';
import {
  HUMAN_MAX_MESSAGE_LENGTH,
  isHumanAccessToken,
  isHumanMessageId,
} from '@/lib/pierrot/humanPresenceShared';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import {
  appendHumanMessage,
  buildHumanStateResponse,
  getHumanPresenceByToken,
  getHumanPresenceForConversation,
  ensureHumanMessageLink,
  getHumanMessageLink,
  publicHumanSession,
  publicHumanState,
  recordHumanEvent,
  updateHumanMessageLink,
} from '@/lib/pierrot/humanPresence';
import { sendVisitorMessageToOwner } from '@/lib/pierrot/humanPresenceTelegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 20;

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * Visitor -> Anton transport.
 *
 * The message is persisted exactly once (client message id + database unique
 * constraints), then relayed through the existing Piero Telegram bot. The
 * response never contains Telegram credentials or message ids.
 */
export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 40,
    keyPrefix: 'pierrot-human-message',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const rawToken = body?.token;
  const token = isHumanAccessToken(rawToken) ? rawToken : null;
  const conversationId = body?.conversationId;
  const sessionId = body?.sessionId;
  const messageId = body?.messageId;
  const rawContent = body?.content;

  if (!token && (!isPierrotId(conversationId) || !isPierrotId(sessionId))) {
    return errorResponse('Conversation credentials are required.', 400);
  }

  if (!isHumanMessageId(messageId)) {
    return errorResponse('Invalid message id.', 400);
  }

  if (
    typeof rawContent !== 'string' ||
    rawContent.trim().length === 0 ||
    rawContent.length > HUMAN_MAX_MESSAGE_LENGTH
  ) {
    return errorResponse('Invalid message.', 400);
  }

  const content = rawContent.trim();
  const store = createPierrotStore();

  if (!store) return errorResponse('Storage is unavailable.', 503);

  try {
    let record = token ? await getHumanPresenceByToken(store, token) : null;

    if (!record && isPierrotId(conversationId) && isPierrotId(sessionId)) {
      record = await getHumanPresenceForConversation(store, conversationId, sessionId);
    }

    if (!record) return errorResponse('Not found.', 403);

    if (record.request.status !== 'active') {
      /** @type {import('@/lib/pierrot/humanPresenceShared').HumanPresenceStateResponse} */
      const state = await buildHumanStateResponse(store, record);

      return NextResponse.json(
        {
          ...state,
          error: 'This conversation is not active.',
        },
        { status: 409, headers: NO_STORE },
      );
    }

    let appended;

    try {
      appended = await appendHumanMessage(store, {
        requestId: record.request.id,
        messageId,
        role: 'user',
        content,
        direction: 'visitor_to_telegram',
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';

      if (code === 'P0002') {
        let latest = token ? await getHumanPresenceByToken(store, token) : null;

        if (!latest && isPierrotId(conversationId) && isPierrotId(sessionId)) {
          latest = await getHumanPresenceForConversation(store, conversationId, sessionId);
        }

        const state = latest ? await buildHumanStateResponse(store, latest) : null;

        return NextResponse.json(
          {
            ...(state ?? {}),
            error: 'This conversation has ended.',
          },
          { status: 409, headers: NO_STORE },
        );
      }

      throw error;
    }

    let delivery: 'sent' | 'failed' = 'failed';
    let shouldRelay = appended.inserted;

    if (!appended.inserted) {
      let existing = await getHumanMessageLink(store, messageId);

      if (!existing && record.session) {
        // The AI route may have persisted this message just before Anton
        // accepted. Attach the delivery metadata and relay it exactly once.
        const createdLink = await ensureHumanMessageLink(store, {
          requestId: record.request.id,
          sessionId: record.session.id,
          conversationId: record.request.conversation_id,
          messageId,
          direction: 'visitor_to_telegram',
        });

        if (createdLink) {
          shouldRelay = true;
        } else {
          existing = await getHumanMessageLink(store, messageId);
        }
      }

      if (existing) {
        const alreadySent =
          existing.delivery_status === 'sent' || existing.telegram_message_id !== null;

        delivery = alreadySent ? 'sent' : 'failed';

        // Retry only a known failed delivery. A pending row may belong to an
        // in-flight request; sending it again could duplicate the message.
        if (!alreadySent && existing.delivery_status === 'failed') {
          shouldRelay = true;
        }
      }
    }

    if (shouldRelay) {
      const ownerTelegramId =
        record.session?.owner_telegram_id ?? record.request.telegram_chat_id ?? null;

      if (ownerTelegramId) {
        try {
          const sent = await sendVisitorMessageToOwner({
            ownerTelegramId,
            visitorLabel: record.request.visitor_label,
            requestId: record.request.id,
            content,
            replyToMessageId: record.request.telegram_message_id,
          });

          if (sent) {
            delivery = 'sent';
            await updateHumanMessageLink(store, messageId, {
              telegramChatId: sent.chatId,
              telegramMessageId: sent.messageId,
              status: 'sent',
            }).catch(() => undefined);
          } else {
            delivery = 'failed';
            await updateHumanMessageLink(store, messageId, {
              status: 'failed',
            }).catch(() => undefined);
          }
        } catch {
          delivery = 'failed';
          await updateHumanMessageLink(store, messageId, {
            status: 'failed',
          }).catch(() => undefined);
        }
      } else {
        await updateHumanMessageLink(store, messageId, {
          status: 'failed',
        }).catch(() => undefined);
      }

      await recordHumanEvent(store, {
        conversationId: record.request.conversation_id,
        eventName: 'human_message_sent',
        eventKey: `human_message_sent:${messageId}`,
        payload: {
          length: content.length,
          delivered: delivery === 'sent',
        },
      }).catch(() => undefined);
    }

    let stored: { created_at?: unknown; message_index?: unknown } | null = null;

    try {
      const result = await store
        .from('pierrot_messages')
        .select('created_at, message_index')
        .eq('id', messageId)
        .maybeSingle();

      stored = result.data ?? null;
    } catch {
      // The message is already persisted; the timestamp is a convenience.
    }

    return NextResponse.json(
      {
        request: publicHumanState(record.request),
        session: publicHumanSession(record.session),
        message: {
          id: messageId,
          createdAt:
            stored && typeof stored.created_at === 'string' ? stored.created_at : null,
          sequence:
            stored && typeof stored.message_index === 'number'
              ? stored.message_index
              : appended.sequence,
        },
        delivery,
      },
      { headers: NO_STORE },
    );
  } catch {
    // Do not log message text or visitor identifiers.
    console.error('[human-presence] message delivery failed');
    return errorResponse('The message could not be delivered.', 500);
  }
}
