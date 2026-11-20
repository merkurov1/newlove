export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotSubscriptionRef,
  pierrotConversationIdFromSubscriptionRef,
} from '@/lib/pierrot/orderAttribution';
import { recordSubscriptionEvent } from '@/lib/newsletter/subscriptionEvents';
import { getTrustedClientIp } from '@/lib/newsletter/clientIp';
import {
  checkNewsletterIpRateLimit,
  newsletterRateLimitResponse,
} from '@/lib/newsletter/rateLimit';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(req: NextRequest) {
  const clientIp = getTrustedClientIp(req.headers);
  const rateLimit = await checkNewsletterIpRateLimit(clientIp);
  if (!rateLimit.allowed) return newsletterRateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const language = searchParams.get('lang') === 'ru' ? 'ru' : 'en';
  const pierrotRef = normalizePierrotSubscriptionRef(searchParams.get('pierrot'));

  if (!token || !TOKEN_PATTERN.test(token)) {
    return NextResponse.json(
      { error: language === 'ru' ? 'Нет токена подтверждения.' : 'Missing confirmation token.' },
      { status: 400 }
    );
  }

  let store: ReturnType<typeof getServerSupabaseClient>;
  try {
    store = getServerSupabaseClient({ useServiceRole: true });
  } catch {
    return NextResponse.json(
      { error: language === 'ru' ? 'Подтверждение недоступно.' : 'Confirmation is unavailable.' },
      { status: 503 }
    );
  }

  try {
    const { data: tokenRow, error: tokenError } = await store
      .from('subscriber_tokens')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('Confirmation token lookup failed');
      return NextResponse.json(
        { error: language === 'ru' ? 'Ошибка подтверждения.' : 'Confirmation failed.' },
        { status: 500 }
      );
    }

    if (!tokenRow || tokenRow.type !== 'confirm') {
      return NextResponse.json(
        {
          error:
            language === 'ru'
              ? 'Некорректный токен подтверждения.'
              : 'Invalid confirmation token.',
        },
        { status: 404 }
      );
    }

    const subscriberId = tokenRow.subscriber_id ?? tokenRow.subscriberId;

    if (!subscriberId) {
      return NextResponse.json({ error: 'Invalid confirmation token.' }, { status: 400 });
    }

    if (tokenRow.used === true) {
      // Link scanners and repeated clicks are safe: if this subscriber is
      // already confirmed, report success instead of breaking the flow.
      const { data: subscriber } = await store
        .from('subscribers')
        .select('id, isActive, confirmedAt')
        .eq('id', subscriberId)
        .maybeSingle();

      if (subscriber?.isActive === true && subscriber.confirmedAt) {
        return NextResponse.json({
          message:
            language === 'ru'
              ? 'Подписка уже подтверждена.'
              : 'Subscription is already confirmed.',
          alreadyConfirmed: true,
        });
      }

      return NextResponse.json(
        {
          error:
            language === 'ru'
              ? 'Некорректный или уже использованный токен.'
              : 'Invalid or already used confirmation token.',
        },
        { status: 404 }
      );
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json(
        {
          error:
            language === 'ru'
              ? 'Токен истёк. Подпишитесь заново.'
              : 'The token has expired. Please subscribe again.',
        },
        { status: 410 }
      );
    }

    const now = new Date().toISOString();

    const { error: subscriberError } = await store
      .from('subscribers')
      .update({
        isActive: true,
        confirmedAt: now,
        unsubscribedAt: null,
      })
      .eq('id', subscriberId);

    if (subscriberError) {
      console.error('Subscriber confirmation update failed');
      return NextResponse.json(
        { error: language === 'ru' ? 'Ошибка подтверждения.' : 'Confirmation failed.' },
        { status: 500 }
      );
    }

    const { error: usedError } = await store
      .from('subscriber_tokens')
      .update({ used: true, usedAt: now })
      .eq('token', token);

    if (usedError) {
      console.error('Confirmation token update failed');
      return NextResponse.json(
        { error: language === 'ru' ? 'Ошибка подтверждения.' : 'Confirmation failed.' },
        { status: 500 }
      );
    }

    await recordSubscriptionEvent(store, {
      eventName: 'subscription_confirmed',
      eventKey: `subscription_confirmed:${token}`,
      subscriberId,
      conversationId: pierrotConversationIdFromSubscriptionRef(pierrotRef),
      payload: { locale: language },
    });

    return NextResponse.json({
      message:
        language === 'ru'
          ? 'Подписка подтверждена. Теперь она активна.'
          : 'Subscription confirmed. It is now active.',
    });
  } catch (error) {
    console.error('Confirmation error:', error);
    return NextResponse.json(
      { error: language === 'ru' ? 'Ошибка подтверждения.' : 'Confirmation failed.' },
      { status: 500 }
    );
  }
}
