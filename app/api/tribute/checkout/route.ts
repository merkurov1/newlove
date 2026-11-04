import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  normalizePierrotTributeRef,
  pierrotConversationIdFromTributeRef,
} from '@/lib/pierrot/orderAttribution';
import { createPierrotStore, recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';
import { toTributeCents } from '@/lib/tributes/amount';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || '',
  {
    apiVersion: '2025-08-27.basil',
  }
);

export const dynamic = 'force-dynamic';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://merkurov.love'
).replace(/\/+$/, '');

function cleanMetadataValue(
  value: unknown,
  fallback: string,
  maxLength: number
) {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim().slice(0, maxLength) || fallback;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const amount = Number(body?.amount);
    const currency =
      typeof body?.currency === 'string'
        ? body.currency.toLowerCase()
        : 'usd';

    const donorName = cleanMetadataValue(
      body?.donor_name,
      'Anonymous',
      120
    );

    const message = cleanMetadataValue(
      body?.message,
      '',
      500
    );

    // Opaque attribution only. It is validated against the same convention as
    // the other commercial paths and never controls the amount or status.
    const pierrotAttribution = normalizePierrotTributeRef(
      body?.pierrotAttribution
    );

    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    // Tribute currently exists as a USD flow.
    if (currency !== 'usd') {
      return NextResponse.json(
        { error: 'Tribute currency must be USD' },
        { status: 400 }
      );
    }

    const amountCents = toTributeCents(amount);

    if (amountCents === null) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

    const attributionQuery = pierrotAttribution
      ? `&pierrot=${encodeURIComponent(pierrotAttribution)}`
      : '';

    const session =
      await stripe.checkout.sessions.create({
        payment_method_types: ['card'],

        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Temple Tribute',
                description:
                  'Fuel for the Digital Altar',
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],

        mode: 'payment',

        // The session id lets /tribute verify payment server-side. The browser
        // return alone is never treated as proof of payment.
        success_url:
          `${SITE_URL}/tribute?status=success&session_id={CHECKOUT_SESSION_ID}${attributionQuery}`,

        cancel_url:
          `${SITE_URL}/tribute?status=cancel${attributionQuery}`,

        metadata: {
          type: 'tribute_v1',
          donor_name: donorName,
          message,
          ...(pierrotAttribution
            ? { pierrotAttribution }
            : {}),
        },
      });

    // Initiation only. A donation is confirmed exclusively by a verified
    // Stripe webhook or the server-side session verification endpoint.
    const pierrotConversationId =
      pierrotConversationIdFromTributeRef(pierrotAttribution);

    if (pierrotConversationId) {
      try {
        const store = createPierrotStore();

        if (store) {
          await recordPierrotEventByConversationId(store, {
            conversationId: pierrotConversationId,
            eventName: 'checkout_started',
            eventKey: `checkout_started:${session.id}`,
            payload: {
              offer_id: 'temple_tribute',
              product_id: 'temple_tribute',
              provider_session_id: session.id,
              amount_total: amountCents,
              currency: 'usd',
            },
          });
        }
      } catch {
        // Analytics must never interrupt a donation checkout.
      }
    }

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error(
      'Tribute Stripe checkout error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to create payment session',
      },
      { status: 500 }
    );
  }
}