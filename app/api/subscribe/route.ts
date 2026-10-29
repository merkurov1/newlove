import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, RATE_LIMITS, checkRateLimit } from '@/lib/rateLimit';
import { getCurrentUser, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotSubscriptionRef,
  pierrotConversationIdFromSubscriptionRef,
} from '@/lib/pierrot/orderAttribution';
import { sendSubscriptionConfirmation } from '@/lib/newsletter/sendSubscriptionConfirmation';
import {
  recordSubscriptionEvent,
  type SubscriptionEventName,
} from '@/lib/newsletter/subscriptionEvents';

export const dynamic = 'force-dynamic';

function confirmationBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, '');
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  const rl = checkRateLimit(clientIp, RATE_LIMITS.NEWSLETTER);
  if (rl) return rl;

  const requestKey = randomUUID();
  let subscriberId: string | number | null = null;
  let pierrotRef: string | null = null;
  let store: ReturnType<typeof getServerSupabaseClient> | null = null;

  async function recordEvent(
    eventName: SubscriptionEventName,
    key: string,
    payload: Record<string, unknown> = {}
  ) {
    if (!store) return;

    await recordSubscriptionEvent(store, {
      eventName,
      eventKey: key,
      subscriberId,
      conversationId: pierrotConversationIdFromSubscriptionRef(pierrotRef),
      payload,
    });
  }

  try {
    const body = await req.json();
    const email = (body?.email || '').toString().trim().toLowerCase();
    const language = (body?.language || body?.locale || 'ru').toString().trim().toLowerCase();
    const locale = language === 'en' ? 'en' : 'ru';
    pierrotRef = normalizePierrotSubscriptionRef(body?.pierrotAttribution);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    try {
      store = getServerSupabaseClient({ useServiceRole: true });
    } catch (error) {
      console.error('Subscribe DB client unavailable:', error);
      return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });
    }

    let userId: string | null = null;
    try {
      const user = await getCurrentUser();
      userId = user?.id ?? null;
    } catch {
      userId = null;
    }

    const { data: existing, error: lookupError } = await store
      .from('subscribers')
      .select('id, isActive, confirmedAt, unsubscribedAt')
      .ilike('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('Subscribe lookup failed');
      await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
        reason: 'lookup',
      });
      return NextResponse.json({ error: 'Subscription unavailable' }, { status: 500 });
    }

    if (existing?.id !== undefined && existing?.id !== null) {
      subscriberId = existing.id;
    }

    if (existing?.isActive === true && existing?.confirmedAt) {
      await recordEvent('subscription_submitted', `subscription_submitted:${requestKey}`, {
        status: 'already_confirmed',
      });
      return NextResponse.json({
        success: true,
        status: 'already_confirmed',
        confirmationRequired: false,
      });
    }

    const now = new Date().toISOString();

    if (!subscriberId) {
      const insertData: Record<string, unknown> = {
        email,
        isActive: false,
        locale,
        confirmedAt: null,
        unsubscribedAt: null,
      };
      if (userId) insertData.userId = userId;

      const insert = await store.from('subscribers').insert(insertData).select('id').maybeSingle();

      if (insert.error || !insert.data?.id) {
        console.error('Subscribe insert failed');
        await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
          reason: 'insert',
        });
        return NextResponse.json({ error: 'Subscription unavailable' }, { status: 500 });
      }

      subscriberId = insert.data.id;
    } else {
      const update: Record<string, unknown> = {
        isActive: false,
        locale,
        confirmedAt: null,
        unsubscribedAt: null,
      };
      if (userId) update.userId = userId;

      const { error: updateError } = await store
        .from('subscribers')
        .update(update)
        .eq('id', subscriberId);

      if (updateError) {
        console.error('Subscribe update failed');
        await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
          reason: 'update',
        });
        return NextResponse.json({ error: 'Subscription unavailable' }, { status: 500 });
      }
    }

    // Only the newest confirmation link should work.
    await store
      .from('subscriber_tokens')
      .update({ used: true, usedAt: now })
      .eq('subscriber_id', subscriberId)
      .eq('type', 'confirm')
      .eq('used', false);

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await store.from('subscriber_tokens').insert({
      subscriber_id: subscriberId,
      type: 'confirm',
      token,
      created_at: now,
      expires_at: expiresAt,
    });

    if (tokenError) {
      console.error('Subscribe confirmation token insert failed');
      await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
        reason: 'token',
      });
      return NextResponse.json(
        { error: 'Confirmation could not be prepared. Please try again.' },
        { status: 500 }
      );
    }

    const delivery = await sendSubscriptionConfirmation({
      email,
      token,
      locale,
      baseUrl: confirmationBaseUrl(req),
      pierrotAttribution: pierrotRef,
    });

    if (delivery.status !== 'sent') {
      await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
        reason: delivery.status === 'skipped' ? 'email_not_configured' : 'email_send',
      });

      if (process.env.NODE_ENV !== 'production' && delivery.status === 'skipped') {
        const confirmationUrl = new URL('/api/newsletter-confirm', confirmationBaseUrl(req));
        confirmationUrl.searchParams.set('token', token);
        if (pierrotRef) confirmationUrl.searchParams.set('pierrot', pierrotRef);

        return NextResponse.json({
          success: true,
          status: 'pending_confirmation',
          confirmationRequired: true,
          devConfirmationUrl: confirmationUrl.toString(),
        });
      }

      return NextResponse.json(
        {
          error: 'The confirmation email could not be sent. Your subscription is not confirmed.',
        },
        { status: 503 }
      );
    }

    await recordEvent('subscription_submitted', `subscription_submitted:${requestKey}`, {
      status: 'pending_confirmation',
      locale,
    });

    return NextResponse.json({
      success: true,
      status: 'pending_confirmation',
      confirmationRequired: true,
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
      reason: 'unexpected',
    });
    return NextResponse.json({ error: 'Subscribe failed' }, { status: 500 });
  }
}
