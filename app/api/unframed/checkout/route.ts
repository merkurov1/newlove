import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { SITE_URL } from '@/lib/seo';
import {
  normalizePierrotUnframedRef,
  pierrotConversationIdFromUnframedRef,
} from '@/lib/pierrot/orderAttribution';
import { createPierrotStore, recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

export const dynamic = 'force-dynamic';

// The existing reader paywall displays a $15 access charge. The amount is
// fixed on the server so a browser cannot choose what to pay.
const UNFRAMED_ACCESS_AMOUNT = 1500;
const UNFRAMED_ACCESS_CURRENCY = 'usd';

/**
 * Stripe redirects must never be derived from the request Origin header:
 * it is browser-controlled. Use the configured application domain, with the
 * canonical site URL as the final fallback.
 */
function applicationBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configured) {
    try {
      const url = new URL(configured);
      if (
        url.protocol === 'https:' ||
        (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')
      ) {
        return url.origin;
      }
    } catch {
      // Fall through to the canonical domain.
    }
  }

  return SITE_URL;
}

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'unframed-checkout',
  });
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl = applicationBaseUrl();
    const pierrotAttribution = normalizePierrotUnframedRef(body?.pierrotAttribution);

    const session = await stripe.checkout.sessions.create({
      // Card enables Apple Pay and Google Pay on Stripe's hosted Checkout.
      // Link is added explicitly and left on its default "auto" display so
      // compatible customers see it as an express wallet.
      payment_method_types: ['card', 'link'],
      wallet_options: {
        link: {
          display: 'auto',
        },
      },
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
      success_url: `${baseUrl}/unframed/book?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/unframed/book?checkout=cancelled`,
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
            product_id: 'unframed',
            amount_total: UNFRAMED_ACCESS_AMOUNT,
            currency: UNFRAMED_ACCESS_CURRENCY,
          },
        });
      }
    }

    if (!session.url) {
      console.error('UNFRAMED checkout error: Stripe returned a session without a URL');
      return NextResponse.json({ error: 'Checkout temporarily unavailable' }, { status: 503 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('UNFRAMED checkout error:', err);
    return NextResponse.json({ error: 'Checkout temporarily unavailable' }, { status: 503 });
  }
}
