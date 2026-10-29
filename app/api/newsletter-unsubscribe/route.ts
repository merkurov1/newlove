export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotSubscriptionRef,
  pierrotConversationIdFromSubscriptionRef,
} from '@/lib/pierrot/orderAttribution';
import { recordSubscriptionEvent } from '@/lib/newsletter/subscriptionEvents';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rateLimitResponse = checkRateLimit(clientIp, RATE_LIMITS.NEWSLETTER);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const pierrotRef = normalizePierrotSubscriptionRef(searchParams.get('pierrot'));

  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: 'Missing unsubscribe token.' }, { status: 400 });
  }

  let store: ReturnType<typeof getServerSupabaseClient>;
  try {
    store = getServerSupabaseClient({ useServiceRole: true });
  } catch {
    return NextResponse.json({ error: 'Unsubscribe is unavailable.' }, { status: 503 });
  }

  try {
    const { data: tokenRow, error: tokenError } = await store
      .from('subscriber_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('Unsubscribe token lookup failed');
      return NextResponse.json({ error: 'Error during unsubscribe.' }, { status: 500 });
    }

    if (!tokenRow || tokenRow.type !== 'unsubscribe' || tokenRow.used === true) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 404 });
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Token expired. Please use a fresh unsubscribe link.' },
        { status: 410 }
      );
    }

    const subscriberId = tokenRow.subscriber_id ?? tokenRow.subscriberId;

    if (!subscriberId) {
      return NextResponse.json({ error: 'Invalid unsubscribe token.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { error: subscriberError } = await store
      .from('subscribers')
      .update({ isActive: false, unsubscribedAt: now })
      .eq('id', subscriberId);

    if (subscriberError) {
      console.error('Subscriber unsubscribe update failed');
      return NextResponse.json({ error: 'Error during unsubscribe.' }, { status: 500 });
    }

    const { error: usedError } = await store
      .from('subscriber_tokens')
      .update({ used: true, usedAt: now })
      .eq('token', token);

    if (usedError) {
      console.error('Unsubscribe token update failed');
      return NextResponse.json({ error: 'Error during unsubscribe.' }, { status: 500 });
    }

    await recordSubscriptionEvent(store, {
      eventName: 'unsubscribe',
      eventKey: `unsubscribe:${token}`,
      subscriberId,
      conversationId: pierrotConversationIdFromSubscriptionRef(pierrotRef),
    });

    return NextResponse.json({
      message: 'You have been unsubscribed from the newsletter.',
    });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Error during unsubscribe.' }, { status: 500 });
  }
}
