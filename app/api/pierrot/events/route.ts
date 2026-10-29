import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
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
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 120,
    keyPrefix: 'pierrot-events',
  });

  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const {
    conversationId,
    sessionId,
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

    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName,
      eventKey: `${eventName}:${eventKey}`,
      payload,
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
