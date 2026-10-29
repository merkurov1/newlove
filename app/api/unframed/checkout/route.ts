import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  normalizePierrotUnframedRef,
  pierrotConversationIdFromUnframedRef,
} from '@/lib/pierrot/orderAttribution';
import { createPierrotStore, recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil' as any,
});

export const dynamic = 'force-dynamic';

// The existing reader paywall displays a $15 access charge. The amount is
// fixed on the server so a browser cannot choose what to pay.
const UNFRAMED_ACCESS_AMOUNT = 1500;
const UNFRAMED_ACCESS_CURRENCY = 'usd';

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'unframed-checkout',
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const origin = req.headers.get('origin') || 'https://merkurov.love';
    const pierrotAttribution = normalizePierrotUnframedRef(body?.pierrotAttribution);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: UNFRAMED_ACCESS_CURRENCY,
            product_data: {
              name: 'UNFRAMED Manuscript Access',
              description: 'Digital access to the UNFRAMED manuscript',
            },
            unit_amount: UNFRAMED_ACCESS_AMOUNT,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/unframed/book?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/unframed/book`,
      metadata: {
        type: 'unframed_book',
        ...(pierrotAttribution ? { pierrotAttribution } : {}),
      },
    });

    const pierrotConversationId = pierrotConversationIdFromUnframedRef(pierrotAttribution);

    if (pierrotConversationId) {
      const store = createPierrotStore();

      if (store) {
        await recordPierrotEventByConversationId(store, {
          conversationId: pierrotConversationId,
          eventName: 'checkout_started',
          eventKey: `checkout_started:${session.id}`,
          payload: {
            offer_id: 'unframed',
            amount_total: UNFRAMED_ACCESS_AMOUNT,
            currency: UNFRAMED_ACCESS_CURRENCY,
          },
        });
      }
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('UNFRAMED checkout error:', err);
    return NextResponse.json({ error: err?.message || 'Checkout unavailable' }, { status: 500 });
  }
}
