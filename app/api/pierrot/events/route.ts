import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import {
  isPierrotClientEventName,
  isPierrotId,
  normalizePierrotConsent,
  normalizePierrotEventKey,
  sanitizePierrotEventPayload,
  sanitizePierrotPathname,
  sanitizePierrotReferrer,
} from '@/lib/pierrot/conversation';
import {
  createPierrotStore,
  ensurePierrotConversation,
  markPierrotConversationEnded,
  persistenceFailure,
  recordPierrotEvent,
} from '@/lib/pierrot/serverStore';
import { isPierrotUserId, resolvePierrotIdentity } from '@/lib/pierrot/identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Write-only telemetry for real client actions (navigation/action/end).
 * There is deliberately no GET handler: a browser cannot read transcripts or
 * events from this route.
 */
export async function POST(req: Request) {
  const limited = await checkPierrotRateLimit({
    identifier: getClientIp(req),
    intervalMs: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'pierrot-events',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const {
    conversationId,
    sessionId,
    visitorId: rawVisitorId,
    eventName,
    eventKey: rawEventKey,
    payload: rawPayload,
    consent: rawConsent,
    context,
  } = body;

  if (!isPierrotId(conversationId) || !isPierrotId(sessionId)) {
    return NextResponse.json({ error: 'Invalid conversation identifiers.' }, { status: 400 });
  }

  if (!isPierrotClientEventName(eventName)) {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }

  const eventKey = normalizePierrotEventKey(rawEventKey);
  const payload = sanitizePierrotEventPayload(eventName, rawPayload);

  if (!eventKey || !payload) {
    return NextResponse.json({ error: 'Invalid event payload.' }, { status: 400 });
  }

  const consent = normalizePierrotConsent(rawConsent);

  // The browser can opt out at any time. No transcript or behavioural event is
  // written without a granted consent state.
  if (!consent || consent.state !== 'granted') return noContent();

  const store = createPierrotStore();
  if (!store) return noContent();

  let ownerAuthorized = false;
  let ownerUserId: string | null = null;

  try {
    const user = await getCurrentUser();
    if (user?.role === 'ADMIN') {
      ownerAuthorized = true;
      ownerUserId = isPierrotUserId(user.id) ? user.id : null;
    }
  } catch {
    ownerAuthorized = false;
  }

  const identity = resolvePierrotIdentity({
    ownerAuthorized,
    ownerUserId,
    ownerSource: 'supabase_session',
    visitorId: rawVisitorId,
    visitorAllowed: consent.state === 'granted',
  });

  const startPage = sanitizePierrotPathname(
    context && typeof context === 'object' ? context.pathname : undefined
  );
  const referrer = sanitizePierrotReferrer(
    context && typeof context === 'object' ? context.referrer : undefined
  );

  try {
    await ensurePierrotConversation(store, {
      id: conversationId,
      sessionId,
      startPage,
      referrer,
      language: 'und',
      consentState: consent.state,
      consentVersion: consent.version,
      identity,
    });

    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'conversation_started',
      eventKey: 'conversation_started',
      payload: {
        start_page: startPage,
        language: 'und',
        has_referrer: Boolean(referrer),
      },
    });

    // Feedback is useful only when it points at the answer that caused it.
    // The client now sends the server assistant message id, but older clients
    // and retries may still send a valid-but-unknown id. In that case the
    // lookup returns nothing and the event is stored unchanged.
    let storedPayload: Record<string, unknown> = payload;

    if (eventName === 'answer_feedback' && typeof payload.message_id === 'string') {
      const messageId = payload.message_id;
      const { data: replyEvent } = await store
        .from('pierrot_events')
        .select('payload')
        .eq('conversation_id', conversationId)
        .eq('event_name', 'assistant_replied')
        .eq('event_key', `assistant_replied:${messageId}`)
        .maybeSingle();

      const replyPayload =
        replyEvent?.payload && typeof replyEvent.payload === 'object'
          ? (replyEvent.payload as Record<string, unknown>)
          : null;

      if (replyPayload) {
        let brainPayload: Record<string, unknown> | null = null;

        if (typeof replyPayload.in_reply_to === 'string') {
          const { data: brainEvent } = await store
            .from('pierrot_events')
            .select('payload')
            .eq('conversation_id', conversationId)
            .eq('event_name', 'brain_retrieval')
            .eq('event_key', `brain_retrieval:${replyPayload.in_reply_to}`)
            .maybeSingle();

          brainPayload =
            brainEvent?.payload && typeof brainEvent.payload === 'object'
              ? (brainEvent.payload as Record<string, unknown>)
              : null;
        }

        storedPayload = {
          ...payload,
          trace: {
            intent: replyPayload.intent ?? null,
            owner_tool: replyPayload.owner_tool ?? null,
            deterministic: replyPayload.deterministic === true,
            provider: replyPayload.provider ?? null,
            answer_sources: replyPayload.answer_sources ?? null,
            web_outcome: replyPayload.web_outcome ?? null,
            web_code: replyPayload.web_code ?? null,
            web_source_count: replyPayload.web_source_count ?? null,
            source_status: replyPayload.source_status ?? null,
            evidence_warnings: replyPayload.evidence_warnings ?? null,
            brain_outcome: brainPayload?.outcome ?? null,
            brain_code: brainPayload?.code ?? null,
            brain_timings: brainPayload?.brain_timings ?? null,
            document_title_matched: brainPayload?.document_title_matched ?? null,
            document_match_type: brainPayload?.document_match_type ?? null,
          },
        };
      }
    }

    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName,
      eventKey: `${eventName}:${eventKey}`,
      payload: storedPayload,
    });

    if (eventName === 'conversation_ended') {
      await markPierrotConversationEnded(store, conversationId, sessionId);
    }
  } catch (error) {
    // Telemetry must never break navigation or chat. Log only a safe code.
    persistenceFailure(error, 'client_event');
  }

  return noContent();
}
