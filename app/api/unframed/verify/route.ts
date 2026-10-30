import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import Stripe from 'stripe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  normalizePierrotUnframedRef,
  pierrotConversationIdFromUnframedRef,
} from '@/lib/pierrot/orderAttribution';
import { recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';
import { recordPierrotPurchaseCompleted } from '@/lib/pierrot/commercialAnalytics';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil' as any,
});

export async function GET(request: Request) {
  const limited = checkRateLimit(getClientIp(request), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'unframed-verify',
  });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.metadata?.type !== 'unframed_book') {
      return NextResponse.json({ error: 'Not an UNFRAMED access session' }, { status: 400 });
    }

    if (session.payment_status === 'paid') {
      const cookieStore = await cookies();
      cookieStore.set({
        name: 'unframed_access',
        value: 'true',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });

      const ref = normalizePierrotUnframedRef(session.metadata?.pierrotAttribution);
      const conversationId = pierrotConversationIdFromUnframedRef(ref);

      if (conversationId) {
        try {
          const store = getServerSupabaseClient({ useServiceRole: true });
          await recordPierrotEventByConversationId(store, {
            conversationId,
            eventName: 'unframed_purchase_confirmed',
            eventKey: `unframed_purchase_confirmed:${session.id}`,
            payload: {
              offer_id: 'unframed',
              product_id: 'unframed',
              amount_total: typeof session.amount_total === 'number' ? session.amount_total : null,
              currency: typeof session.currency === 'string' ? session.currency : null,
            },
          });

          await recordPierrotPurchaseCompleted(store, {
            conversationId,
            eventKey: `purchase_completed:${session.id}`,
            offerId: 'unframed',
            providerSessionId: session.id,
            amountTotal: typeof session.amount_total === 'number' ? session.amount_total : null,
            currency: typeof session.currency === 'string' ? session.currency : null,
            source: 'unframed_verify',
          });
        } catch {
          // Confirmed access still works if analytics is unavailable.
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Not paid' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Verification failed' }, { status: 500 });
  }
}
