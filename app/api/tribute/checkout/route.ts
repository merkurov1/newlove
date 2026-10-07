import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || '',
  {
    apiVersion: '2025-08-27.basil' as any,
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

    const amountCents = Math.round(amount * 100);

    if (
      !Number.isInteger(amountCents) ||
      amountCents < 100
    ) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      );
    }

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

        success_url:
          `${SITE_URL}/tribute?status=success`,

        cancel_url:
          `${SITE_URL}/tribute?status=cancel`,

        metadata: {
          type: 'tribute_v1',
          donor_name: donorName,
          message,
        },
      });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error: any) {
    console.error(
      'Tribute Stripe checkout error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Unable to create payment session',
      },
      { status: 500 }
    );
  }
}