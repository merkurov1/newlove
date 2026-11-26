import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getCurrentUser, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotSubscriptionRef,
  pierrotConversationIdFromSubscriptionRef,
} from '@/lib/pierrot/orderAttribution';
import {
  recordSubscriptionEvent,
  type SubscriptionEventName,
} from '@/lib/newsletter/subscriptionEvents';
import {
  NEWSLETTER_BOT_FIELD,
  NEWSLETTER_FORM_STARTED_FIELD,
  checkSignupTiming,
  honeypotWasFilled,
  verifyTurnstileToken,
} from '@/lib/newsletter/botProtection';
import { getTrustedClientIp } from '@/lib/newsletter/clientIp';
import {
  checkNewsletterRateLimit,
  newsletterRateLimitResponse,
} from '@/lib/newsletter/rateLimit';
import { registerNewsletterSubscriber } from '@/lib/newsletter/signup';

export const dynamic = 'force-dynamic';

function confirmationBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    new URL(req.url).origin
  ).replace(/\/$/, '');
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function POST(req: NextRequest) {
  const requestKey = randomUUID();
  const clientIp = getTrustedClientIp(req.headers);
  let store: ReturnType<typeof getServerSupabaseClient> | null = null;
  let subscriberId: string | number | null = null;
  let pierrotRef: string | null = null;

  async function recordEvent(
    eventName: SubscriptionEventName,
    key: string,
    payload: Record<string, unknown> = {}
  ) {
    try {
      if (!store) store = getServerSupabaseClient({ useServiceRole: true });

      await recordSubscriptionEvent(store, {
        eventName,
        eventKey: key,
        subscriberId,
        conversationId: pierrotConversationIdFromSubscriptionRef(pierrotRef),
        payload,
      });
    } catch {
      // Analytics must never break the signup response.
    }
  }

  let body: Record<string, unknown>;

  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Cheap server-side bot checks run before any database write or external call.
  if (
    honeypotWasFilled(
      body[NEWSLETTER_BOT_FIELD],
      body.company_website,
      body._gotcha
    )
  ) {
    await recordEvent('subscription_failed', `signup_blocked:${requestKey}`, {
      reason: 'honeypot',
    });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const timing = checkSignupTiming(body[NEWSLETTER_FORM_STARTED_FIELD]);

  if (!timing.ok) {
    await recordEvent('subscription_failed', `signup_blocked:${requestKey}`, {
      reason: `timing_${timing.reason}`,
    });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const language = String(body.language || body.locale || 'ru')
    .trim()
    .toLowerCase();
  const locale = language === 'en' ? 'en' : 'ru';
  pierrotRef = normalizePierrotSubscriptionRef(body.pierrotAttribution);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const rateLimit = await checkNewsletterRateLimit({ ip: clientIp, email });

  if (!rateLimit.allowed) {
    await recordEvent('subscription_failed', `signup_blocked:${requestKey}`, {
      reason: `rate_limited_${rateLimit.layer}`,
    });
    return newsletterRateLimitResponse(rateLimit);
  }

  const turnstile = await verifyTurnstileToken({
    token: body.turnstileToken,
    remoteIp: clientIp,
  });

  if (!turnstile.ok) {
    await recordEvent('subscription_failed', `signup_blocked:${requestKey}`, {
      reason: `turnstile_${turnstile.reason}`,
    });

    if (turnstile.reason === 'not_configured') {
      return NextResponse.json(
        {
          error:
            'Subscription is temporarily unavailable because bot protection is not configured. Please contact the site administrator.',
        },
        { status: 503 }
      );
    }

    if (turnstile.reason === 'provider_unavailable' || turnstile.reason === 'invalid_response') {
      return NextResponse.json(
        { error: 'Bot verification is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Bot verification failed. Please refresh the page and try again.' },
      { status: 400 }
    );
  }

  try {
    if (!store) store = getServerSupabaseClient({ useServiceRole: true });
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

  const result = await registerNewsletterSubscriber({
    store,
    email,
    locale,
    userId,
    pierrotAttribution: pierrotRef,
    baseUrl: confirmationBaseUrl(req),
  });

  subscriberId = result.subscriberId;

  if (result.status === 'already_confirmed') {
    await recordEvent('subscription_submitted', `subscription_submitted:${requestKey}`, {
      status: 'already_confirmed',
    });
    return NextResponse.json({
      success: true,
      status: 'already_confirmed',
      confirmationRequired: false,
    });
  }

  if (result.status === 'pending_confirmation') {
    await recordEvent('subscription_submitted', `subscription_submitted:${requestKey}`, {
      status: 'pending_confirmation',
      locale,
    });

    return NextResponse.json({
      success: true,
      status: 'pending_confirmation',
      confirmationRequired: true,
      ...(result.devConfirmationUrl ? { devConfirmationUrl: result.devConfirmationUrl } : {}),
    });
  }

  await recordEvent('subscription_failed', `subscription_failed:${requestKey}`, {
    reason: result.reason,
    error_code: result.errorCode,
  });

  if (result.reason === 'email_send' || result.reason === 'email_not_configured') {
    return NextResponse.json(
      {
        error: 'The confirmation email could not be sent. Your subscription is not confirmed.',
      },
      { status: 503 }
    );
  }

  if (result.reason === 'token') {
    return NextResponse.json(
      { error: 'Confirmation could not be prepared. Please try again.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: 'Subscription unavailable' }, { status: 500 });
}
